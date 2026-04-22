"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AtriumContextStrip } from "@/components/home/AtriumContextStrip";
import { AtriumFamilyPresence } from "@/components/home/AtriumFamilyPresence";
import { AtriumMemoryTrail } from "@/components/home/AtriumMemoryTrail";
import { AtriumSkeleton } from "@/components/home/HomeSurfaceSkeletons";
import { AtriumStage } from "@/components/home/AtriumStage";
import { AtriumStartState } from "@/components/home/AtriumStartState";
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
} from "@/components/home/homeTypes";
import {
  buildAtriumFamilyPresenceGroups,
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
import { DriftMode } from "@/components/tree/DriftMode";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { usePendingTimeout } from "@/lib/usePendingTimeout";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

interface FamilyPresenceGroup {
  id: string;
  label: string;
  people: Person[];
}

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\b(\d{4})\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [driftOpen, setDriftOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [curationCount, setCurationCount] = useState(0);
  const [selectedEra, setSelectedEra] = useState<EraValue>("all");

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

  const familyPresenceGroups = useMemo(
    () =>
      mapFamilyPresenceGroups(
        selectedEra === "all"
          ? familyPresence
          : {
              focusPersonId: activeFocusPersonId,
              groups: buildAtriumFamilyPresenceGroups({
                focusPersonId: activeFocusPersonId,
                focusIds: activeFocusIds,
                people: people.map((person) => ({
                  id: person.id,
                  displayName: person.name,
                  portraitUrl: person.portraitUrl,
                  essenceLine: person.essenceLine,
                  birthDateText: person.birthYear ? String(person.birthYear) : null,
                  deathDateText: person.deathYear ? String(person.deathYear) : null,
                  linkedUserId: person.linkedUserId,
                })),
                relationships,
              }),
            },
        people,
      ),
    [activeFocusIds, activeFocusPersonId, familyPresence, people, relationships, selectedEra],
  );

  const nearbyPeople = useMemo(
    () => {
      const peopleById = new Map(people.map((person) => [person.id, person]));
      const relatedIds =
        selectedEra === "all" && featuredBranch?.relatedPersonIds?.length
          ? featuredBranch.relatedPersonIds
          : [activeFocusPersonId, ...activeFocusIds];
      return [...new Set(relatedIds.filter(Boolean))]
        .filter((personId): personId is string => Boolean(personId) && personId !== activeFocusPersonId)
        .map((personId) => peopleById.get(personId))
        .filter((person): person is Person => Boolean(person))
        .slice(0, 8);
    },
    [activeFocusIds, activeFocusPersonId, featuredBranch?.relatedPersonIds, people, selectedEra],
  );

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
            This atrium is taking too long to open.
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
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          minHeight: 52,
          background: "rgba(246,241,231,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "8px 16px",
          gap: 12,
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
          ← Home
        </Link>
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

        <Link href={`/trees/${treeId}/map`} style={headerLinkStyle}>
          Map
        </Link>

        <Link
          href={`/trees/${treeId}/inbox`}
          style={{
            ...headerIconStyle,
            position: "relative",
          }}
          title="Inbox"
        >
          ✉
          {inboxCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--rose)",
                color: "#fff",
                fontFamily: "var(--font-ui)",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {inboxCount > 9 ? "9+" : inboxCount}
            </span>
          )}
        </Link>

        {curationCount > 0 && (
          <Link
            href={`/trees/${treeId}/curation`}
            style={{
              ...headerLinkStyle,
              color: "var(--amber, #c97d1a)",
              border: "1px solid var(--amber, #c97d1a)",
              gap: 4,
            }}
            title="Curation queue"
          >
            ✎ {curationCount} need{curationCount === 1 ? "s" : ""} attention
          </Link>
        )}

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

        <button
          type="button"
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

      {memories.length === 0 ? (
        <AtriumStartState
          treeName={tree?.name ?? "Family Archive"}
          addPersonHref={`/trees/${treeId}/people/new`}
          onAddMemory={() => setWizardOpen(true)}
        />
      ) : (
        <AtriumStage
          treeName={tree?.name ?? "Family Archive"}
          featuredMemory={activeFeaturedMemory}
          branchCue={branchCue}
          memoryHref={activeFeaturedMemory ? `/trees/${treeId}/memories/${activeFeaturedMemory.id}` : null}
          branchHref={activeFocusPersonId ? `/trees/${treeId}/people/${activeFocusPersonId}` : null}
          fullTreeHref={`/trees/${treeId}`}
          resurfacingCount={activeHeroCandidates.length}
          onDrift={() => setDriftOpen(true)}
        />
      )}

      <AtriumContextStrip
        scaleLabel={formatArchiveScaleLabel(archiveSummary, homeStats, people.length)}
        historicalLabel={formatArchiveHistoricalLabel(archiveSummary, coverage)}
        branchCue={branchCue}
      />

      {memories.length > 0 && (
        <AtriumMemoryTrail
          coverage={coverage}
          sections={trailSections}
          selectedEra={selectedEra}
          selectedEraLabel={selectedEraLabel}
          onSelectEra={setSelectedEra}
          onMemoryClick={(memory) => {
            router.push(`/trees/${treeId}/memories/${memory.id}`);
          }}
          openArchiveHref={`/trees/${treeId}`}
        />
      )}

      <AtriumFamilyPresence
        focusPerson={focusPerson}
        focusPersonName={activeFeaturedMemory?.personName ?? focusPerson?.name ?? null}
        branchCue={branchCue}
        nearbyPeople={nearbyPeople}
        groups={familyPresenceGroups}
        fullTreeHref={`/trees/${treeId}`}
        addPersonHref={`/trees/${treeId}/people/new`}
        onPersonClick={handlePersonClick}
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
            onClose={() => setDriftOpen(false)}
            onPersonDetail={handlePersonClick}
            apiBase={API}
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

