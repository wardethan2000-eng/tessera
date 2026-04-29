import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { search, getSearchFacets } from "../lib/search-service.js";
import { getSession } from "../lib/session.js";
import { db } from "../lib/db.js";

const SearchQuery = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  kinds: z.string().optional(),
  personIds: z.string().optional(),
  memoryKinds: z.string().optional(),
  placeIds: z.string().optional(),
  yearStart: z.coerce.number().int().optional(),
  yearEnd: z.coerce.number().int().optional(),
  hasTranscript: z.enum(["true", "false"]).optional(),
  hasMedia: z.enum(["true", "false"]).optional(),
  contributorUserId: z.string().optional(),
});

const parseCommaList = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
};

export async function searchPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/trees/:treeId/search", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const parsed = SearchQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query parameters", details: parsed.error.issues });
    }

    const { q, limit, offset, kinds, personIds, memoryKinds, placeIds, yearStart, yearEnd, hasTranscript, hasMedia, contributorUserId } = parsed.data;

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const parsedKinds = kinds
      ? kinds
          .split(",")
          .map((k) => k.trim())
          .filter((k): k is "person" | "memory" | "place" =>
            k === "person" || k === "memory" || k === "place"
          )
      : undefined;

    const result = await search(treeId, q, session.user.id, {
      limit,
      offset,
      kinds: parsedKinds,
      filters: {
        personIds: parseCommaList(personIds),
        memoryKinds: parseCommaList(memoryKinds) as ("story" | "photo" | "voice" | "document" | "other")[] | undefined,
        placeIds: parseCommaList(placeIds),
        yearStart,
        yearEnd,
        hasTranscript: hasTranscript === "true" ? true : hasTranscript === "false" ? false : undefined,
        hasMedia: hasMedia === "true" ? true : hasMedia === "false" ? false : undefined,
        contributorUserId,
      },
    });

    return reply.send(result);
  });

  app.get("/api/trees/:treeId/search/facets", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      columns: { role: true },
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const facets = await getSearchFacets(treeId, session.user.id);
    return reply.send(facets);
  });
}