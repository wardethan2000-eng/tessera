import { createHash, randomBytes } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@tessera/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import { mailer, MAIL_FROM } from "../lib/mailer.js";
import { mayEmailUser } from "./me.js";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (t, { and, eq }) => and(eq(t.treeId, treeId), eq(t.userId, userId)),
  });
}

function canManageCampaigns(role: string): boolean {
  return role === "founder" || role === "steward" || role === "contributor";
}

const CreateCampaignBody = z.object({
  toPersonId: z.string().uuid(),
  name: z.string().min(1).max(200),
  cadenceDays: z.number().int().min(1).max(365),
  startsAt: z
    .string()
    .datetime()
    .optional(),
  recipientEmails: z
    .array(z.string().email().max(320))
    .min(1)
    .max(50),
  questions: z.array(z.string().min(1).max(1000)).min(1).max(60),
});

const PatchCampaignBody = z.object({
  status: z.enum(["active", "paused", "completed"]).optional(),
  cadenceDays: z.number().int().min(1).max(365).optional(),
  name: z.string().min(1).max(200).optional(),
  nextSendAt: z.string().datetime().optional(),
});

const AddQuestionsBody = z.object({
  questions: z.array(z.string().min(1).max(1000)).min(1).max(60),
});

export async function promptCampaignsPlugin(app: FastifyInstance): Promise<void> {
  /** GET /api/trees/:treeId/prompt-campaigns — list campaigns */
  app.get("/api/trees/:treeId/prompt-campaigns", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });

    const campaigns = await db.query.promptCampaigns.findMany({
      where: (c, { eq }) => eq(c.treeId, treeId),
      with: {
        toPerson: true,
        questions: true,
        recipients: true,
        fromUser: true,
      },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });

    return reply.send({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        cadenceDays: c.cadenceDays,
        nextSendAt: c.nextSendAt,
        lastSentAt: c.lastSentAt,
        createdAt: c.createdAt,
        toPerson: c.toPerson
          ? { id: c.toPerson.id, name: c.toPerson.displayName }
          : null,
        fromUser: c.fromUser
          ? { id: c.fromUser.id, name: c.fromUser.name ?? c.fromUser.email }
          : null,
        recipients: c.recipients.map((r) => ({ id: r.id, email: r.email })),
        questions: c.questions
          .sort((a, b) => a.position - b.position)
          .map((q) => ({
            id: q.id,
            questionText: q.questionText,
            position: q.position,
            sentAt: q.sentAt,
          })),
        sentCount: c.questions.filter((q) => q.sentAt !== null).length,
        totalCount: c.questions.length,
      })),
    });
  });

  /** POST /api/trees/:treeId/prompt-campaigns — create campaign */
  app.post("/api/trees/:treeId/prompt-campaigns", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });
    if (!canManageCampaigns(membership.role)) {
      return reply.status(403).send({ error: "Not allowed to create prompt campaigns" });
    }

    const parsed = CreateCampaignBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const person = await db.query.people.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, parsed.data.toPersonId), eq(p.treeId, treeId)),
    });
    if (!person) return reply.status(404).send({ error: "Person not found in this tree" });

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();

    const [campaign] = await db
      .insert(schema.promptCampaigns)
      .values({
        treeId,
        fromUserId: session.user.id,
        toPersonId: parsed.data.toPersonId,
        name: parsed.data.name,
        cadenceDays: parsed.data.cadenceDays,
        nextSendAt: startsAt,
        status: "active",
      })
      .returning();
    if (!campaign) return reply.status(500).send({ error: "Failed to create campaign" });

    const dedupedEmails = Array.from(
      new Set(parsed.data.recipientEmails.map((e) => e.toLowerCase().trim())),
    );

    if (dedupedEmails.length > 0) {
      await db.insert(schema.promptCampaignRecipients).values(
        dedupedEmails.map((email) => ({ campaignId: campaign.id, email })),
      );
    }

    await db.insert(schema.promptCampaignQuestions).values(
      parsed.data.questions.map((questionText, index) => ({
        campaignId: campaign.id,
        questionText,
        position: index,
      })),
    );

    return reply.status(201).send({ id: campaign.id });
  });

  /** PATCH /api/trees/:treeId/prompt-campaigns/:id — update status/cadence/name */
  app.patch("/api/trees/:treeId/prompt-campaigns/:id", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, id } = request.params as { treeId: string; id: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });
    if (!canManageCampaigns(membership.role)) {
      return reply.status(403).send({ error: "Not allowed" });
    }

    const parsed = PatchCampaignBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const existing = await db.query.promptCampaigns.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.treeId, treeId)),
    });
    if (!existing) return reply.status(404).send({ error: "Campaign not found" });

    const updates: Partial<typeof schema.promptCampaigns.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.cadenceDays) updates.cadenceDays = parsed.data.cadenceDays;
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.nextSendAt) updates.nextSendAt = new Date(parsed.data.nextSendAt);

    await db.update(schema.promptCampaigns).set(updates).where(eq(schema.promptCampaigns.id, id));
    return reply.send({ ok: true });
  });

  /** POST /api/trees/:treeId/prompt-campaigns/:id/questions — append questions */
  app.post("/api/trees/:treeId/prompt-campaigns/:id/questions", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, id } = request.params as { treeId: string; id: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });
    if (!canManageCampaigns(membership.role)) {
      return reply.status(403).send({ error: "Not allowed" });
    }

    const parsed = AddQuestionsBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const existing = await db.query.promptCampaigns.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.treeId, treeId)),
      with: { questions: true },
    });
    if (!existing) return reply.status(404).send({ error: "Campaign not found" });

    const startPos = existing.questions.length;
    await db.insert(schema.promptCampaignQuestions).values(
      parsed.data.questions.map((questionText, index) => ({
        campaignId: id,
        questionText,
        position: startPos + index,
      })),
    );

    if (existing.status === "completed") {
      await db
        .update(schema.promptCampaigns)
        .set({
          status: "active",
          nextSendAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.promptCampaigns.id, id));
    }

    return reply.status(201).send({ ok: true });
  });

  /** DELETE /api/trees/:treeId/prompt-campaigns/:id */
  app.delete("/api/trees/:treeId/prompt-campaigns/:id", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, id } = request.params as { treeId: string; id: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });
    if (!canManageCampaigns(membership.role)) {
      return reply.status(403).send({ error: "Not allowed" });
    }

    const existing = await db.query.promptCampaigns.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.treeId, treeId)),
    });
    if (!existing) return reply.status(404).send({ error: "Campaign not found" });

    await db.delete(schema.promptCampaigns).where(eq(schema.promptCampaigns.id, id));
    return reply.send({ ok: true });
  });

  /** POST /api/trees/:treeId/prompt-campaigns/:id/send-test — send the next
   * question of this campaign immediately, regardless of schedule or status.
   * Advances nextSendAt like a normal tick. Useful for dogfooding. */
  app.post("/api/trees/:treeId/prompt-campaigns/:id/send-test", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, id } = request.params as { treeId: string; id: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member of this tree" });
    if (!canManageCampaigns(membership.role)) {
      return reply.status(403).send({ error: "Not allowed" });
    }

    const campaign = await db.query.promptCampaigns.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.treeId, treeId)),
    });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });

    const result = await processCampaignOnce(campaign, request.log);
    if (!result.sent) {
      return reply.status(400).send({ error: result.reason ?? "Nothing to send" });
    }
    return reply.send({
      ok: true,
      questionId: result.questionId,
      recipients: result.recipientsAttempted,
      sent: result.recipientsSent,
    });
  });
}

