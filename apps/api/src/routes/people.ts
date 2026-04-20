import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import * as schema from "@familytree/database";
import { getIdentityStatusForUser } from "../lib/account-identity-service.js";
import {
  listLikelyDuplicatePeople,
  mergePeopleRecords,
  PersonMergeError,
} from "../lib/cross-tree-merge-service.js";
import { removePersonFromTree } from "../lib/cross-tree-mutation-service.js";
import {
  canEditPerson,
  canManageTreeScope,
  getResolvedMemoryVisibilitiesForTree,
} from "../lib/cross-tree-permission-service.js";
import {
  getTreeMemories,
  getTreePersonRelationships,
  getTreeScopedPeople,
  getTreeScopedPerson,
  getVisibleTreesForPerson,
  isMemoryInTreeScope,
  isPersonInTreeScope,
} from "../lib/cross-tree-read-service.js";
import { db } from "../lib/db.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";
import {
  addPersonToTreeScope,
  createPersonWithScope,
  upsertPersonTreeScope,
} from "../lib/cross-tree-write-service.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";

const CreatePersonBody = z.object({
  displayName: z.string().min(1).max(200),
  alsoKnownAs: z.array(z.string()).optional(),
  essenceLine: z.string().max(255).optional(),
  birthDateText: z.string().max(100).optional(),
  deathDateText: z.string().max(100).optional(),
  birthPlace: z.string().max(200).optional(),
  deathPlace: z.string().max(200).optional(),
  birthPlaceId: z.string().uuid().optional(),
  deathPlaceId: z.string().uuid().optional(),
  isLiving: z.boolean().optional(),
  linkToUser: z.boolean().optional(),
});

const UpdatePersonBody = z.object({
  displayName: z.string().min(1).max(200).optional(),
  alsoKnownAs: z.array(z.string()).optional(),
  essenceLine: z.string().max(255).nullable().optional(),
  birthDateText: z.string().max(100).nullable().optional(),
  deathDateText: z.string().max(100).nullable().optional(),
  birthPlace: z.string().max(200).nullable().optional(),
  deathPlace: z.string().max(200).nullable().optional(),
  birthPlaceId: z.string().uuid().nullable().optional(),
  deathPlaceId: z.string().uuid().nullable().optional(),
  isLiving: z.boolean().optional(),
  portraitMediaId: z.string().uuid().nullable().optional(),
});

const AddPersonToScopeBody = z.object({
  personId: z.string().uuid(),
});

const UpdateScopePersonBody = z.object({
  displayNameOverride: z.string().min(1).max(200).nullable().optional(),
  visibilityDefault: z
    .enum(["all_members", "family_circle", "named_circle"])
    .optional(),
});

const FieldSourceSchema = z.enum(["survivor", "merged"]);

const MergePeopleBody = z.object({
  survivorPersonId: z.string().uuid(),
  mergedAwayPersonId: z.string().uuid(),
  fieldResolutions: z
    .object({
      displayName: FieldSourceSchema.optional(),
      alsoKnownAs: FieldSourceSchema.optional(),
      essenceLine: FieldSourceSchema.optional(),
      birthDateText: FieldSourceSchema.optional(),
      deathDateText: FieldSourceSchema.optional(),
      birthPlace: FieldSourceSchema.optional(),
      deathPlace: FieldSourceSchema.optional(),
      birthPlaceId: FieldSourceSchema.optional(),
      deathPlaceId: FieldSourceSchema.optional(),
      isLiving: FieldSourceSchema.optional(),
      portraitMediaId: FieldSourceSchema.optional(),
      linkedUserId: FieldSourceSchema.optional(),
      homeTreeId: FieldSourceSchema.optional(),
    })
    .optional(),
});

const UpdatePersonMemorySuppressionBody = z.object({
  suppressed: z.boolean(),
});

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.treeId, treeId), eq(t.userId, userId)),
  });
}

async function validatePlaceId(placeId: string, treeId: string) {
  return db.query.places.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, placeId), eq(p.treeId, treeId)),
  });
}

function serializePlace(place: {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  adminRegion: string | null;
  locality: string | null;
} | null | undefined) {
  return place
    ? {
        id: place.id,
        label: place.label,
        latitude: place.latitude,
        longitude: place.longitude,
        countryCode: place.countryCode,
        adminRegion: place.adminRegion,
        locality: place.locality,
      }
    : null;
}

