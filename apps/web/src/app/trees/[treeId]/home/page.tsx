"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getApiBase } from "@/lib/api-base";
import { writeLastOpenedTreeId } from "@/lib/last-opened-tree";
import { isCanonicalTreeId, resolveCanonicalTreeId } from "@/lib/tree-route";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import { DriftMode, type DriftFilter } from "@/components/tree/DriftMode";
import { CorkboardDrift } from "@/components/corkboard/CorkboardDrift";
import { DriftChooserSheet } from "@/components/tree/DriftChooserSheet";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { GearIcon, InboxIcon } from "@/components/tree/SurfaceToolbarIcons";
import { DriftCastControls } from "@/components/cast/DriftCastControls";
import { CastButton } from "@/components/cast/CastButton";
import { ViewModeDropdown } from "@/components/home/ViewModeDropdown";
import { useMosaicData } from "@/components/home/useMosaicData";
import { ArchiveTile } from "@/components/mosaic/ArchiveTile";
import { MemoryTile } from "@/components/mosaic/MemoryTile";
import { NewArchiveTile } from "@/components/mosaic/NewArchiveTile";
import { InvitationTile } from "@/components/mosaic/InvitationTile";
import { MosaicSurface } from "@/components/mosaic/MosaicTile";
import {
  formatTodayNote,
  formatGenerationsLabel,
  formatSpanLabel,
  formatUnfinishedNote,
  isSparseArchive,
  type TodayHighlight,
} from "@/components/mosaic/mosaicUtils";
import { useChromecast } from "@/hooks/useChromecast";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { usePendingTimeout } from "@/lib/usePendingTimeout";