type CampaignRow = typeof schema.promptCampaigns.$inferSelect;

type ProcessResult =
  | { sent: false; reason: string }
  | {
      sent: true;
      questionId: string;
      recipientsAttempted: number;
      recipientsSent: number;
    };

/** Send the next unsent question of a single campaign. Extracted so the
 * scheduler loop and the manual "send test now" endpoint share one code path.
 * Updates question.sentAt and the campaign's nextSendAt on success. */
async function processCampaignOnce(
  campaign: CampaignRow,
  log: FastifyBaseLogger,
): Promise<ProcessResult> {
  const nextQuestion = await db.query.promptCampaignQuestions.findFirst({
    where: (q, { and, eq, isNull }) =>
      and(eq(q.campaignId, campaign.id), isNull(q.sentAt)),
    orderBy: (q, { asc }) => [asc(q.position)],
  });

  if (!nextQuestion) {
    await db
      .update(schema.promptCampaigns)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(schema.promptCampaigns.id, campaign.id));
    return { sent: false, reason: "Campaign has no unsent questions left" };
  }

  const recipients = await db
    .select()
    .from(schema.promptCampaignRecipients)
    .where(eq(schema.promptCampaignRecipients.campaignId, campaign.id));

  if (recipients.length === 0) {
    log.warn({ campaignId: campaign.id }, "Campaign has no recipients; pausing");
    await db
      .update(schema.promptCampaigns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(schema.promptCampaigns.id, campaign.id));
    return { sent: false, reason: "Campaign has no recipients" };
  }

  const tree = await db.query.trees.findFirst({
    where: (t, { eq }) => eq(t.id, campaign.treeId),
  });
  const fromUser = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, campaign.fromUserId),
  });
  const person = await db.query.people.findFirst({
    where: (p, { eq }) => eq(p.id, campaign.toPersonId),
  });
  if (!tree || !fromUser || !person) {
    log.error({ campaignId: campaign.id }, "Campaign references missing entity; pausing");
    await db
      .update(schema.promptCampaigns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(schema.promptCampaigns.id, campaign.id));
    return { sent: false, reason: "Missing related record (tree, sender, or subject)" };
  }

  const [prompt] = await db
    .insert(schema.prompts)
    .values({
      treeId: campaign.treeId,
      fromUserId: campaign.fromUserId,
      toPersonId: campaign.toPersonId,
      questionText: nextQuestion.questionText,
      status: "pending",
    })
    .returning();
  if (!prompt) {
    return { sent: false, reason: "Failed to create prompt row" };
  }

  const fromName = fromUser.name ?? fromUser.email ?? "A family member";
  const personName = person.displayName ?? "your family member";
  let sentCount = 0;

  for (const recipient of recipients) {
    const email = recipient.email.toLowerCase();
    if (!(await mayEmailUser(email, "promptsEmail"))) {
      log.info({ campaignId: campaign.id, email }, "Recipient opted out; skipping");
      continue;
    }
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const [link] = await db
      .insert(schema.promptReplyLinks)
      .values({
        treeId: campaign.treeId,
        promptId: prompt.id,
        email,
        tokenHash,
        status: "pending",
        createdByUserId: campaign.fromUserId,
        expiresAt,
      })
      .returning();
    if (!link) continue;

    const replyUrl = `${WEB_URL}/prompts/reply?token=${encodeURIComponent(rawToken)}`;
    try {
      await mailer.sendMail({
        from: MAIL_FROM,
        to: email,
        subject: `${campaign.name} — a question for ${personName}`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1C1915; background: #F6F1E7;">
            <h1 style="font-size: 24px; font-weight: 400; margin: 0 0 14px;">A weekly question</h1>
            <p style="font-size: 15px; line-height: 1.7; color: #403A2E; margin: 0 0 12px;">
              This is part of <strong>${campaign.name}</strong>, a series ${fromName} is gathering for the family archive about <strong>${personName}</strong>.
            </p>
            <blockquote style="margin: 0 0 20px; padding: 14px 16px; border-left: 3px solid #B08B3E; background: #EDE6D6; color: #1C1915;">
              ${nextQuestion.questionText}
            </blockquote>
            <p style="margin: 0 0 24px;">
              <a href="${replyUrl}"
                 style="background: #4E5D42; color: #F6F1E7; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; display: inline-block;">
                Share a story, voice note, photo, or document
              </a>
            </p>
            <p style="font-size: 12px; color: #847A66; line-height: 1.6;">
              This link is private and expires in 14 days. You can reply or skip — another question will arrive in ${campaign.cadenceDays} day${campaign.cadenceDays === 1 ? "" : "s"}.
            </p>
          </div>
        `,
        text: `${fromName} asked: "${nextQuestion.questionText}"\n\nReply: ${replyUrl}\n\nThis private link expires in 14 days.`,
      });
      sentCount += 1;
    } catch (err) {
      log.error(
        { err, campaignId: campaign.id, email },
        "Failed to send campaign email; revoking link",
      );
      await db
        .delete(schema.promptReplyLinks)
        .where(eq(schema.promptReplyLinks.id, link.id));
    }
  }

  await db
    .update(schema.promptCampaignQuestions)
    .set({ sentAt: new Date(), sentPromptId: prompt.id })
    .where(eq(schema.promptCampaignQuestions.id, nextQuestion.id));

  const advance = new Date(Date.now() + campaign.cadenceDays * 24 * 60 * 60 * 1000);
  await db
    .update(schema.promptCampaigns)
    .set({ nextSendAt: advance, lastSentAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.promptCampaigns.id, campaign.id));

  log.info(
    {
      campaignId: campaign.id,
      questionId: nextQuestion.id,
      recipients: recipients.length,
      sent: sentCount,
    },
    "Campaign question sent",
  );

  return {
    sent: true,
    questionId: nextQuestion.id,
    recipientsAttempted: recipients.length,
    recipientsSent: sentCount,
  };
}

/** Run one tick of the campaign scheduler. Sends one due question per
 * active campaign whose nextSendAt is in the past. */
export async function processDueCampaigns(log: FastifyBaseLogger): Promise<void> {
  const now = new Date();
  const due = await db
    .select()
    .from(schema.promptCampaigns)
    .where(
      and(
        eq(schema.promptCampaigns.status, "active"),
        lte(schema.promptCampaigns.nextSendAt, now),
      ),
    );

  for (const campaign of due) {
    try {
      await processCampaignOnce(campaign, log);
    } catch (err) {
      log.error({ err, campaignId: campaign.id }, "Failed to process campaign tick");
    }
  }
}

let schedulerHandle: ReturnType<typeof setInterval> | null = null;

/** Start the campaign scheduler. Runs every `intervalMs` (default 5min). */
export function startPromptCampaignScheduler(
  log: FastifyBaseLogger,
  intervalMs = 5 * 60 * 1000,
): () => void {
  if (schedulerHandle) {
    return () => {
      if (schedulerHandle) {
        clearInterval(schedulerHandle);
        schedulerHandle = null;
      }
    };
  }

  // Fire one initial tick after a short delay to catch any campaigns that
  // were already due when the server started.
  const initialTimer = setTimeout(() => {
    processDueCampaigns(log).catch((err) =>
      log.error({ err }, "Initial prompt campaign tick failed"),
    );
  }, 30 * 1000);

  schedulerHandle = setInterval(() => {
    processDueCampaigns(log).catch((err) =>
      log.error({ err }, "Prompt campaign tick failed"),
    );
  }, intervalMs);

  log.info({ intervalMs }, "Prompt campaign scheduler started");

  return () => {
    clearTimeout(initialTimer);
    if (schedulerHandle) {
      clearInterval(schedulerHandle);
      schedulerHandle = null;
    }
  };
}