function describeReachRule(
  rule:
    | {
        kind: "immediate_family" | "ancestors" | "descendants" | "whole_tree";
      }
    | undefined,
) {
  if (!rule) return "Shared through family context";

  switch (rule.kind) {
    case "immediate_family":
      return "Shared through immediate family";
    case "ancestors":
      return "Shared through ancestors";
    case "descendants":
      return "Shared through descendants";
    case "whole_tree":
      return "Shared with this tree";
    default:
      return "Shared through family context";
  }
}

function serializeMemoryForPersonSurface<
  TMemory extends {
    id: string;
    media: { objectKey: string; mimeType: string } | null;
    place: {
      id: string;
      label: string;
      latitude: number;
      longitude: number;
      countryCode: string | null;
      adminRegion: string | null;
      locality: string | null;
    } | null;
    personTags: Array<{ personId: string }>;
    reachRules: Array<{
      kind: "immediate_family" | "ancestors" | "descendants" | "whole_tree";
    }>;
  },
>(
  memory: TMemory,
  personId: string,
) {
  const isDirectSubject = memory.personTags.some((tag) => tag.personId === personId);

  return {
    ...memory,
    mediaUrl: memory.media ? mediaUrl(memory.media.objectKey) : null,
    mimeType: memory.media?.mimeType ?? null,
    place: serializePlace(memory.place),
    memoryContext: isDirectSubject ? "direct" : "contextual",
    memoryReasonLabel: isDirectSubject
      ? "Tagged directly"
      : describeReachRule(memory.reachRules[0]),
  };
}

function serializeTreeVisibility(
  resolved:
    | {
        visibility: "all_members" | "family_circle" | "named_circle" | "hidden";
        isOverride: boolean;
        unlockDate: Date | null;
      }
    | undefined,
) {
  return {
    treeVisibilityLevel: resolved?.visibility ?? "all_members",
    treeVisibilityIsOverride: resolved?.isOverride ?? false,
    treeVisibilityUnlockDate: resolved?.unlockDate?.toISOString() ?? null,
  };
}

