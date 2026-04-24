"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AtriumCoachmark } from "@/components/home/AtriumCoachmark";
import { AtriumSkeleton } from "@/components/home/HomeSurfaceSkeletons";
import { AtriumStartState } from "@/components/home/AtriumStartState";
import { AtriumModeRouter, type AtriumMode } from "@/components/home/AtriumModeRouter";
import type {
  TreeHomeArchiveSummary,
  TreeHomeCoverage,
  TreeHomeFeaturedBranch,
  TreeHomeFamilyPresence,
  TreeHomeMemory,
  TreeHomeMemoryTrailSection,
  TreeHomePayload,
  TreeHomePersonRecord,
  TreeHomeRelationship,
  TreeHomeStats,
  TreeHomeTodayHighlights,
} from "@/components/home/homeTypes";
import {
  buildAtriumMemoryTrail,
  getAtriumBranchFocusIds,
  getMemoryAnchorPersonId,
  memoryMatchesDecade,
  selectAtriumFeaturedMemory,
} from "@/components/home/homeUtils";
import { useSession } from "@/lib/auth-client";
import { writeLastOpenedTreeId } from "@/lib/last-opened-tree";
import { isCanonicalTreeId, resolveCanonicalTreeId } from "@/lib/tree-route";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import { DriftMode, type DriftFilter } from "@/components/tree/DriftMode";
import { DriftChooserSheet } from "@/components/tree/DriftChooserSheet";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { GearIcon, InboxIcon } from "@/components/tree/SurfaceToolbarIcons";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { usePendingTimeout } from "@/lib/usePendingTimeout";

const API = "";

type EraValue = "all" | number;
type Tree = TreeHomePayload["tree"];

interface Person {
  id: string;
  name: string;
  portraitUrl: string | null;
  essenceLine: string | null;
  birthYear: number | null;
  deathYear: number | null;
  linkedUserId: string | null;
}

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\b(\d{4})\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function mapDeathYear(person: TreeHomePersonRecord): number | null {
  return extractYear(person.deathDateText ?? null);
}

function mapHomePerson(person: TreeHomePersonRecord): Person {
  return {
    id: person.id,
    name: person.displayName ?? person.name ?? "",
    portraitUrl: person.portraitUrl,
    essenceLine: person.essenceLine,
    birthYear: extractYear(person.birthDateText ?? null),
    deathYear: mapDeathYear(person),
    linkedUserId: person.linkedUserId,
  };
}

