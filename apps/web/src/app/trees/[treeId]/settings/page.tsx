"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Tree {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  proposedRole: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

interface Member {
  userId: string;
  role: string;
  name: string | null;
  email: string;
  joinedAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  founder: "Founder",
  steward: "Steward",
  contributor: "Contributor",
  viewer: "Viewer",
};

export default function TreeSettingsPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [tree, setTree] = useState<Tree | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"contributor" | "viewer" | "steward">("contributor");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  async function downloadExport() {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/export`, { credentials: "include" });
      if (!res.ok) { setExporting(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(tree?.name ?? "archive").replace(/[^a-z0-9]/gi, "_").toLowerCase()}_archive.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } finally {
      setExporting(false);
    }
  }

  const fetchData = useCallback(async () => {
    if (!treeId) return;
    const [treeRes, invitesRes, membersRes] = await Promise.all([
      fetch(`${API}/api/trees/${treeId}`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/invitations`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/members`, { credentials: "include" }),
    ]);

    if (treeRes.ok) setTree(await treeRes.json());
    if (invitesRes.ok) setInvitations(await invitesRes.json());
    if (membersRes.ok) setMembers(await membersRes.json());
    setLoading(false);
  }, [treeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, proposedRole: inviteRole }),
      });
      if (!res.ok) {
        const e = await res.json();
        setInviteError(e.error ?? "Failed to send invitation");
        return;
      }
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      fetchData();
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    await fetch(`${API}/api/trees/${treeId}/invitations/${inviteId}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchData();
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      {/* Header */}
      <div style={{ maxWidth: 640, width: "100%", margin: "0 auto" }}>
        <button
          onClick={() => router.push(`/trees/${treeId}`)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 32, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to {tree?.name ?? "The Constellation"}
        </button>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400, color: "var(--ink)", margin: "0 0 4px" }}>
          {tree?.name}
        </h1>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: "0 0 48px" }}>
          Archive settings
        </p>

        {/* Invite section */}
        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Invite a contributor</h2>
          <p style={sectionDescStyle}>
            Send an email invitation to share this family archive. Contributors can add memories and people.
          </p>

          <form onSubmit={sendInvite} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                style={inputStyle}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "contributor" | "viewer" | "steward")}
                style={{ ...inputStyle, width: "auto", minWidth: 130 }}
              >
                <option value="contributor">Contributor</option>
                <option value="steward">Steward</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="submit" disabled={inviting} style={primaryBtnStyle}>
                {inviting ? "Sending…" : "Send invitation"}
              </button>
              {inviteSuccess && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)" }}>
                  {inviteSuccess}
                </span>
              )}
              {inviteError && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--rose)" }}>
                  {inviteError}
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <section style={{ ...sectionStyle, marginTop: 32 }}>
            <h2 style={sectionHeadingStyle}>Pending invitations</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {invitations.map((inv) => (
                <div key={inv.id} style={rowStyle}>
                  <div>
                    <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: 0 }}>
                      {inv.email}
                    </p>
                    <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "2px 0 0" }}>
                      {ROLE_LABELS[inv.proposedRole] ?? inv.proposedRole} · invited by {inv.invitedByName} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Members */}
        {members.length > 0 && (
          <section style={{ ...sectionStyle, marginTop: 32 }}>
            <h2 style={sectionHeadingStyle}>Members</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {members.map((m) => (
                <div key={m.userId} style={{ ...rowStyle, justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: 0 }}>
                      {m.name ?? m.email}
                    </p>
                    {m.name && (
                      <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "2px 0 0" }}>
                        {m.email}
                      </p>
                    )}
                  </div>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", padding: "3px 10px", border: "1px solid var(--rule)", borderRadius: 20, background: "var(--paper-deep)" }}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Export archive */}
        <section style={{ ...sectionStyle, marginTop: 32 }}>
          <h2 style={sectionHeadingStyle}>Export archive</h2>
          <p style={sectionDescStyle}>
            Download a ZIP file with all family data, memories, photos, and a standalone offline HTML viewer that works without internet.
          </p>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={downloadExport}
              disabled={exporting}
              style={primaryBtnStyle}
            >
              {exporting ? "Preparing download…" : "Download ZIP"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  padding: "48px 24px",
};

const sectionStyle: React.CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  padding: "28px 28px",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 400,
  color: "var(--ink)",
  margin: "0 0 6px",
};

const sectionDescStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--ink-soft)",
  margin: 0,
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink)",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "9px 14px",
  outline: "none",
};

const primaryBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--paper)",
  background: "var(--moss)",
  border: "none",
  borderRadius: 6,
  padding: "9px 20px",
  cursor: "pointer",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
};
