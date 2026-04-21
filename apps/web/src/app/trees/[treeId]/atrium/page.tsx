"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AnimatePresence } from "framer-motion";
import { ConstellationPreview } from "@/components/home/ConstellationPreview";
import { EraRibbon } from "@/components/home/EraRibbon";
import { HomeSummaryBand } from "@/components/home/HomeSummaryBand";
import { MemoryLane } from "@/components/home/MemoryLane";
import { TreeHomeHero } from "@/components/home/TreeHomeHero";
import type {
  TreeHomeCoverage,
  TreeHomePayload,
  TreeHomePersonRecord,
  TreeHomeRelationship,
  TreeHomeStats,
} from "@/components/home/homeTypes";
import { DriftMode } from "@/components/tree/DriftMode";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { Shimmer } from "@/components/ui/Shimmer";
import { writeLastOpenedTreeId } from "@/lib/last-opened-tree";
import { isCanonicalTreeId, resolveCanonicalTreeId } from "@/lib/tree-route";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";
import { extractYearFromText, memoryMatchesDecade } from "@/components/home/homeUtils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

interface Person {
  id: string;
  name: string;
  portraitUrl: string | null;
  essenceLine: string | null;
  birthYear: number | null;
  deathYear: number | null;
  linkedUserId: string | null;
}

interface Memory {
  id: string;
  kind: "story" | "photo" | "voice" | "document" | "other";
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  personName?: string | null;
  primaryPersonId?: string | null;
  personPortraitUrl?: string | null;
  createdAt?: string;
}

type Tree = TreeHomePayload["tree"];

function extractYear(text?: string | null): number | null {
  return extractYearFromText(text);
}

function mapHomePerson(person: TreeHomePersonRecord): Person {
  return {
    id: person.id,
    name: person.displayName ?? person.name ?? "",
    portraitUrl: person.portraitUrl,
    essenceLine: person.essenceLine,
    birthYear: extractYear(person.birthDateText ?? null),
    deathYear: extractYear(person.deathDateText ?? null),
    linkedUserId: person.linkedUserId,
  };
}

function PersonCard({ person, onClick }: { person: Person; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        background: hovered ? "var(--paper-deep)" : "none",
        transition: `background 150ms ${EASE}`,
      } as React.CSSProperties}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          overflow: "hidden",
          border: "1.5px solid var(--rule)",
          background: "var(--paper-deep)",
          flexShrink: 0,
        }}
      >
        {person.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.portraitUrl}
            alt={person.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--ink-faded)",
            }}
          >
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          color: "var(--ink)",
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: 80,
        }}
      >
        {person.name.split(" ")[0]}
      </div>
      {(person.birthYear ?? person.deathYear) && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            color: "var(--ink-faded)",
          }}
        >
          {[person.birthYear, person.deathYear].filter(Boolean).join("–")}
        </div>
      )}
    </button>
  );
}