export default function AtriumPage() {
  const router = useRouter();
  const params = useParams<{ treeId: string }>();
  const { treeId } = params;
  const { data: session, isPending } = useSession();
  const sessionTimedOut = usePendingTimeout(isPending, 10000);
  const needsNormalization = !isCanonicalTreeId(treeId);

  const [tree, setTree] = useState<Tree | null>(null);
  const [currentUserPersonId, setCurrentUserPersonId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [memories, setMemories] = useState<TreeHomeMemory[]>([]);
  const [heroCandidates, setHeroCandidates] = useState<TreeHomeMemory[]>([]);
  const [featuredMemory, setFeaturedMemory] = useState<TreeHomeMemory | null>(null);
  const [featuredBranch, setFeaturedBranch] = useState<TreeHomeFeaturedBranch | null>(null);
  const [relatedMemoryTrail, setRelatedMemoryTrail] = useState<TreeHomeMemoryTrailSection[]>([]);
  const [familyPresence, setFamilyPresence] = useState<TreeHomeFamilyPresence | null>(null);
  const [archiveSummary, setArchiveSummary] = useState<TreeHomeArchiveSummary | null>(null);
  const [homeStats, setHomeStats] = useState<TreeHomeStats | null>(null);
  const [coverage, setCoverage] = useState<TreeHomeCoverage | null>(null);
  const [relationships, setRelationships] = useState<TreeHomeRelationship[]>([]);
  const [today, setToday] = useState<TreeHomeTodayHighlights | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [driftOpen, setDriftOpen] = useState(false);
  const [driftChooserOpen, setDriftChooserOpen] = useState(false);
  const [driftFilter, setDriftFilter] = useState<DriftFilter | null>(null);
  const openDrift = useCallback(
    (filter?: DriftFilter | null) => {
      setDriftFilter(filter ?? null);
      setDriftChooserOpen(false);
      setDriftOpen(true);
    },
    [],
  );
  const closeDrift = useCallback(() => {
    setDriftOpen(false);
    setDriftFilter(null);
  }, []);
  const openDriftChooser = useCallback(() => {
    setDriftChooserOpen(true);
  }, []);
  const closeDriftChooser = useCallback(() => {
    setDriftChooserOpen(false);
  }, []);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [curationCount, setCurationCount] = useState(0);
  const [selectedEra, setSelectedEra] = useState<EraValue>("all");

  const [mode, setMode] = useState<AtriumMode>("scroll");
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (memories.length === 0 || loading) return;

    let hideTimer: ReturnType<typeof setTimeout>;

    const scheduleHide = () => {
      clearTimeout(hideTimer);
      setHeaderVisible(true);
      hideTimer = setTimeout(() => setHeaderVisible(false), 2500);
    };

    const onTopHover = (e: MouseEvent) => {
      if (e.clientY < 24) {
        clearTimeout(hideTimer);
        setHeaderVisible(true);
      }
    };

    scheduleHide();
    window.addEventListener("mousemove", onTopHover);

    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("mousemove", onTopHover);
    };
  }, [memories.length, loading]);

  const applyHomePayload = useCallback((data: TreeHomePayload) => {
    setTree(data.tree);
    setCurrentUserPersonId(data.currentUserPersonId);
    setPeople(data.people.map(mapHomePerson));
    setMemories(data.memories);
    setHeroCandidates(data.heroCandidates);
    setFeaturedMemory(data.featuredMemory);
    setFeaturedBranch(data.featuredBranch);
    setRelatedMemoryTrail(data.relatedMemoryTrail);
    setFamilyPresence(data.familyPresence);
    setArchiveSummary(data.archiveSummary);
    setHomeStats(data.stats);
    setCoverage(data.coverage);
    setRelationships(data.relationships);
    setToday(data.today ?? null);
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
        router.replace(`/trees/${resolvedTreeId}/home`);
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
        const response = await fetchWithTimeout(`${API}/api/trees/${treeId}/home`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to load this tree.");
        }
        const data = (await response.json()) as TreeHomePayload;
        applyHomePayload(data);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load this tree.");
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
    [router, treeId],
  );

  const refreshHome = useCallback(async () => {
    const response = await fetchWithTimeout(`${API}/api/trees/${treeId}/home`, {
      credentials: "include",
    });
    if (!response.ok) return;
    const data = (await response.json()) as TreeHomePayload;
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

  const apiPeople = useMemo(
    () =>
      people.map((person) => ({
        id: person.id,
        name: person.name,
        portraitUrl: person.portraitUrl,
      })),
    [people],
  );

  const selectedEraLabel =
    selectedEra === "all"
      ? "All eras"
      : coverage?.decadeBuckets.find((bucket) => bucket.startYear === selectedEra)?.label ??
        `${selectedEra}s`;

  const activeMemories = useMemo(
    () =>
      selectedEra === "all"
        ? memories
        : memories.filter((memory) => memoryMatchesDecade(memory, selectedEra)),
    [memories, selectedEra],
  );

  const activeHeroCandidates = useMemo(
    () =>
      selectedEra === "all"
        ? heroCandidates
        : heroCandidates.filter((memory) => memoryMatchesDecade(memory, selectedEra)),
    [heroCandidates, selectedEra],
  );

  const activeFeaturedMemory = useMemo(
    () =>
      selectedEra === "all"
        ? featuredMemory
        : selectAtriumFeaturedMemory(activeMemories, activeHeroCandidates),
    [activeHeroCandidates, activeMemories, featuredMemory, selectedEra],
  );

  const activeFocusPersonId = useMemo(
    () =>
      selectedEra === "all"
        ? featuredBranch?.focusPersonId ??
          familyPresence?.focusPersonId ??
          getMemoryAnchorPersonId(activeFeaturedMemory) ??
          currentUserPersonId ??
          people[0]?.id ??
          null
        : getMemoryAnchorPersonId(activeFeaturedMemory) ??
          featuredBranch?.focusPersonId ??
          currentUserPersonId ??
          people[0]?.id ??
          null,
    [
      activeFeaturedMemory,
      currentUserPersonId,
      familyPresence?.focusPersonId,
      featuredBranch?.focusPersonId,
      people,
      selectedEra,
    ],
  );

  const activeFocusIds = useMemo(
    () => getAtriumBranchFocusIds(activeFocusPersonId, relationships),
    [activeFocusPersonId, relationships],
  );

  const focusPerson = people.find((person) => person.id === activeFocusPersonId) ?? null;
  const branchCue =
    selectedEra === "all"
      ? featuredBranch?.branchLabel ??
        archiveSummary?.branchLabel ??
        (focusPerson
          ? `Centered around ${focusPerson.name}'s branch`
          : "Centered around the branch taking shape here")
      : focusPerson
        ? `Centered around ${focusPerson.name}'s branch`
        : "Centered around the branch that surfaces in this era";

  const trailSections = useMemo(
    () =>
      selectedEra === "all"
        ? relatedMemoryTrail
        : buildAtriumMemoryTrail({
            featuredMemory: activeFeaturedMemory,
            memories: activeMemories,
            focusIds: activeFocusIds,
            focusPersonName: focusPerson?.name ?? null,
          }),
    [activeFeaturedMemory, activeFocusIds, activeMemories, focusPerson?.name, relatedMemoryTrail, selectedEra],
  );

  const familyPresenceGroups = useMemo(() => {
    if (!familyPresence) return [];
    return familyPresence.groups.map((group) => ({
      id: group.id,
      label: group.label,
      people: group.personIds
        .map((personId) => people.find((p) => p.id === personId))
        .filter((p): p is Person => Boolean(p))
        .map((p) => ({
          id: p.id,
          name: p.name,
          portraitUrl: p.portraitUrl,
          essenceLine: p.essenceLine,
          birthYear: p.birthYear,
          deathYear: p.deathYear,
        })),
    }));
  }, [familyPresence, people]);

  const familyFocusPerson = useMemo(() => {
    const focusId = familyPresence?.focusPersonId ?? activeFocusPersonId;
    if (!focusId) return null;
    const p = people.find((person) => person.id === focusId);
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      portraitUrl: p.portraitUrl,
      essenceLine: p.essenceLine,
      birthYear: p.birthYear,
      deathYear: p.deathYear,
    };
  }, [familyPresence?.focusPersonId, activeFocusPersonId, people]);

  const familyFocusPersonName = familyFocusPerson?.name ?? focusPerson?.name ?? null;

  if (sessionTimedOut && isPending) {
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
            maxWidth: 560,
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
            This Home is taking too long to open.
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
            The sign-in or archive service did not answer in time. Reload the page, and if it
            keeps happening, sign in again once the server is healthy.
          </p>
        </div>
      </main>
    );
  }

  if (isPending || loading || (needsNormalization && !loadError)) {
    return <AtriumSkeleton />;
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
            This Home could not be opened.
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
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          minHeight: 52,
          background: "rgba(246,241,231,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "center",
          padding: "8px 16px",
          gap: 16,
          transform: headerVisible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 400ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--ink-faded)",
              textDecoration: "none",
              padding: "4px 0",
            }}
          >
            ← Archives
          </Link>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              color: "var(--ink)",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {tree?.name ?? "Tessera"}
          </span>
        </div>

        <div
          style={{
            justifySelf: "center",
            display: "flex",
            alignItems: "center",
            minWidth: 0,
          }}
        >
          <div style={headerNavGroupStyle}>
            <Link href={`/trees/${treeId}/home`} style={getHeaderNavItemStyle(true)}>
              Home
            </Link>
            <Link href={`/trees/${treeId}/tree`} style={getHeaderNavItemStyle(false)}>
              Family tree
            </Link>
            <button type="button" onClick={openDriftChooser} style={getHeaderNavButtonStyle(false)} title="Choose how to drift">
              Drift
            </button>
            <Link href={`/trees/${treeId}/prompts/campaigns`} style={getHeaderNavItemStyle(false)} title="Recurring questions you're sending">
              Campaigns
            </Link>
          </div>
        </div>

        <div
          style={{
            justifySelf: "end",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 8,
            minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setMode("scroll")}
            style={{
              ...headerButtonStyle,
              fontSize: 11,
              padding: "6px 10px",
              background: mode === "scroll" ? "var(--moss)" : "var(--paper-deep)",
              color: mode === "scroll" ? "#fff" : "var(--ink-faded)",
              border: mode === "scroll" ? "1px solid rgba(78,93,66,0.28)" : "1px solid var(--rule)",
            }}
          >
            Scroll
          </button>
          <button
            type="button"
            onClick={() => setMode("gallery")}
            style={{
              ...headerButtonStyle,
              fontSize: 11,
              padding: "6px 10px",
              background: mode === "gallery" ? "var(--moss)" : "var(--paper-deep)",
              color: mode === "gallery" ? "#fff" : "var(--ink-faded)",
              border: mode === "gallery" ? "1px solid rgba(78,93,66,0.28)" : "1px solid var(--rule)",
            }}
          >
            Gallery
          </button>
          <button
            type="button"
            onClick={() => setMode("filmstrip")}
            style={{
              ...headerButtonStyle,
              fontSize: 11,
              padding: "6px 10px",
              background: mode === "filmstrip" ? "var(--moss)" : "var(--paper-deep)",
              color: mode === "filmstrip" ? "#fff" : "var(--ink-faded)",
              border: mode === "filmstrip" ? "1px solid rgba(78,93,66,0.28)" : "1px solid var(--rule)",
            }}
          >
            Filmstrip
          </button>

          {curationCount > 0 && (
            <Link
              href={`/trees/${treeId}/curation`}
              style={{
                ...headerButtonStyle,
                color: "var(--amber, #c97d1a)",
                border: "1px solid var(--amber, #c97d1a)",
                gap: 4,
              }}
              title="Review queue"
            >
              ✎ {curationCount} need{curationCount === 1 ? "s" : ""} attention
            </Link>
          )}

          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            style={headerPrimaryButtonStyle}
          >
            + Add memory
          </button>

          <button type="button" onClick={() => setSearchOpen(true)} style={headerButtonStyle}>
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

          <Link
            href={`/trees/${treeId}/inbox`}
            style={{
              ...headerIconButtonStyle,
              position: "relative",
            }}
            title="Messages"
            aria-label="Messages"
          >
            <InboxIcon />
            {inboxCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 999,
                  background: "var(--rose)",
                  color: "#fff",
                  fontFamily: "var(--font-ui)",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 5px",
                }}
              >
                {inboxCount > 9 ? "9+" : inboxCount}
              </span>
            )}
          </Link>

          <Link
            href={`/trees/${treeId}/settings`}
            style={headerIconButtonStyle}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      <AtriumCoachmark
        treeId={treeId}
        treeName={tree?.name ?? "your family archive"}
        onAddMemory={() => setWizardOpen(true)}
        familyTreeHref={`/trees/${treeId}/tree`}
      />

      {memories.length === 0 ? (
        <AtriumStartState
          treeName={tree?.name ?? "Family Archive"}
          addPersonHref={`/trees/${treeId}/people/new`}
          onAddMemory={() => setWizardOpen(true)}
        />
      ) : (
        <AtriumModeRouter
          mode={mode}
          treeId={treeId}
          treeName={tree?.name ?? "Family Archive"}
          featuredMemory={activeFeaturedMemory}
          trailSections={trailSections}
          today={today}
          familyPresenceGroups={familyPresenceGroups}
          focusPerson={familyFocusPerson ? {
            id: familyFocusPerson.id,
            name: familyFocusPerson.name,
            portraitUrl: familyFocusPerson.portraitUrl,
            essenceLine: familyFocusPerson.essenceLine,
            birthYear: familyFocusPerson.birthYear,
            deathYear: familyFocusPerson.deathYear,
          } : null}
          focusPersonName={familyFocusPersonName}
          branchCue={branchCue}
          archiveSummary={archiveSummary ? {
            peopleCount: archiveSummary.peopleCount,
            generationCount: archiveSummary.generationCount,
            earliestYear: archiveSummary.earliestYear,
            latestYear: archiveSummary.latestYear,
            branchLabel: archiveSummary.branchLabel,
          } : null}
          coverage={coverage}
          people={people.map((p) => ({ id: p.id, name: p.name, portraitUrl: p.portraitUrl }))}
          resurfacingCount={activeHeroCandidates.length}
          memoryHref={activeFeaturedMemory ? `/trees/${treeId}/memories/${activeFeaturedMemory.id}` : null}
          branchHref={activeFocusPersonId ? `/trees/${treeId}/people/${activeFocusPersonId}` : null}
          fullTreeHref={`/trees/${treeId}/tree`}
          onPersonClick={handlePersonClick}
          onMemoryClick={(memory) => {
            router.push(`/trees/${treeId}/memories/${memory.id}`);
          }}
          onDrift={openDriftChooser}
          onStartPersonDrift={(personId) => openDrift({ personId })}
          onStartRemembrance={(personId) =>
            openDrift({ mode: "remembrance", personId })
          }
        />
      )}

      <DriftChooserSheet
        open={driftChooserOpen}
        people={people}
        onClose={closeDriftChooser}
        onChoose={(filter) => openDrift(filter)}
      />

      <AnimatePresence>
        {driftOpen && (
          <DriftMode
            treeId={treeId}
            people={people.map((person) => ({
              id: person.id,
              name: person.name,
              birthYear: person.birthYear,
              deathYear: person.deathYear,
              essenceLine: person.essenceLine,
              portraitUrl: person.portraitUrl,
              linkedUserId: person.linkedUserId,
            }))}
            onClose={closeDrift}
            onPersonDetail={handlePersonClick}
            apiBase={API}
            initialFilter={driftFilter}
          />
        )}
      </AnimatePresence>

      {wizardOpen && (
        <AddMemoryWizard
          treeId={treeId}
          people={apiPeople}
          apiBase={API}
          onClose={() => setWizardOpen(false)}
          onSuccess={refreshHome}
        />
      )}

      <SearchOverlay
        treeId={treeId}
        people={people.map((person) => ({
          id: person.id,
          name: person.name,
          portraitUrl: person.portraitUrl,
          essenceLine: person.essenceLine,
          birthYear: person.birthYear,
          deathYear: person.deathYear,
        }))}
        memories={memories}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </main>
  );
}

