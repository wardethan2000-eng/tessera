import type { FastifyInstance } from "fastify";
import { getSession } from "../lib/session.js";
import { db } from "../lib/db.js";
import { castTokens } from "@tessera/database";
import { eq, and, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";

const TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
const TOKEN_PREFIX = "cast_";

function generateToken(): string {
  const bytes = randomBytes(32);
  const hex = bytes.toString("hex");
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_MS / 1000;
  return `${TOKEN_PREFIX}${hex}_${expiry}`;
}

export async function castTokenPlugin(app: FastifyInstance) {
  app.post("/api/auth/cast-token", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const body = request.body as { treeId?: string } | undefined;
    const treeId = body?.treeId;
    if (!treeId) {
      return reply.status(400).send({ error: "treeId is required" });
    }

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);

    await db.insert(castTokens).values({
      token,
      userId: session.user.id,
      treeId,
      expiresAt,
    });

    return reply.send({
      token,
      expiresAt: expiresAt.toISOString(),
    });
  });
}

export async function validateCastToken(
  token: string,
  treeId: string,
): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const record = await db.query.castTokens.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.token, token), eq(t.treeId, treeId), gt(t.expiresAt, new Date())),
  });

  if (!record) return null;
  return record.userId;
}