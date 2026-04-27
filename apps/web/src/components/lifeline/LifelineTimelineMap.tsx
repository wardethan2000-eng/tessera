"use client";

import { useMemo } from "react";
import { LIFELINE_ERAS, eraForAge } from "@/lib/date-utils";
import type { LifelineYearGroup } from "./lifelineTypes";
import styles from "./lifeline.module.css";

interface TimelineMapProps {
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean;
  yearGroups: LifelineYearGroup[];
  activeYear: number | null;
  onDecadeClick: (year: number) => void;
}

interface DecadeMarker {
  year: number;
  age: number;
  pct: number;
  hue: string;
  eraLabel: string;
  hasMemories: boolean;
  memoryCount: number;
}

interface YearMarker {
  year: number;
  pct: number;
  hue: string;
}

interface EraSegment {
  label: string;
  hue: string;
  topPct: number;
  heightPct: number;
}

export function LifelineTimelineMap({
  birthYear,
  deathYear,
  isLiving,
  yearGroups,
  activeYear,
  onDecadeClick,
}: TimelineMapProps) {
  const timelineData = useMemo(() => {
    if (yearGroups.length === 0 && birthYear == null) return null;

    const hasBirthYear = birthYear != null;
    const firstYear = hasBirthYear ? birthYear! : Math.min(...yearGroups.map((g) => g.year));
    const endYear = deathYear ?? (isLiving ? new Date().getFullYear() : null);
    const lastYear = endYear ?? Math.max(...yearGroups.map((g) => g.year));
    const totalYears = lastYear - firstYear;
    if (totalYears <= 0) return null;

    const safeTotal = totalYears > 0 ? totalYears : 1;

    const decades: DecadeMarker[] = [];
    const start = Math.ceil(firstYear / 10) * 10;
    for (let y = start; y <= lastYear; y += 10) {
      const age = hasBirthYear ? y - birthYear! : null;
      const era = age !== null ? eraForAge(age) : null;
      const yearsInDecade = yearGroups.filter(
        (g) => g.year >= y && g.year < y + 10
      );
      const memoryCount = yearsInDecade.reduce(
        (sum, g) => sum + g.memories.length,
        0
      );
      decades.push({
        year: y,
        age: age ?? 0,
        pct: ((y - firstYear) / safeTotal) * 100,
        hue: era?.hue ?? "var(--rule)",
        eraLabel: era?.label ?? "",
        hasMemories: memoryCount > 0,
        memoryCount,
      });
    }

    const yearMarkers: YearMarker[] = yearGroups
      .filter((g) => g.memories.length > 0)
      .map((g) => ({
        year: g.year,
        pct: ((g.year - firstYear) / safeTotal) * 100,
        hue: g.era?.hue ?? "var(--rule)",
      }));

    const eraSegments: EraSegment[] = [];
    if (hasBirthYear) {
      for (const era of LIFELINE_ERAS) {
        if (era.ageStart > safeTotal) break;
        const startAge = era.ageStart;
        const endAge = Math.min(era.ageEnd, safeTotal);
        eraSegments.push({
          label: era.label,
          hue: era.hue,
          topPct: (startAge / safeTotal) * 100,
          heightPct: ((endAge - startAge) / safeTotal) * 100,
        });
      }
    }

    return { decades, yearMarkers, eraSegments, totalYears: safeTotal, firstYear, lastYear };
  }, [birthYear, deathYear, isLiving, yearGroups]);

  if (!timelineData) return null;
  const { decades, yearMarkers, eraSegments, totalYears, firstYear, lastYear } = timelineData;
  const hasBirthYear = birthYear != null;
  const endYear = deathYear ?? (isLiving ? new Date().getFullYear() : lastYear);

  const minHeight = Math.max(400, (decades.length + 2) * 44);

  return (
    <>
      <nav className={styles.timelineMap} aria-label="Lifeline timeline">
        <div
          className={styles.timelineMapTrack}
          style={{ minHeight: `${minHeight}px` }}
        >
          {eraSegments.map((seg) => (
            <div
              key={seg.label}
              className={styles.timelineEraBand}
              style={{
                top: `${seg.topPct}%`,
                height: `${seg.heightPct}%`,
                borderColor: seg.hue,
              }}
            />
          ))}

          <div className={styles.timelineMapLine} />

          {hasBirthYear && (
            <button
              className={`${styles.timelineMapMarker} ${styles.timelineMapMarkerAnchor}`}
              style={{ top: "0%" }}
              onClick={() => onDecadeClick(birthYear!)}
              aria-label={`Born ${birthYear}`}
            >
              <span
                className={styles.timelineMapDot}
                style={{
                  background: "var(--gilt)",
                  borderColor: "var(--gilt)",
                }}
              />
              <span className={styles.timelineMapYearLabel}>{birthYear}</span>
              <span className={styles.timelineMapEraTag}>Born</span>
            </button>
          )}

          {decades.map((d) => {
            const isActive =
              activeYear !== null &&
              activeYear >= d.year &&
              activeYear < d.year + 10;
            return (
              <button
                key={d.year}
                className={`${styles.timelineMapMarker} ${
                  isActive ? styles.timelineMapMarkerActive : ""
                } ${
                  d.hasMemories ? styles.timelineMapMarkerHasContent : ""
                }`}
                style={{ top: `${d.pct}%` }}
                onClick={() => onDecadeClick(d.year)}
                aria-label={d.eraLabel ? `${d.year}s \u2014 ${d.eraLabel}` : `${d.year}s`}
              >
                <span
                  className={styles.timelineMapDot}
                  style={{
                    background: d.hasMemories ? d.hue : "var(--paper)",
                    borderColor: d.hue,
                  }}
                />
                <span className={styles.timelineMapYearLabel}>{d.year}</span>
                {isActive && d.eraLabel && (
                  <span
                    className={styles.timelineMapEraTag}
                    style={{ color: d.hue }}
                  >
                    {d.eraLabel}
                  </span>
                )}
              </button>
            );
          })}

          {yearMarkers.map((m) => (
            <div
              key={`yr-${m.year}`}
              className={styles.timelineMapYearDot}
              style={{
                top: `${m.pct}%`,
                background: m.hue,
              }}
              title={String(m.year)}
            />
          ))}

          <button
            className={`${styles.timelineMapMarker} ${styles.timelineMapMarkerAnchor}`}
            style={{ top: "100%" }}
            onClick={() => onDecadeClick(endYear)}
            aria-label={isLiving ? `Present \u2014 ${endYear}` : `Passed ${endYear}`}
          >
            <span
              className={styles.timelineMapDot}
              style={{
                background: isLiving
                  ? "var(--moss)"
                  : "var(--lifeline-passed)",
                borderColor: isLiving
                  ? "var(--moss)"
                  : "var(--lifeline-passed)",
              }}
            />
            <span className={styles.timelineMapYearLabel}>{endYear}</span>
            <span className={styles.timelineMapEraTag}>
              {isLiving ? "Present" : "Passed"}
            </span>
          </button>

          {activeYear !== null && totalYears > 0 && (
            <div
              className={styles.timelineMapActiveIndicator}
              style={{
                top: `${((activeYear - firstYear) / totalYears) * 100}%`,
              }}
            />
          )}
        </div>
      </nav>

      <div className={styles.timelineMapMobile}>
        {hasBirthYear && (
          <button
            className={`${styles.timelineMapChip} ${styles.timelineMapChipAnchor}`}
            onClick={() => onDecadeClick(birthYear!)}
          >
            {birthYear}
          </button>
        )}
        {decades.map((d) => {
          const isActive =
            activeYear !== null &&
            activeYear >= d.year &&
            activeYear < d.year + 10;
          return (
            <button
              key={d.year}
              className={`${styles.timelineMapChip} ${
                isActive ? styles.timelineMapChipActive : ""
              } ${d.hasMemories ? styles.timelineMapChipHasContent : ""}`}
              onClick={() => onDecadeClick(d.year)}
              style={isActive ? { borderColor: d.hue } : undefined}
            >
              {d.year}
            </button>
          );
        })}
        <button
          className={`${styles.timelineMapChip} ${styles.timelineMapChipAnchor}`}
          onClick={() => onDecadeClick(endYear)}
        >
          {endYear}
        </button>
      </div>
    </>
  );
}