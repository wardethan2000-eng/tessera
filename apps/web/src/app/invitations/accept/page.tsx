"use client";

import type { CSSProperties } from "react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

interface InvitationDetails {
  id: string;
  treeName: string;
  treeId: string;
  invitedByName: string;
  email: string;
  proposedRole: string;
  linkedPersonName: string | null;
  expiresAt: string;
}

interface ClaimedPersonSummary {
  id: string;
  displayName: string;
  treeId: string;
  homeTreeId: string | null;
  scopeTreeIds: string[];
}

interface InvitationAcceptResult {
  treeId: string;
  message: string;
  membershipStatus: "existing" | "created";
  linkedIdentity:
    | null
    | {
        status: "linked" | "already_linked";
        linkedPersonId: string;
        linkedPersonName: string;
        message: string;
      }
    | {
        status: "conflict";
        linkedPersonId: string;
        linkedPersonName: string;
        reason: "user_has_multiple_claimed_people" | "user_already_linked_elsewhere";
        existingCanonicalPersonId: string | null;
        existingCanonicalTreeId: string | null;
        claimedPeople: ClaimedPersonSummary[];
        message: string;
      };
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>Loading…</p>
      </main>
    }>
      <AcceptInvitationContent />
    </Suspense>
  );
}

function AcceptInvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: session, isPending: sessionLoading } = useSession();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptResult, setAcceptResult] = useState<InvitationAcceptResult | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided.");
      setLoading(false);
      return;
    }
    fetch(`${API}/api/invitations/${token}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.error ?? "Invitation not found"); });
        return r.json();
      })
      .then((data: InvitationDetails) => {
        setInvitation(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/invitations/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const e = await res.json();
        setError(e.error ?? "Could not accept invitation");
        return;
      }
      const data: InvitationAcceptResult = await res.json();
      setAcceptResult(data);
    } finally {
      setAccepting(false);
    }
  }

  // Loading state
  if (loading || sessionLoading) {
    return (
      <main style={pageStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          {[200, 160, 240].map((w, i) => (
            <div key={i} style={{ width: w, height: 12, borderRadius: 4, background: "var(--paper-deep)", backgroundImage: "linear-gradient(90deg, var(--paper-deep) 25%, var(--rule) 50%, var(--paper-deep) 75%)", backgroundSize: "400px 100%", animation: "shimmer 1.5s infinite" }} />
          ))}
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: "0 0 12px" }}>
            Invitation unavailable
          </p>
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-faded)", margin: "0 0 24px" }}>
            {error}
          </p>
          <a href="/" style={linkStyle}>Go home</a>
        </div>
      </main>
    );
  }

  if (!invitation) return null;

  // Accepted confirmation
  if (acceptResult) {
    const identityConflict =
      acceptResult.linkedIdentity?.status === "conflict"
        ? acceptResult.linkedIdentity
        : null;

    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              color: identityConflict ? "var(--amber, #c97d1a)" : "var(--moss)",
              marginBottom: 16,
            }}
          >
            {identityConflict ? "!" : "✓"}
          </div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: "0 0 8px" }}>
            {identityConflict ? `Joined ${invitation.treeName} with an identity conflict` : `Welcome to ${invitation.treeName}`}
          </p>
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: "0 0 16px" }}>
            {acceptResult.message}
          </p>

          {acceptResult.linkedIdentity && (
            <div style={messageBoxStyle}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", margin: 0, lineHeight: 1.6 }}>
                {acceptResult.linkedIdentity.message}
              </p>
            </div>
          )}

          {identityConflict && (
            <>
              <div style={{ ...messageBoxStyle, marginTop: 12 }}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.7 }}>
                  The invitation was accepted, but your account was not attached to {identityConflict.linkedPersonName}.
                  A steward needs to merge the overlapping person records before the identity can be unified across trees.
                </p>
              </div>

              {identityConflict.claimedPeople.length > 0 && (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  {identityConflict.claimedPeople.map((person) => (
                    <a
                      key={person.id}
                      href={`/trees/${person.treeId}/people/${person.id}`}
                      style={claimedPersonLinkStyle}
                    >
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)" }}>
                        {person.displayName}
                      </span>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
                        Tree {person.treeId.slice(0, 8)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          {!identityConflict && (
            <div style={welcomeFactsStyle}>
              <p style={welcomeFactLabelStyle}>Your role</p>
              <p style={welcomeFactValueStyle}>
                {invitation.proposedRole === "steward"
                  ? "Steward — you can curate memories and invite others"
                  : invitation.proposedRole === "contributor"
                  ? "Contributor — you can add memories and relatives"
                  : invitation.proposedRole === "viewer"
                  ? "Viewer — you can read memories shared with you"
                  : invitation.proposedRole}
              </p>
              {invitation.linkedPersonName && (
                <>
                  <p style={{ ...welcomeFactLabelStyle, marginTop: 12 }}>Connected to</p>
                  <p style={welcomeFactValueStyle}>{invitation.linkedPersonName}</p>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <a href={`/trees/${acceptResult.treeId}/home`} style={primaryBtnStyle}>
              {identityConflict ? "Continue" : "Explore Home"}
            </a>
            {!identityConflict && (
              <a href={`/trees/${acceptResult.treeId}/home?openAddMemory=1`} style={secondaryBtnStyle}>
                Add a memory
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Not signed in
  if (!session) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faded)", margin: "0 0 20px" }}>
            Invitation
          </p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--ink)", fontWeight: 400, margin: "0 0 8px", lineHeight: 1.2 }}>
            {invitation.invitedByName} invited you
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--ink-soft)", margin: "0 0 4px" }}>
            to <em>{invitation.treeName}</em>
          </p>
          {invitation.linkedPersonName && (
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: "4px 0 0" }}>
              as a contributor for {invitation.linkedPersonName}
            </p>
          )}

          <div style={{ marginTop: 32, padding: "16px 20px", background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 8 }}>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", margin: "0 0 16px" }}>
              Sign in or create an account to accept this invitation.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <a
                href={`/auth/signup?invite=${encodeURIComponent(token ?? "")}`}
                style={primaryBtnStyle}
              >
                Create account
              </a>
              <a
                href={`/auth/signin?invite=${encodeURIComponent(token ?? "")}`}
                style={secondaryBtnStyle}
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Signed in — ready to accept
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-faded)", margin: "0 0 20px" }}>
          Invitation
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--ink)", fontWeight: 400, margin: "0 0 8px", lineHeight: 1.2 }}>
          {invitation.invitedByName} invited you
        </h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--ink-soft)", margin: "0 0 4px" }}>
          to <em>{invitation.treeName}</em>
        </p>
        {invitation.linkedPersonName && (
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: "4px 0 0" }}>
            as a contributor for {invitation.linkedPersonName}
          </p>
        )}

        <div style={{ marginTop: 8 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", padding: "3px 10px", background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 20 }}>
            {invitation.proposedRole === "contributor" ? "Contributor" : invitation.proposedRole === "steward" ? "Steward" : "Viewer"}
          </span>
        </div>

        <div style={{ marginTop: 32, display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={handleAccept}
            disabled={accepting}
            style={primaryBtnStyle}
          >
            {accepting ? "Accepting…" : "Accept invitation"}
          </button>
          <a href="/" style={linkStyle}>Not now</a>
        </div>

        <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", marginTop: 20 }}>
          Signed in as {session.user.email}
        </p>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const cardStyle: CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  padding: "48px 40px",
  maxWidth: 460,
  width: "100%",
};

const welcomeFactsStyle: CSSProperties = {
  marginTop: 20,
  padding: "14px 16px",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
};

const welcomeFactLabelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-faded)",
  margin: 0,
};

const welcomeFactValueStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--ink)",
  margin: "4px 0 0",
  lineHeight: 1.5,
};

const messageBoxStyle: CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
};

const claimedPersonLinkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  textDecoration: "none",
};

const primaryBtnStyle: CSSProperties = {
  display: "inline-block",
  background: "var(--moss)",
  color: "var(--paper)",
  border: "none",
  borderRadius: 6,
  padding: "11px 24px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryBtnStyle: CSSProperties = {
  display: "inline-block",
  background: "none",
  color: "var(--ink-soft)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "11px 24px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
};

const linkStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  textDecoration: "underline",
};
