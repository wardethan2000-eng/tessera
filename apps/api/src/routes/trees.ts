import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getIdentityStatusForUser } from "../lib/account-identity-service.js";
import { addPersonToTreeScope } from "../lib/cross-tree-write-service.js";
import { getTreeScopedPerson, isPersonInTreeScope } from "../lib/cross-tree-read-service.js";
import { getSession } from "../lib/session.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";

const CreateTreeBody = z.object({
  name: z.string().min(1).max(160),
});

export async function treesPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/me/identity", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const identity = await getIdentityStatusForUser(session.user.id);

    return reply.send({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      ...identity,
    });
  });

  app.post("/api/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const parsed = CreateTreeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const [tree] = await db
      .insert(schema.trees)
      .values({ name: parsed.data.name, founderUserId: session.user.id })
      .returning();

    if (!tree) {
      return reply.status(500).send({ error: "Failed to create tree" });
    }

    await db.insert(schema.treeMemberships).values({
      treeId: tree.id,
      userId: session.user.id,
      role: "founder",
    });

    return reply.status(201).send(tree);
  });

  app.get("/api/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const memberships = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.userId, session.user.id),
      with: { tree: true },
    });

    return reply.send(memberships.map((m) => ({ ...m.tree, role: m.role })));
  });

  app.get("/api/trees/:treeId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
      with: { tree: true },
    });

    if (!membership) return reply.status(404).send({ error: "Tree not found" });

    return reply.send({ ...membership.tree, role: membership.role });
  });

  app.post("/api/trees/:treeId/identity/bootstrap", async (request, reply) => {
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

    const identity = await getIdentityStatusForUser(session.user.id);
    if (identity.status === "unclaimed") {
      return reply.send({
        status: "unclaimed",
        wasAddedToScope: false,
        person: null,
      });
    }

    if (identity.status === "conflict") {
      return reply.status(409).send({
        error:
          "This account is linked to multiple people. Resolve the duplicate identity before bootstrapping into a new tree.",
        ...identity,
      });
    }

    const claimedPerson = identity.canonicalPerson;
    const alreadyInScope = await isPersonInTreeScope(treeId, claimedPerson.id);

    if (!alreadyInScope) {
      const capacity = await checkTreeCanAdd(treeId, "person");
      if (!capacity.allowed) {
        return reply.status(capacity.status).send({ error: capacity.reason });
      }

      await addPersonToTreeScope({
        treeId,
        personId: claimedPerson.id,
        addedByUserId: session.user.id,
      });
    }

    const person = await getTreeScopedPerson(treeId, claimedPerson.id);
    if (!person) {
      return reply.status(500).send({ error: "Failed to load claimed person in this tree" });
    }

    return reply.send({
      status: "claimed",
      wasAddedToScope: !alreadyInScope,
      person,
    });
  });

  /** GET /api/trees/:treeId/members — list all members of a tree */
  app.get("/api/trees/:treeId/members", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const userMembership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!userMembership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const members = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.treeId, treeId),
      with: { user: true },
    });

    return reply.send(
      members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user?.name ?? null,
        email: m.user?.email ?? "",
        joinedAt: m.joinedAt,
      }))
    );
  });
}
