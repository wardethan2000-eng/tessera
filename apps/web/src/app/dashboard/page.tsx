"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { DashboardSkeleton } from "@/components/home/HomeSurfaceSkeletons";
import { TreeArchiveCard } from "@/components/home/TreeArchiveCard";
import type { TreeHomePayload } from "@/components/home/homeTypes";
import { readLastOpenedTreeId } from "@/lib/last-opened-tree";

const API = "";

type TreeMembership = {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  founderUserId?: string;
};

type DashboardTreeSummary = {
  tree: TreeMembership;
  stats: TreeHomePayload["stats"];
  coverage: TreeHomePayload["coverage"];
  heroCandidates: TreeHomePayload["heroCandidates"];
  isFoundedByYou: boolean;
};

type PendingInvite = {
  id: string;
  treeId: string;
  treeName: string;
  invitedByName: string;
  invitedByEmail: string | null;
  proposedRole: string;
  linkedPersonName: string | null;
  expiresAt: string;
  createdAt: string;
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const preferredTreeId = searchParams.get("treeId");

  const [summaries, setSummaries] = useState<DashboardTreeSummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingLineage, setCreatingLineage] = useState(false);
  const [newLineageName, setNewLineageName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submittingLineage, setSubmittingLineage] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/auth/signin");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;

    const fetchDashboard = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [treesRes, invitesRes] = await Promise.all([
          fetch(`${API}/api/trees`, { credentials: "include" }),
          fetch(`${API}/api/me/invitations`, { credentials: "include" }),
        ]);
        if (!treesRes.ok) {
          throw new Error("Your archives could not be loaded.");
        }

        const trees = (await treesRes.json()) as TreeMembership[];
        const invites = invitesRes.ok
          ? ((await invitesRes.json()) as PendingInvite[])
          : [];
        setPendingInvites(invites);

        if (trees.length === 0) {
          if (invites.length > 0) {
            setSummaries([]);
            return;
          }
          router.replace("/onboarding/welcome");
          return;
        }

        const homeResults = await Promise.all(
          trees.map(async (tree) => {
            const res = await fetch(`${API}/api/trees/${tree.id}/home`, {
              credentials: "include",
            });
            if (!res.ok) return null;
            const payload = (await res.json()) as TreeHomePayload;
            return {
              tree,
              stats: payload.stats,
              coverage: payload.coverage,
              heroCandidates: payload.heroCandidates,
              isFoundedByYou:
                !!tree.founderUserId && tree.founderUserId === session?.user?.id,
            } satisfies DashboardTreeSummary;
          }),
        );

        const nextSummaries = homeResults.filter(
          (summary): summary is DashboardTreeSummary => Boolean(summary),
        );
        const lastOpenedTreeId = readLastOpenedTreeId();

        nextSummaries.sort((left, right) => {
          const leftPreferred = preferredTreeId === left.tree.id ? 1 : 0;
          const rightPreferred = preferredTreeId === right.tree.id ? 1 : 0;
          if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;

          const leftLastOpened = !preferredTreeId && lastOpenedTreeId === left.tree.id ? 1 : 0;
          const rightLastOpened = !preferredTreeId && lastOpenedTreeId === right.tree.id ? 1 : 0;
          if (leftLastOpened !== rightLastOpened) return rightLastOpened - leftLastOpened;

          const memoryDiff = right.stats.memoryCount - left.stats.memoryCount;
          if (memoryDiff !== 0) return memoryDiff;

          return left.tree.name.localeCompare(right.tree.name);
        });

        setSummaries(nextSummaries);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Your archives could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboard();
  }, [preferredTreeId, router, session]);

  async function handleCreateLineage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newLineageName.trim();
    if (!trimmed) {
      setCreateError("Give this archive a name before creating it.");
      return;
    }
    setSubmittingLineage(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API}/api/trees`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        throw new Error("Could not create archive.");
      }
      const created = (await res.json()) as { id: string };
      router.push(`/trees/${created.id}/home`);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create archive.",
      );
    } finally {
      setSubmittingLineage(false);
    }
  }

  const primarySummary = summaries[0] ?? null;
  const secondarySummaries = summaries.slice(1);
  const totalPeople = useMemo(
    () => summaries.reduce((sum, summary) => sum + summary.stats.peopleCount, 0),
    [summaries],
  );
  const totalMemories = useMemo(
    () => summaries.reduce((sum, summary) => sum + summary.stats.memoryCount, 0),
    [summaries],
  );

  if (isPending || loading) {
    return <DashboardSkeleton />;
  }

  if (loadError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #f7f2e9 0%, #efe7da 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            border: "1px solid rgba(124,108,84,0.18)",
            background: "rgba(252,248,242,0.92)",
            borderRadius: 18,
            padding: 24,
          }}
        >
          <h1
            style={{
              margin: "0 0 10px",
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            Your archives could not be loaded.
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--ink-faded)",
            }}
          >
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.58), transparent 26%), radial-gradient(circle at 82% 18%, rgba(210,182,133,0.16), transparent 24%), linear-gradient(180deg, #f7f2e9 0%, #efe7da 100%)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px clamp(18px, 4vw, 28px)",
          borderBottom: "1px solid rgba(128,107,82,0.14)",
          background: "rgba(247,242,233,0.74)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "rgba(63,53,41,0.52)",
            }}
          >
            Tessera
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--ink)",
            }}
          >
            Your archives
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setCreatingLineage(true);
              setCreateError(null);
              setNewLineageName("");
            }}
            style={{
              border: "1px solid rgba(128,107,82,0.2)",
              background: "var(--ink)",
              color: "white",
              borderRadius: 999,
              padding: "8px 14px",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
            }}
          >
            + Start a new archive
          </button>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--ink-faded)",
            }}
          >
            {session?.user.name}
          </span>
          <a
            href="/account"
            style={{
              border: "1px solid rgba(128,107,82,0.2)",
              background: "rgba(255,250,244,0.84)",
              borderRadius: 999,
              padding: "8px 12px",
              textDecoration: "none",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            Account
          </a>
          <button
            onClick={() => {
              void signOut().then(() => router.push("/auth/signin"));
            }}
            style={{
              border: "1px solid rgba(128,107,82,0.2)",
              background: "rgba(255,250,244,0.84)",
              borderRadius: 999,
              padding: "8px 12px",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "clamp(30px, 6vw, 48px) clamp(18px, 4vw, 28px) 64px",
        }}
      >
        <section style={{ marginBottom: 34 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(34px, 5vw, 56px)",
              lineHeight: 1.02,
              color: "var(--ink)",
              maxWidth: "14ch",
            }}
          >
            Step between your family archives.
          </div>
          <div
            style={{
              marginTop: 14,
              maxWidth: 760,
              fontFamily: "var(--font-body)",
              fontSize: 18,
              lineHeight: 1.75,
              color: "rgba(53,44,33,0.74)",
            }}
          >
            You can belong to many archives — the ones you founded and the ones you were
            welcomed into. Shared relatives are the bridges between them. Open an archive
            to step inside it, or start a new one for a spouse, a maternal line, or a
            chosen family.
          </div>
        </section>

        {pendingInvites.length > 0 && (
          <section style={{ marginBottom: 34 }}>
            <h2
              style={{
                margin: "0 0 12px",
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 400,
                color: "var(--ink)",
              }}
            >
              Pending invitations
            </h2>
            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              }}
            >
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  style={{
                    border: "1px solid rgba(128,107,82,0.18)",
                    background: "rgba(252,248,242,0.92)",
                    borderRadius: 14,
                    padding: "14px 16px",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-body)",
                      fontSize: 15,
                      color: "var(--ink)",
                    }}
                  >
                    <strong>{invite.invitedByName}</strong> invited you to{" "}
                    <em>{invite.treeName}</em>
                    {invite.linkedPersonName
                      ? ` as a contributor for ${invite.linkedPersonName}`
                      : ""}
                    .
                  </p>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      color: "var(--ink-faded)",
                    }}
                  >
                    Check your inbox
                    {invite.invitedByEmail ? ` for an email from ${invite.invitedByEmail}` : ""}
                    , or ask them to resend the link.
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 36,
          }}
        >
          <StatTile label="Archives" value={`${summaries.length}`} />
          <StatTile label="People" value={`${totalPeople}`} />
          <StatTile label="Memories" value={`${totalMemories}`} />
          <StatTile
            label="Primary archive"
            value={primarySummary ? `${primarySummary.tree.name}` : "Archive"}
          />
        </section>

        {primarySummary && (
          <section style={{ marginBottom: 30 }}>
            <TreeArchiveCard
              treeName={primarySummary.tree.name}
              role={primarySummary.tree.role}
              stats={primarySummary.stats}
              coverage={primarySummary.coverage}
              heroMemory={primarySummary.heroCandidates[0] ?? null}
              href={`/trees/${primarySummary.tree.id}/home`}
              variant="primary"
            />
          </section>
        )}

        {primarySummary && primarySummary.stats.memoryCount === 0 && (
          <section style={{ marginBottom: 30 }}>
            <div
              style={{
                border: "1px solid rgba(128,107,82,0.14)",
                borderRadius: 18,
                background:
                  "linear-gradient(180deg, rgba(252,248,242,0.88) 0%, rgba(245,238,228,0.84) 100%)",
                padding: "22px clamp(18px, 3vw, 24px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                boxShadow: "0 12px 28px rgba(40,30,18,0.05)",
              }}
            >
              <div style={{ maxWidth: 640 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 24,
                    lineHeight: 1.15,
                    color: "var(--ink)",
                    marginBottom: 8,
                  }}
                >
                  This archive is still in its first chapter.
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "rgba(53,44,33,0.74)",
                  }}
                >
                  Open its Home to add the first memory, or start by shaping the family branch
                  it will belong to.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <a
                  href={`/trees/${primarySummary.tree.id}/home`}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    color: "white",
                    background: "var(--ink)",
                    borderRadius: 999,
                    padding: "10px 16px",
                    textDecoration: "none",
                  }}
                >
                  Open Home
                </a>
                <a
                  href={`/trees/${primarySummary.tree.id}/people/new`}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    color: "var(--moss)",
                    textDecoration: "none",
                  }}
                >
                  Add a person →
                </a>
              </div>
            </div>
          </section>
        )}

        {secondarySummaries.length > 0 && (
          <section
            style={{
              borderTop: "1px solid rgba(128,107,82,0.12)",
              paddingTop: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 18,
                flexWrap: "wrap",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 24,
                  fontWeight: 400,
                  color: "var(--ink)",
                }}
              >
                Other archives
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                }}
              >
                Move between the rest of your family spaces — founded by you or shared with you.
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gap: 18,
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              }}
            >
              {secondarySummaries.map((summary) => (
                <div key={summary.tree.id} style={{ position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      zIndex: 2,
                      fontFamily: "var(--font-ui)",
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: summary.isFoundedByYou ? "var(--moss)" : "rgba(63,53,41,0.55)",
                      background: "rgba(255,250,244,0.84)",
                      border: "1px solid rgba(128,107,82,0.18)",
                      borderRadius: 999,
                      padding: "3px 8px",
                    }}
                  >
                    {summary.isFoundedByYou ? "Founded by you" : "Shared with you"}
                  </div>
                  <TreeArchiveCard
                    treeName={summary.tree.name}
                    role={summary.tree.role}
                    stats={summary.stats}
                    coverage={summary.coverage}
                    heroMemory={summary.heroCandidates[0] ?? null}
                    href={`/trees/${summary.tree.id}/home`}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {primarySummary && secondarySummaries.length === 0 && (
          <section>
            <div
              style={{
                borderTop: "1px solid rgba(128,107,82,0.12)",
                paddingTop: 22,
                fontFamily: "var(--font-body)",
                fontSize: 15,
                lineHeight: 1.75,
                color: "rgba(53,44,33,0.68)",
                maxWidth: 720,
              }}
            >
              Only one archive is open right now. Start another for a spouse-family line,
              a maternal branch, or a chosen family — shared relatives will become the bridges
              between them.
            </div>
          </section>
        )}
      </main>

      {creatingLineage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!submittingLineage) setCreatingLineage(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(28,25,21,0.55)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <form
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleCreateLineage}
            style={{
              maxWidth: 440,
              width: "100%",
              background: "rgba(252,248,242,0.98)",
              borderRadius: 18,
              border: "1px solid rgba(128,107,82,0.2)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 24px 60px rgba(40,30,18,0.3)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 24,
                color: "var(--ink)",
              }}
            >
              Start a new archive
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.6,
                color: "rgba(53,44,33,0.72)",
              }}
            >
              An archive can be a family name like{" "}
              <em>Ward Family</em> or <em>Karsen Family</em>, a line like{" "}
              <em>Maternal Line</em>, or a framing like <em>Chosen Family</em>.
            </div>
            <input
              autoFocus
              value={newLineageName}
              onChange={(event) => setNewLineageName(event.target.value)}
              placeholder="e.g. Karsen Family"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 16,
                padding: "10px 12px",
                border: "1px solid rgba(128,107,82,0.3)",
                borderRadius: 10,
                background: "white",
                color: "var(--ink)",
              }}
            />
            {createError && (
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "#8a2a1c",
                }}
              >
                {createError}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={submittingLineage}
                onClick={() => setCreatingLineage(false)}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  background: "transparent",
                  color: "var(--ink-faded)",
                  border: "1px solid rgba(128,107,82,0.2)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingLineage}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  background: "var(--ink)",
                  color: "white",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 16px",
                  cursor: submittingLineage ? "default" : "pointer",
                }}
              >
                {submittingLineage ? "Creating…" : "Create archive"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(128,107,82,0.14)",
        borderRadius: 18,
        background: "rgba(252,248,242,0.82)",
        padding: "16px 18px",
        boxShadow: "0 10px 24px rgba(40,30,18,0.04)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(63,53,41,0.52)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          lineHeight: 1.1,
          color: "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            background: "linear-gradient(180deg, #f7f2e9 0%, #efe7da 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--ink-faded)",
            }}
          >
            Opening your archives…
          </p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
