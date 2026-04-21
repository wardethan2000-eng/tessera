import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import {
  contentDisposition,
  getPresignedUploadUrl,
  isAllowedMimeType,
  MEDIA_BUCKET,
  s3,
} from "../lib/storage.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";

const PresignBody = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(200 * 1024 * 1024), // 200 MB cap
});

const GetMediaQuery = z.object({
  key: z.string().min(1),
});

export async function mediaPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/media", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const parsed = GetMediaQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query parameters" });
    }

    const mediaRecord = await db.query.media.findFirst({
      where: (m, { eq }) => eq(m.objectKey, parsed.data.key),
    });
    if (!mediaRecord) return reply.status(404).send({ error: "Media not found" });

    // ── Access check ────────────────────────────────────────────────────────────
    // Path 1: user is a direct member of the tree that owns the media.
    const directMembership = await db.query.treeMemberships.findFirst({
      where: (m) =>
        and(eq(m.treeId, mediaRecord.treeId), eq(m.userId, session.user.id)),
    });

    if (!directMembership) {
      // Path 2: cross-tree access.
      // Requirements:
      //   (a) user is a member of some OTHER tree
      //   (b) that other tree has an ACTIVE connection with the media's tree
      //   (c) the media belongs to a memory whose primaryPerson has a
      //       crossTreePersonLink within that active connection
      const allowed = await checkCrossTreeAccess(mediaRecord, session.user.id);
      if (!allowed) {
        return reply.status(403).send({ error: "Access denied" });
      }
    }
    // ────────────────────────────────────────────────────────────────────────────

    const rangeHeader = (request.headers as Record<string, string | undefined>).range;

    try {
      const command = new GetObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: mediaRecord.objectKey,
        // Forward Range header to S3/MinIO so video seeks work natively
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      });
      const object = await s3.send(command);

      if (!object.Body) {
        return reply.status(404).send({ error: "Media body not found" });
      }

      // Security: only serve types we accepted at upload time
      const mimeType = mediaRecord.mimeType;
      reply.header("Content-Type", mimeType);
      reply.header(
        "Content-Disposition",
        contentDisposition(mimeType, mediaRecord.originalFilename ?? parsed.data.key),
      );

      // Performance: cache media client-side; pair with ETag for revalidation
      reply.header("Cache-Control", "private, max-age=3600");
      reply.header("Accept-Ranges", "bytes");

      if (object.ContentLength != null) {
        reply.header("Content-Length", String(object.ContentLength));
      } else if (typeof mediaRecord.sizeBytes === "number" && !rangeHeader) {
        reply.header("Content-Length", String(mediaRecord.sizeBytes));
      }
      if (object.ETag) reply.header("ETag", object.ETag);
      if (object.LastModified) {
        reply.header("Last-Modified", object.LastModified.toUTCString());
      }
      if (object.ContentRange) {
        reply.header("Content-Range", object.ContentRange);
      }

      // Return 206 Partial Content when the upstream returned a range response
      const statusCode = object.ContentRange ? 206 : 200;
      reply.status(statusCode);

      // AWS SDK v3 returns a WHATWG ReadableStream in some environments but a
      // Node.js Readable (IncomingMessage) when talking to MinIO over HTTP.
      // Handle both by checking for the Node.js Readable interface first.
      const body = object.Body;
      const isNodeReadable =
        typeof (body as { pipe?: unknown }).pipe === "function";
      const stream = isNodeReadable
        ? (body as Readable)
        : Readable.fromWeb(body as globalThis.ReadableStream<Uint8Array>);
      return reply.send(stream);
    } catch (err) {
      const code =
        (err as { Code?: string; name?: string }).Code ??
        (err as { name?: string }).name;
      if (code === "NoSuchKey" || code === "NotFound") {
        return reply.status(404).send({ error: "Media not found" });
      }
      throw err;
    }
  });

  app.post("/api/trees/:treeId/media/presign", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const parsed = PresignBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { filename, contentType, sizeBytes } = parsed.data;

    if (!isAllowedMimeType(contentType)) {
      return reply.status(415).send({ error: "Unsupported media type" });
    }

    const capacity = await checkTreeCanAdd(treeId, "media", sizeBytes);
    if (!capacity.allowed) {
      return reply.status(capacity.status).send({ error: capacity.reason });
    }

    const ext = filename.includes(".") ? filename.split(".").pop()! : "bin";
    const objectKey = `trees/${treeId}/${randomUUID()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(objectKey, contentType);

    const [mediaRecord] = await db
      .insert(schema.media)
      .values({
        treeId,
        contributingTreeId: treeId,
        uploadedByUserId: session.user.id,
        objectKey,
        originalFilename: filename,
        mimeType: contentType,
        sizeBytes,
        storageProvider: "minio",
      })
      .returning();

    if (!mediaRecord) {
      return reply.status(500).send({ error: "Failed to create media record" });
    }

    return reply.status(201).send({
      mediaId: mediaRecord.id,
      uploadUrl,
      objectKey,
    });
  });
}

// ── Cross-tree access helper ──────────────────────────────────────────────────

type MediaRecord = { treeId: string; id: string };

/**
 * Returns true if userId may access media from mediaRecord's tree via an
 * active cross-tree connection:
 *   1. userId is a member of some tree T2
 *   2. There is an active treeConnection between mediaRecord.treeId (T1) and T2
 *   3. The media's primaryPerson in T1 has a crossTreePersonLink to a person in T2
 *      within that connection.
 */
async function checkCrossTreeAccess(
  mediaRecord: MediaRecord,
  userId: string,
): Promise<boolean> {
  return checkScopedTreeAccess(mediaRecord, userId);
}

async function checkScopedTreeAccess(
  mediaRecord: MediaRecord,
  userId: string,
): Promise<boolean> {
  const memberships = await db.query.treeMemberships.findMany({
    where: (membership) => eq(membership.userId, userId),
    columns: {
      treeId: true,
    },
  });
  const userTreeIds = memberships.map((membership) => membership.treeId);
  if (userTreeIds.length === 0) {
    return false;
  }

  const [linkedMemoryRow, legacyMemory] = await Promise.all([
    db.query.memoryMedia.findFirst({
      where: (candidate, { eq }) => eq(candidate.mediaId, mediaRecord.id),
      columns: {
        memoryId: true,
      },
    }),
    db.query.memories.findFirst({
      where: (candidate) => eq(candidate.mediaId, mediaRecord.id),
      columns: {
        id: true,
        primaryPersonId: true,
      },
    }),
  ]);
  const memory = legacyMemory
    ? legacyMemory
    : linkedMemoryRow
      ? await db.query.memories.findFirst({
          where: (candidate, { eq }) => eq(candidate.id, linkedMemoryRow.memoryId),
          columns: {
            id: true,
            primaryPersonId: true,
          },
        })
      : null;
  if (!memory) {
    return false;
  }

  const tagRows = await db
    .select({ personId: schema.memoryPersonTags.personId })
    .from(schema.memoryPersonTags)
    .where(eq(schema.memoryPersonTags.memoryId, memory.id));

  const candidatePersonIds =
    tagRows.length > 0
      ? [...new Set(tagRows.map((row) => row.personId))]
      : [memory.primaryPersonId];

  const [scopeMatch, legacyMatch] = await Promise.all([
    db.query.treePersonScope.findFirst({
      where: (scope, { and, inArray }) =>
        and(
          inArray(scope.treeId, userTreeIds),
          inArray(scope.personId, candidatePersonIds),
        ),
      columns: {
        personId: true,
      },
    }),
    db.query.people.findFirst({
      where: (person, { and, inArray }) =>
        and(
          inArray(person.treeId, userTreeIds),
          inArray(person.id, candidatePersonIds),
        ),
      columns: {
        id: true,
      },
    }),
  ]);

  return Boolean(scopeMatch || legacyMatch);
}
