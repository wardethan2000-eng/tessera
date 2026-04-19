import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import * as schema from "@familytree/database";
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

      const person = await db.query.people.findFirst({
        where: (p) => and(eq(p.id, personId), eq(p.treeId, treeId)),
      });
      if (!person) {
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
          promptId: promptId ?? null,
          dateOfEventText: dateOfEventText ?? null,
          placeId: placeId ?? null,
          placeLabelOverride: placeLabelOverride ?? null,
        })
        .returning();

      if (!memory) {
        return reply.status(500).send({ error: "Failed to create memory" });
      }

      if (kind === "voice") {
        await enqueueMemoryTranscription(memory.id, treeId);
      }

      // Fetch with media for the response
      const full = await db.query.memories.findFirst({
        where: (m, { eq }) => eq(m.id, memory.id),
        with: { media: true, place: true },
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
        where: (t) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      });
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const person = await db.query.people.findFirst({
        where: (p) => and(eq(p.id, personId), eq(p.treeId, treeId)),
      });
      if (!person) {
        return reply.status(404).send({ error: "Person not found in this tree" });
      }

      const memories = await db.query.memories.findMany({
        where: (m) =>
          and(eq(m.primaryPersonId, personId), eq(m.treeId, treeId)),
        with: { media: true, place: true },
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      });

      return reply.send(
        memories.map((m) => ({
          ...m,
          mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
          mimeType: m.media?.mimeType ?? null,
          place: serializePlace(m.place),
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

    const memories = await db.query.memories.findMany({
      where: (m) => eq(m.treeId, treeId),
      with: {
        media: true,
        place: true,
        primaryPerson: { with: { portraitMedia: true } },
      },
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      limit: 200,
    });

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
      })),
    );
  });
}
