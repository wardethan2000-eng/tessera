import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
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

    const [person] = await db
      .insert(schema.people)
      .values({
        treeId,
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
      })
      .returning();

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

    const people = await db.query.people.findMany({
      where: (p, { eq }) => eq(p.treeId, treeId),
      with: { portraitMedia: true, birthPlaceRef: true, deathPlaceRef: true },
    });

    return reply.send(
      people.map((p) => ({
        ...p,
        portraitUrl: p.portraitMedia ? mediaUrl(p.portraitMedia.objectKey) : null,
        birthPlaceResolved: serializePlace(p.birthPlaceRef),
        deathPlaceResolved: serializePlace(p.deathPlaceRef),
      })),
    );
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

    const [person, memories, relationships] = await Promise.all([
      db.query.people.findFirst({
        where: (p, { and, eq }) =>
          and(eq(p.treeId, treeId), eq(p.id, personId)),
        with: { portraitMedia: true, birthPlaceRef: true, deathPlaceRef: true },
      }),
      db.query.memories.findMany({
        where: (m, { and, eq }) =>
          and(eq(m.primaryPersonId, personId), eq(m.treeId, treeId)),
        with: { media: true, place: true },
        orderBy: (m, { desc }) => [desc(m.createdAt)],
      }),
      db.query.relationships.findMany({
        where: (r, { and, or, eq }) =>
          and(
            eq(r.treeId, treeId),
            or(eq(r.fromPersonId, personId), eq(r.toPersonId, personId)),
          ),
        with: { fromPerson: true, toPerson: true },
      }),
    ]);

    if (!person) return reply.status(404).send({ error: "Person not found" });

    return reply.send({
      ...person,
      portraitUrl: person.portraitMedia
        ? mediaUrl(person.portraitMedia.objectKey)
        : null,
      birthPlaceResolved: serializePlace(person.birthPlaceRef),
      deathPlaceResolved: serializePlace(person.deathPlaceRef),
      memories: memories.map((m) => ({
        ...m,
        mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
        mimeType: m.media?.mimeType ?? null,
        place: serializePlace(m.place),
      })),
      relationships,
    });
  });

  /**
   * GET /api/trees/:treeId/people/:personId/cross-tree
   *
   * Returns the "mirror" person record and their public memories from a
   * connected tree, accessible because of an active crossTreePersonLink.
   *
   * The requesting user must be a member of treeId.
   * The personId must be in treeId.
   * The response lists all active links for this person and the linked
   * person's basic profile + memories from the other tree.
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
      const person = await db.query.people.findFirst({
        where: (p) => and(eq(p.id, personId), eq(p.treeId, treeId)),
      });
      if (!person) {
        return reply.status(404).send({ error: "Person not found" });
      }

      // Find all active cross-tree links for this person (could be personA or personB)
      const linksRaw = await db.query.crossTreePersonLinks.findMany({
        where: (l) =>
          or(eq(l.personAId, personId), eq(l.personBId, personId)),
        with: {
          connection: true,
          personA: { with: { portraitMedia: true } },
          personB: { with: { portraitMedia: true } },
        },
      });

      // Filter to active connections only
      const activeLinks = linksRaw.filter((l) => l.connection.status === "active");

      // For each active link, resolve the "other" person and their memories
      const results = await Promise.all(
        activeLinks.map(async (link) => {
          const isPersonA = link.personAId === personId;
          const otherPerson = isPersonA ? link.personB : link.personA;
          const otherTreeId = isPersonA
            ? link.connection.treeBId
            : link.connection.treeAId;

          const memories = await db.query.memories.findMany({
            where: (m) =>
              and(eq(m.primaryPersonId, otherPerson.id), eq(m.treeId, otherTreeId)),
            with: { media: true },
            orderBy: (m, { desc }) => [desc(m.createdAt)],
          });

          return {
            connectionId: link.connectionId,
            linkedPerson: {
              ...otherPerson,
              portraitUrl: otherPerson.portraitMedia
                ? mediaUrl(otherPerson.portraitMedia.objectKey)
                : null,
            },
            memories: memories.map((m) => ({
              ...m,
              mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
              mimeType: m.media?.mimeType ?? null,
            })),
          };
        }),
      );

      return reply.send(results);
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

    const [updated] = await db
      .update(schema.people)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.people.treeId, treeId), eq(schema.people.id, personId)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Person not found" });

    const fullUpdated = await db.query.people.findFirst({
      where: (p, { and, eq }) => and(eq(p.treeId, treeId), eq(p.id, personId)),
      with: { birthPlaceRef: true, deathPlaceRef: true, portraitMedia: true },
    });

    return reply.send({
      ...fullUpdated,
      portraitUrl: fullUpdated?.portraitMedia
        ? mediaUrl(fullUpdated.portraitMedia.objectKey)
        : null,
      birthPlaceResolved: serializePlace(fullUpdated?.birthPlaceRef),
      deathPlaceResolved: serializePlace(fullUpdated?.deathPlaceRef),
    });
  });
}
