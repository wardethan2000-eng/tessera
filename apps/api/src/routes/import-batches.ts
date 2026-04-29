import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@tessera/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import {
  extForMimeType,
  getPresignedUploadUrl,
  isAllowedMimeType,
  mediaUrl,
} from "../lib/storage.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";
import { createMemoryWithPrimaryTag } from "../lib/cross-tree-write-service.js";
import { enqueueMemoryTranscription } from "../lib/transcription.js";

const CreateBatchBody = z.object({
  label: z.string().min(1).max(200),
  defaultPersonId: z.string().uuid(),
});

const PresignItemsBody = z.object({
  items: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        sizeBytes: z.number().int().positive().max(200 * 1024 * 1024),
        lastModified: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(100),
});

const CompleteBatchBody = z.object({
  createMemories: z.boolean().default(true),
});

function canImport(role: string): boolean {
  return role === "founder" || role === "steward" || role === "contributor";
}

function deriveMemoryKind(contentType: string): "photo" | "voice" | "document" | "other" {
  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return "photo";
  }
  if (contentType.startsWith("audio/")) {
    return "voice";
  }
  if (
    contentType === "application/pdf" ||
    contentType.includes("word") ||
    contentType.includes("document")
  ) {
    return "document";
  }
  return "other";
}

function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return (withoutExtension || filename).slice(0, 200);
}

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (membership, { and, eq }) =>
      and(eq(membership.treeId, treeId), eq(membership.userId, userId)),
  });
}

async function verifyPersonInTreeScope(treeId: string, personId: string) {
  const person = await db.query.people.findFirst({
    where: (candidate, { eq }) => eq(candidate.id, personId),
    columns: { id: true, treeId: true },
  });
  if (!person) return false;
  if (person.treeId === treeId) return true;
  const scoped = await db.query.treePersonScope.findFirst({
    where: (scope, { and, eq }) =>
      and(eq(scope.treeId, treeId), eq(scope.personId, personId)),
    columns: { personId: true },
  });
  return Boolean(scoped);
}

async function verifyBatch(treeId: string, batchId: string) {
  return db.query.importBatches.findFirst({
    where: (batch, { and, eq }) =>
      and(eq(batch.id, batchId), eq(batch.treeId, treeId)),
  });
}

