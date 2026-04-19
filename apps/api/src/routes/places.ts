import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";

const CreatePlaceBody = z.object({
  label: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  countryCode: z.string().trim().length(2).optional(),
  adminRegion: z.string().max(120).optional(),
  locality: z.string().max(120).optional(),
  geocodeProvider: z.string().max(40).optional(),
  geocodeConfidence: z.number().int().min(0).max(100).optional(),
});

function normalizePlaceLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\b(\d{4})\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
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

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, userId)),
  });
}

type MapEvent = {
  id: string;
  type: "birth" | "death" | "memory";
  personId: string;
  personName: string;
  placeId: string;
  placeLabel: string;
  latitude: number;
  longitude: number;
  dateText: string | null;
  sortYear: number | null;
  title: string;
  memoryId?: string;
};

export async function placesPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/trees/:treeId/places", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const places = await db.query.places.findMany({
      where: (p, { eq }) => eq(p.treeId, treeId),
      orderBy: (p, { asc }) => [asc(p.label)],
    });

    return reply.send(places.map((place) => serializePlace(place)));
  });

  app.post("/api/trees/:treeId/places", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (membership.role === "viewer") {
      return reply.status(403).send({ error: "Viewers cannot add places" });
    }

    const parsed = CreatePlaceBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const normalizedLabel = normalizePlaceLabel(parsed.data.label);
    const existing = await db.query.places.findFirst({
      where: (p) =>
        and(eq(p.treeId, treeId), eq(p.normalizedLabel, normalizedLabel)),
    });
    if (existing) {
      return reply.send(serializePlace(existing));
    }

    const [place] = await db
      .insert(schema.places)
      .values({
        treeId,
        label: parsed.data.label.trim(),
        normalizedLabel,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        countryCode: parsed.data.countryCode?.toUpperCase() ?? null,
        adminRegion: parsed.data.adminRegion?.trim() || null,
        locality: parsed.data.locality?.trim() || null,
        geocodeProvider: parsed.data.geocodeProvider ?? "manual",
        geocodeConfidence: parsed.data.geocodeConfidence ?? 100,
        createdByUserId: session.user.id,
      })
      .returning();

    return reply.status(201).send(serializePlace(place));
  });

  app.get("/api/trees/:treeId/map", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const [tree, people, memories] = await Promise.all([
      db.query.trees.findFirst({
        where: (t, { eq }) => eq(t.id, treeId),
      }),
      db.query.people.findMany({
        where: (p, { eq }) => eq(p.treeId, treeId),
        with: {
          portraitMedia: true,
          birthPlaceRef: true,
          deathPlaceRef: true,
        },
      }),
      db.query.memories.findMany({
        where: (m, { and, eq }) => and(eq(m.treeId, treeId), isNotNull(m.placeId)),
        with: {
          place: true,
          primaryPerson: { with: { portraitMedia: true } },
        },
      }),
    ]);

    if (!tree) {
      return reply.status(404).send({ error: "Tree not found" });
    }

    const events: MapEvent[] = [];

    for (const person of people) {
      if (person.birthPlaceRef) {
        events.push({
          id: `birth:${person.id}`,
          type: "birth",
          personId: person.id,
          personName: person.displayName,
          placeId: person.birthPlaceRef.id,
          placeLabel: person.birthPlaceRef.label,
          latitude: person.birthPlaceRef.latitude,
          longitude: person.birthPlaceRef.longitude,
          dateText: person.birthDateText ?? null,
          sortYear: extractYear(person.birthDateText),
          title: `${person.displayName} was born`,
        });
      }
      if (person.deathPlaceRef) {
        events.push({
          id: `death:${person.id}`,
          type: "death",
          personId: person.id,
          personName: person.displayName,
          placeId: person.deathPlaceRef.id,
          placeLabel: person.deathPlaceRef.label,
          latitude: person.deathPlaceRef.latitude,
          longitude: person.deathPlaceRef.longitude,
          dateText: person.deathDateText ?? null,
          sortYear: extractYear(person.deathDateText),
          title: `${person.displayName} died`,
        });
      }
    }

    for (const memory of memories) {
      if (!memory.place || !memory.primaryPerson) continue;
      events.push({
        id: `memory:${memory.id}`,
        type: "memory",
        personId: memory.primaryPerson.id,
        personName: memory.primaryPerson.displayName,
        placeId: memory.place.id,
        placeLabel: memory.placeLabelOverride ?? memory.place.label,
        latitude: memory.place.latitude,
        longitude: memory.place.longitude,
        dateText: memory.dateOfEventText ?? null,
        sortYear: extractYear(memory.dateOfEventText),
        title: memory.title,
        memoryId: memory.id,
      });
    }

    const placeCounts = new Map<string, number>();
    for (const event of events) {
      placeCounts.set(event.placeId, (placeCounts.get(event.placeId) ?? 0) + 1);
    }

    const placeIndex = new Map<string, ReturnType<typeof serializePlace>>();
    for (const person of people) {
      if (person.birthPlaceRef) {
        placeIndex.set(person.birthPlaceRef.id, serializePlace(person.birthPlaceRef));
      }
      if (person.deathPlaceRef) {
        placeIndex.set(person.deathPlaceRef.id, serializePlace(person.deathPlaceRef));
      }
    }
    for (const memory of memories) {
      if (memory.place) {
        placeIndex.set(memory.place.id, serializePlace(memory.place));
      }
    }

    const routes = people
      .map((person) => {
        const personEvents = events
          .filter((event) => event.personId === person.id && event.sortYear !== null)
          .sort((a, b) => {
            if (a.sortYear !== b.sortYear) return (a.sortYear ?? 0) - (b.sortYear ?? 0);
            return a.id.localeCompare(b.id);
          });

        const segments = [];
        for (let i = 1; i < personEvents.length; i += 1) {
          const from = personEvents[i - 1]!;
          const to = personEvents[i]!;
          if (from.placeId === to.placeId) continue;
          segments.push({
            id: `${from.id}->${to.id}`,
            fromEventId: from.id,
            toEventId: to.id,
            from: {
              placeId: from.placeId,
              label: from.placeLabel,
              latitude: from.latitude,
              longitude: from.longitude,
            },
            to: {
              placeId: to.placeId,
              label: to.placeLabel,
              latitude: to.latitude,
              longitude: to.longitude,
            },
          });
        }

        return {
          personId: person.id,
          personName: person.displayName,
          segments,
        };
      })
      .filter((route) => route.segments.length > 0);

    return reply.send({
      tree: { id: tree.id, name: tree.name },
      places: Array.from(placeIndex.values())
        .filter((place): place is NonNullable<typeof place> => Boolean(place))
        .map((place) => ({
          ...place,
          eventCount: placeCounts.get(place.id) ?? 0,
        })),
      events: events.sort((a, b) => {
        const aYear = a.sortYear ?? Number.MAX_SAFE_INTEGER;
        const bYear = b.sortYear ?? Number.MAX_SAFE_INTEGER;
        if (aYear !== bYear) return aYear - bYear;
        return a.id.localeCompare(b.id);
      }),
      routes,
    });
  });
}
