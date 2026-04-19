import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createTransport } from "nodemailer";
import * as schema from "@familytree/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import {
  getPresignedUploadUrl,
  isAllowedMimeType,
  mediaUrl,
} from "../lib/storage.js";
import { enqueueMemoryTranscription } from "../lib/transcription.js";

const mailer = createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? "1025"),
  secure: false,
});

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const CreatePromptBody = z.object({
  toPersonId: z.string().uuid(),
  questionText: z.string().min(1).max(1000),
});

const ReplyBody = z.object({
  kind: z.enum(["story", "photo", "voice", "document", "other"]),
  title: z.string().min(1).max(200),
  body: z.string().optional(),
  mediaId: z.string().uuid().optional(),
  dateOfEventText: z.string().max(100).optional(),
  placeId: z.string().uuid().optional(),
  placeLabelOverride: z.string().max(200).optional(),
});

const PublicReplyBody = ReplyBody.extend({
  submitterName: z.string().min(1).max(200).optional(),
});

const UpdatePromptBody = z.object({
  status: z.enum(["pending", "answered", "dismissed"]),
});

const CreateEmailReplyLinkBody = z.object({
  email: z.string().email(),
});

const PresignBody = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(200 * 1024 * 1024), // 200 MB cap
});

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, userId)),
  });
}

function canAccessAllPrompts(role: string): boolean {
  return role === "founder" || role === "steward" || role === "contributor";
}

function canManagePrompt(
  role: string,
  promptLinkedUserId: string | null | undefined,
  currentUserId: string,
): boolean {
  const isModerator = role === "founder" || role === "steward";
  const isRecipient = promptLinkedUserId === currentUserId;
  return isModerator || isRecipient;
}

function canSendEmailReplyLink(
  role: string,
  promptSenderUserId: string,
  promptLinkedUserId: string | null | undefined,
  currentUserId: string,
): boolean {
  if (role === "viewer") return false;
  const isSender = promptSenderUserId === currentUserId;
  return (
    isSender ||
    canManagePrompt(role, promptLinkedUserId, currentUserId)
  );
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function deriveNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Family member";
  return cleaned.slice(0, 200);
}

