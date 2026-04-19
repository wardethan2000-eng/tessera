/**
 * Cross-tree connection API
 *
 * A "tree connection" is a bilateral link between two family trees, modelling
 * real-world in-law / extended-family relationships. It goes through a handshake:
 *
 *   Tree A proposes → Tree B accepts → status becomes "active"
 *
 * Once active, members of either tree can create cross-tree person links, which
 * declare that a person record in tree A and a person record in tree B represent
 * the same real individual. This unlocks cross-tree memory access.
 *
 * Access rules (enforced in GET /api/media):
 *   - The requesting user must be a member of the tree that owns the media.
 *   - OR: the media's primary person has a crossTreePersonLink, the connection
 *     is "active", and the requesting user is a member of the OTHER tree.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns the normalised (treeA < treeB) pair for a connection. */
function normalisePair(
  idX: string,
  idY: string,
): { treeAId: string; treeBId: string } {
  return idX < idY
    ? { treeAId: idX, treeBId: idY }
    : { treeAId: idY, treeBId: idX };
}

async function requireMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (m) => and(eq(m.treeId, treeId), eq(m.userId, userId)),
  });
}

async function findConnection(connectionId: string) {
  return db.query.treeConnections.findFirst({
    where: (c) => eq(c.id, connectionId),
    with: { treeA: true, treeB: true },
  });
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const ProposeBody = z.object({
  targetTreeId: z.string().uuid(),
});

const RespondBody = z.object({
  action: z.enum(["accept", "reject", "end"]),
});

const LinkPersonsBody = z.object({
  personAId: z.string().uuid(),
  personBId: z.string().uuid(),
});

// ── Plugin ────────────────────────────────────────────────────────────────────

export async function connectionsPlugin(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/trees/:treeId/connections
   * Propose a connection from this tree to another tree.
   * The requesting user must be a steward or founder of the initiating tree.
   */
  app.post("/api/trees/:treeId/connections", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await requireMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }
    if (membership.role !== "founder" && membership.role !== "steward") {
      return reply.status(403).send({ error: "Only founders and stewards can propose connections" });
    }

    const parsed = ProposeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { targetTreeId } = parsed.data;

    if (targetTreeId === treeId) {
      return reply.status(400).send({ error: "Cannot connect a tree to itself" });
    }

    const targetTree = await db.query.trees.findFirst({
      where: (t) => eq(t.id, targetTreeId),
    });
    if (!targetTree) {
      return reply.status(404).send({ error: "Target tree not found" });
    }

    const { treeAId, treeBId } = normalisePair(treeId, targetTreeId);

    // Prevent duplicate connections
    const existing = await db.query.treeConnections.findFirst({
      where: (c) => and(eq(c.treeAId, treeAId), eq(c.treeBId, treeBId)),
    });
    if (existing) {
      if (existing.status === "ended") {
        // Re-activate by proposing again
        const [updated] = await db
          .update(schema.treeConnections)
          .set({
            status: "pending",
            initiatedByUserId: session.user.id,
            initiatedByTreeId: treeId,
            acceptedAt: null,
            endedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.treeConnections.id, existing.id))
          .returning();
        return reply.status(200).send(updated);
      }
      return reply.status(409).send({
        error: "A connection already exists between these trees",
        connectionId: existing.id,
        status: existing.status,
      });
    }

    const [connection] = await db
      .insert(schema.treeConnections)
      .values({
        treeAId,
        treeBId,
        status: "pending",
        initiatedByUserId: session.user.id,
        initiatedByTreeId: treeId,
      })
      .returning();

    return reply.status(201).send(connection);
  });

  /**
   * GET /api/trees/:treeId/connections
   * List all connections for this tree (both sides, any status).
   */
  app.get("/api/trees/:treeId/connections", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await requireMembership(treeId, session.user.id);
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const connections = await db.query.treeConnections.findMany({
      where: (c) => or(eq(c.treeAId, treeId), eq(c.treeBId, treeId)),
      with: {
        treeA: { columns: { id: true, name: true } },
        treeB: { columns: { id: true, name: true } },
        initiatedByUser: { columns: { id: true, name: true } },
      },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });

    return reply.send(connections);
  });

  /**
   * PATCH /api/trees/:treeId/connections/:connectionId
   * Accept, reject, or end a connection.
   * - accept/reject: only the OTHER tree (not the one that proposed) may do this.
   * - end: either tree's founder/steward may do this.
   */
  app.patch(
    "/api/trees/:treeId/connections/:connectionId",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, connectionId } = request.params as {
        treeId: string;
        connectionId: string;
      };

      const membership = await requireMembership(treeId, session.user.id);
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }
      if (membership.role !== "founder" && membership.role !== "steward") {
        return reply.status(403).send({ error: "Only founders and stewards can manage connections" });
      }

      const parsed = RespondBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const connection = await findConnection(connectionId);
      if (!connection) {
        return reply.status(404).send({ error: "Connection not found" });
      }

      // Ensure this tree is a party to the connection
      if (connection.treeAId !== treeId && connection.treeBId !== treeId) {
        return reply.status(403).send({ error: "This tree is not party to this connection" });
      }

      const { action } = parsed.data;

      if (action === "accept" || action === "reject") {
        if (connection.status !== "pending") {
          return reply.status(409).send({ error: "Connection is not pending" });
        }
        // Only the invited (non-initiating) tree may accept or reject
        if (connection.initiatedByTreeId === treeId) {
          return reply.status(403).send({
            error: "The initiating tree cannot accept or reject its own proposal",
          });
        }

        if (action === "reject") {
          const [updated] = await db
            .update(schema.treeConnections)
            .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.treeConnections.id, connectionId))
            .returning();
          return reply.send(updated);
        }

        // accept
        const [updated] = await db
          .update(schema.treeConnections)
          .set({ status: "active", acceptedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.treeConnections.id, connectionId))
          .returning();
        return reply.send(updated);
      }

      // end — either tree's founder/steward may do this on an active connection
      if (connection.status !== "active") {
        return reply.status(409).send({ error: "Connection is not active" });
      }
      const [updated] = await db
        .update(schema.treeConnections)
        .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.treeConnections.id, connectionId))
        .returning();
      return reply.send(updated);
    },
  );

  /**
   * POST /api/trees/:treeId/connections/:connectionId/person-links
   * Create a cross-tree person link within an active connection.
   * The requesting user must be a member of treeId, which must be a party.
   * personAId must belong to treeA; personBId must belong to treeB.
   */
  app.post(
    "/api/trees/:treeId/connections/:connectionId/person-links",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, connectionId } = request.params as {
        treeId: string;
        connectionId: string;
      };

      const membership = await requireMembership(treeId, session.user.id);
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const connection = await findConnection(connectionId);
      if (!connection) {
        return reply.status(404).send({ error: "Connection not found" });
      }
      if (connection.treeAId !== treeId && connection.treeBId !== treeId) {
        return reply.status(403).send({ error: "This tree is not party to this connection" });
      }
      if (connection.status !== "active") {
        return reply.status(409).send({ error: "Connection must be active to link people" });
      }

      const parsed = LinkPersonsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const { personAId, personBId } = parsed.data;

      // Validate personA belongs to treeA and personB to treeB
      const [personA, personB] = await Promise.all([
        db.query.people.findFirst({
          where: (p) => and(eq(p.id, personAId), eq(p.treeId, connection.treeAId)),
        }),
        db.query.people.findFirst({
          where: (p) => and(eq(p.id, personBId), eq(p.treeId, connection.treeBId)),
        }),
      ]);

      if (!personA) {
        return reply
          .status(400)
          .send({ error: "personAId does not belong to tree A of this connection" });
      }
      if (!personB) {
        return reply
          .status(400)
          .send({ error: "personBId does not belong to tree B of this connection" });
      }

      const [link] = await db
        .insert(schema.crossTreePersonLinks)
        .values({
          connectionId,
          personAId,
          personBId,
          linkedByUserId: session.user.id,
        })
        .onConflictDoNothing()
        .returning();

      if (!link) {
        return reply.status(409).send({ error: "These people are already linked" });
      }

      return reply.status(201).send(link);
    },
  );

  /**
   * GET /api/trees/:treeId/connections/:connectionId/person-links
   * List all person links within a connection.
   */
  app.get(
    "/api/trees/:treeId/connections/:connectionId/person-links",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, connectionId } = request.params as {
        treeId: string;
        connectionId: string;
      };

      const membership = await requireMembership(treeId, session.user.id);
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const connection = await findConnection(connectionId);
      if (!connection) {
        return reply.status(404).send({ error: "Connection not found" });
      }
      if (connection.treeAId !== treeId && connection.treeBId !== treeId) {
        return reply.status(403).send({ error: "This tree is not party to this connection" });
      }

      const links = await db.query.crossTreePersonLinks.findMany({
        where: (l) => eq(l.connectionId, connectionId),
        with: {
          personA: { columns: { id: true, displayName: true, treeId: true } },
          personB: { columns: { id: true, displayName: true, treeId: true } },
          linkedBy: { columns: { id: true, name: true } },
        },
      });

      return reply.send(links);
    },
  );

  /**
   * DELETE /api/trees/:treeId/connections/:connectionId/person-links/:linkId
   * Remove a person link. Any member of either tree may remove.
   */
  app.delete(
    "/api/trees/:treeId/connections/:connectionId/person-links/:linkId",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });

      const { treeId, connectionId, linkId } = request.params as {
        treeId: string;
        connectionId: string;
        linkId: string;
      };

      const membership = await requireMembership(treeId, session.user.id);
      if (!membership) {
        return reply.status(403).send({ error: "Not a member of this tree" });
      }

      const connection = await findConnection(connectionId);
      if (!connection) {
        return reply.status(404).send({ error: "Connection not found" });
      }
      if (connection.treeAId !== treeId && connection.treeBId !== treeId) {
        return reply.status(403).send({ error: "This tree is not party to this connection" });
      }

      const [deleted] = await db
        .delete(schema.crossTreePersonLinks)
        .where(
          and(
            eq(schema.crossTreePersonLinks.id, linkId),
            eq(schema.crossTreePersonLinks.connectionId, connectionId),
          ),
        )
        .returning();

      if (!deleted) {
        return reply.status(404).send({ error: "Link not found" });
      }

      return reply.status(200).send({ deleted: true });
    },
  );
}
