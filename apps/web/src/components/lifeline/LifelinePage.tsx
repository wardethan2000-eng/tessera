"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import {
  isCanonicalPersonId,
  isCanonicalTreeId,
  resolveCanonicalPersonId,
  resolveCanonicalTreeId,
} from "@/lib/tree-route";
import { extractYear, eraForAge } from "@/lib/date-utils";
import { getApiBase } from "@/lib/api-base";
import { Shimmer } from "@/components/ui/Shimmer";

import type { LifelinePerson, LifelineMemory, LifelineRelationshipEvent, LifelineYearGroup as LifelineYearGroupType } from "./lifelineTypes";
import { LifelineHeader } from "./LifelineHeader";
import { LifelineTimelineMap } from "./LifelineTimelineMap";
import { LifelineAnchorRow } from "./LifelineAnchorRow";
import { LifelineYearGroup } from "./LifelineYearGroup";
import { LifelineUndated } from "./LifelineUndated";
import { useActiveEra } from "./useActiveEra";

import { DriftMode, type DriftFilter } from "@/components/tree/DriftMode";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";

import styles from "./lifeline.module.css";

const API = getApiBase();

interface PersonApiResponse extends LifelinePerson {
  relationships: LifelineRelationshipEvent[];
}

export function LifelinePageContent({
  treeId,
  personId,
}: {
  treeId: string;
  personId: string;
}) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const userId = session?.user?.id;

  const [person, setPerson] = useState<PersonApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(
    !isCanonicalTreeId(treeId) || !isCanonicalPersonId(personId)
  );

  const [driftOpen, setDriftOpen] = useState(false);
  const [driftFilter, setDriftFilter] = useState<DriftFilter | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadPerson = useCallback(
    async ({
      signal,
      showLoading = true,
    }: {
      signal?: AbortSignal;
      showLoading?: boolean;
    } = {}) => {
      await Promise.resolve();
      if (signal?.aborted) return;
      if (showLoading) setLoading(true);
      try {
        const res = await fetch(`${API}/api/trees/${treeId}/people/${personId}`, {
          credentials: "include",
          signal,
        });
        if (!res.ok) throw new Error(`Could not load person (${res.status})`);
        const data = (await res.json()) as PersonApiResponse;
        if (signal?.aborted) return;
        setPerson(data);
        setLoadError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Could not load person");
      } finally {
        if (!signal?.aborted && showLoading) setLoading(false);
      }
    },
    [treeId, personId]
  );

  useEffect(() => {
    if (!sessionPending && !session) router.replace("/auth/signin");
  }, [session, sessionPending, router]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (sessionPending || !userId) return;
    if (!isCanonicalTreeId(treeId)) {
      void (async () => {
        const resolved = await resolveCanonicalTreeId(API, treeId);
        if (cancelled) return;
        if (resolved && resolved !== treeId) {
          router.replace(`/trees/${resolved}/people/${personId}/lifeline`);
          return;
        }
        if (!resolved) {
          setLoadError("This link is invalid or no longer points to a tree.");
          setLoading(false);
          setNormalizing(false);
        }
      })();
      return () => { cancelled = true; };
    }
    if (!isCanonicalPersonId(personId)) {
      void (async () => {
        const resolved = await resolveCanonicalPersonId(API, treeId, personId);
        if (cancelled) return;
        if (resolved && resolved !== personId) {
          router.replace(`/trees/${treeId}/people/${resolved}/lifeline`);
          return;
        }
        if (!resolved) {
          setLoadError("This link is invalid or no longer points to a person in this tree.");
          setLoading(false);
        }
        setNormalizing(false);
      })();
      return () => { cancelled = true; };
    }
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        void loadPerson({ signal: controller.signal });
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [treeId, personId, userId, sessionPending, router, loadPerson]);

  const birthYear = useMemo(() => extractYear(person?.birthDateText), [person]);
  const deathYear = useMemo(() => extractYear(person?.deathDateText), [person]);
  const lifespanYears = birthYear && (deathYear || person?.isLiving)
    ? (deathYear || new Date().getFullYear()) - birthYear
    : null;

  const grouped = useMemo(() => {
    if (!person) return { years: [] as LifelineYearGroupType[], undated: [] as LifelineMemory[] };
    const direct = person.directMemories ?? person.memories.filter((m) => m.memoryContext !== "contextual");
    const contextual = person.contextualMemories ?? [];
    const allMem = [...direct, ...contextual];
    const by = extractYear(person.birthDateText);

    const map = new Map<number, LifelineMemory[]>();
    const undated: LifelineMemory[] = [];
    for (const memory of allMem) {
      const y = extractYear(memory.dateOfEventText);
      if (y === null) {
        undated.push(memory);
      } else {
        if (!map.has(y)) map.set(y, []);
        map.get(y)!.push(memory);
      }
    }
    for (const yearMemories of map.values()) {
      yearMemories.sort((a, b) => {
        if (a.memoryContext === "contextual" && b.memoryContext !== "contextual") return 1;
        if (a.memoryContext !== "contextual" && b.memoryContext === "contextual") return -1;
        return 0;
      });
    }

    const relationshipEventsByYear = new Map<number, LifelineRelationshipEvent[]>();
    if (person.relationships) {
      for (const rel of person.relationships) {
        if (rel.type === "spouse" && rel.startDateText) {
          const relYear = extractYear(rel.startDateText);
          if (relYear !== null) {
            if (!relationshipEventsByYear.has(relYear)) relationshipEventsByYear.set(relYear, []);
            relationshipEventsByYear.get(relYear)!.push(rel);
          }
        }
      }
    }

    const years: LifelineYearGroupType[] = Array.from(map.entries())
      .map(([year, memories]) => {
        const age = by ? year - by : null;
        const era = age !== null ? eraForAge(age) : null;
        return {
          year,
          age,
          era: era ? { label: era.label, hue: era.hue } : null,
          memories,
          relationshipEvents: relationshipEventsByYear.get(year) ?? [],
        };
      })
      .sort((a, b) => a.year - b.year);
    return { years, undated };
  }, [person]);

  const handleDecadeClick = useCallback((targetYear: number) => {
    if (targetYear === birthYear) {
      const el = document.getElementById("lifeline-anchor-born");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    if (deathYear && targetYear >= deathYear) {
      const el = document.getElementById("lifeline-anchor-passed");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    const target = grouped.years.find((g) => g.year >= targetYear && g.year < targetYear + 10);
    if (target) {
      const el = document.getElementById(`lifeline-year-${target.year}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (grouped.years.length > 0) {
      const last = grouped.years[grouped.years.length - 1]!;
      const el = document.getElementById(`lifeline-year-${last.year}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [birthYear, deathYear, grouped.years]);
  const yearElementIds = useMemo(
    () => grouped.years.map((g) => `lifeline-year-${g.year}`),
    [grouped.years]
  );

  const activePosition = useActiveEra(yearElementIds);

  const openDrift = useCallback((filter?: DriftFilter | null) => {
    setDriftFilter(filter ?? null);
    setDriftOpen(true);
  }, []);

  const handleDriftThisLife = useCallback(() => {
    if (!person) return;
    const filter: DriftFilter = person.isLiving
      ? { personId: person.id }
      : { mode: "remembrance", personId: person.id };
    openDrift(filter);
  }, [person, openDrift]);

  const handleAddMemory = useCallback(() => {
    setWizardOpen(true);
  }, []);

  const wizardPeople = useMemo(() => {
    if (!person) return [];
    return [{ id: person.id, name: person.displayName, portraitUrl: person.portraitUrl }];
  }, [person]);

  if (loading || sessionPending || normalizing) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingStack}>
          <Shimmer height={38} width="40%" />
          <Shimmer height={14} width="25%" />
          <div className={styles.loadingRow}>
            <Shimmer height={20} width={72} />
            <Shimmer height={12} width={12} borderRadius={6} />
            <Shimmer height={100} />
          </div>
          <div className={styles.loadingRow}>
            <Shimmer height={20} width={72} />
            <Shimmer height={12} width={12} borderRadius={6} />
            <Shimmer height={140} />
          </div>
          <div className={styles.loadingRow}>
            <Shimmer height={20} width={72} />
            <Shimmer height={12} width={12} borderRadius={6} />
            <Shimmer height={80} />
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !person) {
    return (
      <main className={styles.page}>
        <p className={styles.error}>{loadError ?? "Could not load this person."}</p>
      </main>
    );
  }

  const hasContent = grouped.years.length > 0 || grouped.undated.length > 0;
  const hasDatedTimeline = grouped.years.length > 0;

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <LifelineHeader
          person={person}
          treeId={treeId}
          personId={personId}
          lifespanYears={lifespanYears}
          onDrift={handleDriftThisLife}
          onAddMemory={handleAddMemory}
        />

        {!hasContent ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              A few memories, not yet placed in time. That is alright.
            </p>
            <p className={styles.emptySubtext}>
              Memories with dates will appear here along {person.displayName}&apos;s life.
            </p>
            <button
              onClick={handleAddMemory}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              Add a memory
            </button>
          </div>
        ) : (
          <>
            {hasDatedTimeline && (
              <div className={styles.twoColumnLayout}>
                <LifelineTimelineMap
                  birthYear={birthYear}
                  deathYear={deathYear}
                  isLiving={person.isLiving}
                  yearGroups={grouped.years}
                  activeYear={activePosition.year}
                  onDecadeClick={handleDecadeClick}
                />
                <div className={styles.timelineWrap}>
                  <div className={styles.spine} aria-hidden="true" />

                  {birthYear && (
                    <LifelineAnchorRow
                      year={birthYear}
                      label="Born"
                      accent="var(--gilt)"
                      detail={person.birthDateText ?? String(birthYear)}
                    />
                  )}

                  {grouped.years.map((group) => (
                    <LifelineYearGroup
                      key={group.year}
                      group={group}
                      treeId={treeId}
                      personId={personId}
                      birthYear={birthYear}
                    />
                  ))}

                  {deathYear && (
                    <LifelineAnchorRow
                      year={deathYear}
                      label="Passed"
                      accent="var(--lifeline-passed)"
                      detail={person.deathDateText ?? String(deathYear)}
                    />
                  )}
                </div>
              </div>
            )}

            <div className={hasDatedTimeline ? styles.undatedAfterTimeline : styles.undatedOnly}>
              <LifelineUndated
                memories={grouped.undated}
                treeId={treeId}
                personId={personId}
              />
            </div>
          </>
        )}
      </div>

      {driftOpen && (
        <DriftMode
          treeId={treeId}
          people={wizardPeople}
          onClose={() => setDriftOpen(false)}
          onPersonDetail={(pid) => router.push(`/trees/${treeId}/people/${pid}`)}
          apiBase={API}
          initialFilter={driftFilter}
        />
      )}

      {wizardOpen && (
        <AddMemoryWizard
          treeId={treeId}
          people={wizardPeople}
          apiBase={API}
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onSuccess={() => {
            setWizardOpen(false);
            void loadPerson();
          }}
          defaultPersonId={personId}
          subjectName={person.displayName}
        />
      )}
    </main>
  );
}
