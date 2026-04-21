import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import * as schema from "@familytree/database";
import {
  canManageTreeScope,
  getResolvedMemoryVisibilitiesForTree,
} from "../lib/cross-tree-permission-service.js";
import {
  getTreeScopedPersonByLinkedUserId,
  getTreeMemories,
  isMemoryInTreeScope,
  isPersonInTreeScope,
} from "../lib/cross-tree-read-service.js";
import { createMemoryWithPrimaryTag } from "../lib/cross-tree-write-service.js";
import { db } from "../lib/db.js";
import { normalizeLinkedMedia } from "../lib/linked-media.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";
import { enqueueMemoryTranscription } from "../lib/transcription.js";

const CreateMemoryBody = z.object({
  kind: z.enum(["story", "photo", "voice", "document", "other"]),
  title: z.string().min(1).max(200),
  body: z.string().optional(),
  mediaId: z.string().uuid().optional(),
  mediaIds: z.array(z.string().uuid()).max(24).optional(),
  linkedMedia: z
    .object({
      provider: z.literal("google_drive"),
      url: z.string().url().max(2000),
      label: z.string().max(255).optional(),
    })
    .optional(),
  dateOfEventText: z.string().max(100).optional(),
  placeId: z.string().uuid().optional(),
  placeLabelOverride: z.string().max(200).optional(),
  promptId: z.string().uuid().optional(),
  taggedPersonIds: z.array(z.string().uuid()).max(24).optional(),
  reach: z
    .array(
      z.object({
        kind: z.enum(["immediate_family", "ancestors", "descendants", "whole_tree"]),
        seedPersonId: z.string().uuid().optional(),
        scopeTreeId: z.string().uuid().optional(),
      }),
    )
    .max(12)
    .optional(),
});

const UpdateMemoryVisibilityBody = z.object({
  visibilityOverride: z
    .enum(["all_members", "family_circle", "named_circle", "hidden"])
    .nullable(),
  unlockDate: z.string().datetime().nullable().optional(),
});

const PatchMemoryBody = z.object({
  title: z.string().min(1).max(200).optional(),
  dateOfEventText: z.string().max(100).nullable().optional(),
  placeLabelOverride: z.string().max(200).nullable().optional(),
});

const CreateMemoryPerspectiveBody = z.object({
  body: z.string().trim().min(1).max(8000),
});

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

function serializePerspective(perspective: {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  contributor: {
    id: string;
    name: string;
    email: string;
  } | null;
  contributorPerson?: {
    id: string;
    displayName: string;
    portraitMedia?: {
      objectKey: string;
    } | null;
  } | null;
}) {
  return {
    id: perspective.id,
    body: perspective.body,
    createdAt: perspective.createdAt.toISOString(),
    updatedAt: perspective.updatedAt.toISOString(),
    contributor: perspective.contributor
      ? {
          id: perspective.contributor.id,
          name: perspective.contributor.name,
          email: perspective.contributor.email,
        }
      : null,
    contributorPerson: perspective.contributorPerson
      ? {
          id: perspective.contributorPerson.id,
          displayName: perspective.contributorPerson.displayName,
          portraitUrl: perspective.contributorPerson.portraitMedia
            ? mediaUrl(perspective.contributorPerson.portraitMedia.objectKey)
            : null,
        }
      : null,
  };
}

