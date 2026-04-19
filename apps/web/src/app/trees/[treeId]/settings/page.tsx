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

interface Connection {
  id: string;
  treeAId: string;
  treeBId: string;
  status: "pending" | "active" | "ended";
  initiatedByTreeId: string;
  treeA: { id: string; name: string };
  treeB: { id: string; name: string };
  initiatedByUser: { id: string; name: string };
  createdAt: string;
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
  const [connections, setConnections] = useState<Connection[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"contributor" | "viewer" | "steward">("contributor");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Connect form
  const [connectTreeId, setConnectTreeId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);

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
    const [treeRes, invitesRes, membersRes, connectionsRes] = await Promise.all([
      fetch(`${API}/api/trees/${treeId}`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/invitations`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/members`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/connections`, { credentials: "include" }),
    ]);

    if (treeRes.ok) setTree(await treeRes.json());
    if (invitesRes.ok) setInvitations(await invitesRes.json());
    if (membersRes.ok) {
      const membersData: Member[] = await membersRes.json();
      setMembers(membersData);
      if (session?.user?.id) {
        const me = membersData.find((m) => m.userId === session.user.id);
        setMyRole(me?.role ?? null);
      }
    }
    if (connectionsRes.ok) setConnections(await connectionsRes.json());
    setLoading(false);
  }, [treeId, session?.user?.id]);

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

  async function proposeConnection(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setConnectError(null);
    setConnectSuccess(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetTreeId: connectTreeId.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        setConnectError(body.error ?? "Failed to propose connection");
        return;
      }
      setConnectSuccess("Connection proposed — waiting for the other family to accept.");
      setConnectTreeId("");
      fetchData();
    } finally {
      setConnecting(false);
    }
  }

  async function respondToConnection(connectionId: string, action: "accept" | "reject" | "end") {
    const res = await fetch(`${API}/api/trees/${treeId}/connections/${connectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action }),
    });
    if (res.ok) fetchData();
  }

  const isManager = myRole === "founder" || myRole === "steward";
  const visibleConnections = connections.filter((c) => c.status !== "ended");
  const pendingInbound = visibleConnections.filter(
    (c) => c.status === "pending" && c.initiatedByTreeId !== treeId,
  );
  const pendingOutbound = visibleConnections.filter(
    (c) => c.status === "pending" && c.initiatedByTreeId === treeId,
  );
  const activeConnections = visibleConnections.filter((c) => c.status === "active");

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

        {/* ── Connected Families ──────────────────────────────────────────────── */}
        <section style={{ ...sectionStyle, marginTop: 32 }}>
          <h2 style={sectionHeadingStyle}>Connected families</h2>
          <p style={sectionDescStyle}>
            Connect this archive with another family tree to share memories across in-law or blended-family connections.
            People linked across trees can view each other's memories.
          </p>

          {/* Tree ID for sharing */}
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
              Your tree ID (share with the other family):
            </span>
            <code
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 11,
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                padding: "3px 8px",
                color: "var(--ink-soft)",
                userSelect: "all",
              }}
            >
              {treeId}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(treeId ?? "")}
              style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", background: "none", border: "1px solid var(--rule)", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
            >
              Copy
            </button>
          </div>

          {/* Inbound pending — someone else proposed */}
          {pendingInbound.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Waiting for your response
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingInbound.map((c) => {
                  const other = c.treeAId === treeId ? c.treeB : c.treeA;
                  return (
                    <div key={c.id} style={rowStyle}>
                      <div>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: 0 }}>
                          {other.name}
                        </p>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "2px 0 0" }}>
                          Proposed by {c.initiatedByUser.name} · {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {isManager && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => respondToConnection(c.id, "accept")}
                            style={{ ...primaryBtnStyle, padding: "6px 14px", fontSize: 12 }}
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => respondToConnection(c.id, "reject")}
                            style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--rose)", background: "none", border: "1px solid var(--rose)", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outbound pending — we proposed */}
          {pendingOutbound.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Awaiting their response
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingOutbound.map((c) => {
                  const other = c.treeAId === treeId ? c.treeB : c.treeA;
                  return (
                    <div key={c.id} style={rowStyle}>
                      <div>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: 0 }}>
                          {other.name}
                        </p>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "2px 0 0" }}>
                          Pending · sent {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", padding: "3px 10px", border: "1px solid var(--rule)", borderRadius: 20 }}>
                        Pending
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active connections */}
          {activeConnections.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Active connections
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeConnections.map((c) => {
                  const other = c.treeAId === treeId ? c.treeB : c.treeA;
                  return (
                    <div key={c.id} style={rowStyle}>
                      <div>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: 0 }}>
                          {other.name}
                        </p>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "2px 0 0" }}>
                          Connected · {other.id}
                        </p>
                      </div>
                      {isManager && (
                        <button
                          onClick={() => respondToConnection(c.id, "end")}
                          style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--rose)", background: "none", border: "1px solid var(--rose)", borderRadius: 6, padding: "6px 14px", cursor: "pointer" }}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {visibleConnections.length === 0 && (
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", marginTop: 20 }}>
              No connected families yet.
            </p>
          )}

          {/* Propose a new connection */}
          {isManager && (
            <form onSubmit={proposeConnection} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", margin: 0 }}>
                Ask the other family to share their tree ID from their own settings page, then enter it below.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="Other family's tree ID (UUID)"
                  value={connectTreeId}
                  onChange={(e) => setConnectTreeId(e.target.value)}
                  required
                  style={inputStyle}
                />
                <button type="submit" disabled={connecting} style={{ ...primaryBtnStyle, whiteSpace: "nowrap" }}>
                  {connecting ? "Sending…" : "Propose connection"}
                </button>
              </div>
              {connectSuccess && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)" }}>
                  {connectSuccess}
                </span>
              )}
              {connectError && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--rose)" }}>
                  {connectError}
                </span>
              )}
            </form>
          )}
        </section>

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
