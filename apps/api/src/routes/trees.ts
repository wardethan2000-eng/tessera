import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, isNull, notExists } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getIdentityStatusForUser } from "../lib/account-identity-service.js";
import { addPersonToTreeScope } from "../lib/cross-tree-write-service.js";
import {
  getTreeMemories,
  getTreeRelationships,
  getTreeScopedPeople,
  getTreeScopedPerson,
  isPersonInTreeScope,
} from "../lib/cross-tree-read-service.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";

const CreateTreeBody = z.object({
  name: z.string().min(1).max(160),
});

type HomePerson = Awaited<ReturnType<typeof getTreeScopedPeople>>[number];
type HomeMemory = Awaited<ReturnType<typeof getTreeMemories>>[number];
type HomeRelationship = Awaited<ReturnType<typeof getTreeRelationships>>[number];

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\b(\d{4})\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function serializeHomePerson(person: HomePerson) {
  return {
    ...person,
    portraitUrl: person.portraitMedia ? mediaUrl(person.portraitMedia.objectKey) : null,
  };
}

function serializeHomeMemory(memory: HomeMemory) {
  const mediaItems =
    memory.mediaItems && memory.mediaItems.length > 0
      ? memory.mediaItems.map((item) => ({
          id: item.id,
          sortOrder: item.sortOrder,
          mediaId: item.mediaId,
          mediaUrl: item.media ? mediaUrl(item.media.objectKey) : item.linkedMediaPreviewUrl ?? null,
          mimeType: item.media?.mimeType ?? null,
          linkedMediaProvider: item.linkedMediaProvider,
          linkedMediaOpenUrl: item.linkedMediaOpenUrl,
          linkedMediaSourceUrl: item.linkedMediaSourceUrl,
          linkedMediaLabel: item.linkedMediaLabel,
        }))
      : [
          {
            id: "legacy-0",
            sortOrder: 0,
            mediaId: null,
            mediaUrl: memory.media ? mediaUrl(memory.media.objectKey) : memory.linkedMediaPreviewUrl ?? null,
            mimeType: memory.media?.mimeType ?? null,
            linkedMediaProvider: memory.linkedMediaProvider,
            linkedMediaOpenUrl: memory.linkedMediaOpenUrl,
            linkedMediaSourceUrl: memory.linkedMediaSourceUrl,
            linkedMediaLabel: memory.linkedMediaLabel,
          },
        ].filter((item) => item.mediaUrl || item.linkedMediaOpenUrl);
  const primaryItem = mediaItems[0] ?? null;

  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    transcriptText: memory.transcriptText ?? null,
    transcriptLanguage: memory.transcriptLanguage ?? null,
    transcriptStatus: memory.transcriptStatus,
    transcriptError: memory.transcriptError ?? null,
    dateOfEventText: memory.dateOfEventText ?? null,
    createdAt: memory.createdAt.toISOString(),
    primaryPersonId: memory.primaryPersonId,
    personName: memory.primaryPerson?.displayName ?? null,
    personPortraitUrl: memory.primaryPerson?.portraitMedia
      ? mediaUrl(memory.primaryPerson.portraitMedia.objectKey)
      : null,
    mediaUrl: primaryItem?.mediaUrl ?? null,
    mimeType: primaryItem?.mimeType ?? null,
    linkedMediaProvider: primaryItem?.linkedMediaProvider ?? null,
    linkedMediaOpenUrl: primaryItem?.linkedMediaOpenUrl ?? null,
    linkedMediaSourceUrl: primaryItem?.linkedMediaSourceUrl ?? null,
    linkedMediaLabel: primaryItem?.linkedMediaLabel ?? null,
    mediaItems,
  };
}

function serializeHomeRelationship(relationship: HomeRelationship) {
  return {
    id: relationship.id,
    fromPersonId: relationship.fromPersonId,
    toPersonId: relationship.toPersonId,
    type: relationship.type,
    spouseStatus: relationship.spouseStatus ?? null,
    startDateText: relationship.startDateText ?? null,
    endDateText: relationship.endDateText ?? null,
  };
}

function scoreHeroMemory(memory: HomeMemory): number {
  let score = 0;

  if (memory.kind === "photo") score += 30;
  if (memory.kind === "voice") score += 26;
  if (memory.kind === "story") score += 24;
  if (memory.kind === "document") score += 18;
  if (memory.media || memory.linkedMediaPreviewUrl || memory.mediaItems.length > 0) score += 18;
  if (memory.transcriptText) score += 10;
  if (memory.body) score += Math.min(8, Math.floor(memory.body.trim().length / 240));
  if (memory.dateOfEventText) score += 8;
  if (memory.primaryPersonId) score += 4;
  if (memory.title.trim().length >= 12) score += 4;

  return score;
}

