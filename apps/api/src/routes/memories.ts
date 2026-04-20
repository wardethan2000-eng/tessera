import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import * as schema from "@familytree/database";
import {
  canManageTreeScope,
  getResolvedMemoryVisibilitiesForTree,
} from "../lib/cross-tree-permission-service.js";
import {
  getTreeMemories,
  isMemoryInTreeScope,
  isPersonInTreeScope,
} from "../lib/cross-tree-read-service.js";
import { createMemoryWithPrimaryTag } from "../lib/cross-tree-write-service.js";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";
import { enqueueMemoryTranscription } from "../lib/transcription.js";

const CreateMemoryBody = z.object({
  kind: z.enum(["story", "photo", "voice", "document", "other"]),
  title: z.string().min(1).max(200),
  body: z.string().optional(),
  mediaId: z.string().uuid().optional(),
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
      if (kind === "photo" && !mediaId) {
        return reply.status(400).send({ error: "Photo memories require a mediaId" });
      }
      if (kind === "voice" && !mediaId) {
        return reply.status(400).send({ error: "Voice memories require a mediaId" });
      }
      if (kind === "document" && !mediaId) {
        return reply.status(400).send({ error: "Document memories require a mediaId" });
      }

      const personInScope = await isPersonInTreeScope(treeId, personId);
      if (!personInScope) {
        return reply.status(404).send({ error: "Person not found in this tree" });
      }

      if (mediaId) {
        const mediaRecord = await db.query.media.findFirst({
          where: (m) => and(eq(m.id, mediaId), eq(m.treeId, treeId)),
        });
        if (!mediaRecord) {
          return reply.status(400).send({ error: "Media not found in this tree" });
        }
      }

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
          mediaId,
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
          place: true,
          personTags: {
            with: {
              person: true,
            },
          },
          reachRules: true,
        },
      });

      const withUrl =
        full?.media
          ? {
              ...full,
              mediaUrl: mediaUrl(full.media.objectKey),
              mimeType: full.media.mimeType,
              place: serializePlace(full.place),
            }
          : full
            ? { ...full, place: serializePlace(full.place) }
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
          mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
          mimeType: m.media?.mimeType ?? null,
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
        mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
        mimeType: m.media?.mimeType ?? null,
        personName: m.primaryPerson?.displayName ?? null,
        personPortraitUrl: m.primaryPerson?.portraitMedia
          ? mediaUrl(m.primaryPerson.portraitMedia.objectKey)
          : null,
        place: serializePlace(m.place),
        ...serializeTreeVisibility(visibilityById.get(m.id)),
      })),
    );
  });

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

      const PatchMemoryBody = z.object({
        title: z.string().min(1).max(200).optional(),
        dateOfEventText: z.string().max(100).nullable().optional(),
        placeLabelOverride: z.string().max(200).nullable().optional(),
      });

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
