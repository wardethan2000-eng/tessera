"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { TreeArchiveCard } from "@/components/home/TreeArchiveCard";
import type { TreeHomePayload } from "@/components/home/homeTypes";
import { readLastOpenedTreeId } from "@/lib/last-opened-tree";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type TreeMembership = {
  id: string;
  name: string;
  role: string;
  createdAt: string;
};

type DashboardTreeSummary = {
  tree: TreeMembership;
  stats: TreeHomePayload["stats"];
  coverage: TreeHomePayload["coverage"];
  heroCandidates: TreeHomePayload["heroCandidates"];
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const preferredTreeId = searchParams.get("treeId");

  const [summaries, setSummaries] = useState<DashboardTreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        const treesRes = await fetch(`${API}/api/trees`, { credentials: "include" });
        if (!treesRes.ok) {
          throw new Error("Could not load your archives.");
        }

        const trees = (await treesRes.json()) as TreeMembership[];
        if (trees.length === 0) {
          router.replace("/onboarding");
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
          error instanceof Error ? error.message : "Could not load your archives.",
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboard();
  }, [preferredTreeId, router, session]);

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
    return (
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
    );
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
            This foyer could not be opened.
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
            FamilyTree
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--ink)",
            }}
          >
            Your archive foyer
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--ink-faded)",
            }}
          >
            {session?.user.name}
          </span>
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
              maxWidth: "12ch",
            }}
          >
            Step into the family archives.
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
            This is the cross-tree foyer. Choose an archive to enter, revisit a memory already
            surfacing there, or move between branches of family history without dropping into a
            utility dashboard.
          </div>
        </section>

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
            label="Primary route"
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
              href={`/trees/${primarySummary.tree.id}/atrium`}
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
                  Enter the atrium to add the first memory, or start by shaping the family branch
                  it will belong to.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <a
                  href={`/trees/${primarySummary.tree.id}/atrium`}
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
                  Open atrium
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
                Move between the rest of your family spaces without leaving the foyer.
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
                <TreeArchiveCard
                  key={summary.tree.id}
                  treeName={summary.tree.name}
                  role={summary.tree.role}
                  stats={summary.stats}
                  coverage={summary.coverage}
                  heroMemory={summary.heroCandidates[0] ?? null}
                  href={`/trees/${summary.tree.id}/atrium`}
                />
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
              Only one archive is open right now. If more family branches are added later, they
              will surface here as companion archives in the foyer.
            </div>
          </section>
        )}
      </main>
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