const headerLinkStyle = {
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
} as const;

const headerIconStyle = {
  fontFamily: "var(--font-ui)",
  fontSize: 18,
  color: "var(--ink-faded)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "5px 10px",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
} as const;

const headerButtonStyle = {
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
} as const;

function mapFamilyPresenceGroups(
  familyPresence:
    | {
        focusPersonId: string | null;
        groups: Array<{ id: string; label: string; personIds: string[] }>;
      }
    | TreeHomeFamilyPresence
    | null,
  people: Person[],
): FamilyPresenceGroup[] {
  if (!familyPresence) return [];

  const peopleById = new Map(people.map((person) => [person.id, person]));
  return familyPresence.groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      people: group.personIds
        .map((personId) => peopleById.get(personId))
        .filter((person): person is Person => Boolean(person)),
    }))
    .filter((group) => group.people.length > 0);
}

function formatArchiveScaleLabel(
  archiveSummary: TreeHomeArchiveSummary | null,
  stats: TreeHomeStats | null,
  peopleCount: number,
) {
  const resolvedPeopleCount = archiveSummary?.peopleCount ?? stats?.peopleCount ?? peopleCount;
  const generationCount = archiveSummary?.generationCount ?? stats?.generationCount ?? 0;

  if (resolvedPeopleCount === 0) return "No people have been added yet.";
  if (generationCount > 0) {
    return `${resolvedPeopleCount} ${resolvedPeopleCount === 1 ? "person" : "people"} across ${generationCount} ${generationCount === 1 ? "generation" : "generations"}`;
  }
  return `${resolvedPeopleCount} ${resolvedPeopleCount === 1 ? "person" : "people"} taking shape`;
}

function formatArchiveHistoricalLabel(
  archiveSummary: TreeHomeArchiveSummary | null,
  coverage: TreeHomeCoverage | null,
) {
  const earliestYear = archiveSummary?.earliestYear ?? coverage?.earliestYear ?? null;
  const latestYear = archiveSummary?.latestYear ?? coverage?.latestYear ?? null;

  if (earliestYear === null && latestYear === null) {
    return "Dates are still gathering around the archive.";
  }
  if (earliestYear !== null && latestYear !== null) {
    if (earliestYear === latestYear) {
      return `Memories are currently centered on ${earliestYear}.`;
    }
    return `Memories stretch from ${earliestYear} to ${latestYear}.`;
  }
  const knownYear = earliestYear ?? latestYear;
  return `Memories are currently anchored around ${knownYear}.`;
}
