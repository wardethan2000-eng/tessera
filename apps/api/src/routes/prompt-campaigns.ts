import { createHash, randomBytes } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { and, eq, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@tessera/database";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import { mailer, MAIL_FROM } from "../lib/mailer.js";
import { escapeHtml } from "../lib/email-templates.js";
import { mayEmailUser } from "./me.js";
import { sendInstallEmail as sendElderInstallEmail } from "./elder-capture.js";

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
           ? { id: c.fromUser.id, name: c.fromUser.name ?? "A tree member" }
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

      // Auto-mint an elder capture token for any recipient that doesn't
      // already have one for this tree, and email them the install link so
      // every subsequent campaign question opens inside their PWA.
      const tree = await db.query.trees.findFirst({
        where: (t, { eq }) => eq(t.id, treeId),
      });
      const inviter = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, session.user.id),
      });
      const inviterName = inviter?.name ?? inviter?.email ?? "A family member";
      for (const email of dedupedEmails) {
        const existing = await db.query.elderCaptureTokens.findFirst({
          where: (t, { and, eq, isNull }) =>
            and(eq(t.treeId, treeId), eq(t.email, email), isNull(t.revokedAt)),
        });
        if (!existing) {
          const rawToken = randomBytes(32).toString("hex");
          const tokenHash = createHash("sha256").update(rawToken).digest("hex");
          await db.insert(schema.elderCaptureTokens).values({
            treeId,
            email,
            tokenHash,
            associatedPersonId: parsed.data.toPersonId,
            createdByUserId: session.user.id,
          });
          if (tree) {
            void sendElderInstallEmail({
              email,
              rawToken,
              treeName: tree.name,
              familyLabel: null,
              inviterName,
            });
          }
        }
      }
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

  /** GET /api/prompt-library */
  app.get("/api/prompt-library", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const query = request.query as { theme?: string; tier?: string };
    const whereParts: SQL[] = [];
    if (query.theme) {
      whereParts.push(eq(schema.promptLibraryQuestions.theme, query.theme as typeof schema.promptLibraryThemeEnum.enumValues[number]));
    }
    if (query.tier) {
      whereParts.push(eq(schema.promptLibraryQuestions.tier, query.tier as typeof schema.promptLibraryTierEnum.enumValues[number]));
    }

    const questions = await db.query.promptLibraryQuestions.findMany({
      where: whereParts.length > 0 ? and(...whereParts) : undefined,
      orderBy: (q, { asc }) => [asc(q.theme), asc(q.recommendedPosition)],
    });

    return reply.send({
      questions: questions.map((q) => ({
        id: q.id,
        theme: q.theme,
        tier: q.tier,
        questionText: q.questionText,
        sensitivity: q.sensitivity,
        recommendedPosition: q.recommendedPosition,
        followUpTags: q.followUpTags,
      })),
    });
  });

  /** GET /api/prompt-campaign-templates */
  app.get("/api/prompt-campaign-templates", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const templates = await db.query.promptCampaignTemplates.findMany({
      with: {
        questions: {
          with: {
            libraryQuestion: true,
          },
          orderBy: (tq, { asc }) => [asc(tq.position)],
        },
      },
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });

    return reply.send({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        campaignType: t.campaignType,
        theme: t.theme,
        defaultCadenceDays: t.defaultCadenceDays,
        sensitivityCeiling: t.sensitivityCeiling,
        questionCount: t.questions.length,
        questions: t.questions.map((tq) => ({
          id: tq.id,
          position: tq.position,
          questionText: tq.libraryQuestion.questionText,
          theme: tq.libraryQuestion.theme,
          tier: tq.libraryQuestion.tier,
          sensitivity: tq.libraryQuestion.sensitivity,
        })),
      })),
    });
  });

  /** POST /api/trees/:treeId/prompt-campaigns/from-template */
  app.post("/api/trees/:treeId/prompt-campaigns/from-template", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (!canManageCampaigns(membership.role)) {
      return reply.status(403).send({ error: "Not allowed to create campaigns" });
    }

    const body = request.body as {
      templateId?: string;
      toPersonId?: string;
      name?: string;
      cadenceDays?: number;
      recipientEmails?: string[];
      startsAt?: string;
      customizations?: Record<number, string>;
    };

    if (!body.templateId || !body.toPersonId) {
      return reply.status(400).send({ error: "templateId and toPersonId are required" });
    }

    const template = await db.query.promptCampaignTemplates.findFirst({
      where: (t, { eq }) => eq(t.id, body.templateId!),
      with: {
        questions: {
          with: { libraryQuestion: true },
          orderBy: (tq, { asc }) => [asc(tq.position)],
        },
      },
    });
    if (!template) return reply.status(404).send({ error: "Template not found" });

    const person = await db.query.people.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, body.toPersonId!), eq(p.treeId, treeId)),
    });
    if (!person) return reply.status(404).send({ error: "Person not found in this tree" });

    const questions = template.questions.map((tq) => {
      const custom = body.customizations?.[tq.position];
      return (custom?.trim() || tq.libraryQuestion.questionText);
    });

    const recipientEmails = body.recipientEmails ?? [];
    const dedupedEmails = Array.from(new Set(recipientEmails.map((e) => e.toLowerCase().trim())));
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const cadence = body.cadenceDays ?? template.defaultCadenceDays;

    const [campaign] = await db
      .insert(schema.promptCampaigns)
      .values({
        treeId,
        fromUserId: session.user.id,
        toPersonId: body.toPersonId,
        name: body.name?.trim() || template.name,
        campaignType: template.campaignType,
        cadenceDays: cadence,
        nextSendAt: startsAt,
        status: "active",
      })
      .returning();
    if (!campaign) return reply.status(500).send({ error: "Failed to create campaign" });

    if (dedupedEmails.length > 0) {
      await db.insert(schema.promptCampaignRecipients).values(
        dedupedEmails.map((email) => ({ campaignId: campaign.id, email })),
      );

      const tree = await db.query.trees.findFirst({ where: (t, { eq }) => eq(t.id, treeId) });
      const inviter = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, session.user.id) });
      const inviterName = inviter?.name ?? inviter?.email ?? "A family member";
      for (const email of dedupedEmails) {
        const existing = await db.query.elderCaptureTokens.findFirst({
          where: (t, { and, eq, isNull }) =>
            and(eq(t.treeId, treeId), eq(t.email, email), isNull(t.revokedAt)),
        });
        if (!existing) {
          const rawToken = randomBytes(32).toString("hex");
          const tokenHash = createHash("sha256").update(rawToken).digest("hex");
          await db.insert(schema.elderCaptureTokens).values({
            treeId, email, tokenHash,
            associatedPersonId: body.toPersonId,
            createdByUserId: session.user.id,
          });
          if (tree) {
            void sendElderInstallEmail({ email, rawToken, treeName: tree.name, familyLabel: null, inviterName });
          }
        }
      }
    }

    await db.insert(schema.promptCampaignQuestions).values(
      questions.map((questionText, index) => ({
        campaignId: campaign.id,
        questionText,
        position: index,
      })),
    );

    return reply.status(201).send({ id: campaign.id, questionCount: questions.length });
  });

  /** GET /api/trees/:treeId/prompt-campaigns/:id/activity */
  app.get("/api/trees/:treeId/prompt-campaigns/:id/activity", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, id } = request.params as { treeId: string; id: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });

    const campaign = await db.query.promptCampaigns.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.treeId, treeId)),
      with: {
        toPerson: true,
        fromUser: true,
        questions: { orderBy: (q, { asc }) => [asc(q.position)] },
        recipients: true,
      },
    });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });

    const sentPromptIds = campaign.questions
      .filter((q) => q.sentPromptId)
      .map((q) => q.sentPromptId!);

    const recentReplies: Array<{ promptId: string; questionText: string; memoryId: string; memoryTitle: string; createdAt: string }> = [];
    if (sentPromptIds.length > 0) {
      const replyMemories = await db.query.memories.findMany({
        where: (m, { and, eq, inArray }) =>
          and(eq(m.treeId, treeId), inArray(m.promptId, sentPromptIds)),
        columns: { id: true, title: true, promptId: true, createdAt: true },
        orderBy: (m, { desc }) => [desc(m.createdAt)],
        limit: 10,
      });
      const promptMap = new Map<string, string>();
      for (const q of campaign.questions) {
        if (q.sentPromptId) promptMap.set(q.sentPromptId, q.questionText);
      }
      for (const mem of replyMemories) {
        if (mem.promptId) {
          recentReplies.push({
            promptId: mem.promptId,
            questionText: promptMap.get(mem.promptId) ?? "",
            memoryId: mem.id,
            memoryTitle: mem.title,
            createdAt: mem.createdAt.toISOString(),
          });
        }
      }
    }

    const totalRecipients = campaign.recipients.length;
    const activeRecipients = campaign.recipients.filter((r) => r.status === "active").length;
    const totalReplies = campaign.recipients.reduce((sum, r) => sum + r.repliedCount, 0);

    return reply.send({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      campaignType: campaign.campaignType,
      cadenceDays: campaign.cadenceDays,
      nextSendAt: campaign.nextSendAt,
      lastSentAt: campaign.lastSentAt,
      toPerson: campaign.toPerson ? { id: campaign.toPerson.id, name: campaign.toPerson.displayName } : null,
      fromUser: campaign.fromUser ? { id: campaign.fromUser.id, name: campaign.fromUser.name ?? "A tree member" } : null,
      questions: campaign.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        position: q.position,
        sentAt: q.sentAt,
        sentPromptId: q.sentPromptId,
      })),
      sentCount: campaign.questions.filter((q) => q.sentAt !== null).length,
      totalCount: campaign.questions.length,
      recipients: campaign.recipients.map((r) => ({
        id: r.id,
        email: r.email,
        status: r.status,
        lastSentAt: r.lastSentAt,
        lastOpenedAt: r.lastOpenedAt,
        repliedCount: r.repliedCount,
        reminderCount: r.reminderCount,
      })),
      recipientSummary: {
        total: totalRecipients,
        active: activeRecipients,
        bounced: campaign.recipients.filter((r) => r.status === "bounced").length,
        optedOut: campaign.recipients.filter((r) => r.status === "opted_out").length,
        totalReplies,
      },
      recentReplies,
    });
  });

  /** POST /api/trees/:treeId/prompt-campaigns/:id/reminders */
  app.post("/api/trees/:treeId/prompt-campaigns/:id/reminders", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, id } = request.params as { treeId: string; id: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (!canManageCampaigns(membership.role)) return reply.status(403).send({ error: "Not allowed" });

    const campaign = await db.query.promptCampaigns.findFirst({
      where: (c, { and, eq }) => and(eq(c.id, id), eq(c.treeId, treeId)),
      with: {
        toPerson: true,
        fromUser: true,
        questions: { orderBy: (q, { asc }) => [asc(q.position)] },
        recipients: true,
      },
    });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    if (campaign.status !== "active") return reply.status(400).send({ error: "Campaign is not active" });

    const lastQuestion = campaign.questions
      .filter((q) => q.sentAt !== null)
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))[0];
    if (!lastQuestion || !lastQuestion.sentPromptId) {
      return reply.status(400).send({ error: "No sent question to remind about" });
    }

    const fromName = campaign.fromUser?.name ?? campaign.fromUser?.email ?? "A family member";
    const personName = campaign.toPerson?.displayName ?? "your family member";
    let sent = 0;

    for (const recipient of campaign.recipients.filter((r) => r.status === "active")) {
      if (!(await mayEmailUser(recipient.email, "promptsEmail"))) continue;

      const prompt = await db.query.prompts.findFirst({
        where: (p, { and, eq }) => and(eq(p.id, lastQuestion.sentPromptId!), eq(p.treeId, treeId)),
      });
      if (!prompt || prompt.status !== "pending") continue;

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const replyUrl = `${WEB_URL}/prompts/reply?token=${encodeURIComponent(rawToken)}`;

      await db.insert(schema.promptReplyLinks).values({
        treeId,
        promptId: prompt.id,
        email: recipient.email,
        tokenHash,
        status: "pending",
        createdByUserId: session.user.id,
        expiresAt,
      });

      try {
        await mailer.sendMail({
          from: MAIL_FROM,
          to: recipient.email,
          subject: `A gentle reminder — ${campaign.name}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1C1915; background: #F6F1E7;">
              <h1 style="font-size: 22px; font-weight: 400; margin: 0 0 14px;">Still thinking?</h1>
              <p style="font-size: 15px; line-height: 1.7; color: #403A2E; margin: 0 0 12px;">
                No rush — just a friendly nudge. ${escapeHtml(fromName)} is still gathering memories about <strong>${escapeHtml(personName)}</strong>.
              </p>
              <blockquote style="margin: 0 0 20px; padding: 14px 16px; border-left: 3px solid #B08B3E; background: #EDE6D6; color: #1C1915;">
                ${escapeHtml(lastQuestion.questionText)}
              </blockquote>
              <p style="margin: 0 0 24px;">
                <a href="${replyUrl}"
                   style="background: #4E5D42; color: #F6F1E7; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; display: inline-block;">
                  Share a story or voice note
                </a>
              </p>
              <p style="font-size: 12px; color: #847A66; line-height: 1.6;">
                This link expires in 7 days. You can reply or skip — another question will arrive soon.
              </p>
            </div>
          `,
          text: `A gentle reminder: "${lastQuestion.questionText}"\n\nReply: ${replyUrl}\n\nThis link expires in 7 days.`,
        });
        sent += 1;
      } catch (err) {
        request.log.error({ err, email: recipient.email }, "Reminder send failed");
      }

      await db
        .update(schema.promptCampaignRecipients)
        .set({
          reminderCount: sql`${schema.promptCampaignRecipients.reminderCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.promptCampaignRecipients.id, recipient.id));
    }

    return reply.send({ sent, totalRecipients: campaign.recipients.length });
  });

  /** POST /api/trees/:treeId/prompts/:promptId/follow-ups */
  app.post("/api/trees/:treeId/prompts/:promptId/follow-ups", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, promptId } = request.params as { treeId: string; promptId: string };
    const membership = await verifyMembership(treeId, session.user.id);
    if (!membership) return reply.status(403).send({ error: "Not a member" });
    if (!canManageCampaigns(membership.role)) return reply.status(403).send({ error: "Not allowed" });

    const body = request.body as { questionText?: string };
    if (!body.questionText?.trim()) {
      return reply.status(400).send({ error: "questionText is required" });
    }

    const originalPrompt = await db.query.prompts.findFirst({
      where: (p, { and, eq }) => and(eq(p.id, promptId), eq(p.treeId, treeId)),
    });
    if (!originalPrompt) return reply.status(404).send({ error: "Prompt not found" });

    const [followUp] = await db
      .insert(schema.prompts)
      .values({
        treeId,
        fromUserId: session.user.id,
        toPersonId: originalPrompt.toPersonId,
        questionText: body.questionText.trim(),
        status: "pending",
      })
      .returning();

    return reply.status(201).send({ id: followUp?.id ?? null, questionText: body.questionText });
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
  const fromUser = campaign.fromUserId
    ? await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, campaign.fromUserId!),
      })
    : null;
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

    // If an active elder capture token exists, link the email to the
    // recipient's installed PWA inbox instead of minting a single-use reply
    // link. The new prompt appears in their inbox automatically.
    const elderToken = await db.query.elderCaptureTokens.findFirst({
      where: (t, { and, eq, isNull }) =>
        and(eq(t.treeId, campaign.treeId), eq(t.email, email), isNull(t.revokedAt)),
    });

    let createdLinkId: string | null = null;
    let replyUrl: string;
    {
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
      createdLinkId = link.id;
      replyUrl = `${WEB_URL}/prompts/reply?token=${encodeURIComponent(rawToken)}`;
    }
    const recipientHasPwa = !!elderToken;
    try {
      const pwaTip = recipientHasPwa
        ? `<p style="font-size: 13px; color: #847A66; margin: 0 0 18px;">Tip: this opens in your installed family memory page if you've already added it to your home screen.</p>`
        : "";
      await mailer.sendMail({
        from: MAIL_FROM,
        to: email,
        subject: `${campaign.name} — a question for ${personName}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1C1915; background: #F6F1E7;">
              <h1 style="font-size: 24px; font-weight: 400; margin: 0 0 14px;">A weekly question</h1>
              <p style="font-size: 15px; line-height: 1.7; color: #403A2E; margin: 0 0 12px;">
                This is part of <strong>${escapeHtml(campaign.name)}</strong>, a series ${escapeHtml(fromName)} is gathering for the family archive about <strong>${escapeHtml(personName)}</strong>.
              </p>
              <blockquote style="margin: 0 0 20px; padding: 14px 16px; border-left: 3px solid #B08B3E; background: #EDE6D6; color: #1C1915;">
                ${escapeHtml(nextQuestion.questionText)}
              </blockquote>
            <p style="margin: 0 0 24px;">
              <a href="${replyUrl}"
                 style="background: #4E5D42; color: #F6F1E7; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; display: inline-block;">
                Share a story, voice note, photo, or document
              </a>
            </p>
            ${pwaTip}
            <p style="font-size: 12px; color: #847A66; line-height: 1.6;">
              This link is private and expires in 14 days. You can reply or skip — another question will arrive in ${campaign.cadenceDays} day${campaign.cadenceDays === 1 ? "" : "s"}.
            </p>
          </div>
        `,
        text: `${fromName} asked: "${nextQuestion.questionText}"\n\nReply: ${replyUrl}\n\nThis private link expires in 14 days.`,
      });
      sentCount += 1;
      await db
        .update(schema.promptCampaignRecipients)
        .set({ lastSentAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.promptCampaignRecipients.id, recipient.id));
    } catch (err) {
      log.error(
        { err, campaignId: campaign.id, email },
        "Failed to send campaign email; revoking link",
      );
      if (createdLinkId) {
        await db
          .delete(schema.promptReplyLinks)
          .where(eq(schema.promptReplyLinks.id, createdLinkId));
      }
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