const API = getApiBase();

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
  const chromecast = useChromecast();
  const openDrift = useCallback(
    (filter?: DriftFilter | null) => {
      setDriftFilter(filter ?? null);
      setDriftChooserOpen(false);
      if (chromecast.state.isConnected) {
        chromecast.startDrift(treeId, filter ?? null);
      } else {
        setDriftOpen(true);
      }
    },
    [treeId, chromecast],
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
  const memoriesRef = useRef<HTMLDivElement>(null);
  const [selectedEra, setSelectedEra] = useState<EraValue>("all");

  const [mode, setMode] = useState<AtriumMode>("scroll");
  const [headerVisible, setHeaderVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const mosaic = useMosaicData(treeId);

  const scrollToMemories = useCallback(() => {
    memoriesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [memoriesRef]);

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
      className="tessera-main-with-bottom-bar"
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ink)",
      }}
    >
      <header
        className="tessera-header"
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
           <span
             style={{
               fontFamily: "var(--font-ui)",
               fontSize: 14,
               fontWeight: 500,
               color: "var(--ink)",
             }}
           >
             {tree?.name ?? "Tessera"}
           </span>
         </div>

        <div
          className="tessera-header-nav"
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
          <ViewModeDropdown mode={mode} onChange={setMode} />

          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="tessera-mobile-hide"
            style={headerPrimaryButtonStyle}
          >
            + Add memory
          </button>

          <Link
            href={`/trees/${treeId}/prompts/campaigns`}
            className="tessera-mobile-hide"
            style={headerButtonStyle}
            title="Recurring questions you're sending"
          >
            Campaigns
          </Link>

          <span className="tessera-mobile-hide">
            <CastButton variant="icon" />
          </span>

          <button type="button" onClick={() => setSearchOpen(true)} style={{ ...headerButtonStyle, minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <span>⌕</span>
            <span className="tessera-header-search-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
              minHeight: 44,
              minWidth: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
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
            style={{ ...headerIconButtonStyle, minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </Link>

          <button
            type="button"
            className="tessera-mobile-menu-button"
            onClick={openMobileMenu}
            aria-label="Menu"
            style={{
              ...headerIconButtonStyle,
              minHeight: 44,
              minWidth: 44,
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile slide-out menu */}
      <div
        className="tessera-mobile-menu-overlay"
        data-open={mobileMenuOpen ? "true" : "false"}
        onClick={closeMobileMenu}
      />
      <div className="tessera-mobile-menu" data-open={mobileMenuOpen ? "true" : "false"}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink)" }}>
            {tree?.name ?? "Tessera"}
          </span>
          <button
            type="button"
            onClick={closeMobileMenu}
            aria-label="Close menu"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              color: "var(--ink-faded)",
              cursor: "pointer",
              minHeight: 44,
              minWidth: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
        <nav>
          <Link href={`/trees/${treeId}/home`} onClick={closeMobileMenu} aria-current="page">
            Home
          </Link>
          <Link href={`/trees/${treeId}/tree`} onClick={closeMobileMenu}>
            Family tree
          </Link>
          <button type="button" onClick={() => { closeMobileMenu(); openDriftChooser(); }}>
            Drift through the archive
          </button>
        </nav>
        <div className="tessera-menu-section">
          <button
            type="button"
            className="tessera-menu-primary"
            onClick={() => { closeMobileMenu(); setWizardOpen(true); }}
          >
            + Add memory
          </button>
        </div>
        <div className="tessera-menu-section" style={{ display: "grid", gap: 4 }}>
          <Link
            href={`/trees/${treeId}/prompts/campaigns`}
            onClick={closeMobileMenu}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 10,
              textDecoration: "none",
              color: "var(--ink)",
              fontFamily: "var(--font-ui)",
              fontSize: 14,
            }}
          >
            Campaigns
          </Link>
          <Link
            href={`/trees/${treeId}/inbox`}
            onClick={closeMobileMenu}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 10,
              textDecoration: "none",
              color: "var(--ink)",
              fontFamily: "var(--font-ui)",
              fontSize: 14,
            }}
          >
            <InboxIcon /> Messages
            {inboxCount > 0 && (
              <span style={{
                marginLeft: "auto",
                minWidth: 20,
                height: 20,
                borderRadius: 999,
                background: "var(--rose)",
                color: "#fff",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 6px",
              }}>
                {inboxCount > 9 ? "9+" : inboxCount}
              </span>
            )}
          </Link>
          <Link
            href={`/trees/${treeId}/settings`}
            onClick={closeMobileMenu}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              padding: "10px 16px",
              borderRadius: 10,
              textDecoration: "none",
              color: "var(--ink-faded)",
              fontFamily: "var(--font-ui)",
              fontSize: 14,
            }}
          >
            <GearIcon /> Settings
          </Link>
        </div>
      </div>

      {/* Mobile bottom action bar */}
      <div className="tessera-mobile-bottom-bar">
        <button
          type="button"
          data-active={mode === "scroll" ? "true" : "false"}
          onClick={() => setMode("scroll")}
        >
          <span className="tessera-bottom-bar-icon">↕</span>
          Scroll
        </button>
        <button
          type="button"
          data-active={mode === "gallery" ? "true" : "false"}
          onClick={() => setMode("gallery")}
        >
          <span className="tessera-bottom-bar-icon">▦</span>
          Gallery
        </button>
        <button
          type="button"
          data-active={mode === "filmstrip" ? "true" : "false"}
          onClick={() => setMode("filmstrip")}
        >
          <span className="tessera-bottom-bar-icon">≡</span>
          Filmstrip
        </button>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{ color: "var(--moss)" }}
        >
          <span className="tessera-bottom-bar-icon" style={{ fontSize: 24, lineHeight: 1 }}>+</span>
          Add
        </button>
        <button
          type="button"
          onClick={openMobileMenu}
        >
          <span className="tessera-bottom-bar-icon">☰</span>
          More
        </button>
      </div>

      <AtriumCoachmark
        treeId={treeId}
        treeName={tree?.name ?? "your family archive"}
        onAddMemory={() => setWizardOpen(true)}
        familyTreeHref={`/trees/${treeId}/tree`}
      />

      {!mosaic.loading && !mosaic.loadError && mosaic.summaries.length > 0 && (
        <section className="mosaic-main" style={{ paddingTop: 0 }}>
          <div className="mosaic-intro">
            {mosaic.primary && (
              <p className="mosaic-subtitle">
                {formatGenerationsLabel(mosaic.primary.stats.generationCount) && formatSpanLabel(mosaic.primary.coverage.earliestYear, mosaic.primary.coverage.latestYear)
                  ? `${mosaic.primary.stats.peopleCount} people across ${formatGenerationsLabel(mosaic.primary.stats.generationCount)}, ${formatSpanLabel(mosaic.primary.coverage.earliestYear, mosaic.primary.coverage.latestYear)}`
                  : formatGenerationsLabel(mosaic.primary.stats.generationCount)
                    ? `${mosaic.primary.stats.peopleCount} people across ${formatGenerationsLabel(mosaic.primary.stats.generationCount)}`
                    : formatSpanLabel(mosaic.primary.coverage.earliestYear, mosaic.primary.coverage.latestYear)
                      ? `${mosaic.primary.stats.peopleCount} people, ${formatSpanLabel(mosaic.primary.coverage.earliestYear, mosaic.primary.coverage.latestYear)}`
                      : ""}
                {mosaic.primary && formatUnfinishedNote(mosaic.primary.stats) && (
                  <span className="mosaic-subtitle__note">{formatUnfinishedNote(mosaic.primary.stats)}</span>
                )}
              </p>
            )}
          </div>

          {mosaic.todayHighlights.length > 0 && (
            <div className="mosaic-today">
              {mosaic.todayHighlights.map((h, i) => (
                <TodayLink key={i} highlight={h} />
              ))}
            </div>
          )}

          <MosaicSurface>
            {mosaic.primary && (
              <ArchiveTile
                key={mosaic.primary.tree.id}
                treeName={mosaic.primary.tree.name}
                role={mosaic.primary.tree.role}
                stats={mosaic.primary.stats}
                coverage={mosaic.primary.coverage}
                heroMemory={mosaic.primary.heroCandidates[0] ?? null}
                isFoundedByYou={mosaic.primary.isFoundedByYou}
                isPrimary
                isSparse={isSparseArchive(mosaic.primary.stats)}
                href={`/trees/${mosaic.primary.tree.id}/home`}
                stagger={0}
              />
            )}

            {mosaic.mosaicMemories.map((tile, i) => (
              <MemoryTile
                key={`${tile.treeId}:${tile.memory.id}`}
                memory={tile.memory}
                treeName={tile.treeName}
                href={`/trees/${tile.treeId}/memories/${tile.memory.id}`}
                weight={tile.weight}
                index={i}
                stagger={i + 1}
              />
            ))}

            {mosaic.pendingInvites.map((invite, i) => (
              <InvitationTile
                key={invite.id}
                treeName={invite.treeName}
                invitedByName={invite.invitedByName}
                proposedRole={invite.proposedRole}
                linkedPersonName={invite.linkedPersonName}
                treeId={invite.treeId}
                inviteId={invite.id}
                stagger={mosaic.mosaicMemories.length + i + 1}
              />
            ))}

            {mosaic.secondary.map((summary, i) => (
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
                stagger={mosaic.mosaicMemories.length + mosaic.pendingInvites.length + i + 1}
              />
            ))}

            <NewArchiveTile
              onClick={() => {
                mosaic.setCreatingLineage(true);
                mosaic.setCreateError(null);
                mosaic.setNewLineageName("");
              }}
              stagger={mosaic.mosaicMemories.length + mosaic.pendingInvites.length + mosaic.secondary.length + 1}
            />
          </MosaicSurface>

          {mosaic.summaries.length === 1 && (
            <p className="mosaic-epilogue">
              Start another archive for a spouse-family line, a maternal branch, or a chosen family — shared relatives become the bridges between them.
            </p>
          )}
        </section>
      )}

      {mosaic.creatingLineage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!mosaic.submittingLineage) mosaic.setCreatingLineage(false); }}
          className="mosaic-overlay"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={mosaic.handleCreateLineage}
            className="mosaic-dialog"
          >
            <h2 className="mosaic-dialog__title">Start a new archive</h2>
            <p className="mosaic-dialog__desc">
              An archive can be a family name like <em>Ward Family</em> or <em>Karsen Family</em>, a line like <em>Maternal Line</em>, or a framing like <em>Chosen Family</em>.
            </p>
            <input
              autoFocus
              value={mosaic.newLineageName}
              onChange={(e) => mosaic.setNewLineageName(e.target.value)}
              placeholder="e.g. Karsen Family"
              className="mosaic-dialog__input"
            />
            {mosaic.createError && (
              <p className="mosaic-dialog__error">{mosaic.createError}</p>
            )}
            <div className="mosaic-dialog__actions">
              <button
                type="button"
                disabled={mosaic.submittingLineage}
                onClick={() => mosaic.setCreatingLineage(false)}
                className="mosaic-btn-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mosaic.submittingLineage}
                className="mosaic-btn-primary"
              >
                {mosaic.submittingLineage ? "Creating..." : "Create archive"}
              </button>
            </div>
          </form>
        </div>
      )}

      {memories.length === 0 ? (
        <AtriumStartState
          treeName={tree?.name ?? "Family Archive"}
          addPersonHref={`/trees/${treeId}/people/new`}
          onAddMemory={() => setWizardOpen(true)}
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "clamp(16px, 3vw, 32px) 0 clamp(8px, 2vw, 16px)",
            }}
          >
            <button
              type="button"
              onClick={scrollToMemories}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-faded)",
                background: "var(--paper-deep)",
                border: "1px solid var(--rule)",
                borderRadius: 999,
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              Explore memories
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 2v8M2 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div
            style={{
              margin: "0 auto",
              maxWidth: 400,
              height: 1,
              background: "var(--rule)",
            }}
          />
          <div ref={memoriesRef} style={{ scrollMarginTop: 56 }} />
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
        </>
      )}

      <DriftChooserSheet
        open={driftChooserOpen}
        people={people}
        onClose={closeDriftChooser}
        onChoose={(filter) => openDrift(filter)}
        onCastDrift={(filter) => {
          if (chromecast.state.isConnected) {
            chromecast.startDrift(treeId, filter);
            setDriftChooserOpen(false);
          }
        }}
        isCastConnected={chromecast.state.isConnected}
        deviceName={chromecast.state.deviceName}
      />

      <AnimatePresence>
        {driftOpen && driftFilter?.mode === "corkboard" ? (
          <CorkboardDrift
            key="corkboard"
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
        ) : driftOpen ? (
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
            casting={chromecast.state.isConnected}
            castDeviceName={chromecast.state.deviceName}
          />
        ) : null}
      </AnimatePresence>

      <DriftCastControls />

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

      <style jsx>{`
        @media (max-width: 900px) {
          .tessera-header {
            grid-template-columns: 1fr auto !important;
            gap: 8px !important;
            padding: 6px 12px !important;
          }
          .tessera-header-nav {
            display: none !important;
          }
          .tessera-header-search-text {
            display: none !important;
          }
        }
        @media (max-width: 640px) {
          .tessera-mobile-menu-button {
            display: inline-flex !important;
          }
        }
      `}</style>
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

function TodayLink({ highlight }: { highlight: TodayHighlight }) {
  const note = formatTodayNote(highlight);
  if (!note) return null;
  const treeId = highlight.treeId;
  const kind = highlight.kind;
  return (
    <a
      href={`/trees/${treeId}/home`}
      className={`mosaic-today__note mosaic-today__note--${kind}`}
    >
      <span className="mosaic-today__dot" />
      {note}
    </a>
  );
}