function selectHeroCandidates(memories: HomeMemory[], limit = 6) {
  const sorted = [...memories].sort((left, right) => {
    const scoreDiff = scoreHeroMemory(right) - scoreHeroMemory(left);
    if (scoreDiff !== 0) return scoreDiff;
    return right.createdAt.getTime() - left.createdAt.getTime();
  });

  const selected: HomeMemory[] = [];
  const kindCounts = new Map<string, number>();
  const personCounts = new Map<string, number>();

  for (const memory of sorted) {
    if (selected.length >= limit) break;

    const nextKindCount = (kindCounts.get(memory.kind) ?? 0) + 1;
    const nextPersonCount = memory.primaryPersonId
      ? (personCounts.get(memory.primaryPersonId) ?? 0) + 1
      : 0;

    if (selected.length >= 2 && nextKindCount > 3) continue;
    if (memory.primaryPersonId && selected.length >= 2 && nextPersonCount > 2) continue;

    selected.push(memory);
    kindCounts.set(memory.kind, nextKindCount);
    if (memory.primaryPersonId) {
      personCounts.set(memory.primaryPersonId, nextPersonCount);
    }
  }

  return selected.length > 0 ? selected : sorted.slice(0, limit);
}

function buildDecadeBuckets(memories: HomeMemory[]) {
  const buckets = new Map<number, number>();

  for (const memory of memories) {
    const year = extractYear(memory.dateOfEventText);
    if (year === null) continue;
    const decade = Math.floor(year / 10) * 10;
    buckets.set(decade, (buckets.get(decade) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([startYear, count]) => ({
      startYear,
      label: `${startYear}s`,
      count,
    }));
}

function computeGenerationCount(
  people: HomePerson[],
  relationships: HomeRelationship[],
): number {
  if (people.length === 0) return 0;

  const parentIdsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent_child") continue;
    const parentIds = parentIdsByChild.get(relationship.toPersonId) ?? [];
    parentIds.push(relationship.fromPersonId);
    parentIdsByChild.set(relationship.toPersonId, parentIds);
  }

  const depthMemo = new Map<string, number>();
  const visit = (personId: string, visiting: Set<string>): number => {
    const cached = depthMemo.get(personId);
    if (cached) return cached;
    if (visiting.has(personId)) return 1;

    visiting.add(personId);
    const parentIds = parentIdsByChild.get(personId) ?? [];
    const depth =
      parentIds.length === 0
        ? 1
        : 1 + Math.max(...parentIds.map((parentId) => visit(parentId, visiting)));
    visiting.delete(personId);
    depthMemo.set(personId, depth);
    return depth;
  };

  return Math.max(...people.map((person) => visit(person.id, new Set())));
}

async function getCurationCount(treeId: string): Promise<number> {
  const baseWhere = eq(schema.memories.treeId, treeId);

  const [needsDate, needsPlace, needsPeople] = await Promise.all([
    db.query.memories.findMany({
      where: and(baseWhere, isNull(schema.memories.dateOfEventText)),
      columns: { id: true },
      limit: 20,
      orderBy: (memory, operators) => [operators.desc(memory.createdAt)],
    }),
    db.query.memories.findMany({
      where: and(
        baseWhere,
        isNull(schema.memories.placeId),
        isNull(schema.memories.placeLabelOverride),
      ),
      columns: { id: true },
      limit: 20,
      orderBy: (memory, operators) => [operators.desc(memory.createdAt)],
    }),
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
      columns: { id: true },
      limit: 20,
      orderBy: (memory, operators) => [operators.desc(memory.createdAt)],
    }),
  ]);

  return new Set([
    ...needsDate.map((memory) => memory.id),
    ...needsPlace.map((memory) => memory.id),
    ...needsPeople.map((memory) => memory.id),
  ]).size;
}

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (membership) =>
      and(eq(membership.treeId, treeId), eq(membership.userId, userId)),
    with: { tree: true },
  });
}