export async function promptsPlugin(app: FastifyInstance): Promise<void> {
  /** POST /api/trees/:treeId/prompts — send a memory prompt to a person */
  app.post("/api/trees/:treeId/prompts", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    const parsed = CreatePromptBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid request body" });

    const { toPersonId, questionText } = parsed.data;

    const person = await db.query.people.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, toPersonId), eq(p.treeId, treeId)),
    });
    if (!person) return reply.status(404).send({ error: "Person not found in this tree" });

    const [prompt] = await db
      .insert(schema.prompts)
      .values({ treeId, fromUserId: session.user.id, toPersonId, questionText })
      .returning();
    if (!prompt) return reply.status(500).send({ error: "Failed to create prompt" });

    const full = await db.query.prompts.findFirst({
      where: (p, { eq }) => eq(p.id, prompt.id),
      with: {
        fromUser: true,
        toPerson: { with: { portraitMedia: true } },
      },
    });

    return reply.status(201).send(enrichPrompt(full as PromptWithRelations));
  });

  /** GET /api/trees/:treeId/prompts — all prompts in tree (founder/steward/contributor) */
  app.get("/api/trees/:treeId/prompts", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });
    if (!canAccessAllPrompts(membership.role)) {
      return reply
        .status(403)
        .send({ error: "Only contributors, stewards, or founders can view all prompts" });
    }

    const prompts = await db.query.prompts.findMany({
      where: (p, { eq }) => eq(p.treeId, treeId),
      with: {
        fromUser: true,
        toPerson: { with: { portraitMedia: true } },
        replies: { with: { media: true } },
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });

    return reply.send(prompts.map((p) => enrichPromptWithReplies(p as PromptWithRelations)));
  });

  /** GET /api/trees/:treeId/prompts/inbox — prompts directed to the current user's linked person */
  app.get("/api/trees/:treeId/prompts/inbox", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    const linkedPerson = await db.query.people.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.treeId, treeId), eq(p.linkedUserId, session.user.id)),
    });

    if (!linkedPerson) return reply.send([]);

    const prompts = await db.query.prompts.findMany({
      where: (p, { and, eq }) =>
        and(eq(p.treeId, treeId), eq(p.toPersonId, linkedPerson.id)),
      with: {
        fromUser: true,
        toPerson: { with: { portraitMedia: true } },
        replies: { with: { media: true } },
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });

    return reply.send(prompts.map((p) => enrichPromptWithReplies(p as PromptWithRelations)));
  });

  /** PATCH /api/trees/:treeId/prompts/:promptId — update status (dismiss, etc.) */
  app.patch("/api/trees/:treeId/prompts/:promptId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, promptId } = request.params as { treeId: string; promptId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    const parsed = UpdatePromptBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid request body" });

    const prompt = await db.query.prompts.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, promptId), eq(p.treeId, treeId)),
      with: { toPerson: true },
    });
    if (!prompt) return reply.status(404).send({ error: "Prompt not found" });
    if (
      !canManagePrompt(
        membership.role,
        prompt.toPerson?.linkedUserId,
        session.user.id,
      )
    ) {
      return reply.status(403).send({ error: "Not allowed to update this prompt" });
    }

    const [updated] = await db
      .update(schema.prompts)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.treeId, treeId)))
      .returning();

    return reply.send(updated);
  });

  /** POST /api/trees/:treeId/prompts/:promptId/reply — create a memory as a reply */
  app.post("/api/trees/:treeId/prompts/:promptId/reply", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, promptId } = request.params as { treeId: string; promptId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    const parsed = ReplyBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid request body" });

    const prompt = await db.query.prompts.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, promptId), eq(p.treeId, treeId)),
      with: { toPerson: true },
    });
    if (!prompt) return reply.status(404).send({ error: "Prompt not found" });
    if (
      !canManagePrompt(
        membership.role,
        prompt.toPerson?.linkedUserId,
        session.user.id,
      )
    ) {
      return reply.status(403).send({ error: "Not allowed to reply to this prompt" });
    }
    if (prompt.status !== "pending") {
      return reply.status(409).send({ error: "Prompt is not pending" });
    }

    const { kind, title, body, mediaId, dateOfEventText, placeId, placeLabelOverride } = parsed.data;
    if (kind === "story" && !body) {
      return reply.status(400).send({ error: "Story memories require a body" });
    }
    if ((kind === "photo" || kind === "voice" || kind === "document") && !mediaId) {
      return reply.status(400).send({ error: `${kind} memories require a mediaId` });
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

    const [memory] = await db
      .insert(schema.memories)
      .values({
        treeId,
        primaryPersonId: prompt.toPersonId,
        contributorUserId: session.user.id,
        kind,
        title,
        body: body ?? null,
        mediaId: mediaId ?? null,
        promptId,
        dateOfEventText: dateOfEventText ?? null,
        placeId: placeId ?? null,
        placeLabelOverride: placeLabelOverride ?? null,
      })
      .returning();
    if (!memory) return reply.status(500).send({ error: "Failed to create reply memory" });

    await db
      .update(schema.prompts)
      .set({ status: "answered", updatedAt: new Date() })
      .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.treeId, treeId)));

    if (kind === "voice") {
      await enqueueMemoryTranscription(memory.id, treeId);
    }

    const full = await db.query.memories.findFirst({
      where: (m, { eq }) => eq(m.id, memory.id),
      with: { media: true },
    });

    return reply.status(201).send({
      ...full,
      mediaUrl: full?.media ? mediaUrl(full.media.objectKey) : null,
      mimeType: full?.media?.mimeType ?? null,
    });
  });

  /** POST /api/trees/:treeId/prompts/:promptId/email-link — send lightweight email reply link */
  app.post("/api/trees/:treeId/prompts/:promptId/email-link", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, promptId } = request.params as { treeId: string; promptId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    const parsed = CreateEmailReplyLinkBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid request body" });

    const prompt = await db.query.prompts.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, promptId), eq(p.treeId, treeId)),
      with: {
        tree: true,
        fromUser: true,
        toPerson: true,
      },
    });
    if (!prompt) return reply.status(404).send({ error: "Prompt not found" });
    if (prompt.status !== "pending") {
      return reply.status(409).send({ error: "Prompt is not pending" });
    }
    if (
      !canSendEmailReplyLink(
        membership.role,
        prompt.fromUserId,
        prompt.toPerson?.linkedUserId,
        session.user.id,
      )
    ) {
      return reply.status(403).send({ error: "Not allowed to send email links for this prompt" });
    }

    const email = parsed.data.email.toLowerCase();
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const [replyLink] = await db
      .insert(schema.promptReplyLinks)
      .values({
        treeId,
        promptId,
        email,
        tokenHash,
        status: "pending",
        createdByUserId: session.user.id,
        expiresAt,
      })
      .returning();
    if (!replyLink) {
      return reply.status(500).send({ error: "Failed to create prompt reply link" });
    }

    const replyUrl = `${WEB_URL}/prompts/reply?token=${encodeURIComponent(rawToken)}`;
    const fromName = prompt.fromUser?.name ?? prompt.fromUser?.email ?? "A family member";
    const personName = prompt.toPerson?.displayName ?? "your family member";

    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@familytree.local",
        to: email,
        subject: `${fromName} asked a family history question`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1C1915; background: #F6F1E7;">
            <h1 style="font-size: 26px; font-weight: 400; margin: 0 0 14px;">Share a memory</h1>
            <p style="font-size: 16px; line-height: 1.7; color: #403A2E; margin: 0 0 12px;">
              <strong>${fromName}</strong> asked a question for <strong>${personName}</strong> in the family archive.
            </p>
            <blockquote style="margin: 0 0 20px; padding: 14px 16px; border-left: 3px solid #B08B3E; background: #EDE6D6; color: #1C1915;">
              ${prompt.questionText}
            </blockquote>
            <p style="margin: 0 0 24px;">
              <a href="${replyUrl}"
                 style="background: #4E5D42; color: #F6F1E7; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; display: inline-block;">
                Reply with a story, voice note, photo, or document
              </a>
            </p>
            <p style="font-size: 12px; color: #847A66; line-height: 1.6;">
              This link is private and expires in 14 days.
            </p>
          </div>
        `,
        text: `${fromName} asked: "${prompt.questionText}"\n\nReply here: ${replyUrl}\n\nThis private link expires in 14 days.`,
      });
    } catch (err) {
      await db.delete(schema.promptReplyLinks).where(eq(schema.promptReplyLinks.id, replyLink.id));
      throw err;
    }

    return reply.status(201).send({
      message: "Reply link sent",
      email,
      expiresAt,
    });
  });

  /** GET /api/prompt-replies/:token — public prompt metadata for lightweight reply flow */
  app.get("/api/prompt-replies/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const resolved = await resolveReplyLink(token);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });

    return reply.send({
      promptId: resolved.link.promptId,
      treeId: resolved.link.treeId,
      treeName: resolved.link.prompt.tree?.name ?? "Family archive",
      questionText: resolved.link.prompt.questionText,
      toPersonName: resolved.link.prompt.toPerson?.displayName ?? null,
      fromUserName:
        resolved.link.prompt.fromUser?.name ??
        resolved.link.prompt.fromUser?.email ??
        "A family member",
      email: resolved.link.email,
      expiresAt: resolved.link.expiresAt,
    });
  });

  /** POST /api/prompt-replies/:token/media/presign — public token-scoped media upload */
  app.post("/api/prompt-replies/:token/media/presign", async (request, reply) => {
    const { token } = request.params as { token: string };
    const resolved = await resolveReplyLink(token);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });

    const parsed = PresignBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid request body" });

    const { filename, contentType, sizeBytes } = parsed.data;

    if (!isAllowedMimeType(contentType)) {
      return reply.status(415).send({ error: "Unsupported media type" });
    }

    const ext = filename.includes(".") ? filename.split(".").pop()! : "bin";
    const objectKey = `trees/${resolved.link.treeId}/reply-links/${resolved.link.id}/${randomUUID()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(objectKey, contentType);

    const [mediaRecord] = await db
      .insert(schema.media)
      .values({
        treeId: resolved.link.treeId,
        uploadedByUserId: resolved.link.createdByUserId,
        objectKey,
        originalFilename: filename,
        mimeType: contentType,
        sizeBytes,
        storageProvider: "minio",
      })
      .returning();
    if (!mediaRecord) {
      return reply.status(500).send({ error: "Failed to create media record" });
    }

    return reply.status(201).send({
      mediaId: mediaRecord.id,
      uploadUrl,
      objectKey,
    });
  });

  /** POST /api/prompt-replies/:token/reply — submit memory via lightweight email token */
  app.post("/api/prompt-replies/:token/reply", async (request, reply) => {
    const { token } = request.params as { token: string };
    const resolved = await resolveReplyLink(token);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });

    const parsed = PublicReplyBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid request body" });

    const { kind, title, body, mediaId, dateOfEventText, placeId, placeLabelOverride, submitterName } = parsed.data;
    if (kind === "story" && !body) {
      return reply.status(400).send({ error: "Story memories require a body" });
    }
    if ((kind === "photo" || kind === "voice" || kind === "document") && !mediaId) {
      return reply.status(400).send({ error: `${kind} memories require a mediaId` });
    }

    if (mediaId) {
      const mediaRecord = await db.query.media.findFirst({
        where: (m) => and(eq(m.id, mediaId), eq(m.treeId, resolved.link.treeId)),
      });
      if (!mediaRecord) {
        return reply.status(400).send({ error: "Media not found in this tree" });
      }
    }
    if (placeId) {
      const place = await db.query.places.findFirst({
        where: (p) => and(eq(p.id, placeId), eq(p.treeId, resolved.link.treeId)),
      });
      if (!place) {
        return reply.status(400).send({ error: "Place not found in this tree" });
      }
    }

    let createdMemoryId: string | null = null;
    try {
      const result = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(schema.promptReplyLinks)
          .set({
            status: "used",
            usedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.promptReplyLinks.id, resolved.link.id),
              eq(schema.promptReplyLinks.status, "pending"),
            ),
          )
          .returning();
        if (!claimed) {
          throw new Error("Reply link is no longer available");
        }
        if (new Date() > claimed.expiresAt) {
          throw new Error("Reply link has expired");
        }

        const normalizedEmail = resolved.link.email.toLowerCase();
        const existingUser = await tx.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, normalizedEmail),
        });
        const contributorUserId = existingUser?.id ?? `email_${randomUUID().replace(/-/g, "")}`;

        if (!existingUser) {
          await tx.insert(schema.users).values({
            id: contributorUserId,
            email: normalizedEmail,
            name:
              (submitterName?.trim() || deriveNameFromEmail(normalizedEmail)).slice(0, 200),
            emailVerified: false,
            image: null,
          });
        }

        const [memory] = await tx
          .insert(schema.memories)
          .values({
            treeId: resolved.link.treeId,
            primaryPersonId: resolved.link.prompt.toPersonId,
            contributorUserId,
            kind,
            title,
            body: body ?? null,
            mediaId: mediaId ?? null,
            promptId: resolved.link.promptId,
            dateOfEventText: dateOfEventText ?? null,
            placeId: placeId ?? null,
            placeLabelOverride: placeLabelOverride ?? null,
          })
          .returning();
        if (!memory) {
          throw new Error("Failed to create memory");
        }

        await tx
          .update(schema.prompts)
          .set({
            status: "answered",
            updatedAt: new Date(),
          })
          .where(eq(schema.prompts.id, resolved.link.promptId));

        return memory;
      });

      createdMemoryId = result.id;
      if (kind === "voice") {
        await enqueueMemoryTranscription(result.id, resolved.link.treeId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit reply";
      if (
        message.includes("no longer available") ||
        message.includes("expired")
      ) {
        return reply.status(410).send({ error: message });
      }
      return reply.status(400).send({ error: message });
    }

    const full = createdMemoryId
      ? await db.query.memories.findFirst({
          where: (m, { eq }) => eq(m.id, createdMemoryId),
          with: { media: true },
        })
      : null;

    return reply.status(201).send({
      ...full,
      mediaUrl: full?.media ? mediaUrl(full.media.objectKey) : null,
      mimeType: full?.media?.mimeType ?? null,
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type PromptWithRelations = {
  id: string;
  treeId: string;
  fromUserId: string;
  toPersonId: string;
  questionText: string;
  status: "pending" | "answered" | "dismissed";
  createdAt: Date;
  updatedAt: Date;
  fromUser?: { id: string; name: string; email: string } | null;
  toPerson?: {
    id: string;
    displayName: string;
    linkedUserId?: string | null;
    portraitMedia?: { objectKey: string } | null;
  } | null;
  replies?: Array<{
    id: string;
    kind: string;
    title: string;
    media?: { objectKey: string; mimeType: string } | null;
    [key: string]: unknown;
  }>;
};

type ResolvedReplyLink = {
  id: string;
  treeId: string;
  promptId: string;
  email: string;
  status: "pending" | "used" | "revoked" | "expired";
  createdByUserId: string | null;
  expiresAt: Date;
  prompt: {
    id: string;
    toPersonId: string;
    questionText: string;
    status: "pending" | "answered" | "dismissed";
    toPerson: { displayName: string } | null;
    fromUser: { name: string; email: string } | null;
    tree: { name: string } | null;
  };
};

async function resolveReplyLink(
  rawToken: string,
): Promise<
  | { ok: true; link: ResolvedReplyLink }
  | { ok: false; status: number; error: string }
> {
  const tokenHash = hashToken(rawToken);
  const link = await db.query.promptReplyLinks.findFirst({
    where: (l, { eq }) => eq(l.tokenHash, tokenHash),
    with: {
      prompt: {
        with: {
          toPerson: true,
          fromUser: true,
          tree: true,
        },
      },
    },
  });

  if (!link || !link.prompt) {
    return { ok: false, status: 404, error: "Reply link not found" };
  }

  if (link.status !== "pending") {
    return { ok: false, status: 410, error: "Reply link is no longer active" };
  }

  if (new Date() > link.expiresAt) {
    await db
      .update(schema.promptReplyLinks)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(schema.promptReplyLinks.id, link.id));
    return { ok: false, status: 410, error: "Reply link has expired" };
  }

  if (link.prompt.status !== "pending") {
    return { ok: false, status: 410, error: "Prompt is no longer accepting replies" };
  }

  return {
    ok: true,
    link: link as ResolvedReplyLink,
  };
}

function enrichPrompt(p: PromptWithRelations | null | undefined) {
  if (!p) return p;
  return {
    ...p,
    personName: p.toPerson?.displayName ?? null,
    personPortraitUrl: p.toPerson?.portraitMedia
      ? mediaUrl(p.toPerson.portraitMedia.objectKey)
      : null,
    fromUserName: p.fromUser?.name ?? null,
  };
}

function enrichPromptWithReplies(p: PromptWithRelations) {
  const base = enrichPrompt(p);
  if (!base) return base;
  return {
    ...base,
    replies: (p.replies ?? []).map((r) => ({
      ...r,
      mediaUrl: r.media ? mediaUrl(r.media.objectKey) : null,
      mimeType: r.media?.mimeType ?? null,
    })),
  };
}
