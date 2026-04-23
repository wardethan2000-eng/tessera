import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import * as schema from "@tessera/database";
import { createMemoryWithPrimaryTag } from "../lib/cross-tree-write-service.js";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import {
  getPresignedUploadUrl,
  isAllowedMimeType,
  mediaUrl,
} from "../lib/storage.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";
import { enqueueMemoryTranscription } from "../lib/transcription.js";
import { mailer, MAIL_FROM } from "../lib/mailer.js";
import { mayEmailUser } from "./me.js";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const elderSubmitBuckets = new Map<string, number[]>();

const MintBody = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200).optional(),
  associatedPersonId: z.string().uuid().optional(),
  familyLabel: z.string().min(1).max(200).optional(),
  sendInviteEmail: z.boolean().default(true),
});

const PresignBody = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});

const SubmitBody = z.object({
  kind: z.enum(["story", "photo", "voice", "document", "other"]),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).optional(),
  mediaIds: z.array(z.string().uuid()).max(24).optional(),
  dateOfEventText: z.string().max(100).optional(),
  promptId: z.string().uuid().optional(),
});

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
function generateToken(): string {
  return randomBytes(32).toString("hex");
}
export { hashToken as elderHashToken, generateToken as elderGenerateToken };
function deriveNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return (cleaned || "Family member").slice(0, 200);
}
function deriveTitle(input: {
  body?: string | null;
  kind: string;
  questionText?: string | null;
}): string {
  const body = input.body?.trim();
  if (body) {
    const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? body;
    return firstSentence.slice(0, 120);
  }
  if (input.questionText) return `Reply — ${input.questionText.slice(0, 100)}`;
  if (input.kind === "voice") return "Voice memory";
  if (input.kind === "photo") return "A photo";
  return "A memory";
}

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, userId)),
  });
}
function canMintTokens(role: string): boolean {
  return role === "founder" || role === "steward" || role === "contributor";
}
function canRevokeTokens(role: string): boolean {
  return role === "founder" || role === "steward";
}

type ResolvedToken = Awaited<ReturnType<typeof resolveElderToken>>;
async function resolveElderToken(token: string) {
  if (!token || token.length < 16) {
    return { ok: false as const, status: 404, error: "Invalid token" };
  }
  const tokenHash = hashToken(token);
  const row = await db.query.elderCaptureTokens.findFirst({
    where: (t, { eq }) => eq(t.tokenHash, tokenHash),
    with: {
      tree: true,
      associatedPerson: true,
    },
  });
  if (!row) return { ok: false as const, status: 404, error: "Token not found" };
  if (row.revokedAt) {
    return { ok: false as const, status: 410, error: "This link has been revoked" };
  }
  return { ok: true as const, token: row };
}

async function touchToken(tokenId: string, request: FastifyRequest) {
  const ua = (request.headers["user-agent"] ?? "").toString().slice(0, 500);
  await db
    .update(schema.elderCaptureTokens)
    .set({ lastUsedAt: new Date(), lastUsedUserAgent: ua || null })
    .where(eq(schema.elderCaptureTokens.id, tokenId));
}

