"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  const [accepted, setAccepted] = useState(false);

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
      const data = await res.json();
      setAccepted(true);
      setTimeout(() => {
        router.push(`/trees/${data.treeId}`);
      }, 2000);
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
  if (accepted) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--moss)", marginBottom: 16 }}>✓</div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: "0 0 8px" }}>
            Welcome to {invitation.treeName}
          </p>
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>
            Redirecting you to the archive…
          </p>
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
            style={primaryBtnStyle as React.CSSProperties}
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

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  padding: "48px 40px",
  maxWidth: 460,
  width: "100%",
};

const primaryBtnStyle = {
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

const secondaryBtnStyle = {
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

const linkStyle = {
  fontFamily: "var(--font-ui)" as const,
  fontSize: 13,
  color: "var(--ink-faded)" as const,
  textDecoration: "underline" as const,
};
