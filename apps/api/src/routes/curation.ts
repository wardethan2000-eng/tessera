import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@tessera/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";

const QUEUE_LIMIT = 50;

type RawMemory = {
  id: string;
  title: string;
  kind: string;
  createdAt: Date;
  primaryPersonId: string | null;
  mediaId: string | null;
  sourceFilename: string | null;
  dateOfEventText: string | null;
  placeLabelOverride: string | null;
};

interface CurationMemory {
  id: string;
  title: string;
  kind: string;
  primaryPersonName: string | null;
  mediaUrl: string | null;
  sourceFilename: string | null;
  dateOfEventText: string | null;
  placeLabelOverride: string | null;
  createdAt: string;
}

interface CurationCounts {
  needsDate: number;
  needsPlace: number;
  needsPeople: number;
  needsReview: number;
}

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

  const mediaIds = [
    ...new Set(items.map((m) => m.mediaId).filter(Boolean) as string[]),
  ];
  const mediaMap = new Map<string, string>();

  if (mediaIds.length > 0) {
    const mediaItems = await db.query.media.findMany({
      where: (m, { inArray: inArr }) => inArr(m.id, mediaIds),
      columns: { id: true, objectKey: true },
    });
    for (const m of mediaItems) mediaMap.set(m.id, mediaUrl(m.objectKey));
  }

  return items.map((m) => ({
    id: m.id,
    title: m.title,
    kind: m.kind,
    primaryPersonName: m.primaryPersonId
      ? nameMap.get(m.primaryPersonId) ?? null
      : null,
    mediaUrl: m.mediaId ? mediaMap.get(m.mediaId) ?? null : null,
    sourceFilename: m.sourceFilename ?? null,
    dateOfEventText: m.dateOfEventText ?? null,
    placeLabelOverride: m.placeLabelOverride ?? null,
    createdAt: m.createdAt.toISOString(),
  }));
}

async function computeCounts(
  treeId: string,
  batchMemoryIds: string[] | null,
): Promise<CurationCounts> {
  const baseWhere = batchMemoryIds
    ? and(eq(schema.memories.treeId, treeId), inArray(schema.memories.id, batchMemoryIds))
    : eq(schema.memories.treeId, treeId);

  const [needsDateResult, needsPlaceResult, needsPeopleResult] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.memories)
        .where(and(baseWhere, isNull(schema.memories.dateOfEventText))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.memories)
        .where(
          and(
            baseWhere,
            isNull(schema.memories.placeId),
            isNull(schema.memories.placeLabelOverride),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.memories)
        .where(
          and(
            baseWhere,
            notExists(
              db
                .select({ id: schema.memoryPersonTags.memoryId })
                .from(schema.memoryPersonTags)
                .where(eq(schema.memoryPersonTags.memoryId, schema.memories.id)),
            ),
          ),
        ),
    ]);

  const needsDate = Number(needsDateResult[0]?.count ?? 0);
  const needsPlace = Number(needsPlaceResult[0]?.count ?? 0);
  const needsPeople = Number(needsPeopleResult[0]?.count ?? 0);

  const needsReview = new Set<string>();
  if (batchMemoryIds) {
    const allReviewMemories = await db.query.memories.findMany({
      where: baseWhere,
      columns: { id: true, dateOfEventText: true, placeId: true, placeLabelOverride: true },
    });
    for (const m of allReviewMemories) {
      if (
        !m.dateOfEventText ||
        (!m.placeId && !m.placeLabelOverride) ||
        !(await hasPersonTags(m.id))
      ) {
        needsReview.add(m.id);
      }
    }
  } else {
    const reviewResult = await db
      .select({ count: sql<number>`count(DISTINCT ${schema.memories.id})` })
      .from(schema.memories)
      .where(
        and(
          baseWhere,
          sql`(${schema.memories.dateOfEventText} IS NULL OR (${schema.memories.placeId} IS NULL AND ${schema.memories.placeLabelOverride} IS NULL) OR NOT EXISTS (SELECT 1 FROM ${schema.memoryPersonTags} WHERE ${schema.memoryPersonTags.memoryId} = ${schema.memories.id}))`,
        ),
      );
    return {
      needsDate,
      needsPlace,
      needsPeople,
      needsReview: Number(reviewResult[0]?.count ?? 0),
    };
  }

  return {
    needsDate,
    needsPlace,
    needsPeople,
    needsReview: needsReview.size,
  };
}

async function hasPersonTags(memoryId: string): Promise<boolean> {
  const result = await db.query.memoryPersonTags.findFirst({
    where: (t, { eq }) => eq(t.memoryId, memoryId),
    columns: { memoryId: true },
  });
  return Boolean(result);
}

const BulkActionBody = z.object({
  memoryIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["assignPerson", "assignDate", "assignPlace", "tagPeople", "skip"]),
  value: z.string().max(200).optional(),
});