function serializeLinkedMemory(memory: {
  media?: { objectKey: string; mimeType: string } | null;
  mediaItems?: Array<{
    id: string;
    sortOrder: number;
    mediaId: string | null;
    media: {
      objectKey: string;
      mimeType: string;
    } | null;
    linkedMediaProvider: "google_drive" | null;
    linkedMediaOpenUrl: string | null;
    linkedMediaSourceUrl: string | null;
    linkedMediaPreviewUrl: string | null;
    linkedMediaLabel: string | null;
  }>;
  linkedMediaProvider: "google_drive" | null;
  linkedMediaOpenUrl: string | null;
  linkedMediaSourceUrl: string | null;
  linkedMediaPreviewUrl: string | null;
  linkedMediaLabel: string | null;
}) {
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
            mediaUrl: memory.media
              ? mediaUrl(memory.media.objectKey)
              : memory.linkedMediaPreviewUrl ?? null,
            mimeType: memory.media?.mimeType ?? null,
            linkedMediaProvider: memory.linkedMediaProvider,
            linkedMediaOpenUrl: memory.linkedMediaOpenUrl,
            linkedMediaSourceUrl: memory.linkedMediaSourceUrl,
            linkedMediaLabel: memory.linkedMediaLabel,
          },
        ].filter((item) => item.mediaUrl || item.linkedMediaOpenUrl);
  const primaryItem = mediaItems[0] ?? null;

  return {
    mediaUrl: primaryItem?.mediaUrl ?? null,
    mimeType: primaryItem?.mimeType ?? null,
    linkedMediaProvider: primaryItem?.linkedMediaProvider ?? null,
    linkedMediaOpenUrl: primaryItem?.linkedMediaOpenUrl ?? null,
    linkedMediaSourceUrl: primaryItem?.linkedMediaSourceUrl ?? null,
    linkedMediaLabel: primaryItem?.linkedMediaLabel ?? null,
    mediaItems,
  };
}

function serializeRelatedMemory(memory: {
  id: string;
  kind: "story" | "photo" | "voice" | "document" | "other";
  title: string;
  body: string | null;
  transcriptText?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText: string | null;
  media?: { objectKey: string; mimeType: string } | null;
  linkedMediaProvider: "google_drive" | null;
  linkedMediaOpenUrl: string | null;
  linkedMediaSourceUrl: string | null;
  linkedMediaPreviewUrl: string | null;
  linkedMediaLabel: string | null;
  mediaItems?: Array<{
    id: string;
    sortOrder: number;
    mediaId: string | null;
    media: { objectKey: string; mimeType: string } | null;
    linkedMediaProvider: "google_drive" | null;
    linkedMediaOpenUrl: string | null;
    linkedMediaSourceUrl: string | null;
    linkedMediaPreviewUrl: string | null;
    linkedMediaLabel: string | null;
  }>;
  primaryPerson?: {
    id: string;
    displayName: string;
    portraitMedia?: { objectKey: string } | null;
  } | null;
}) {
  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    transcriptText: memory.transcriptText ?? null,
    transcriptStatus: memory.transcriptStatus ?? "none",
    transcriptError: memory.transcriptError ?? null,
    dateOfEventText: memory.dateOfEventText,
    ...serializeLinkedMemory(memory),
    primaryPerson: memory.primaryPerson
      ? {
          id: memory.primaryPerson.id,
          displayName: memory.primaryPerson.displayName,
          portraitUrl: memory.primaryPerson.portraitMedia
            ? mediaUrl(memory.primaryPerson.portraitMedia.objectKey)
            : null,
        }
      : null,
  };
}