export async function sendInstallEmail(opts: {
  email: string;
  rawToken: string;
  treeName: string;
  familyLabel: string | null;
  inviterName: string;
}): Promise<boolean> {
  if (!(await mayEmailUser(opts.email, "promptsEmail"))) return false;
  const url = `${WEB_URL}/elder/${encodeURIComponent(opts.rawToken)}`;
  const label = opts.familyLabel ?? opts.treeName;
  try {
    await mailer.sendMail({
      from: MAIL_FROM,
      to: opts.email,
      subject: `${label} — your private memory link`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1C1915; background: #F6F1E7;">
          <h1 style="font-size: 26px; font-weight: 400; margin: 0 0 14px;">A place for your memories</h1>
          <p style="font-size: 17px; line-height: 1.7; color: #403A2E;">
            ${opts.inviterName} set up a private space where you can share photos, voice notes, and stories for the family archive of <strong>${label}</strong>.
          </p>
          <p style="font-size: 17px; line-height: 1.7; color: #403A2E; margin: 0 0 24px;">
            Tap the button below to open it. On your phone, tap <strong>Share</strong> → <strong>Add to Home Screen</strong> so it stays one tap away.
          </p>
          <p style="margin: 0 0 24px;">
            <a href="${url}" style="background: #4E5D42; color: #F6F1E7; text-decoration: none; padding: 16px 28px; border-radius: 6px; font-size: 18px; display: inline-block;">
              Open my memory page
            </a>
          </p>
          <p style="font-size: 13px; color: #847A66; line-height: 1.6;">
            This link is private to you. Don't share it with others.
          </p>
        </div>`,
      text: `${opts.inviterName} set up a private memory page for ${label}.\n\nOpen it: ${url}\n\nOn your phone, choose Share → Add to Home Screen so it stays one tap away.`,
    });
    return true;
  } catch {
    return false;
  }
}

export async function elderCapturePlugin(app: FastifyInstance): Promise<void> {
  /** POST /api/trees/:treeId/elder-capture-tokens — steward mints */
  app.post("/api/trees/:treeId/elder-capture-tokens", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (!canMintTokens(membership.role)) {
      return reply.status(403).send({ error: "Insufficient role" });
    }
    const parsed = MintBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const email = parsed.data.email.toLowerCase();

    if (parsed.data.associatedPersonId) {
      const person = await db.query.people.findFirst({
        where: (p, { and, eq }) =>
          and(eq(p.id, parsed.data.associatedPersonId!), eq(p.treeId, treeId)),
      });
      if (!person) {
        return reply.status(400).send({ error: "Person not in this tree" });
      }
    }

    const tree = await db.query.trees.findFirst({
      where: (t, { eq }) => eq(t.id, treeId),
    });
    if (!tree) return reply.status(404).send({ error: "Tree not found" });

    const existing = await db.query.elderCaptureTokens.findFirst({
      where: (t, { and, eq, isNull }) =>
        and(eq(t.treeId, treeId), eq(t.email, email), isNull(t.revokedAt)),
    });
    if (existing) {
      return reply.status(409).send({
        error: "An active link already exists for this email",
        existingTokenId: existing.id,
      });
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const [row] = await db
      .insert(schema.elderCaptureTokens)
      .values({
        treeId,
        email,
        tokenHash,
        displayName: parsed.data.displayName ?? null,
        associatedPersonId: parsed.data.associatedPersonId ?? null,
        familyLabel: parsed.data.familyLabel ?? null,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!row) return reply.status(500).send({ error: "Failed to create token" });

    let emailSent = false;
    if (parsed.data.sendInviteEmail) {
      emailSent = await sendInstallEmail({
        email,
        rawToken,
        treeName: tree.name,
        familyLabel: parsed.data.familyLabel ?? null,
        inviterName: session.user.name ?? session.user.email ?? "A family member",
      });
    }

    return reply.status(201).send({
      id: row.id,
      email,
      token: rawToken,
      url: `${WEB_URL}/elder/${rawToken}`,
      emailSent,
    });
  });

  /** GET /api/trees/:treeId/elder-capture-tokens — list */
  app.get("/api/trees/:treeId/elder-capture-tokens", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });
    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });

    const rows = await db.query.elderCaptureTokens.findMany({
      where: (t, { eq }) => eq(t.treeId, treeId),
      with: { associatedPerson: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return reply.send({
      tokens: rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        familyLabel: r.familyLabel,
        associatedPerson: r.associatedPerson
          ? { id: r.associatedPerson.id, name: r.associatedPerson.displayName }
          : null,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        lastUsedUserAgent: r.lastUsedUserAgent,
        lastStandaloneAt: r.lastStandaloneAt,
        revokedAt: r.revokedAt,
      })),
    });
  });

  /** DELETE /api/trees/:treeId/elder-capture-tokens/:id — revoke */
  app.delete(
    "/api/trees/:treeId/elder-capture-tokens/:id",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });
      const { treeId, id } = request.params as { treeId: string; id: string };
      const membership = await verifyMembership(treeId, session.user.id);
      if (!membership) return reply.status(403).send({ error: "Not a member" });
      if (!canRevokeTokens(membership.role)) {
        return reply.status(403).send({ error: "Insufficient role" });
      }
      const [row] = await db
        .update(schema.elderCaptureTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.elderCaptureTokens.id, id),
            eq(schema.elderCaptureTokens.treeId, treeId),
            isNull(schema.elderCaptureTokens.revokedAt),
          ),
        )
        .returning();
      if (!row) return reply.status(404).send({ error: "Token not found" });
      return reply.send({ ok: true });
    },
  );

  /** POST /api/trees/:treeId/elder-capture-tokens/:id/resend — rotate token + re-send install email */
  app.post(
    "/api/trees/:treeId/elder-capture-tokens/:id/resend",
    async (request, reply) => {
      const session = await getSession(request.headers);
      if (!session) return reply.status(401).send({ error: "Unauthorized" });
      const { treeId, id } = request.params as { treeId: string; id: string };
      const membership = await verifyMembership(treeId, session.user.id);
      if (!membership) return reply.status(403).send({ error: "Not a member" });
      if (!canMintTokens(membership.role)) {
        return reply.status(403).send({ error: "Insufficient role" });
      }
      const existing = await db.query.elderCaptureTokens.findFirst({
        where: (t, { and, eq, isNull }) =>
          and(eq(t.id, id), eq(t.treeId, treeId), isNull(t.revokedAt)),
      });
      if (!existing) return reply.status(404).send({ error: "Token not found" });
      const tree = await db.query.trees.findFirst({
        where: (t, { eq }) => eq(t.id, treeId),
      });
      if (!tree) return reply.status(404).send({ error: "Tree not found" });
      const rawToken = generateToken();
      const tokenHash = hashToken(rawToken);
      await db
        .update(schema.elderCaptureTokens)
        .set({ tokenHash })
        .where(eq(schema.elderCaptureTokens.id, existing.id));
      const emailSent = await sendInstallEmail({
        email: existing.email,
        rawToken,
        treeName: tree.name,
        familyLabel: existing.familyLabel,
        inviterName: session.user.name ?? session.user.email ?? "A family member",
      });
      return reply.send({
        ok: true,
        emailSent,
        url: `${WEB_URL}/elder/${rawToken}`,
      });
    },
  );

  /** POST /api/elder/:token/ping — mark that the PWA is installed */
  app.post("/api/elder/:token/ping", async (request, reply) => {
    const { token } = request.params as { token: string };
    const resolved = await resolveElderToken(token);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });
    const body = (request.body ?? {}) as { standalone?: boolean };
    await db
      .update(schema.elderCaptureTokens)
      .set({
        lastStandaloneAt: body.standalone ? new Date() : resolved.token.lastStandaloneAt,
        lastUsedAt: new Date(),
        lastUsedUserAgent:
          (request.headers["user-agent"] ?? "").toString().slice(0, 500) || null,
      })
      .where(eq(schema.elderCaptureTokens.id, resolved.token.id));
    return reply.send({ ok: true });
  });

  /** GET /api/elder/:token/inbox — public */
  app.get("/api/elder/:token/inbox", async (request, reply) => {
    const { token } = request.params as { token: string };
    const resolved = await resolveElderToken(token);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });
    const t = resolved.token;
    await touchToken(t.id, request);

    const pendingPrompts = t.associatedPerson
      ? await db.query.prompts.findMany({
          where: (p, { and, eq }) =>
            and(eq(p.toPersonId, t.associatedPerson!.id), eq(p.status, "pending")),
          with: { fromUser: true },
          orderBy: (p, { asc }) => [asc(p.createdAt)],
          limit: 10,
        })
      : [];

    const recent = await db.query.memories.findMany({
      where: (m, { and, eq }) =>
        and(
          eq(m.treeId, t.treeId),
          eq(m.contributingTreeId, t.treeId),
        ),
      orderBy: (m, { desc }) => [desc(m.createdAt)],
      with: { media: true },
      limit: 5,
    });

    return reply.send({
      familyLabel: t.familyLabel ?? t.tree?.name ?? "Family memories",
      treeName: t.tree?.name ?? "Family",
      displayName: t.displayName ?? deriveNameFromEmail(t.email),
      email: t.email,
      associatedPerson: t.associatedPerson
        ? { id: t.associatedPerson.id, name: t.associatedPerson.displayName }
        : null,
      pendingPrompts: pendingPrompts.map((p) => ({
        id: p.id,
        questionText: p.questionText,
        fromName: p.fromUser?.name ?? p.fromUser?.email ?? "A family member",
        createdAt: p.createdAt,
      })),
      recent: recent.slice(0, 3).map((m) => ({
        id: m.id,
        title: m.title,
        kind: m.kind,
        createdAt: m.createdAt,
        mediaUrl: m.media ? mediaUrl(m.media.objectKey) : null,
        mimeType: m.media?.mimeType ?? null,
      })),
    });
  });

  /** POST /api/elder/:token/media/presign */
  app.post("/api/elder/:token/media/presign", async (request, reply) => {
    const { token } = request.params as { token: string };
    const resolved = await resolveElderToken(token);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });
    const t = resolved.token;

    const parsed = PresignBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });
    const { filename, contentType, sizeBytes } = parsed.data;
    if (!isAllowedMimeType(contentType)) {
      return reply.status(415).send({ error: "Unsupported media type" });
    }
    const capacity = await checkTreeCanAdd(t.treeId, "media", sizeBytes);
    if (!capacity.allowed) {
      return reply.status(capacity.status).send({ error: capacity.reason });
    }
    const ext = filename.includes(".") ? filename.split(".").pop()! : "bin";
    const objectKey = `trees/${t.treeId}/elder-capture/${t.id}/${randomUUID()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(objectKey, contentType);
    const [mediaRecord] = await db
      .insert(schema.media)
      .values({
        treeId: t.treeId,
        contributingTreeId: t.treeId,
        uploadedByUserId: t.createdByUserId,
        objectKey,
        originalFilename: filename,
        mimeType: contentType,
        sizeBytes,
        storageProvider: "minio",
      })
      .returning();
    if (!mediaRecord) return reply.status(500).send({ error: "Media insert failed" });
    await touchToken(t.id, request);
    return reply.status(201).send({
      mediaId: mediaRecord.id,
      uploadUrl,
      objectKey,
    });
  });

  /** POST /api/elder/:token/submit */
  app.post("/api/elder/:token/submit", async (request, reply) => {
    return submitMemory(request, reply, false);
  });

  /** POST /api/elder/:token/reply/:promptId */
  app.post("/api/elder/:token/reply/:promptId", async (request, reply) => {
    return submitMemory(request, reply, true);
  });
}

async function submitMemory(
  request: FastifyRequest,
  reply: FastifyReply,
  isPromptReply: boolean,
) {
  const params = request.params as { token: string; promptId?: string };
  const resolved = await resolveElderToken(params.token);
  if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });
  const t = resolved.token;

  const parsed = SubmitBody.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });
  const { kind, body, mediaIds, dateOfEventText } = parsed.data;
  let { title } = parsed.data;
  let promptId = parsed.data.promptId ?? params.promptId ?? null;

  if (kind === "story" && !body) {
    return reply.status(400).send({ error: "Story memories need a body" });
  }
  if ((kind === "photo" || kind === "voice" || kind === "document") && !mediaIds?.length) {
    return reply.status(400).send({ error: `${kind} memories require media` });
  }
  if (!t.associatedPersonId) {
    return reply.status(400).send({
      error: "This link is not associated with a person yet — ask the steward to set one.",
    });
  }

  // Rate limit: max 30 submissions per token per 24h. Tracked in-process —
  // good enough until we move to Redis. Bypassable across restarts but caps
  // run-away spam from a single compromised token.
  const now = Date.now();
  const recentBucket = elderSubmitBuckets.get(t.id) ?? [];
  const fresh = recentBucket.filter((ts) => now - ts < 24 * 60 * 60 * 1000);
  if (fresh.length >= 30) {
    elderSubmitBuckets.set(t.id, fresh);
    return reply.status(429).send({
      error: "You've shared a lot today — please come back tomorrow.",
    });
  }
  fresh.push(now);
  elderSubmitBuckets.set(t.id, fresh);

  let promptRow: typeof schema.prompts.$inferSelect | null = null;
  if (isPromptReply) {
    if (!promptId) return reply.status(400).send({ error: "Missing promptId" });
    promptRow = (await db.query.prompts.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.id, promptId!), eq(p.treeId, t.treeId)),
    })) ?? null;
    if (!promptRow) return reply.status(404).send({ error: "Prompt not found" });
  }

  if (mediaIds?.length) {
    for (const mid of mediaIds) {
      const m = await db.query.media.findFirst({
        where: (mm, { and, eq }) => and(eq(mm.id, mid), eq(mm.treeId, t.treeId)),
      });
      if (!m) return reply.status(400).send({ error: "Media not in this tree" });
    }
  }

  if (!title) {
    title = deriveTitle({
      body,
      kind,
      questionText: promptRow?.questionText ?? null,
    });
  }

  let createdMemoryId: string | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const normalizedEmail = t.email.toLowerCase();
      const existingUser = await tx.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, normalizedEmail),
      });
      const contributorUserId =
        existingUser?.id ?? `email_${randomUUID().replace(/-/g, "")}`;
      if (!existingUser) {
        await tx.insert(schema.users).values({
          id: contributorUserId,
          email: normalizedEmail,
          name: (t.displayName ?? deriveNameFromEmail(normalizedEmail)).slice(0, 200),
          emailVerified: false,
          image: null,
        });
      }

      const memory = await createMemoryWithPrimaryTag(tx, {
        treeId: t.treeId,
        primaryPersonId: t.associatedPersonId!,
        contributorUserId,
        kind,
        title: title!,
        body,
        mediaId: mediaIds?.[0] ?? null,
        mediaIds: mediaIds ?? [],
        promptId: promptRow?.id ?? null,
        dateOfEventText,
      });
      if (!memory) throw new Error("Failed to create memory");

      if (promptRow) {
        await tx
          .update(schema.prompts)
          .set({ status: "answered", updatedAt: new Date() })
          .where(eq(schema.prompts.id, promptRow.id));
      }
      return memory;
    });
    createdMemoryId = result.id;
    if (kind === "voice") {
      await enqueueMemoryTranscription(result.id, t.treeId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return reply.status(400).send({ error: message });
  }

  await touchToken(t.id, request);

  const full = createdMemoryId
    ? await db.query.memories.findFirst({
        where: (m, { eq }) => eq(m.id, createdMemoryId),
        with: {
          media: true,
          mediaItems: {
            with: { media: true },
            orderBy: (memoryMediaItem, { asc }) => [asc(memoryMediaItem.sortOrder)],
          },
        },
      })
    : null;
  const primaryItem = full?.mediaItems?.[0];
  return reply.status(201).send({
    id: full?.id,
    title: full?.title,
    kind: full?.kind,
    body: full?.body,
    createdAt: full?.createdAt,
    mediaUrl: primaryItem?.media
      ? mediaUrl(primaryItem.media.objectKey)
      : full?.media
        ? mediaUrl(full.media.objectKey)
        : null,
    mimeType: primaryItem?.media?.mimeType ?? full?.media?.mimeType ?? null,
  });
}

// Suppress unused-import warning for ResolvedToken (kept for clarity)
void (null as unknown as ResolvedToken);