export async function curationPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/trees/:treeId/curation/queue", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const query = request.query as {
      batchId?: string;
      section?: string;
      offset?: string;
      limit?: string;
    };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    let batchMemoryIds: string[] | null = null;
    if (query.batchId) {
      const batch = await db.query.importBatches.findFirst({
        where: (candidate, { and, eq }) =>
          and(eq(candidate.id, query.batchId!), eq(candidate.treeId, treeId)),
        columns: { id: true },
      });
      if (!batch) return reply.status(404).send({ error: "Import batch not found" });

      const batchItems = await db.query.importBatchItems.findMany({
        where: (item, { and, eq, isNotNull }) =>
          and(
            eq(item.batchId, query.batchId!),
            eq(item.treeId, treeId),
            isNotNull(item.memoryId),
          ),
        columns: { memoryId: true },
      });
      batchMemoryIds = batchItems
        .map((item) => item.memoryId)
        .filter((id): id is string => Boolean(id));

      if (batchMemoryIds.length === 0) {
        const emptyCounts: CurationCounts = { needsDate: 0, needsPlace: 0, needsPeople: 0, needsReview: 0 };
        return reply.send({
          needsDate: [],
          needsPlace: [],
          needsPeople: [],
          distinctCount: 0,
          counts: emptyCounts,
        });
      }
    }

    const baseWhere = batchMemoryIds
      ? and(eq(schema.memories.treeId, treeId), inArray(schema.memories.id, batchMemoryIds))
      : eq(schema.memories.treeId, treeId);

    const requestedLimit = Math.min(parseInt(query.limit ?? String(QUEUE_LIMIT), 10) || QUEUE_LIMIT, 100);
    const requestedOffset = Math.max(parseInt(query.offset ?? "0", 10) || 0, 0);

    const section = query.section as "needsDate" | "needsPlace" | "needsPeople" | undefined;

    const memoriesColumns = {
      id: true,
      title: true,
      kind: true,
      createdAt: true,
      primaryPersonId: true,
      mediaId: true,
      sourceFilename: true,
      dateOfEventText: true,
      placeLabelOverride: true,
    } as const;

    const countsPromise = computeCounts(treeId, batchMemoryIds);

    let needsDateRaw: RawMemory[] = [];
    let needsPlaceRaw: RawMemory[] = [];
    let needsPeopleRaw: RawMemory[] = [];

    if (!section || section === "needsDate") {
      needsDateRaw = await db.query.memories.findMany({
        where: and(baseWhere, isNull(schema.memories.dateOfEventText)),
        columns: memoriesColumns,
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: requestedLimit,
        offset: requestedOffset,
      });
    }

    if (!section || section === "needsPlace") {
      needsPlaceRaw = await db.query.memories.findMany({
        where: and(
          baseWhere,
          isNull(schema.memories.placeId),
          isNull(schema.memories.placeLabelOverride),
        ),
        columns: memoriesColumns,
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: requestedLimit,
        offset: requestedOffset,
      });
    }

    if (!section || section === "needsPeople") {
      needsPeopleRaw = await db.query.memories.findMany({
        where: and(
          baseWhere,
          notExists(
            db
              .select({ id: schema.memoryPersonTags.memoryId })
              .from(schema.memoryPersonTags)
              .where(eq(schema.memoryPersonTags.memoryId, schema.memories.id)),
          ),
        ),
        columns: memoriesColumns,
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: requestedLimit,
        offset: requestedOffset,
      });
    }

    const allRaw = [...needsDateRaw, ...needsPlaceRaw, ...needsPeopleRaw];
    const allResolved = await resolvePersonNames(allRaw);
    const counts = await countsPromise;

    const needsDate = allResolved.slice(0, needsDateRaw.length);
    const needsPlace = allResolved.slice(
      needsDateRaw.length,
      needsDateRaw.length + needsPlaceRaw.length,
    );
    const needsPeople = allResolved.slice(
      needsDateRaw.length + needsPlaceRaw.length,
    );

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
      counts,
    });
  });

  app.patch("/api/trees/:treeId/curation/bulk", async (request, reply) => {
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

    if (membership.role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot edit memories" });
    }

    const parsed = BulkActionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { memoryIds, action, value } = parsed.data;

    const memories = await db.query.memories.findMany({
      where: (m, { and, eq, inArray: inArr }) =>
        and(eq(m.treeId, treeId), inArr(m.id, memoryIds)),
      columns: { id: true },
    });
    if (memories.length === 0) {
      return reply.status(404).send({ error: "No matching memories found" });
    }

    const validIds = memories.map((m) => m.id);
    let applied = 0;

    switch (action) {
      case "assignDate": {
        if (!value?.trim()) {
          return reply.status(400).send({ error: "Date value is required" });
        }
        await db
          .update(schema.memories)
          .set({ dateOfEventText: value.trim(), updatedAt: new Date() })
          .where(
            and(
              eq(schema.memories.treeId, treeId),
              inArray(schema.memories.id, validIds),
              isNull(schema.memories.dateOfEventText),
            ),
          );
        applied = validIds.length;
        break;
      }

      case "assignPlace": {
        if (!value?.trim()) {
          return reply.status(400).send({ error: "Place value is required" });
        }
        await db
          .update(schema.memories)
          .set({ placeLabelOverride: value.trim(), updatedAt: new Date() })
          .where(
            and(
              eq(schema.memories.treeId, treeId),
              inArray(schema.memories.id, validIds),
              isNull(schema.memories.placeId),
              isNull(schema.memories.placeLabelOverride),
            ),
          );
        applied = validIds.length;
        break;
      }

      case "assignPerson": {
        if (!value?.trim()) {
          return reply.status(400).send({ error: "Person ID is required" });
        }
        const personId = value.trim();
        const person = await db.query.people.findFirst({
          where: (p, { and, eq }) => and(eq(p.id, personId), eq(p.treeId, treeId)),
          columns: { id: true },
        });
        if (!person) {
          const scoped = await db.query.treePersonScope.findFirst({
            where: (s, { and, eq }) => and(eq(s.treeId, treeId), eq(s.personId, personId)),
            columns: { personId: true },
          });
          if (!scoped) {
            return reply.status(400).send({ error: "Person not found in this tree" });
          }
        }

        const existingTags = await db.query.memoryPersonTags.findMany({
          where: (t, { and, inArray: inArr, eq }) =>
            and(inArr(t.memoryId, validIds), eq(t.personId, personId)),
          columns: { memoryId: true },
        });
        const alreadyTagged = new Set(existingTags.map((t) => t.memoryId));
        const toTag = validIds.filter((id) => !alreadyTagged.has(id));

        if (toTag.length > 0) {
          await db.insert(schema.memoryPersonTags).values(
            toTag.map((memoryId) => ({ memoryId, personId })),
          );
          applied = toTag.length;
        }

        const noPrimaryMemories = await db.query.memories.findMany({
          where: (m, { and, eq, inArray: inArr, isNull: isN }) =>
            and(
              eq(m.treeId, treeId),
              inArr(m.id, validIds),
              isN(m.primaryPersonId),
            ),
          columns: { id: true },
        });

        if (noPrimaryMemories.length > 0) {
          await db
            .update(schema.memories)
            .set({ primaryPersonId: personId, updatedAt: new Date() })
            .where(
              and(
                eq(schema.memories.treeId, treeId),
                inArray(schema.memories.id, noPrimaryMemories.map((m) => m.id)),
              ),
            );
        }
        break;
      }

      case "tagPeople": {
        if (!value?.trim()) {
          return reply.status(400).send({ error: "Person ID is required" });
        }
        const personId = value.trim();

        const existingTags = await db.query.memoryPersonTags.findMany({
          where: (t, { and, eq, inArray: inArr }) =>
            and(
              inArr(t.memoryId, validIds),
              eq(t.personId, personId),
            ),
          columns: { memoryId: true },
        });
        const alreadyTagged = new Set(existingTags.map((t) => t.memoryId));
        const toTag = validIds.filter((id) => !alreadyTagged.has(id));

        if (toTag.length > 0) {
          await db.insert(schema.memoryPersonTags).values(
            toTag.map((memoryId) => ({ memoryId, personId })),
          );
          applied = toTag.length;
        }
        break;
      }

      case "skip": {
        applied = validIds.length;
        break;
      }
    }

    return reply.send({ applied });
  });

  app.post("/api/trees/:treeId/memories/:memoryId/tag-person", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, memoryId } = request.params as { treeId: string; memoryId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (membership.role === "viewer") return reply.status(403).send({ error: "Viewers cannot edit" });

    const body = request.body as { personId?: string };
    if (!body.personId) return reply.status(400).send({ error: "personId is required" });

    const personId = body.personId;

    const person = await db.query.people.findFirst({
      where: (p, { eq }) => eq(p.id, personId),
      columns: { id: true, treeId: true },
    });
    if (!person) return reply.status(404).send({ error: "Person not found" });

    if (person.treeId !== treeId) {
      const scoped = await db.query.treePersonScope.findFirst({
        where: (s, { and, eq }) => and(eq(s.treeId, treeId), eq(s.personId, personId)),
        columns: { personId: true },
      });
      if (!scoped) return reply.status(400).send({ error: "Person not in tree scope" });
    }

    await db.insert(schema.memoryPersonTags).values({ memoryId, personId }).onConflictDoNothing();

    return reply.status(201).send({ ok: true });
  });

  app.delete("/api/trees/:treeId/memories/:memoryId/tag-person/:personId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, memoryId, personId } = request.params as {
      treeId: string;
      memoryId: string;
      personId: string;
    };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (membership.role === "viewer") return reply.status(403).send({ error: "Viewers cannot edit" });

    const memory = await db.query.memories.findFirst({
      where: (m, { and, eq }) => and(eq(m.id, memoryId), eq(m.treeId, treeId)),
      columns: { primaryPersonId: true },
    });
    if (!memory) return reply.status(404).send({ error: "Memory not found" });

    if (memory.primaryPersonId === personId) {
      return reply.status(400).send({ error: "Cannot remove the primary person tag" });
    }

    await db
      .delete(schema.memoryPersonTags)
      .where(
        and(
          eq(schema.memoryPersonTags.memoryId, memoryId),
          eq(schema.memoryPersonTags.personId, personId),
        ),
      );

    return reply.send({ ok: true });
  });
}