export async function memoriesPlugin(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/trees/:treeId/people/:personId/memories",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, personId } = request.params as {
        treeId: string;
        personId: string;
      };

      const membership = await db.query.treeMemberships.findFirst({
        where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const parsed = CreateMemoryBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const {
        kind,
        title,
        body,
        mediaId,
        mediaIds,
        linkedMedia,
        dateOfEventText,
        placeId,
        placeLabelOverride,
        promptId,
        taggedPersonIds,
        reach,
      } = parsed.data;

      if (kind === "story" && !body) {
        return reply.status(400).send({ error: "Story memories require a body" });
      }
      if ((mediaId || mediaIds?.length) && linkedMedia) {
        return reply.status(400).send({
          error: "Use either an uploaded file or linked media, not both.",
        });
      }
      if (mediaId && mediaIds?.length) {
        return reply.status(400).send({
          error: "Use mediaIds for multiple uploads or mediaId for a single upload, not both.",
        });
      }
      if (linkedMedia && kind === "voice") {
        return reply.status(400).send({
          error: "Voice memories do not support linked media yet.",
        });
      }
      if (kind === "photo" && !mediaId && !mediaIds?.length && !linkedMedia) {
        return reply.status(400).send({
          error: "Photo memories require uploaded media or linked media.",
        });
      }
      if (kind === "voice" && !mediaId && !mediaIds?.length) {
        return reply.status(400).send({ error: "Voice memories require uploaded media" });
      }
      if (kind === "voice" && (mediaIds?.length ?? 0) > 1) {
        return reply.status(400).send({ error: "Voice memories support only one media item" });
      }
      if (kind === "document" && !mediaId && !mediaIds?.length && !linkedMedia) {
        return reply.status(400).send({
          error: "Document memories require uploaded media or linked media.",
        });
      }

      const personInScope = await isPersonInTreeScope(treeId, personId);
      if (!personInScope) {
        return reply.status(404).send({ error: "Person not found in this tree" });
      }

      const resolvedMediaIds = mediaIds?.length ? mediaIds : mediaId ? [mediaId] : [];
      if (resolvedMediaIds.length > 0) {
        for (const resolvedMediaId of resolvedMediaIds) {
          const mediaRecord = await db.query.media.findFirst({
            where: (m) => and(eq(m.id, resolvedMediaId), eq(m.treeId, treeId)),
          });
          if (!mediaRecord) {
            return reply.status(400).send({ error: "Media not found in this tree" });
          }
        }
      }

      const normalizedLinkedMedia = linkedMedia
        ? normalizeLinkedMedia(linkedMedia)
        : null;

      if (placeId) {
        const place = await db.query.places.findFirst({
          where: (p) => and(eq(p.id, placeId), eq(p.treeId, treeId)),
        });
        if (!place) {
          return reply.status(400).send({ error: "Place not found in this tree" });
        }
      }

      if (promptId) {
        const prompt = await db.query.prompts.findFirst({
          where: (p) => and(eq(p.id, promptId), eq(p.treeId, treeId)),
        });
        if (!prompt) {
          return reply.status(400).send({ error: "Prompt not found in this tree" });
        }
        if (prompt.toPersonId !== personId) {
          return reply.status(400).send({
            error: "Prompt does not target this person",
          });
        }
      }

      if (taggedPersonIds?.length) {
        for (const taggedPersonId of taggedPersonIds) {
          const taggedPersonInScope = await isPersonInTreeScope(treeId, taggedPersonId);
          if (!taggedPersonInScope) {
            return reply.status(400).send({
              error: "Tagged people must be in this tree",
            });
          }
        }
      }

      if (reach?.length) {
        for (const rule of reach) {
          if (rule.kind === "whole_tree") {
            if (rule.scopeTreeId && rule.scopeTreeId !== treeId) {
              return reply.status(400).send({
                error: "Whole-tree reach must target the current tree",
              });
            }
            continue;
          }

          if (!rule.seedPersonId) {
            return reply.status(400).send({
              error: "Lineage reach rules require a seed person",
            });
          }

          const seedPersonInScope = await isPersonInTreeScope(treeId, rule.seedPersonId);
          if (!seedPersonInScope) {
            return reply.status(400).send({
              error: "Reach-rule seed people must be in this tree",
            });
          }
        }
      }

      const memory = await db.transaction((tx) =>
        createMemoryWithPrimaryTag(tx, {
          treeId,
          primaryPersonId: personId,
          contributorUserId: session.user.id,
          kind,
          title,
          body,
          mediaId: resolvedMediaIds[0] ?? null,
          mediaIds: resolvedMediaIds,
          linkedMedia: normalizedLinkedMedia,
          promptId,
          dateOfEventText,
          placeId,
          placeLabelOverride,
          taggedPersonIds,
          reachRules: reach?.map((rule) => ({
            kind: rule.kind,
            seedPersonId: rule.seedPersonId ?? null,
            scopeTreeId: rule.kind === "whole_tree" ? treeId : rule.scopeTreeId ?? null,
          })),
        }),
      );

      if (!memory) {
        return reply.status(500).send({ error: "Failed to create memory" });
      }

      if (kind === "voice") {
        await enqueueMemoryTranscription(memory.id, treeId);
      }

      // Fetch with media for the response
      const full = await db.query.memories.findFirst({
        where: (m, { eq }) => eq(m.id, memory.id),
        with: {
          media: true,
          mediaItems: {
            with: {
              media: true,
            },
            orderBy: (memoryMediaItem, { asc }) => [asc(memoryMediaItem.sortOrder)],
          },
          place: true,
          personTags: {
            with: {
              person: true,
            },
          },
          reachRules: true,
        },
      });

      const withUrl = full
        ? {
            ...full,
            ...serializeLinkedMemory(full),
            place: serializePlace(full.place),
          }
        : full;

      const [visibility] = await getResolvedMemoryVisibilitiesForTree(treeId, [memory.id]);

      return reply.status(201).send({
        ...withUrl,
        ...serializeTreeVisibility(visibility),
      });
    },
  );

  app.get(
    "/api/trees/:treeId/people/:personId/memories",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, personId } = request.params as {
        treeId: string;
        personId: string;
      };

      const membership = await db.query.treeMemberships.findFirst({
        where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const personInScope = await isPersonInTreeScope(treeId, personId);
      if (!personInScope) {
        return reply.status(404).send({ error: "Person not found in this tree" });
      }

      const memories = await getTreeMemories(treeId, {
        personId,
        viewerUserId: session.user.id,
      });
      const visibilities = await getResolvedMemoryVisibilitiesForTree(
        treeId,
        memories.map((memory) => memory.id),
      );
      const visibilityById = new Map(
        visibilities.map((visibility) => [visibility.memoryId, visibility]),
      );

      return reply.send(
        memories.map((m) => ({
          ...m,
          ...serializeLinkedMemory(m),
          place: serializePlace(m.place),
          ...serializeTreeVisibility(visibilityById.get(m.id)),
        })),
      );
    },
  );

  /** GET /api/trees/:treeId/memories — all memories for a tree (Atrium + Search) */
  app.get("/api/trees/:treeId/memories", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const memories = await getTreeMemories(treeId, {
      limit: 200,
      viewerUserId: session.user.id,
    });
    const visibilities = await getResolvedMemoryVisibilitiesForTree(
      treeId,
      memories.map((memory) => memory.id),
    );
    const visibilityById = new Map(
      visibilities.map((visibility) => [visibility.memoryId, visibility]),
    );

    return reply.send(
      memories.map((m) => ({
        ...m,
        ...serializeLinkedMemory(m),
        personName: m.primaryPerson?.displayName ?? null,
        personPortraitUrl: m.primaryPerson?.portraitMedia
          ? mediaUrl(m.primaryPerson.portraitMedia.objectKey)
          : null,
        place: serializePlace(m.place),
        ...serializeTreeVisibility(visibilityById.get(m.id)),
      })),
    );
  });

  app.get("/api/trees/:treeId/memories/:memoryId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, memoryId } = request.params as {
      treeId: string;
      memoryId: string;
    };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const inScope = await isMemoryInTreeScope(treeId, memoryId);
    if (!inScope) {
      return reply.status(404).send({ error: "Memory not found in this tree" });
    }

    const treeMemories = await getTreeMemories(treeId, {
      viewerUserId: session.user.id,
    });
    const memory = treeMemories.find((candidate) => candidate.id === memoryId);
    if (!memory) {
      return reply.status(404).send({ error: "Memory not found in this tree" });
    }

    const detailedMemory = await db.query.memories.findFirst({
      where: (candidate, { eq }) => eq(candidate.id, memoryId),
      with: {
        contributor: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        prompt: {
          with: {
            fromUser: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
            toPerson: {
              columns: {
                id: true,
                displayName: true,
              },
            },
          },
        },
        perspectives: {
          with: {
            contributor: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
            contributorPerson: {
              columns: {
                id: true,
                displayName: true,
              },
              with: {
                portraitMedia: {
                  columns: {
                    objectKey: true,
                  },
                },
              },
            },
          },
          orderBy: (perspective, { asc: orderAsc }) => [orderAsc(perspective.createdAt)],
        },
      },
    });
    if (!detailedMemory) {
      return reply.status(404).send({ error: "Memory not found in this tree" });
    }

    const [visibility] = await getResolvedMemoryVisibilitiesForTree(treeId, [memoryId]);
    const uniqueDirectSubjectIds = [...new Set(memory.personTags.map((tag) => tag.personId))];
    const reachSeedPersonIds = [
      ...new Set(
        memory.reachRules
          .map((rule) => rule.seedPersonId)
          .filter((seedPersonId): seedPersonId is string => Boolean(seedPersonId)),
      ),
    ];

    const [directSubjectScopeChecks, primaryPersonInScope, seedPeople] = await Promise.all([
      Promise.all(
        uniqueDirectSubjectIds.map(async (personId) => ({
          personId,
          inScope: await isPersonInTreeScope(treeId, personId),
        })),
      ),
      isPersonInTreeScope(treeId, memory.primaryPersonId),
      reachSeedPersonIds.length > 0
        ? db.query.people.findMany({
            where: (person, operators) =>
              and(
                eq(person.treeId, treeId),
                operators.inArray(person.id, reachSeedPersonIds),
              ),
            columns: {
              id: true,
              displayName: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const directSubjectIdSet = new Set(
      directSubjectScopeChecks
        .filter((result) => result.inScope)
        .map((result) => result.personId),
    );
    const directSubjectIds = [...directSubjectIdSet];
    const seedPersonNameById = new Map(
      seedPeople.map((person) => [person.id, person.displayName]),
    );
    const directSubjects = memory.personTags
      .filter((tag) => directSubjectIdSet.has(tag.personId))
      .reduce<Array<{ id: string; displayName: string }>>((acc, tag) => {
        if (!acc.some((person) => person.id === tag.personId)) {
          acc.push({
            id: tag.person.id,
            displayName: tag.person.displayName,
          });
        }
        return acc;
      }, []);
    const relatedMemories = treeMemories
      .filter((candidate) => candidate.id !== memory.id)
      .map((candidate) => {
        const sharedDirectSubjects = candidate.personTags.filter((tag) =>
          directSubjectIdSet.has(tag.personId),
        ).length;
        const samePrompt = Boolean(
          detailedMemory.promptId && candidate.promptId === detailedMemory.promptId,
        );
        const sameAnchor = candidate.primaryPersonId === memory.primaryPersonId;
        const score =
          (samePrompt ? 100 : 0) +
          sharedDirectSubjects * 10 +
          (sameAnchor ? 5 : 0);

        return {
          candidate,
          score,
        };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 4)
      .map(({ candidate }) => serializeRelatedMemory(candidate));

    return reply.send({
      ...memory,
      ...serializeLinkedMemory(memory),
      place: serializePlace(memory.place),
      primaryPerson:
        primaryPersonInScope && memory.primaryPerson
          ? {
              id: memory.primaryPerson.id,
              displayName: memory.primaryPerson.displayName,
              portraitUrl: memory.primaryPerson.portraitMedia
                ? mediaUrl(memory.primaryPerson.portraitMedia.objectKey)
                : null,
            }
          : null,
      directSubjects,
      reachRules: memory.reachRules.map((rule) => ({
        kind: rule.kind,
        seedPersonId: rule.seedPersonId,
        seedPersonName: rule.seedPersonId
          ? (seedPersonNameById.get(rule.seedPersonId) ?? null)
          : null,
        scopeTreeId: rule.scopeTreeId,
      })),
      contributor: detailedMemory.contributor
        ? {
            id: detailedMemory.contributor.id,
            name: detailedMemory.contributor.name,
            email: detailedMemory.contributor.email,
          }
        : null,
      prompt: detailedMemory.prompt
        ? {
            id: detailedMemory.prompt.id,
            questionText: detailedMemory.prompt.questionText,
            status: detailedMemory.prompt.status,
            fromUserName:
              detailedMemory.prompt.fromUser?.name ??
              detailedMemory.prompt.fromUser?.email ??
              null,
            toPerson: detailedMemory.prompt.toPerson
              ? {
                  id: detailedMemory.prompt.toPerson.id,
                  displayName: detailedMemory.prompt.toPerson.displayName,
                }
              : null,
          }
        : null,
      perspectives: detailedMemory.perspectives.map((perspective) =>
        serializePerspective(perspective),
      ),
      perspectiveSummary: {
        totalCount: detailedMemory.perspectives.length,
      },
      relatedMemories,
      relatedMemorySummary: {
        directSubjectCount: directSubjectIds.length,
        hasPromptThread: Boolean(detailedMemory.promptId),
      },
      viewerCanAddPerspective: true,
      viewerCanManageVisibility: canManageTreeScope(membership.role),
      ...serializeTreeVisibility(visibility),
    });
  });

  app.post(
    "/api/trees/:treeId/memories/:memoryId/perspectives",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, memoryId } = request.params as {
        treeId: string;
        memoryId: string;
      };

      const membership = await db.query.treeMemberships.findFirst({
        where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const parsed = CreateMemoryPerspectiveBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const inScope = await isMemoryInTreeScope(treeId, memoryId);
      if (!inScope) {
        return reply.status(404).send({ error: "Memory not found in this tree" });
      }

      const linkedContributorPerson = await getTreeScopedPersonByLinkedUserId(
        treeId,
        session.user.id,
      );
      const [createdPerspective] = await db
        .insert(schema.memoryPerspectives)
        .values({
          memoryId,
          treeId,
          contributorUserId: session.user.id,
          contributorPersonId: linkedContributorPerson?.id ?? null,
          body: parsed.data.body,
        })
        .returning({ id: schema.memoryPerspectives.id });

      if (!createdPerspective) {
        return reply.status(500).send({ error: "Failed to add perspective" });
      }

      const perspective = await db.query.memoryPerspectives.findFirst({
        where: (candidate, { eq }) => eq(candidate.id, createdPerspective.id),
        with: {
          contributor: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
          contributorPerson: {
            columns: {
              id: true,
              displayName: true,
            },
            with: {
              portraitMedia: {
                columns: {
                  objectKey: true,
                },
              },
            },
          },
        },
      });

      if (!perspective) {
        return reply.status(500).send({ error: "Failed to load perspective" });
      }

      return reply.status(201).send(serializePerspective(perspective));
    },
  );

  app.patch(
    "/api/trees/:treeId/memories/:memoryId/visibility",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, memoryId } = request.params as {
        treeId: string;
        memoryId: string;
      };

      const membership = await db.query.treeMemberships.findFirst({
        where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }
      if (!canManageTreeScope(membership.role)) {
        return reply.status(403).send({ error: "Only founders and stewards can manage visibility" });
      }

      const parsed = UpdateMemoryVisibilityBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const inScope = await isMemoryInTreeScope(treeId, memoryId);
      if (!inScope) {
        return reply.status(404).send({ error: "Memory not found in this tree" });
      }

      if (parsed.data.visibilityOverride === null) {
        await db
          .delete(schema.memoryTreeVisibility)
          .where(
            and(
              eq(schema.memoryTreeVisibility.treeId, treeId),
              eq(schema.memoryTreeVisibility.memoryId, memoryId),
            ),
          );

        return reply.send({ cleared: true, treeId, memoryId });
      }

      const unlockDate = parsed.data.unlockDate
        ? new Date(parsed.data.unlockDate)
        : null;

      const [updated] = await db
        .insert(schema.memoryTreeVisibility)
        .values({
          treeId,
          memoryId,
          visibilityOverride: parsed.data.visibilityOverride,
          unlockDate,
        })
        .onConflictDoUpdate({
          target: [
            schema.memoryTreeVisibility.memoryId,
            schema.memoryTreeVisibility.treeId,
          ],
          set: {
            visibilityOverride: parsed.data.visibilityOverride,
            unlockDate,
          },
        })
        .returning();

      return reply.send(updated);
    },
  );

  app.patch(
    "/api/trees/:treeId/memories/:memoryId",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, memoryId } = request.params as {
        treeId: string;
        memoryId: string;
      };

      const membership = await db.query.treeMemberships.findFirst({
        where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }
      if (membership.role === "viewer") {
        return reply.status(403).send({ error: "Viewers cannot edit memories" });
      }

      const parsed = PatchMemoryBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const inScope = await isMemoryInTreeScope(treeId, memoryId);
      if (!inScope) {
        return reply.status(404).send({ error: "Memory not found in this tree" });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (parsed.data.title !== undefined) updates.title = parsed.data.title;
      if (parsed.data.dateOfEventText !== undefined) {
        updates.dateOfEventText = parsed.data.dateOfEventText;
      }
      if (parsed.data.placeLabelOverride !== undefined) {
        updates.placeLabelOverride = parsed.data.placeLabelOverride;
      }

      const [updated] = await db
        .update(schema.memories)
        .set(updates)
        .where(eq(schema.memories.id, memoryId))
        .returning();

      return reply.send(updated);
    },
  );
}