export async function peoplePlugin(app: FastifyInstance): Promise<void> {
  app.post("/api/trees/:treeId/people", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (membership.role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot add people" });
    }

    const parsed = CreatePersonBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { linkToUser, ...fields } = parsed.data;

    if (fields.birthPlaceId) {
      const place = await validatePlaceId(fields.birthPlaceId, treeId);
      if (!place) {
        return reply.status(400).send({ error: "Birth place not found in this tree" });
      }
    }
    if (fields.deathPlaceId) {
      const place = await validatePlaceId(fields.deathPlaceId, treeId);
      if (!place) {
        return reply.status(400).send({ error: "Death place not found in this tree" });
      }
    }

    if (linkToUser) {
      const identity = await getIdentityStatusForUser(session.user.id);
      if (identity.status === "conflict") {
        return reply.status(409).send({
          error:
            "This account is linked to multiple people. Resolve the duplicate identity before linking yourself to another tree.",
          ...identity,
        });
      }

      if (identity.status === "claimed") {
        const claimedPersonId = identity.canonicalPerson.id;
        const alreadyInScope = await isPersonInTreeScope(treeId, claimedPersonId);

        if (!alreadyInScope) {
          const capacity = await checkTreeCanAdd(treeId, "person");
          if (!capacity.allowed) {
            return reply.status(capacity.status).send({ error: capacity.reason });
          }

          await addPersonToTreeScope({
            treeId,
            personId: claimedPersonId,
            addedByUserId: session.user.id,
          });
        }

        const existingPerson = await getTreeScopedPerson(treeId, claimedPersonId);
        if (!existingPerson) {
          return reply.status(500).send({ error: "Failed to load claimed person" });
        }

        return reply.status(alreadyInScope ? 200 : 201).send({
          ...existingPerson,
          portraitUrl: existingPerson.portraitMedia
            ? mediaUrl(existingPerson.portraitMedia.objectKey)
            : null,
          birthPlaceResolved: serializePlace(existingPerson.birthPlaceRef),
          deathPlaceResolved: serializePlace(existingPerson.deathPlaceRef),
          reusedClaimedPerson: true,
          wasAddedToScope: !alreadyInScope,
        });
      }
    }

    const capacity = await checkTreeCanAdd(treeId, "person");
    if (!capacity.allowed) {
      return reply.status(capacity.status).send({ error: capacity.reason });
    }

    const person = await createPersonWithScope({
      treeId,
      addedByUserId: session.user.id,
      displayName: fields.displayName,
      alsoKnownAs: fields.alsoKnownAs ?? [],
      essenceLine: fields.essenceLine,
      birthDateText: fields.birthDateText,
      deathDateText: fields.deathDateText,
      birthPlace: fields.birthPlace,
      deathPlace: fields.deathPlace,
      birthPlaceId: fields.birthPlaceId,
      deathPlaceId: fields.deathPlaceId,
      isLiving: fields.isLiving ?? true,
      linkedUserId: linkToUser ? session.user.id : undefined,
    });

    if (!person) {
      return reply.status(500).send({ error: "Failed to create person" });
    }

    const fullPerson = await db.query.people.findFirst({
      where: (p, { eq }) => eq(p.id, person.id),
      with: { birthPlaceRef: true, deathPlaceRef: true },
    });

    return reply.status(201).send({
      ...fullPerson,
      birthPlaceResolved: serializePlace(fullPerson?.birthPlaceRef),
      deathPlaceResolved: serializePlace(fullPerson?.deathPlaceRef),
    });
  });

  app.get("/api/trees/:treeId/people", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const people = await getTreeScopedPeople(treeId);

    return reply.send(
      people.map((p) => ({
        ...p,
        portraitUrl: p.portraitMedia ? mediaUrl(p.portraitMedia.objectKey) : null,
        birthPlaceResolved: serializePlace(p.birthPlaceRef),
        deathPlaceResolved: serializePlace(p.deathPlaceRef),
      })),
    );
  });

  app.get("/api/trees/:treeId/people/:personId/duplicates", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, personId } = request.params as {
      treeId: string;
      personId: string;
    };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const personInScope = await isPersonInTreeScope(treeId, personId);
    if (!personInScope) {
      return reply.status(404).send({ error: "Person not found" });
    }

    const candidates = await listLikelyDuplicatePeople(personId);
    if (!candidates) {
      return reply.status(404).send({ error: "Person not found" });
    }

    const visibleCandidates = (
      await Promise.all(
        candidates.map(async (candidate) => {
          const visibleTrees = await getVisibleTreesForPerson(
            candidate.id,
            session.user.id,
          );
          if (visibleTrees.length === 0) {
            return null;
          }

          return {
            id: candidate.id,
            displayName: candidate.displayName,
            essenceLine: candidate.essenceLine,
            birthDateText: candidate.birthDateText,
            deathDateText: candidate.deathDateText,
            linkedUserId: candidate.linkedUserId,
            homeTreeId: candidate.homeTreeId,
            portraitUrl: candidate.portraitMedia
              ? mediaUrl(candidate.portraitMedia.objectKey)
              : null,
            score: candidate.score,
            reasons: candidate.reasons,
            visibleTrees,
            alreadyInTree: await isPersonInTreeScope(treeId, candidate.id),
          };
        }),
      )
    ).filter((candidate) => candidate !== null);

    return reply.send(visibleCandidates);
  });

  app.get("/api/trees/:treeId/people/:personId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, personId } = request.params as {
      treeId: string;
      personId: string;
    };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const [person, memories, allMemories, relationships, personPermission] = await Promise.all([
      getTreeScopedPerson(treeId, personId),
      getTreeMemories(treeId, { personId, viewerUserId: session.user.id }),
      getTreeMemories(treeId, {
        personId,
        viewerUserId: session.user.id,
        includeSuppressed: true,
      }),
      getTreePersonRelationships(treeId, personId),
      canEditPerson(session.user.id, personId),
    ]);

    if (!person) return reply.status(404).send({ error: "Person not found" });

    const visibilityRows = await getResolvedMemoryVisibilitiesForTree(
      treeId,
      allMemories.map((memory) => memory.id),
    );
    const visibilityById = new Map(
      visibilityRows.map((visibility) => [visibility.memoryId, visibility]),
    );

    const serializedMemories = memories.map((memory) =>
      ({
        ...serializeMemoryForPersonSurface(memory, personId),
        ...serializeTreeVisibility(visibilityById.get(memory.id)),
      }),
    );
    const visibleMemoryIds = new Set(serializedMemories.map((memory) => memory.id));
    const suppressedContextualMemories = personPermission.allowed
      ? allMemories
          .filter((memory) => !visibleMemoryIds.has(memory.id))
          .map((memory) => ({
            ...serializeMemoryForPersonSurface(memory, personId),
            ...serializeTreeVisibility(visibilityById.get(memory.id)),
          }))
          .filter((memory) => memory.memoryContext === "contextual")
      : [];

    return reply.send({
      ...person,
      portraitUrl: person.portraitMedia
        ? mediaUrl(person.portraitMedia.objectKey)
        : null,
      birthPlaceResolved: serializePlace(person.birthPlaceRef),
      deathPlaceResolved: serializePlace(person.deathPlaceRef),
      memories: serializedMemories,
      directMemories: serializedMemories.filter((memory) => memory.memoryContext === "direct"),
      contextualMemories: serializedMemories.filter(
        (memory) => memory.memoryContext === "contextual",
      ),
      suppressedContextualMemories,
      relationships,
    });
  });

  app.patch(
    "/api/trees/:treeId/people/:personId/memories/:memoryId/suppression",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, personId, memoryId } = request.params as {
        treeId: string;
        personId: string;
        memoryId: string;
      };

      const membership = await verifyMembership(treeId, session.user.id);
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const parsed = UpdatePersonMemorySuppressionBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const [personInScope, memoryInScope, permission] = await Promise.all([
        isPersonInTreeScope(treeId, personId),
        isMemoryInTreeScope(treeId, memoryId),
        canEditPerson(session.user.id, personId),
      ]);

      if (!personInScope) {
        return reply.status(404).send({ error: "Person not found" });
      }
      if (!memoryInScope) {
        return reply.status(404).send({ error: "Memory not found in this tree" });
      }
      if (!permission.allowed) {
        return reply.status(403).send({ error: permission.reason });
      }

      const personMemories = await getTreeMemories(treeId, {
        personId,
        viewerUserId: session.user.id,
        includeSuppressed: true,
      });
      const matchingMemory = personMemories.find((memory) => memory.id === memoryId);
      if (!matchingMemory) {
        return reply.status(400).send({
          error: "This memory does not appear on this person's surface",
        });
      }

      const isDirectSubject = matchingMemory.personTags.some((tag) => tag.personId === personId);
      if (isDirectSubject) {
        return reply.status(400).send({
          error: "Directly tagged memories cannot be hidden from this page",
        });
      }

      if (!parsed.data.suppressed) {
        await db
          .delete(schema.memoryPersonSuppressions)
          .where(
            and(
              eq(schema.memoryPersonSuppressions.memoryId, memoryId),
              eq(schema.memoryPersonSuppressions.treeId, treeId),
              eq(schema.memoryPersonSuppressions.personId, personId),
            ),
          );

        return reply.send({ suppressed: false, treeId, personId, memoryId });
      }

      const [updated] = await db
        .insert(schema.memoryPersonSuppressions)
        .values({
          treeId,
          personId,
          memoryId,
          suppressedByUserId: session.user.id,
        })
        .onConflictDoUpdate({
          target: [
            schema.memoryPersonSuppressions.memoryId,
            schema.memoryPersonSuppressions.treeId,
            schema.memoryPersonSuppressions.personId,
          ],
          set: {
            suppressedByUserId: session.user.id,
          },
        })
        .returning();

      return reply.send({ suppressed: true, record: updated });
    },
  );

  app.post("/api/trees/:treeId/people/merge", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (!canManageTreeScope(membership.role)) {
      return reply.status(403).send({ error: "Only founders and stewards can merge people" });
    }

    const parsed = MergePeopleBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { survivorPersonId, mergedAwayPersonId, fieldResolutions } = parsed.data;
    const [survivorInTree, mergedAwayInTree] = await Promise.all([
      isPersonInTreeScope(treeId, survivorPersonId),
      isPersonInTreeScope(treeId, mergedAwayPersonId),
    ]);

    if (!survivorInTree && !mergedAwayInTree) {
      return reply.status(404).send({ error: "At least one of these people must belong to this tree" });
    }

    try {
      const mergedPerson = await mergePeopleRecords({
        treeId,
        survivorPersonId,
        mergedAwayPersonId,
        performedByUserId: session.user.id,
        fieldResolutions,
      });

      return reply.send({
        mergedAwayPersonId,
        person: {
          ...mergedPerson,
          portraitUrl: mergedPerson.portraitMedia
            ? mediaUrl(mergedPerson.portraitMedia.objectKey)
            : null,
          birthPlaceResolved: serializePlace(mergedPerson.birthPlaceRef),
          deathPlaceResolved: serializePlace(mergedPerson.deathPlaceRef),
        },
      });
    } catch (error) {
      if (error instanceof PersonMergeError) {
        return reply.status(error.status).send({ error: error.message });
      }
      request.log.error({ err: error }, "Failed to merge people");
      return reply.status(500).send({ error: "Failed to merge people" });
    }
  });

  app.post("/api/trees/:treeId/scope/people", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (!canManageTreeScope(membership.role)) {
      return reply.status(403).send({ error: "Only founders and stewards can manage tree scope" });
    }

    const parsed = AddPersonToScopeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { personId } = parsed.data;
    const alreadyInScope = await isPersonInTreeScope(treeId, personId);
    if (alreadyInScope) {
      const existing = await getTreeScopedPerson(treeId, personId);
      return reply.status(200).send(existing);
    }

    const capacity = await checkTreeCanAdd(treeId, "person");
    if (!capacity.allowed) {
      return reply.status(capacity.status).send({ error: capacity.reason });
    }

    const person = await addPersonToTreeScope({
      treeId,
      personId,
      addedByUserId: session.user.id,
    });
    if (!person) {
      return reply.status(404).send({ error: "Person not found" });
    }

    const fullPerson = await getTreeScopedPerson(treeId, personId);
    return reply.status(201).send(fullPerson);
  });

  app.get("/api/trees/:treeId/scope/people", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const people = await getTreeScopedPeople(treeId);
    return reply.send(people);
  });

  app.patch("/api/trees/:treeId/scope/people/:personId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, personId } = request.params as {
      treeId: string;
      personId: string;
    };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (!canManageTreeScope(membership.role)) {
      return reply.status(403).send({ error: "Only founders and stewards can manage tree scope" });
    }

    const parsed = UpdateScopePersonBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }
    if (Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({ error: "No scope fields to update" });
    }

    const personInScope = await isPersonInTreeScope(treeId, personId);
    if (!personInScope) {
      return reply.status(404).send({ error: "Person not found" });
    }

    const updated = await upsertPersonTreeScope({
      treeId,
      personId,
      addedByUserId: session.user.id,
      displayNameOverride: parsed.data.displayNameOverride,
      visibilityDefault: parsed.data.visibilityDefault,
    });

    if (!updated) {
      return reply.status(404).send({ error: "Person not found" });
    }

    const fullPerson = await getTreeScopedPerson(treeId, personId);
    return reply.send(fullPerson);
  });

  app.delete("/api/trees/:treeId/scope/people/:personId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, personId } = request.params as {
      treeId: string;
      personId: string;
    };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (!canManageTreeScope(membership.role)) {
      return reply.status(403).send({ error: "Only founders and stewards can manage tree scope" });
    }

    const result = await removePersonFromTree(treeId, personId);
    if (!result) {
      return reply.status(404).send({ error: "Person not found" });
    }

    return reply.send({
      deleted: true,
      action: result.action,
      remainingScopeCount: result.remainingScopeCount,
      personId: result.personId,
    });
  });

  app.get("/api/people/:personId/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { personId } = request.params as { personId: string };

    const visibleTrees = await getVisibleTreesForPerson(personId, session.user.id);
    if (visibleTrees.length === 0) {
      return reply.status(404).send({ error: "Person not found" });
    }

    return reply.send(visibleTrees);
  });

  /**
   * GET /api/trees/:treeId/people/:personId/cross-tree
   *
   * Returns scope-based views of a person across other trees where the
   * requesting user also has membership. Uses `tree_person_scope` to
   * discover which trees include this person, then returns the scoped
   * profile and visible memories from each.
   *
   * The requesting user must be a member of treeId.
   * The personId must be in scope for treeId.
   */
  app.get(
    "/api/trees/:treeId/people/:personId/cross-tree",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, personId } = request.params as {
        treeId: string;
        personId: string;
      };

      const membership = await verifyMembership(treeId, session.user.id);
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      // Confirm the person belongs to this tree
      const personInScope = await isPersonInTreeScope(treeId, personId);
      if (!personInScope) {
        return reply.status(404).send({ error: "Person not found" });
      }

      const visibleTrees = await getVisibleTreesForPerson(personId, session.user.id);
      const scopeResults = await Promise.all(
        visibleTrees
          .filter((candidateTree) => candidateTree.id !== treeId)
          .map(async (candidateTree) => {
            const scopedPerson = await getTreeScopedPerson(candidateTree.id, personId);
            if (!scopedPerson) {
              return null;
            }

            const memories = await getTreeMemories(candidateTree.id, {
              personId,
              viewerUserId: session.user.id,
            });

            return {
              treeId: candidateTree.id,
              treeName: candidateTree.name,
              linkedPerson: {
                ...scopedPerson,
                portraitUrl: scopedPerson.portraitMedia
                  ? mediaUrl(scopedPerson.portraitMedia.objectKey)
                  : null,
              },
              memories: memories.map((memory) => ({
                ...memory,
                mediaUrl: memory.media ? mediaUrl(memory.media.objectKey) : null,
                mimeType: memory.media?.mimeType ?? null,
              })),
            };
          }),
      );

      return reply.send(scopeResults.filter((result) => result !== null));
    },
  );

  app.patch("/api/trees/:treeId/people/:personId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, personId } = request.params as {
      treeId: string;
      personId: string;
    };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const parsed = UpdatePersonBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: "No fields to update" });
    }

    if (updates.portraitMediaId) {
      const portraitMediaId = updates.portraitMediaId;
      const portraitMedia = await db.query.media.findFirst({
        where: (m, { and, eq }) =>
          and(eq(m.id, portraitMediaId), eq(m.treeId, treeId)),
      });
      if (!portraitMedia) {
        return reply.status(400).send({ error: "Portrait media not found in this tree" });
      }
    }

    if (updates.birthPlaceId) {
      const place = await validatePlaceId(updates.birthPlaceId, treeId);
      if (!place) {
        return reply.status(400).send({ error: "Birth place not found in this tree" });
      }
    }
    if (updates.deathPlaceId) {
      const place = await validatePlaceId(updates.deathPlaceId, treeId);
      if (!place) {
        return reply.status(400).send({ error: "Death place not found in this tree" });
      }
    }

    const personInScope = await isPersonInTreeScope(treeId, personId);
    if (!personInScope) {
      return reply.status(404).send({ error: "Person not found" });
    }

    const permission = await canEditPerson(session.user.id, personId);
    if (!permission.allowed) {
      return reply.status(403).send({ error: permission.reason });
    }

    const [updated] = await db
      .update(schema.people)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.people.id, personId))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Person not found" });

    const fullUpdated = await getTreeScopedPerson(treeId, personId);
    if (!fullUpdated) {
      return reply.status(404).send({ error: "Person not found after update" });
    }

    return reply.send({
      ...fullUpdated,
      portraitUrl: fullUpdated.portraitMedia
        ? mediaUrl(fullUpdated.portraitMedia.objectKey)
        : null,
      birthPlaceResolved: serializePlace(fullUpdated.birthPlaceRef),
      deathPlaceResolved: serializePlace(fullUpdated.deathPlaceRef),
    });
  });

  app.delete("/api/trees/:treeId/people/:personId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, personId } = request.params as {
      treeId: string;
      personId: string;
    };

    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (!canManageTreeScope(membership.role)) {
      return reply.status(403).send({ error: "Only founders and stewards can delete people from a tree" });
    }

    const result = await removePersonFromTree(treeId, personId);
    if (!result) {
      return reply.status(404).send({ error: "Person not found" });
    }

    return reply.status(200).send({
      deleted: true,
      action: result.action,
      remainingScopeCount: result.remainingScopeCount,
      personId: result.personId,
    });
  });
}
