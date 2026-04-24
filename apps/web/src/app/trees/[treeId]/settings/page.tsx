"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

type ImportStage = "idle" | "previewing" | "ready" | "importing" | "done" | "error";

interface Tree {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  proposedRole: string;
  linkedPersonId: string | null;
  linkedPersonName: string | null;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

interface PersonOption {
  id: string;
  displayName: string;
  isLiving: boolean;
  linkedUserId: string | null;
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
  const searchParams = useSearchParams();
  const preselectedPersonId = searchParams.get("personId");
  const { data: session } = useSession();
  const inviteSectionRef = useRef<HTMLElement | null>(null);
  const inviteEmailRef = useRef<HTMLInputElement | null>(null);

  const [tree, setTree] = useState<Tree | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"contributor" | "viewer" | "steward">("contributor");
  const [inviteLinkedPersonId, setInviteLinkedPersonId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // GEDCOM import
  const [gedcomFile, setGedcomFile] = useState<File | null>(null);
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const [importPreview, setImportPreview] = useState<{ individualsFound: number; familiesFound: number; expectedRelationships: number; treeHadExistingPeople?: boolean } | null>(null);
  const [importResult, setImportResult] = useState<{ peopleCreated: number; relationshipsCreated: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [cachedGedcomText, setCachedGedcomText] = useState<string | null>(null);

  async function handleGedcomFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setGedcomFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    if (!file) { setImportStage("idle"); return; }

    setImportStage("previewing");
    try {
      const text = await file.text();
      setCachedGedcomText(text);
      const res = await fetch(`${API}/api/trees/${treeId}/import/gedcom/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gedcom: text }),
      });
      if (!res.ok) {
        const body = await res.json();
        setImportError(body.error ?? "Could not parse file");
        setImportStage("error");
        return;
      }
      setImportPreview(await res.json());
      setImportStage("ready");
    } catch {
      setImportError("Could not read file");
      setImportStage("error");
    }
  }

  async function confirmGedcomImport() {
    if (!cachedGedcomText || importStage === "importing") return;
    setImportStage("importing");
    setImportError(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/import/gedcom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gedcom: cachedGedcomText }),
      });
      if (!res.ok) {
        const body = await res.json();
        setImportError(body.error ?? "Import failed");
        setImportStage("error");
        return;
      }
      setImportResult(await res.json());
      setImportStage("done");
    } catch {
      setImportError("Import failed unexpectedly");
      setImportStage("error");
    }
  }

  function resetImport() {
    setGedcomFile(null);
    setCachedGedcomText(null);
    setImportPreview(null);
    setImportResult(null);
    setImportError(null);
    setImportStage("idle");
  }


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
    const [treeRes, invitesRes, membersRes, peopleRes] = await Promise.all([
      fetch(`${API}/api/trees/${treeId}`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/invitations`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/members`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
    ]);

    if (treeRes.ok) setTree(await treeRes.json());
    if (invitesRes.ok) setInvitations(await invitesRes.json());
    if (peopleRes.ok) setPeople(await peopleRes.json());
    if (membersRes.ok) {
      const membersData: Member[] = await membersRes.json();
      setMembers(membersData);
      if (session?.user?.id) {
        const me = membersData.find((m) => m.userId === session.user.id);
        setMyRole(me?.role ?? null);
      }
    }
    setLoading(false);
  }, [treeId, session?.user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apply ?personId=... preselection once people are loaded
  const preselectAppliedRef = useRef(false);
  useEffect(() => {
    if (preselectAppliedRef.current) return;
    if (!preselectedPersonId || people.length === 0) return;
    const match = people.find((p) => p.id === preselectedPersonId);
    if (!match) return;
    preselectAppliedRef.current = true;
    setInviteLinkedPersonId(preselectedPersonId);
    // Default to steward so the invited subject has full edit rights across
    // this tree (matches the user's typical intent when inviting the person
    // their record represents).
    setInviteRole("steward");
    // Scroll to invite section and focus the email field.
    setTimeout(() => {
      inviteSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inviteEmailRef.current?.focus();
    }, 100);
  }, [preselectedPersonId, people]);

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
        body: JSON.stringify({
          email: inviteEmail,
          proposedRole: inviteRole,
          linkedPersonId: inviteLinkedPersonId || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setInviteError(e.error ?? "Failed to send invitation");
        return;
      }
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteLinkedPersonId("");
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

  const isManager = myRole === "founder" || myRole === "steward";
  const linkedInvitePeople = people
    .filter((person) => person.isLiving)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

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
          onClick={() => router.push(`/trees/${treeId}/home`)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 32, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to {tree?.name ?? "your archive"}
        </button>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400, color: "var(--ink)", margin: "0 0 4px" }}>
          {tree?.name}
        </h1>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: "0 0 48px" }}>
          Archive settings
        </p>

        {/* Invite section */}
        <section id="invite" ref={inviteSectionRef} style={sectionStyle}>
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
                ref={inviteEmailRef}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="linked-person"
                style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }}
              >
                Link this invite to a person in the tree
              </label>
              <select
                id="linked-person"
                value={inviteLinkedPersonId}
                onChange={(e) => setInviteLinkedPersonId(e.target.value)}
                style={inputStyle}
              >
                <option value="">No linked person</option>
                {linkedInvitePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                    {person.linkedUserId ? " (already claimed)" : ""}
                  </option>
                ))}
              </select>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>
                Use this when you are inviting a living relative as themselves so the account can attach to the right person record after acceptance.
              </p>
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
                    {inv.linkedPersonName && (
                      <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "4px 0 0" }}>
                        Linked to {inv.linkedPersonName}
                      </p>
                    )}
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

        {/* ── Cross-tree sharing ─────────────────────────────────────────────── */}
        <section style={{ ...sectionStyle, marginTop: 32 }}>
          <h2 style={sectionHeadingStyle}>Cross-tree sharing</h2>
          <p style={sectionDescStyle}>
            Family sharing no longer depends on manual archive-to-archive connection requests.
            Shared people, memories, and in-law branches now travel through the cross-tree scope model.
          </p>
          <div style={{ ...rowStyle, marginTop: 20, alignItems: "flex-start", flexDirection: "column", gap: 10 }}>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", margin: 0 }}>
              <strong>What changed:</strong> the old connected-family handshake has been retired.
            </p>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.6 }}>
              Shared relatives now belong to one global person record and can appear in multiple trees at once.
              Memories follow that shared person through tree scope and visibility rules instead of manual connection requests.
            </p>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.6 }}>
              Use a person&apos;s detail page to switch tree context, review where they already appear, and merge duplicate people when two branches describe the same individual.
            </p>
            {isManager && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: 0, lineHeight: 1.6 }}>
                Stewards can keep expanding shared family coverage by adding existing people into this tree&apos;s scope instead of creating archive-to-archive links.
              </p>
            )}
          </div>
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

        {/* GEDCOM import — founders and stewards only */}
        {isManager && (
          <section style={{ ...sectionStyle, marginTop: 32 }}>
            <h2 style={sectionHeadingStyle}>Import from GEDCOM</h2>
            <p style={sectionDescStyle}>
              Upload a <code>.ged</code> file exported from another genealogy program (Ancestry, FamilySearch, MacFamilyTree, etc.)
              to bootstrap this archive with people and relationships. Existing records are not affected.
            </p>

            {importStage !== "done" && (
              <div style={{ marginTop: 20 }}>
                <label
                  htmlFor="gedcom-file"
                  style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", display: "block", marginBottom: 8 }}
                >
                  Select a GEDCOM file (.ged)
                </label>
                <input
                  id="gedcom-file"
                  type="file"
                  accept=".ged,.gedcom,text/plain"
                  onChange={handleGedcomFileChange}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)" }}
                />
              </div>
            )}

            {importStage === "previewing" && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", marginTop: 14 }}>
                Parsing file…
              </p>
            )}

            {importStage === "ready" && importPreview && (
              <div style={{ marginTop: 20, padding: "16px 18px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8 }}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: "0 0 4px", fontWeight: 500 }}>
                  Ready to import
                </p>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.8 }}>
                  {importPreview.individualsFound} people · {importPreview.familiesFound} families · ~{importPreview.expectedRelationships} relationships
                </p>
                {importPreview.treeHadExistingPeople && (
                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--amber, #c97d1a)", margin: "8px 0 0", lineHeight: 1.5 }}>
                    ⚠ This tree already has people. Importing will add new records — it will not merge with existing ones. Duplicates may result.
                  </p>
                )}
                <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={confirmGedcomImport}
                    style={primaryBtnStyle}
                  >
                    Import into archive
                  </button>
                  <button
                    onClick={resetImport}
                    style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {importStage === "importing" && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", marginTop: 14 }}>
                Importing… this may take a moment for large files.
              </p>
            )}

            {importStage === "done" && importResult && (
              <div style={{ marginTop: 20, padding: "16px 18px", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8 }}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--moss)", margin: "0 0 4px", fontWeight: 500 }}>
                  Import complete
                </p>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.8 }}>
                  {importResult.peopleCreated} people added · {importResult.relationshipsCreated} relationships created
                  {importResult.skipped > 0 && ` · ${importResult.skipped} duplicates skipped`}
                </p>
                <button
                  onClick={resetImport}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 12 }}
                >
                  Import another file
                </button>
              </div>
            )}

            {importStage === "error" && importError && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--rose)", marginTop: 14 }}>
                {importError} —{" "}
                <button
                  onClick={resetImport}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--rose)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  try again
                </button>
              </p>
            )}
          </section>
        )}
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
