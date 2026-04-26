"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { ArchiveTile } from "./ArchiveTile";
import { NewArchiveTile } from "./NewArchiveTile";
import { InvitationTile } from "./InvitationTile";
import { MemoryTile } from "./MemoryTile";
import { MosaicSurface } from "./MosaicTile";
import type { TreeHomePayload } from "@/components/home/homeTypes";
import { readLastOpenedTreeId } from "@/lib/last-opened-tree";
import {
  collectTodayHighlights,
  formatTodayNote,
  formatGenerationsLabel,
  formatSpanLabel,
  formatUnfinishedNote,
  isSparseArchive,
  selectMosaicMemories,
  type DashboardTreeSummary,
  type PendingInvite,
  type TodayHighlight,
} from "./mosaicUtils";

const API = getApiBase();

type TreeMembership = {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  founderUserId?: string;
};

function MosaicDashboardContent() {
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

          const homeResults: (DashboardTreeSummary | null)[] = await Promise.all(
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
              memories: payload.memories,
              isFoundedByYou:
                !!tree.founderUserId && tree.founderUserId === session?.user?.id,
              today: payload.today ?? null,
            } as DashboardTreeSummary;
          }),
        );

        const nextSummaries = homeResults.filter(
          (s): s is DashboardTreeSummary => s !== null,
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

  const primary = summaries[0] ?? null;
  const secondary = summaries.slice(1);

  const mosaicMemories = useMemo(() => selectMosaicMemories(summaries), [summaries]);
  const todayHighlights = useMemo(() => collectTodayHighlights(summaries), [summaries]);

  const unfinishedTotal = useMemo(
    () =>
      summaries.reduce(
        (sum, s) => sum + s.stats.peopleWithoutPortraitCount + s.stats.peopleWithoutDirectMemoriesCount,
        0,
      ),
    [summaries],
  );

  const primarySpan = formatSpanLabel(primary?.coverage.earliestYear ?? null, primary?.coverage.latestYear ?? null);

  if (isPending || loading) {
    return (
      <div className="mosaic-viewport mosaic-viewport--loading">
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>
          Opening your archives…
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mosaic-viewport mosaic-viewport--loading" style={{ padding: 24 }}>
        <div style={{ maxWidth: 520, border: "1px solid var(--rule)", background: "var(--card-bg)", borderRadius: 18, padding: 24 }}>
          <h1 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, color: "var(--ink)" }}>
            Your archives could not be loaded.
          </h1>
          <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7, color: "var(--ink-faded)" }}>
            {loadError}
          </p>
        </div>
      </div>
    );
  }

  const hasMultipleTrees = summaries.length > 1;
  const primaryIsSparse = primary ? isSparseArchive(primary.stats) : true;

  return (
    <div className="mosaic-viewport">
      <header className="mosaic-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mosaic-header-wordmark">Tessera</span>
          {summaries.length > 0 && (
            <span className="mosaic-header-detail">
              {hasMultipleTrees ? `${summaries.length} archives` : "Archive"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/account" className="mosaic-header-link">Account</a>
          <button
            onClick={() => { void signOut().then(() => router.push("/auth/signin")); }}
            className="mosaic-header-link"
            style={{ cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mosaic-main">
        {summaries.length === 0 && pendingInvites.length > 0 && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7, color: "var(--ink-faded)", marginBottom: 28 }}>
            You have pending invitations below.
          </p>
        )}

          {todayHighlights.length > 0 && (
            <div className="mosaic-today-strip">
              {todayHighlights.map((h, i) => (
                <TodayNote key={i} highlight={h} />
              ))}
            </div>
          )}

        <MosaicSurface>
          {primary && (
            <ArchiveTile
              key={primary.tree.id}
              treeName={primary.tree.name}
              role={primary.tree.role}
              stats={primary.stats}
              coverage={primary.coverage}
              heroMemory={primary.heroCandidates[0] ?? null}
              isFoundedByYou={primary.isFoundedByYou}
              isPrimary
              isSparse={primaryIsSparse}
              href={`/trees/${primary.tree.id}/home`}
            />
          )}

          {mosaicMemories.slice(0, 3).map((tile) => (
            <MemoryTile
              key={`${tile.treeId}:${tile.memory.id}`}
              memory={tile.memory}
              treeName={tile.treeName}
              href={`/trees/${tile.treeId}/memories/${tile.memory.id}`}
              weight={tile.weight}
              index={mosaicMemories.indexOf(tile)}
            />
          ))}

          {primary && !primaryIsSparse && (
            <MosaicStatNote
              label={(() => {
                const gen = formatGenerationsLabel(primary.stats.generationCount);
                const span = primarySpan;
                if (gen && span) return `${primary.stats.peopleCount} people across ${gen}, ${span}`;
                if (gen) return `${primary.stats.peopleCount} people across ${gen}`;
                if (span) return `${primary.stats.peopleCount} people, ${span}`;
                return `${primary.stats.peopleCount} people`;
              })()}
            />
          )}

          {primary && primaryIsSparse && (
            <MosaicStatNote label="This archive is just beginning" />
          )}

          {pendingInvites.map((invite) => (
            <InvitationTile
              key={invite.id}
              treeName={invite.treeName}
              invitedByName={invite.invitedByName}
              proposedRole={invite.proposedRole}
              linkedPersonName={invite.linkedPersonName}
              treeId={invite.treeId}
              inviteId={invite.id}
            />
          ))}

          {mosaicMemories.slice(3).map((tile) => (
            <MemoryTile
              key={`${tile.treeId}:${tile.memory.id}`}
              memory={tile.memory}
              treeName={tile.treeName}
              href={`/trees/${tile.treeId}/memories/${tile.memory.id}`}
              weight={tile.weight}
              index={mosaicMemories.indexOf(tile)}
            />
          ))}

          {secondary.map((summary) => (
            <ArchiveTile
              key={summary.tree.id}
              treeName={summary.tree.name}
              role={summary.tree.role}
              stats={summary.stats}
              coverage={summary.coverage}
              heroMemory={summary.heroCandidates[0] ?? null}
              isFoundedByYou={summary.isFoundedByYou}
              isPrimary={false}
              isSparse={isSparseArchive(summary.stats)}
              href={`/trees/${summary.tree.id}/home`}
            />
          ))}

          {unfinishedTotal > 0 && !primaryIsSparse && (
            <MosaicStatNote
              label={formatUnfinishedNote(primary?.stats ?? { peopleWithoutPortraitCount: 0, peopleWithoutDirectMemoriesCount: 0 }) ?? `${unfinishedTotal} stories still waiting`}
              accent="gilt"
            />
          )}

          <NewArchiveTile
            onClick={() => {
              setCreatingLineage(true);
              setCreateError(null);
              setNewLineageName("");
            }}
          />
        </MosaicSurface>

        {summaries.length === 1 && (
          <p className="mosaic-epilogue">
            Start another archive for a spouse-family line, a maternal branch, or a chosen family — shared relatives become the bridges between them.
          </p>
        )}
      </main>

      {creatingLineage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!submittingLineage) setCreatingLineage(false); }}
          className="mosaic-overlay"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateLineage}
            className="mosaic-dialog"
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)" }}>
              Start a new archive
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--ink-soft)" }}>
              An archive can be a family name like <em>Ward Family</em> or <em>Karsen Family</em>, a line like <em>Maternal Line</em>, or a framing like <em>Chosen Family</em>.
            </div>
            <input
              autoFocus
              value={newLineageName}
              onChange={(e) => setNewLineageName(e.target.value)}
              placeholder="e.g. Karsen Family"
              className="mosaic-input"
            />
            {createError && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "#8a2a1c" }}>
                {createError}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={submittingLineage}
                onClick={() => setCreatingLineage(false)}
                className="mosaic-btn-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingLineage}
                className="mosaic-btn-primary"
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

