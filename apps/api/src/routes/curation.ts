import type { FastifyInstance } from "fastify";
import { and, eq, isNull, notExists } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";

const QUEUE_LIMIT = 20;

interface CurationMemory {
  id: string;
  title: string;
  kind: string;
  primaryPersonName: string | null;
  createdAt: string;
}

async function buildQueueItem(m: {
  id: string;
  title: string;
  kind: string;
  createdAt: Date;
  primaryPersonId: string | null;
}): Promise<CurationMemory> {
  let primaryPersonName: string | null = null;
  if (m.primaryPersonId) {
    const person = await db.query.people.findFirst({
      where: (p, { eq }) => eq(p.id, m.primaryPersonId!),
      columns: { displayName: true },
    });
    primaryPersonName = person?.displayName ?? null;
  }
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    primaryPersonName,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function curationPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/trees/:treeId/curation/queue", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const baseWhere = eq(schema.memories.treeId, treeId);

    // Needs date: dateOfEventText is null
    const needsDateRaw = await db.query.memories.findMany({
      where: and(baseWhere, isNull(schema.memories.dateOfEventText)),
      columns: { id: true, title: true, kind: true, createdAt: true, primaryPersonId: true },
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit: QUEUE_LIMIT,
    });

    // Needs place: both placeId and placeLabelOverride are null
    const needsPlaceRaw = await db.query.memories.findMany({
      where: and(
        baseWhere,
        isNull(schema.memories.placeId),
        isNull(schema.memories.placeLabelOverride),
      ),
      columns: { id: true, title: true, kind: true, createdAt: true, primaryPersonId: true },
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit: QUEUE_LIMIT,
    });

    // Needs people: no rows in memory_person_tags for this memory
    const needsPeopleRaw = await db.query.memories.findMany({
      where: and(
        baseWhere,
        notExists(
          db
            .select({ id: schema.memoryPersonTags.memoryId })
            .from(schema.memoryPersonTags)
            .where(eq(schema.memoryPersonTags.memoryId, schema.memories.id)),
        ),
      ),
      columns: { id: true, title: true, kind: true, createdAt: true, primaryPersonId: true },
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit: QUEUE_LIMIT,
    });

    const [needsDate, needsPlace, needsPeople] = await Promise.all([
      Promise.all(needsDateRaw.map(buildQueueItem)),
      Promise.all(needsPlaceRaw.map(buildQueueItem)),
      Promise.all(needsPeopleRaw.map(buildQueueItem)),
    ]);

    return reply.send({ needsDate, needsPlace, needsPeople });
  });
}
