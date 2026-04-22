import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import * as schema from "@familytree/database";
import {
  decideInvitationLinkedIdentity,
  getIdentityStatusForUser,
} from "../lib/account-identity-service.js";
import { db } from "../lib/db.js";
import { getSession } from "../lib/session.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";
import { addPersonToTreeScope } from "../lib/cross-tree-write-service.js";
import { isPersonInTreeScope } from "../lib/cross-tree-read-service.js";
import { mailer, MAIL_FROM } from "../lib/mailer.js";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const SendInviteBody = z.object({
  email: z.string().email(),
  proposedRole: z.enum(["steward", "contributor", "viewer"]).default("contributor"),
  linkedPersonId: z.string().uuid().optional(),
});

export async function invitationsPlugin(app: FastifyInstance): Promise<void> {
  /** POST /api/trees/:treeId/invitations — send an invitation email */
  app.post("/api/trees/:treeId/invitations", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    // Require editor or owner membership
    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership || membership.role === "viewer") {
      return reply.status(403).send({ error: "Editors and owners can send invitations" });
    }

    const parsed = SendInviteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { email, proposedRole, linkedPersonId } = parsed.data;

    if (linkedPersonId) {
      const linkedPersonInScope = await isPersonInTreeScope(treeId, linkedPersonId);
      if (!linkedPersonInScope) {
        return reply.status(400).send({
          error: "The linked person must already be in this tree before you can invite them by identity.",
        });
      }
    }

    // Check if this email already has a pending invite for this tree
    const existing = await db.query.invitations.findFirst({
      where: (inv, { and, eq }) =>
        and(eq(inv.treeId, treeId), eq(inv.email, email.toLowerCase()), eq(inv.status, "pending")),
    });
    if (existing) {
      return reply.status(409).send({ error: "This email already has a pending invitation for this tree" });
    }

    // Fetch the tree name for the email
    const tree = await db.query.trees.findFirst({
      where: (t, { eq }) => eq(t.id, treeId),
    });
    if (!tree) return reply.status(404).send({ error: "Tree not found" });

    // Generate token
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(schema.invitations).values({
      treeId,
      invitedByUserId: session.user.id,
      email: email.toLowerCase(),
      proposedRole: proposedRole as "steward" | "contributor" | "viewer",
      linkedPersonId: linkedPersonId ?? null,
      tokenHash,
      status: "pending",
      expiresAt,
    });

    // Send email (non-blocking on failure so the invitation row isn't orphaned
    // in a way that prevents the accept link from being usable).
    const acceptUrl = `${WEB_URL}/invitations/accept?token=${rawToken}`;
    const inviterName = session.user.name ?? session.user.email;

    let emailDelivered = true;
    let emailError: string | undefined;
    try {
      await mailer.sendMail({
        from: MAIL_FROM,
        to: email,
        subject: `You've been invited to the ${tree.name} family archive`,
        html: `
        <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #1C1915; background: #F6F1E7;">
          <h1 style="font-size: 28px; font-weight: 400; margin: 0 0 16px;">You're invited</h1>
          <p style="font-size: 16px; line-height: 1.7; color: #403A2E;">
            <strong>${inviterName}</strong> has invited you to contribute to
            <strong>${tree.name}</strong> — a private family archive.
          </p>
          <p style="margin: 32px 0;">
            <a href="${acceptUrl}"
               style="background: #4E5D42; color: #F6F1E7; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; display: inline-block;">
              Accept invitation
            </a>
          </p>
          <p style="font-size: 13px; color: #847A66; line-height: 1.6;">
            This invitation expires in 7 days. If you did not expect this, you can safely ignore it.
          </p>
          <hr style="border: none; border-top: 1px solid #D9D0BC; margin: 32px 0;">
          <p style="font-size: 12px; color: #847A66;">Heirloom · private family archive</p>
        </div>
      `,
        text: `You've been invited to the ${tree.name} family archive by ${inviterName}.\n\nAccept your invitation: ${acceptUrl}\n\nThis link expires in 7 days.`,
      });
    } catch (err) {
      emailDelivered = false;
      emailError = err instanceof Error ? err.message : String(err);
      request.log.error(
        { err, email, treeId },
        "Failed to deliver invitation email; invitation record still created",
      );
    }

    return reply.status(201).send({
      message: emailDelivered
        ? "Invitation sent"
        : "Invitation created but email delivery failed — share the link manually",
      email,
      emailDelivered,
      emailError,
      acceptUrl,
    });
  });

  /** GET /api/trees/:treeId/invitations — list pending invitations for a tree */
  app.get("/api/trees/:treeId/invitations", async (request, reply) => {
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

    const invites = await db.query.invitations.findMany({
      where: (inv, { and, eq }) =>
        and(eq(inv.treeId, treeId), eq(inv.status, "pending")),
      with: { invitedBy: true, linkedPerson: true },
      orderBy: (inv, { desc }) => [desc(inv.createdAt)],
    });

    return reply.send(
      invites.map((inv) => ({
        id: inv.id,
        email: inv.email,
        proposedRole: inv.proposedRole,
        linkedPersonId: inv.linkedPersonId,
        linkedPersonName: inv.linkedPerson?.displayName ?? null,
        invitedByName: inv.invitedBy?.name ?? inv.invitedBy?.email ?? "Unknown",
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }))
    );
  });

  /** GET /api/invitations/:token — look up invitation details (public route) */
  app.get("/api/invitations/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const tokenHash = hashToken(token);

    const invitation = await db.query.invitations.findFirst({
      where: (inv, { eq }) => eq(inv.tokenHash, tokenHash),
      with: { tree: true, invitedBy: true, linkedPerson: true },
    });

    if (!invitation) {
      return reply.status(404).send({ error: "Invitation not found" });
    }

    if (invitation.status !== "pending") {
      return reply.status(410).send({ error: "Invitation has already been used or revoked" });
    }

    if (new Date() > invitation.expiresAt) {
      return reply.status(410).send({ error: "Invitation has expired" });
    }

    return reply.send({
      id: invitation.id,
      treeName: invitation.tree?.name ?? "Unknown",
      treeId: invitation.treeId,
      invitedByName: invitation.invitedBy?.name ?? invitation.invitedBy?.email ?? "Unknown",
      email: invitation.email,
      proposedRole: invitation.proposedRole,
      linkedPersonName: invitation.linkedPerson?.displayName ?? null,
      expiresAt: invitation.expiresAt,
    });
  });

  /** POST /api/invitations/:token/accept — accept an invitation (requires auth) */
  app.post("/api/invitations/:token/accept", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { token } = request.params as { token: string };
    const tokenHash = hashToken(token);

    const invitation = await db.query.invitations.findFirst({
      where: (inv, { eq }) => eq(inv.tokenHash, tokenHash),
    });

    if (!invitation) {
      return reply.status(404).send({ error: "Invitation not found" });
    }

    if (invitation.status !== "pending") {
      return reply.status(410).send({ error: "Invitation has already been used or revoked" });
    }

    if (new Date() > invitation.expiresAt) {
      return reply.status(410).send({ error: "Invitation has expired" });
    }

    if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return reply.status(403).send({
        error: "This invitation is for a different email address",
      });
    }

    const linkedPerson = invitation.linkedPersonId
      ? await db.query.people.findFirst({
          where: (person, { eq }) => eq(person.id, invitation.linkedPersonId!),
          columns: {
            id: true,
            displayName: true,
            treeId: true,
            linkedUserId: true,
          },
        })
      : null;

    const identity = invitation.linkedPersonId
      ? await getIdentityStatusForUser(session.user.id)
      : null;

    const linkedIdentityDecision =
      invitation.linkedPersonId && linkedPerson && identity
        ? decideInvitationLinkedIdentity({
            userId: session.user.id,
            linkedPersonId: linkedPerson.id,
            linkedPersonLinkedUserId: linkedPerson.linkedUserId,
            identity,
          })
        : null;

    if (invitation.linkedPersonId && !linkedPerson) {
      return reply.status(409).send({
        error: "The linked person for this invitation could not be found.",
      });
    }

    if (linkedIdentityDecision?.kind === "linked-person-claimed-by-other-user") {
      return reply.status(409).send({
        error:
          "This invitation is linked to a person record that is already claimed by another account.",
      });
    }

    // Check if user already has membership
    const existing = await db.query.treeMemberships.findFirst({
      where: (m, { and, eq }) =>
        and(eq(m.treeId, invitation.treeId), eq(m.userId, session.user.id)),
    });

    if (
      !existing &&
      (invitation.proposedRole === "founder" ||
        invitation.proposedRole === "steward" ||
        invitation.proposedRole === "contributor")
    ) {
      const capacity = await checkTreeCanAdd(invitation.treeId, "contributor");
      if (!capacity.allowed) {
        return reply.status(capacity.status).send({ error: capacity.reason });
      }
    }

    await db.transaction(async (tx) => {
      if (!existing) {
        await tx.insert(schema.treeMemberships).values({
          treeId: invitation.treeId,
          userId: session.user.id,
          role: invitation.proposedRole as "founder" | "steward" | "contributor" | "viewer",
          invitedByUserId: invitation.invitedByUserId,
        });
      }

      await tx
        .update(schema.invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(schema.invitations.id, invitation.id));

      if (linkedPerson) {
        await addPersonToTreeScope({
          treeId: invitation.treeId,
          personId: linkedPerson.id,
          addedByUserId: invitation.invitedByUserId,
          tx,
        });

        if (linkedIdentityDecision?.kind === "claim-linked-person") {
          await tx
            .update(schema.people)
            .set({ linkedUserId: session.user.id, updatedAt: new Date() })
            .where(eq(schema.people.id, linkedPerson.id));
        }
      }
    });

    const claimedPeople =
      linkedIdentityDecision?.kind === "identity-conflict"
        ? identity?.claimedPeople.map((person) => ({
            id: person.id,
            displayName: person.displayName,
            treeId: person.treeId,
            homeTreeId: person.homeTreeId,
            scopeTreeIds: person.scopeTreeIds,
          })) ?? []
        : [];

    const linkedIdentity =
      linkedPerson && linkedIdentityDecision
        ? linkedIdentityDecision.kind === "claim-linked-person"
          ? {
              status: "linked" as const,
              linkedPersonId: linkedPerson.id,
              linkedPersonName: linkedPerson.displayName,
              message:
                "Your account is now linked to the invited person in this tree.",
            }
          : linkedIdentityDecision.kind === "already-linked-to-person"
            ? {
                status: "already_linked" as const,
                linkedPersonId: linkedPerson.id,
                linkedPersonName: linkedPerson.displayName,
                message:
                  "Your account was already linked to this person. We kept that identity and added you to the tree.",
              }
            : {
                status: "conflict" as const,
                linkedPersonId: linkedPerson.id,
                linkedPersonName: linkedPerson.displayName,
                reason: linkedIdentityDecision.reason,
                existingCanonicalPersonId:
                  linkedIdentityDecision.existingCanonicalPersonId,
                existingCanonicalTreeId:
                  linkedIdentityDecision.existingCanonicalTreeId,
                claimedPeople,
                message:
                  linkedIdentityDecision.reason ===
                  "user_has_multiple_claimed_people"
                    ? "Your account is already linked to multiple people. A steward needs to resolve that duplicate identity before this linked person can be unified."
                    : "Your account is already linked to a different person record. A steward can merge the records to unify your identity across trees.",
              }
        : null;

    return reply.send({
      treeId: invitation.treeId,
      message: existing ? "Already a member" : "Invitation accepted",
      membershipStatus: existing ? "existing" : "created",
      linkedIdentity,
    });
  });

  /** DELETE /api/trees/:treeId/invitations/:inviteId — revoke pending invitation */
  app.delete("/api/trees/:treeId/invitations/:inviteId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId, inviteId } = request.params as { treeId: string; inviteId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.treeId, treeId), eq(t.userId, session.user.id)),
    });
    if (!membership || membership.role === "viewer") {
      return reply.status(403).send({ error: "Only editors and owners can revoke invitations" });
    }

    const [revoked] = await db
      .update(schema.invitations)
      .set({ status: "revoked" })
      .where(
        and(
          eq(schema.invitations.id, inviteId),
          eq(schema.invitations.treeId, treeId),
          eq(schema.invitations.status, "pending"),
        ),
      )
      .returning({ id: schema.invitations.id });

    if (!revoked) {
      return reply.status(404).send({ error: "Pending invitation not found" });
    }

    return reply.status(204).send();
  });
}
