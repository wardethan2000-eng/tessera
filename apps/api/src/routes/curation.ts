import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNull, notExists } from "drizzle-orm";
import * as schema from "@tessera/database";
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

type RawMemory = {
  id: string;
  title: string;
  kind: string;
  createdAt: Date;
  primaryPersonId: string | null;
};

/** Resolve primaryPersonId → displayName for a batch of memories */
async function resolvePersonNames(
  items: RawMemory[],
): Promise<CurationMemory[]> {
  const personIds = [
    ...new Set(items.map((m) => m.primaryPersonId).filter(Boolean) as string[]),
  ];
  const nameMap = new Map<string, string>();

  if (personIds.length > 0) {
    const people = await db.query.people.findMany({
      where: (p, { inArray: inArr }) => inArr(p.id, personIds),
      columns: { id: true, displayName: true },
    });
    for (const p of people) nameMap.set(p.id, p.displayName);
  }

  return items.map((m) => ({
    id: m.id,
    title: m.title,
    kind: m.kind,
    primaryPersonName: m.primaryPersonId
      ? nameMap.get(m.primaryPersonId) ?? null
      : null,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function curationPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/trees/:treeId/curation/queue", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const { batchId } = request.query as { batchId?: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    let batchMemoryIds: string[] | null = null;
    if (batchId) {
      const batch = await db.query.importBatches.findFirst({
        where: (candidate, { and, eq }) =>
          and(eq(candidate.id, batchId), eq(candidate.treeId, treeId)),
        columns: { id: true },
      });
      if (!batch) return reply.status(404).send({ error: "Import batch not found" });

      const batchItems = await db.query.importBatchItems.findMany({
        where: (item, { and, eq, isNotNull }) =>
          and(
            eq(item.batchId, batchId),
            eq(item.treeId, treeId),
            isNotNull(item.memoryId),
          ),
        columns: { memoryId: true },
      });
      batchMemoryIds = batchItems
        .map((item) => item.memoryId)
        .filter((id): id is string => Boolean(id));

      if (batchMemoryIds.length === 0) {
        return reply.send({
          needsDate: [],
          needsPlace: [],
          needsPeople: [],
          distinctCount: 0,
        });
      }
    }

    const baseWhere = batchMemoryIds
      ? and(eq(schema.memories.treeId, treeId), inArray(schema.memories.id, batchMemoryIds))
      : eq(schema.memories.treeId, treeId);

    // Run all three queries in parallel
    const [needsDateRaw, needsPlaceRaw, needsPeopleRaw] = await Promise.all([
      // Needs date: dateOfEventText is null
      db.query.memories.findMany({
        where: and(baseWhere, isNull(schema.memories.dateOfEventText)),
        columns: { id: true, title: true, kind: true, createdAt: true, primaryPersonId: true },
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: QUEUE_LIMIT,
      }),
      // Needs place: both placeId and placeLabelOverride are null
      db.query.memories.findMany({
        where: and(
          baseWhere,
          isNull(schema.memories.placeId),
          isNull(schema.memories.placeLabelOverride),
        ),
        columns: { id: true, title: true, kind: true, createdAt: true, primaryPersonId: true },
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: QUEUE_LIMIT,
      }),
      // Needs people: no rows in memory_person_tags for this memory
      db.query.memories.findMany({
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
      }),
    ]);

    // Batch-resolve person names across all three lists at once
    const allRaw = [...needsDateRaw, ...needsPlaceRaw, ...needsPeopleRaw];
    const allResolved = await resolvePersonNames(allRaw);

    // Split back into three lists
    const needsDate = allResolved.slice(0, needsDateRaw.length);
    const needsPlace = allResolved.slice(
      needsDateRaw.length,
      needsDateRaw.length + needsPlaceRaw.length,
    );
    const needsPeople = allResolved.slice(
      needsDateRaw.length + needsPlaceRaw.length,
    );

    // Compute distinct memory count for the nudge badge
    const allIds = new Set([
      ...needsDateRaw.map((m) => m.id),
      ...needsPlaceRaw.map((m) => m.id),
      ...needsPeopleRaw.map((m) => m.id),
    ]);

    return reply.send({
      needsDate,
      needsPlace,
      needsPeople,
      distinctCount: allIds.size,
    });
  });
}