const headerButtonStyle = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 999,
  padding: "8px 14px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  textDecoration: "none",
  boxShadow: "0 12px 26px rgba(28,25,21,0.06)",
} as const;

const headerPrimaryButtonStyle = {
  ...headerButtonStyle,
  color: "#fff",
  background: "var(--moss)",
  border: "1px solid rgba(78,93,66,0.28)",
  fontWeight: 500,
} as const;

const headerIconButtonStyle = {
  ...headerButtonStyle,
  padding: "7px 10px",
  justifyContent: "center",
  minWidth: 36,
} as const;

const headerNavGroupStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 4,
  borderRadius: 999,
  border: "1px solid var(--rule)",
  background: "var(--paper-deep)",
  boxShadow: "0 12px 26px rgba(28,25,21,0.06)",
} as const;

function getHeaderNavItemStyle(active: boolean) {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    color: active ? "#fff" : "var(--ink-faded)",
    background: active ? "var(--moss)" : "transparent",
    border: active ? "1px solid rgba(78,93,66,0.28)" : "1px solid transparent",
    borderRadius: 999,
    padding: "5px 12px",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  } as const;
}

function getHeaderNavButtonStyle(active: boolean) {
  return {
    ...getHeaderNavItemStyle(active),
    cursor: "pointer",
  } as const;
}