export async function treesPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/me/identity", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const identity = await getIdentityStatusForUser(session.user.id);

    return reply.send({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      ...identity,
    });
  });

  app.post("/api/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const parsed = CreateTreeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const [tree] = await db
      .insert(schema.trees)
      .values({ name: parsed.data.name, founderUserId: session.user.id })
      .returning();

    if (!tree) {
      return reply.status(500).send({ error: "Failed to create tree" });
    }

    await db.insert(schema.treeMemberships).values({
      treeId: tree.id,
      userId: session.user.id,
      role: "founder",
    });

    return reply.status(201).send(tree);
  });

  app.get("/api/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const memberships = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.userId, session.user.id),
      with: { tree: true },
    });

    return reply.send(memberships.map((m) => ({ ...m.tree, role: m.role })));
  });

  app.get("/api/trees/:treeId/home", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);

    if (!membership) {
      return reply.status(404).send({ error: "Tree not found" });
    }

    const [people, memories, relationships] = await Promise.all([
      getTreeScopedPeople(treeId),
      getTreeMemories(treeId, {
        limit: 200,
        viewerUserId: session.user.id,
      }),
      getTreeRelationships(treeId),
    ]);

    const currentUserPersonId =
      people.find((person) => person.linkedUserId === session.user.id)?.id ?? null;

    const [inboxCount, curationCount] = await Promise.all([
      currentUserPersonId
        ? db.query.prompts
            .findMany({
              where: (prompt) =>
                and(
                  eq(prompt.treeId, treeId),
                  eq(prompt.toPersonId, currentUserPersonId),
                  eq(prompt.status, "pending"),
                ),
              columns: { id: true },
            })
            .then((prompts) => prompts.length)
        : Promise.resolve(0),
      getCurationCount(treeId),
    ]);

    const directMemoryPersonIds = new Set<string>();
    for (const memory of memories) {
      if (memory.primaryPersonId) {
        directMemoryPersonIds.add(memory.primaryPersonId);
      }
      for (const tag of memory.personTags) {
        directMemoryPersonIds.add(tag.personId);
      }
    }

    const years = [
      ...people.flatMap((person) =>
        [person.birthDateText, person.deathDateText]
          .map((value) => extractYear(value))
          .filter((value): value is number => value !== null),
      ),
      ...memories
        .map((memory) => extractYear(memory.dateOfEventText))
        .filter((value): value is number => value !== null),
    ];
    const earliestYear = years.length > 0 ? Math.min(...years) : null;
    const latestYear = years.length > 0 ? Math.max(...years) : null;

    return reply.send({
      tree: {
        ...membership.tree,
        role: membership.role,
      },
      currentUserPersonId,
      inboxCount,
      curationCount,
      stats: {
        peopleCount: people.length,
        memoryCount: memories.length,
        generationCount: computeGenerationCount(people, relationships),
        peopleWithoutPortraitCount: people.filter((person) => !person.portraitMedia).length,
        peopleWithoutDirectMemoriesCount: people.filter(
          (person) => !directMemoryPersonIds.has(person.id),
        ).length,
      },
      coverage: {
        earliestYear,
        latestYear,
        decadeBuckets: buildDecadeBuckets(memories),
      },
      relationships: relationships.map(serializeHomeRelationship),
      heroCandidates: selectHeroCandidates(memories).map(serializeHomeMemory),
      people: people.map(serializeHomePerson),
      memories: memories.map(serializeHomeMemory),
    });
  });

  app.get("/api/trees/:treeId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await verifyMembership(treeId, session.user.id);

    if (!membership) return reply.status(404).send({ error: "Tree not found" });

    return reply.send({ ...membership.tree, role: membership.role });
  });

  app.post("/api/trees/:treeId/identity/bootstrap", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and: opAnd, eq: opEq }) =>
        opAnd(opEq(t.treeId, treeId), opEq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const identity = await getIdentityStatusForUser(session.user.id);
    if (identity.status === "unclaimed") {
      return reply.send({
        status: "unclaimed",
        wasAddedToScope: false,
        person: null,
      });
    }

    if (identity.status === "conflict") {
      return reply.status(409).send({
        error:
          "This account is linked to multiple people. Resolve the duplicate identity before bootstrapping into a new tree.",
        ...identity,
      });
    }

    const claimedPerson = identity.canonicalPerson;
    const alreadyInScope = await isPersonInTreeScope(treeId, claimedPerson.id);

    if (!alreadyInScope) {
      const capacity = await checkTreeCanAdd(treeId, "person");
      if (!capacity.allowed) {
        return reply.status(capacity.status).send({ error: capacity.reason });
      }

      await addPersonToTreeScope({
        treeId,
        personId: claimedPerson.id,
        addedByUserId: session.user.id,
      });
    }

    const person = await getTreeScopedPerson(treeId, claimedPerson.id);
    if (!person) {
      return reply.status(500).send({ error: "Failed to load claimed person in this tree" });
    }

    return reply.send({
      status: "claimed",
      wasAddedToScope: !alreadyInScope,
      person,
    });
  });

  /** GET /api/trees/:treeId/members — list all members of a tree */
  app.get("/api/trees/:treeId/members", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const userMembership = await db.query.treeMemberships.findFirst({
      where: (t, { and: opAnd, eq: opEq }) =>
        opAnd(opEq(t.treeId, treeId), opEq(t.userId, session.user.id)),
    });
    if (!userMembership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const members = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.treeId, treeId),
      with: { user: true },
    });

    return reply.send(
      members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user?.name ?? null,
        email: m.user?.email ?? "",
        joinedAt: m.joinedAt,
      }))
    );
  });
}
