import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";

const CreatePersonBody = z.object({
  displayName: z.string().min(1).max(200),
  alsoKnownAs: z.array(z.string()).optional(),
  essenceLine: z.string().max(255).optional(),
  birthDateText: z.string().max(100).optional(),
  deathDateText: z.string().max(100).optional(),
  birthPlace: z.string().max(200).optional(),
  deathPlace: z.string().max(200).optional(),
  isLiving: z.boolean().optional(),
  linkToUser: z.boolean().optional(),
});

export async function peoplePlugin(app: FastifyInstance): Promise<void> {
  app.post("/api/trees/:treeId/people", async (request, reply) => {
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

    const parsed = CreatePersonBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { linkToUser, ...fields } = parsed.data;

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
        isLiving: fields.isLiving ?? true,
        linkedUserId: linkToUser ? session.user.id : undefined,
      })
      .returning();

    return reply.status(201).send(person);
  });

  app.get("/api/trees/:treeId/people", async (request, reply) => {
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

    const people = await db.query.people.findMany({
      where: (p, { eq }) => eq(p.treeId, treeId),
    });

    return reply.send(people);
  });
}
