import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";

const CreateMemoryBody = z.object({
  kind: z.enum(["story", "photo", "voice", "document", "other"]),
  title: z.string().min(1).max(200),
  body: z.string().optional(),
  mediaId: z.string().uuid().optional(),
  dateOfEventText: z.string().max(100).optional(),
});

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
        where: (t, { and, eq }) =>
          and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const parsed = CreateMemoryBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const { kind, title, body, mediaId, dateOfEventText } = parsed.data;

      if (kind === "story" && !body) {
        return reply.status(400).send({ error: "Story memories require a body" });
      }
      if (kind === "photo" && !mediaId) {
        return reply.status(400).send({ error: "Photo memories require a mediaId" });
      }
      if (kind === "voice" && !mediaId) {
        return reply.status(400).send({ error: "Voice memories require a mediaId" });
      }

      const [memory] = await db
        .insert(schema.memories)
        .values({
          treeId,
          primaryPersonId: personId,
          contributorUserId: session.user.id,
          kind,
          title,
          body: body ?? null,
          mediaId: mediaId ?? null,
          dateOfEventText: dateOfEventText ?? null,
        })
        .returning();

      if (!memory) {
        return reply.status(500).send({ error: "Failed to create memory" });
      }

      // Fetch with media for the response
      const full = await db.query.memories.findFirst({
        where: (m, { eq }) => eq(m.id, memory.id),
        with: { media: true },
      });

      const withUrl =
        full?.media
          ? { ...full, mediaUrl: mediaUrl(full.media.objectKey) }
          : full;

      return reply.status(201).send(withUrl);
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
        where: (t, { and, eq }) =>
          and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const memories = await db.query.memories.findMany({
        where: (m, { eq }) => eq(m.primaryPersonId, personId),
        with: { media: true },
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      });

      return reply.send(
        memories.map((m) => ({
          ...m,
          mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
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
      where: (t, { and, eq }) =>
        and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const memories = await db.query.memories.findMany({
      where: (m, { eq }) => eq(m.treeId, treeId),
      with: {
        media: true,
        primaryPerson: { with: { portraitMedia: true } },
      },
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit: 200,
    });

    return reply.send(
      memories.map((m) => ({
        ...m,
        mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
        personName: m.primaryPerson?.displayName ?? null,
        personPortraitUrl: m.primaryPerson?.portraitMedia
          ? mediaUrl(m.primaryPerson.portraitMedia.objectKey)
          : null,
      })),
    );
  });
}