export async function importBatchesPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/trees/:treeId/import-batches", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });

    const batches = await db.query.importBatches.findMany({
      where: (batch, { eq }) => eq(batch.treeId, treeId),
      with: {
        defaultPerson: {
          columns: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: (batch, { desc }) => [desc(batch.createdAt)],
      limit: 30,
    });

    return reply.send({
      batches: batches.map((batch) => ({
        id: batch.id,
        label: batch.label,
        status: batch.status,
        totalItems: batch.totalItems,
        processedItems: batch.processedItems,
        failedItems: batch.failedItems,
        defaultPerson: batch.defaultPerson
          ? {
              id: batch.defaultPerson.id,
              name: batch.defaultPerson.displayName,
            }
          : null,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      })),
    });
  });

  app.get("/api/trees/:treeId/import-batches/:batchId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, batchId } = request.params as {
      treeId: string;
      batchId: string;
    };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });

    const batch = await db.query.importBatches.findFirst({
      where: (candidate, { and, eq }) =>
        and(eq(candidate.id, batchId), eq(candidate.treeId, treeId)),
      with: {
        defaultPerson: {
          columns: { id: true, displayName: true },
        },
        items: {
          with: {
            media: {
              columns: {
                objectKey: true,
                mimeType: true,
              },
            },
            memory: {
              columns: {
                id: true,
                title: true,
                kind: true,
                dateOfEventText: true,
                placeLabelOverride: true,
              },
            },
          },
          orderBy: (item, { desc }) => [desc(item.createdAt)],
        },
      },
    });

    if (!batch) return reply.status(404).send({ error: "Batch not found" });

    return reply.send({
      id: batch.id,
      label: batch.label,
      status: batch.status,
      totalItems: batch.totalItems,
      processedItems: batch.processedItems,
      failedItems: batch.failedItems,
      defaultPerson: batch.defaultPerson
        ? { id: batch.defaultPerson.id, name: batch.defaultPerson.displayName }
        : null,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      items: batch.items.map((item) => ({
        id: item.id,
        originalFilename: item.originalFilename,
        detectedMimeType: item.detectedMimeType,
        sizeBytes: item.sizeBytes,
        status: item.status,
        reviewState: item.reviewState,
        errorMessage: item.errorMessage,
        mediaUrl: item.media ? mediaUrl(item.media.objectKey) : null,
        memory: item.memory,
        createdAt: item.createdAt,
      })),
    });
  });

  app.post("/api/trees/:treeId/import-batches", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (!canImport(membership.role)) {
      return reply.status(403).send({ error: "Viewers cannot import memories" });
    }

    const parsed = CreateBatchBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const personInScope = await verifyPersonInTreeScope(
      treeId,
      parsed.data.defaultPersonId,
    );
    if (!personInScope) {
      return reply.status(400).send({ error: "Person not found in this tree" });
    }

    const [batch] = await db
      .insert(schema.importBatches)
      .values({
        treeId,
        createdByUserId: session.user.id,
        label: parsed.data.label,
        defaultPersonId: parsed.data.defaultPersonId,
      })
      .returning();

    if (!batch) return reply.status(500).send({ error: "Failed to create batch" });
    return reply.status(201).send(batch);
  });

  app.post(
    "/api/trees/:treeId/import-batches/:batchId/items/presign",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, batchId } = request.params as {
        treeId: string;
        batchId: string;
      };
      const membership = await verifyMembership(treeId, session.user.id);
      if (!membership) return reply.status(403).send({ error: "Not a member" });
      if (!canImport(membership.role)) {
        return reply.status(403).send({ error: "Viewers cannot import memories" });
      }

      const batch = await verifyBatch(treeId, batchId);
      if (!batch) return reply.status(404).send({ error: "Batch not found" });

      const parsed = PresignItemsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const prepared: Array<{
        itemId: string;
        mediaId: string;
        uploadUrl: string;
        objectKey: string;
        filename: string;
      }> = [];

      for (const item of parsed.data.items) {
        if (!isAllowedMimeType(item.contentType)) {
          return reply.status(415).send({
            error: `Unsupported media type for ${item.filename}`,
          });
        }
        const capacity = await checkTreeCanAdd(treeId, "media", item.sizeBytes);
        if (!capacity.allowed) {
          return reply.status(capacity.status).send({ error: capacity.reason });
        }
      }

      for (const item of parsed.data.items) {
        const ext = extForMimeType(item.contentType);
        const objectKey = `trees/${treeId}/imports/${batchId}/${randomUUID()}.${ext}`;
        const uploadUrl = await getPresignedUploadUrl(objectKey, item.contentType);

        const [mediaRecord] = await db
          .insert(schema.media)
          .values({
            treeId,
            contributingTreeId: treeId,
            uploadedByUserId: session.user.id,
            objectKey,
            originalFilename: item.filename,
            mimeType: item.contentType,
            sizeBytes: item.sizeBytes,
            storageProvider: "minio",
          })
          .returning();

        if (!mediaRecord) {
          return reply.status(500).send({ error: "Failed to create media record" });
        }

        const [batchItem] = await db
          .insert(schema.importBatchItems)
          .values({
            batchId,
            treeId,
            mediaId: mediaRecord.id,
            originalFilename: item.filename,
            detectedMimeType: item.contentType,
            sizeBytes: item.sizeBytes,
            capturedAt: item.lastModified ? new Date(item.lastModified) : null,
            metadata: item.lastModified
              ? { lastModified: new Date(item.lastModified).toISOString() }
              : null,
          })
          .returning();

        if (!batchItem) {
          return reply.status(500).send({ error: "Failed to create batch item" });
        }

        prepared.push({
          itemId: batchItem.id,
          mediaId: mediaRecord.id,
          uploadUrl,
          objectKey,
          filename: item.filename,
        });
      }

      await db
        .update(schema.importBatches)
        .set({
          totalItems: sql`${schema.importBatches.totalItems} + ${prepared.length}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.importBatches.id, batchId));

      return reply.status(201).send({ items: prepared });
    },
  );

  app.post(
    "/api/trees/:treeId/import-batches/:batchId/complete",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, batchId } = request.params as {
        treeId: string;
        batchId: string;
      };
      const membership = await verifyMembership(treeId, session.user.id);
      if (!membership) return reply.status(403).send({ error: "Not a member" });
      if (!canImport(membership.role)) {
        return reply.status(403).send({ error: "Viewers cannot import memories" });
      }

      const parsed = CompleteBatchBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const batch = await verifyBatch(treeId, batchId);
      if (!batch) return reply.status(404).send({ error: "Batch not found" });
      if (!batch.defaultPersonId) {
        return reply.status(400).send({
          error: "This import needs a default person before memories can be created",
        });
      }

      const items = await db.query.importBatchItems.findMany({
        where: (item, { and, eq, isNull }) =>
          and(
            eq(item.batchId, batchId),
            eq(item.treeId, treeId),
            eq(item.status, "uploaded"),
            isNull(item.memoryId),
          ),
        with: {
          media: true,
        },
      });

      if (!parsed.data.createMemories || items.length === 0) {
        await db
          .update(schema.importBatches)
          .set({ status: "needs_review", updatedAt: new Date() })
          .where(eq(schema.importBatches.id, batchId));
        return reply.send({ created: 0, failed: 0 });
      }

      let created = 0;
      let failed = 0;
      const voiceMemoryIds: string[] = [];

      for (const item of items) {
        if (!item.media) {
          failed += 1;
          await db
            .update(schema.importBatchItems)
            .set({
              status: "failed",
              reviewState: "needs_review",
              errorMessage: "Media record missing",
              updatedAt: new Date(),
            })
            .where(eq(schema.importBatchItems.id, item.id));
          continue;
        }

        try {
          const kind = deriveMemoryKind(item.media.mimeType);
          const memory = await db.transaction(async (tx) => {
            const createdMemory = await createMemoryWithPrimaryTag(tx, {
              treeId,
              primaryPersonId: batch.defaultPersonId!,
              contributorUserId: session.user.id,
              kind,
              title: titleFromFilename(item.originalFilename),
              body: undefined,
              mediaId: item.mediaId,
              mediaIds: item.mediaId ? [item.mediaId] : [],
            });
            await tx
              .update(schema.memories)
              .set({
                sourceBatchId: batchId,
                sourceFilename: item.originalFilename,
              })
              .where(eq(schema.memories.id, createdMemory.id));
            await tx
              .update(schema.importBatchItems)
              .set({
                memoryId: createdMemory.id,
                status: "imported",
                reviewState: "needs_date",
                updatedAt: new Date(),
              })
              .where(eq(schema.importBatchItems.id, item.id));
            return createdMemory;
          });
          if (kind === "voice") voiceMemoryIds.push(memory.id);
          created += 1;
        } catch (error) {
          failed += 1;
          request.log.error({ error, itemId: item.id }, "Import item failed");
          await db
            .update(schema.importBatchItems)
            .set({
              status: "failed",
              reviewState: "needs_review",
              errorMessage: "Could not create memory",
              updatedAt: new Date(),
            })
            .where(eq(schema.importBatchItems.id, item.id));
        }
      }

      for (const memoryId of voiceMemoryIds) {
        await enqueueMemoryTranscription(memoryId, treeId);
      }

      await db
        .update(schema.importBatches)
        .set({
          status: failed > 0 ? "needs_review" : "completed",
          processedItems: sql`${schema.importBatches.processedItems} + ${created}`,
          failedItems: sql`${schema.importBatches.failedItems} + ${failed}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.importBatches.id, batchId));

      return reply.send({ created, failed });
    },
  );
}