function TodayNote({ highlight }: { highlight: TodayHighlight }) {
  const note = formatTodayNote(highlight);
  if (!note) return null;
  const treeId = highlight.treeId;
  const kind = highlight.kind;
  const accent = kind === "birthday" ? "var(--moss)" : kind === "deathiversary" ? "var(--ink-faded)" : "var(--gilt)";
  return (
    <a
      href={`/trees/${treeId}/home`}
      className="mosaic-today-note"
      style={{ borderColor: accent }}
    >
      <span className="mosaic-today-dot" style={{ background: accent }} />
      <span>{note}</span>
    </a>
  );
}

function MosaicStatNote({ label, accent }: { label: string; accent?: "moss" | "gilt" | "rose" }) {
  const colorMap = { moss: "var(--moss)", gilt: "var(--gilt)", rose: "var(--rose)" };
  const borderColor = accent ? colorMap[accent] : "var(--rule)";
  return (
    <div
      className="mosaic-stat-note"
      style={{ borderColor }}
    >
      <span style={{ color: accent ? colorMap[accent] : "var(--ink-soft)" }}>
        {label}
      </span>
    </div>
  );
}

export default function MosaicDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mosaic-viewport mosaic-viewport--loading">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>
            Opening your archives…
          </p>
        </div>
      }
    >
      <MosaicDashboardContent />
    </Suspense>
  );
}