export default function AtriumPage() {
  const router = useRouter();
  const params = useParams<{ treeId: string }>();
  const { treeId } = params;
  const { data: session, isPending } = useSession();
  const needsNormalization = !isCanonicalTreeId(treeId);

  const [tree, setTree] = useState<Tree | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [heroCandidates, setHeroCandidates] = useState<Memory[]>([]);
  const [homeStats, setHomeStats] = useState<TreeHomeStats | null>(null);
  const [coverage, setCoverage] = useState<TreeHomeCoverage | null>(null);
  const [relationships, setRelationships] = useState<TreeHomeRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [driftOpen, setDriftOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [curationCount, setCurationCount] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [selectedEra, setSelectedEra] = useState<"all" | number>("all");

  // Global ⌘K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const applyHomePayload = useCallback((data: TreeHomePayload) => {
    setTree(data.tree);
    setPeople(data.people.map(mapHomePerson));
    setMemories(data.memories);
    setHeroIndex(0);
    setHeroCandidates(data.heroCandidates);
    setHomeStats(data.stats);
    setCoverage(data.coverage);
    setRelationships(data.relationships);
    setSelectedEra((current) =>
      current === "all" || data.coverage.decadeBuckets.some((bucket) => bucket.startYear === current)
        ? current
        : "all",
    );
    setInboxCount(data.inboxCount);
    setCurationCount(data.curationCount);
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session || !needsNormalization) return;

    let cancelled = false;
    void (async () => {
      const resolvedTreeId = await resolveCanonicalTreeId(API, treeId);
      if (cancelled) return;
      if (resolvedTreeId && resolvedTreeId !== treeId) {
        router.replace(`/trees/${resolvedTreeId}/atrium`);
        return;
      }
      if (!resolvedTreeId) {
        setLoadError("This tree link is invalid or no longer points to an available tree.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsNormalization, router, session, treeId]);

  useEffect(() => {
    if (!session || !treeId || !isCanonicalTreeId(treeId)) return;
    const fetchHome = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`${API}/api/trees/${treeId}/home`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to load this tree.");
        }
        const data = (await res.json()) as TreeHomePayload;
        applyHomePayload(data);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load this tree.",
        );
      } finally {
        setLoading(false);
      }
    };
    void fetchHome();
  }, [applyHomePayload, session, treeId]);

  useEffect(() => {
    if (!session || !isCanonicalTreeId(treeId)) return;
    writeLastOpenedTreeId(treeId);
  }, [session, treeId]);

  const handlePersonClick = useCallback(
    (personId: string) => {
      router.push(`/trees/${treeId}/people/${personId}`);
    },
    [router, treeId]
  );

  const refreshHome = useCallback(async () => {
    const res = await fetch(`${API}/api/trees/${treeId}/home`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = (await res.json()) as TreeHomePayload;
    applyHomePayload(data);
  }, [applyHomePayload, treeId]);

  usePendingVoiceTranscriptionRefresh({
    items: memories.map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      transcriptStatus: memory.transcriptStatus,
    })),
    refresh: refreshHome,
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (heroCandidates.length < 2 || heroPaused) return;
    const interval = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroCandidates.length);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [heroCandidates.length, heroPaused]);

  const apiPeople = people.map((p) => ({
    id: p.id,
    name: p.name,
    portraitUrl: p.portraitUrl,
  }));
  const previewPeople = people.map((p) => ({
    id: p.id,
    name: p.name,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    essenceLine: p.essenceLine,
    portraitUrl: p.portraitUrl,
    linkedUserId: p.linkedUserId,
  }));

  const eraFilteredMemories =
    selectedEra === "all"
      ? memories
      : memories.filter((memory) => memoryMatchesDecade(memory, selectedEra));
  const eraFilteredHeroCandidates =
    selectedEra === "all"
      ? heroCandidates
      : heroCandidates.filter((memory) => memoryMatchesDecade(memory, selectedEra));

  const featuredMemory =
    (eraFilteredHeroCandidates.length > 0
      ? eraFilteredHeroCandidates[heroIndex % eraFilteredHeroCandidates.length]
      : null) ??
    eraFilteredMemories.find((m) => m.kind === "photo" && m.mediaUrl) ??
    eraFilteredMemories.find((m) => m.kind === "story") ??
    eraFilteredMemories[0] ??
    null;
  const recentMemories = eraFilteredMemories.slice(0, 12);
  const voiceMemories = eraFilteredMemories.filter((memory) => memory.kind === "voice").slice(0, 8);
  const selectedEraLabel =
    selectedEra === "all"
      ? "All eras"
      : coverage?.decadeBuckets.find((bucket) => bucket.startYear === selectedEra)?.label ??
        `${selectedEra}s`;
  const previewFocusPersonId = currentUserPersonIdFromPeople(people, session?.user.id) ?? featuredMemory?.primaryPersonId ?? people[0]?.id ?? null;

  if (isPending || loading || (needsNormalization && !loadError)) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Shimmer width={180} height={14} />
        <Shimmer width={280} height={10} />
      </main>
    );
  }

  if (loadError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            borderRadius: 12,
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
            This atrium could not be opened.
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: 17,
              lineHeight: 1.7,
              color: "var(--ink-soft)",
            }}
          >
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ink)",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          height: 52,
          background: "rgba(246,241,231,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 12,
        }}
      >
        <a
          href="/dashboard"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textDecoration: "none",
            padding: "4px 0",
          }}
        >
          ← Home
        </a>
        <span style={{ color: "var(--rule)", fontSize: 12 }}>·</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 17,
            color: "var(--ink)",
          }}
        >
          {tree?.name ?? "Heirloom"}
        </span>

        <div style={{ flex: 1 }} />

        <a
          href={`/trees/${treeId}/map`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 12px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          Map
        </a>

        {/* Inbox bell */}
        <a
          href={`/trees/${treeId}/inbox`}
          style={{
            position: "relative",
            fontFamily: "var(--font-ui)",
            fontSize: 18,
            color: "var(--ink-faded)",
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 10px",
            cursor: "pointer",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
          title="Inbox"
        >
          ✉
          {inboxCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--rose)", color: "#fff", fontFamily: "var(--font-ui)", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {inboxCount > 9 ? "9+" : inboxCount}
            </span>
          )}
        </a>

        {/* Curation nudge */}
        {curationCount > 0 && (
          <a
            href={`/trees/${treeId}/curation`}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--amber, #c97d1a)",
              background: "var(--paper-deep)",
              border: "1px solid var(--amber, #c97d1a)",
              borderRadius: 6,
              padding: "5px 12px",
              cursor: "pointer",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Curation queue"
          >
            ✎ {curationCount} need{curationCount === 1 ? "s" : ""} attention
          </a>
        )}

        <button
          onClick={() => setSearchOpen(true)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>⌕</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Search
            <kbd
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 3,
                padding: "1px 4px",
                color: "var(--ink-faded)",
              }}
            >
              ⌘K
            </kbd>
          </span>
        </button>

        <button
          onClick={() => setWizardOpen(true)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: 500,
            color: "white",
            background: "var(--moss)",
            border: "none",
            borderRadius: 6,
            padding: "5px 14px",
            cursor: "pointer",
          }}
        >
          + Add memory
        </button>
      </header>

      <TreeHomeHero
        treeName={tree?.name ?? "Family Archive"}
        featuredMemory={featuredMemory}
        heroIndex={
          eraFilteredHeroCandidates.length > 0 ? heroIndex % eraFilteredHeroCandidates.length : 0
        }
        heroCount={eraFilteredHeroCandidates.length}
        onPauseChange={setHeroPaused}
        onSelectHero={setHeroIndex}
      />

      {/* CTA row */}
      <section
        style={{
          padding: "28px max(24px, 5vw)",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setDriftOpen(true)}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontStyle: "italic",
            color: "var(--paper)",
            background: "var(--ink)",
            border: "none",
            borderRadius: 8,
            padding: "11px 24px",
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: `opacity 200ms ${EASE}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          Begin drifting ›
        </button>

        {featuredMemory && (
          <a
            href={`/trees/${treeId}/memories/${featuredMemory.id}`}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 14,
              color: "var(--ink)",
              background: "var(--paper-deep)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              padding: "10px 22px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Open memory →
          </a>
        )}

        <a
          href={`/trees/${treeId}`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            color: "var(--moss)",
            background: "none",
            border: "1.5px solid var(--moss)",
            borderRadius: 8,
            padding: "10px 22px",
            textDecoration: "none",
            transition: `background 200ms ${EASE}`,
            display: "inline-block",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(78,93,66,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          Enter the constellation →
        </a>

        <div style={{ flex: 1 }} />

        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          {homeStats?.peopleCount ?? people.length}{" "}
          {(homeStats?.peopleCount ?? people.length) === 1 ? "person" : "people"} ·{" "}
          {homeStats?.memoryCount ?? memories.length}{" "}
          {(homeStats?.memoryCount ?? memories.length) === 1 ? "memory" : "memories"}
        </div>
      </section>

      {/* Divider */}
      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--rule)",
          margin: "0 max(24px, 5vw)",
        }}
      />

      <HomeSummaryBand stats={homeStats} coverage={coverage} />

      <EraRibbon
        coverage={coverage}
        selectedEra={selectedEra}
        onSelectEra={(value) => {
          setSelectedEra(value);
          setHeroIndex(0);
        }}
      />

      <ConstellationPreview
        people={previewPeople}
        relationships={relationships}
        focusPersonId={previewFocusPersonId}
        href={`/trees/${treeId}`}
      />

      {selectedEra !== "all" && eraFilteredMemories.length === 0 && (
        <section
          style={{
            padding: "24px max(24px, 5vw) 0",
          }}
        >
          <div
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 12,
              background: "var(--paper-deep)",
              padding: "22px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                color: "var(--ink)",
                marginBottom: 6,
              }}
            >
              Nothing surfaced for {selectedEraLabel} yet
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 15,
                lineHeight: 1.7,
                color: "var(--ink-faded)",
              }}
            >
              Try another decade or return to all eras while the archive fills in more dated memories.
            </div>
          </div>
        </section>
      )}

      {memories.length === 0 ? (
        <section
          style={{
            padding: "28px max(24px, 5vw) 0",
          }}
        >
          <div
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 18,
              background:
                "linear-gradient(180deg, rgba(255,250,244,0.98) 0%, rgba(242,235,224,0.98) 100%)",
              padding: "28px clamp(20px, 3vw, 34px)",
              boxShadow: "0 12px 28px rgba(40,30,18,0.05)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--ink-faded)",
                marginBottom: 10,
              }}
            >
              First chapter
            </div>
            <h2
              style={{
                margin: "0 0 10px",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(26px, 3vw, 34px)",
                fontWeight: 400,
                lineHeight: 1.08,
                color: "var(--ink)",
                maxWidth: "16ch",
              }}
            >
              This atrium is ready for its first memory.
            </h2>
            <p
              style={{
                margin: 0,
                maxWidth: 620,
                fontFamily: "var(--font-body)",
                fontSize: 16,
                lineHeight: 1.75,
                color: "var(--ink-soft)",
              }}
            >
              Add a story, photo, or voice note to give this archive something to surface. If the
              tree is still taking shape, add a person first so memories have someone to gather
              around.
            </p>
            <div
              style={{
                marginTop: 18,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setWizardOpen(true)}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "white",
                  background: "var(--ink)",
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 16px",
                  cursor: "pointer",
                }}
              >
                Add the first memory
              </button>
              <a
                href={`/trees/${treeId}/people/new`}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--moss)",
                  textDecoration: "none",
                }}
              >
                Add the first person →
              </a>
            </div>
          </div>
        </section>
      ) : (
        <MemoryLane
          title="Resurfacing now"
          countLabel={`${recentMemories.length} memories${selectedEra === "all" ? "" : ` from ${selectedEraLabel}`}`}
          memories={recentMemories}
          onMemoryClick={(memory) => {
            router.push(`/trees/${treeId}/memories/${memory.id}`);
          }}
          viewAllHref={`/trees/${treeId}`}
          viewAllLabel={
            memories.length > recentMemories.length
              ? `+${memories.length - recentMemories.length} more in the constellation`
              : undefined
          }
        />
      )}

      {/* Divider */}
      {recentMemories.length > 0 && (
        <hr
          style={{
            border: "none",
            borderTop: "1px solid var(--rule)",
            margin: "20px max(24px, 5vw) 0",
          }}
        />
      )}

      {voiceMemories.length > 0 && (
        <>
          <MemoryLane
            title="Voices in the archive"
            countLabel={`${voiceMemories.length} voice memories${selectedEra === "all" ? "" : ` from ${selectedEraLabel}`}`}
            memories={voiceMemories}
            onMemoryClick={(memory) => {
              router.push(`/trees/${treeId}/memories/${memory.id}`);
            }}
          />
          <hr
            style={{
              border: "none",
              borderTop: "1px solid var(--rule)",
              margin: "20px max(24px, 5vw) 0",
            }}
          />
        </>
      )}

      {/* The family */}
      <section style={{ padding: "28px max(24px, 5vw) 60px" }}>
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              color: "var(--ink)",
              margin: 0,
              fontWeight: 400,
            }}
          >
            The family
          </h2>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
          <div style={{ flex: 1 }} />
          <a
            href={`/trees/${treeId}/people/new`}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--moss)",
              textDecoration: "none",
            }}
          >
            + Add person
          </a>
        </div>

        {people.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              fontFamily: "var(--font-body)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink-faded)",
            }}
          >
            No one in the archive yet.{" "}
            <a
              href={`/trees/${treeId}/people/new`}
              style={{ color: "var(--moss)", textDecoration: "underline" }}
            >
              Add the first person
            </a>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {people.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                onClick={() => handlePersonClick(p.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* DriftMode */}
      <AnimatePresence>
        {driftOpen && (
          <DriftMode
            treeId={treeId}
            people={people.map((p) => ({
              id: p.id,
              name: p.name,
              birthYear: p.birthYear,
              deathYear: p.deathYear,
              essenceLine: p.essenceLine,
              portraitUrl: p.portraitUrl,
              linkedUserId: p.linkedUserId,
            }))}
            onClose={() => setDriftOpen(false)}
            onPersonDetail={handlePersonClick}
            apiBase={API}
          />
        )}
      </AnimatePresence>

      {/* Add Memory wizard */}
      {wizardOpen && (
        <AddMemoryWizard
          treeId={treeId}
          people={apiPeople}
          apiBase={API}
          onClose={() => setWizardOpen(false)}
          onSuccess={refreshHome}
        />
      )}

      {/* Search overlay */}
      <SearchOverlay
        treeId={treeId}
        people={people.map((p) => ({
          id: p.id,
          name: p.name,
          portraitUrl: p.portraitUrl,
          essenceLine: p.essenceLine,
          birthYear: p.birthYear,
          deathYear: p.deathYear,
        }))}
        memories={memories}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </main>
  );
}

function currentUserPersonIdFromPeople(people: Person[], userId: string | undefined) {
  if (!userId) return null;
  return people.find((person) => person.linkedUserId === userId)?.id ?? null;
}
