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
    if (birthYear == null) return null;
    const endYear = deathYear ?? new Date().getFullYear();
    const totalYears = endYear - birthYear;
    if (totalYears <= 0) return null;

    const decades: DecadeMarker[] = [];
    const start = Math.ceil(birthYear / 10) * 10;
    for (let y = start; y <= endYear; y += 10) {
      const age = y - birthYear;
      const era = eraForAge(age);
      const yearsInDecade = yearGroups.filter(
        (g) => g.year >= y && g.year < y + 10
      );
      const memoryCount = yearsInDecade.reduce(
        (sum, g) => sum + g.memories.length,
        0
      );
      decades.push({
        year: y,
        age,
        pct: (age / totalYears) * 100,
        hue: era.hue,
        eraLabel: era.label,
        hasMemories: memoryCount > 0,
        memoryCount,
      });
    }

    const yearMarkers: YearMarker[] = yearGroups
      .filter((g) => g.memories.length > 0)
      .map((g) => ({
        year: g.year,
        pct: ((g.year - birthYear) / totalYears) * 100,
        hue: g.era?.hue ?? "var(--rule)",
      }));

    const eraSegments: EraSegment[] = [];
    for (const era of LIFELINE_ERAS) {
      if (era.ageStart > totalYears) break;
      const startAge = era.ageStart;
      const endAge = Math.min(era.ageEnd, totalYears);
      eraSegments.push({
        label: era.label,
        hue: era.hue,
        topPct: (startAge / totalYears) * 100,
        heightPct: ((endAge - startAge) / totalYears) * 100,
      });
    }

    return { decades, yearMarkers, eraSegments, totalYears };
  }, [birthYear, deathYear, yearGroups]);

  if (!timelineData) return null;
  const { decades, yearMarkers, eraSegments, totalYears } = timelineData;
  const endYear = deathYear ?? new Date().getFullYear();

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

          <button
            className={`${styles.timelineMapMarker} ${styles.timelineMapMarkerAnchor}`}
            style={{ top: "0%" }}
            onClick={() => birthYear && onDecadeClick(birthYear)}
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
                aria-label={`${d.year}s \u2014 ${d.eraLabel}`}
              >
                <span
                  className={styles.timelineMapDot}
                  style={{
                    background: d.hasMemories ? d.hue : "var(--paper)",
                    borderColor: d.hue,
                  }}
                />
                <span className={styles.timelineMapYearLabel}>{d.year}</span>
                {isActive && (
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

          {activeYear !== null &&
            birthYear !== null &&
            totalYears > 0 && (
              <div
                className={styles.timelineMapActiveIndicator}
                style={{
                  top: `${((activeYear - birthYear) / totalYears) * 100}%`,
                }}
              />
            )}
        </div>
      </nav>

      <div className={styles.timelineMapMobile}>
        {birthYear != null && (
          <button
            className={`${styles.timelineMapChip} ${styles.timelineMapChipAnchor}`}
            onClick={() => onDecadeClick(birthYear)}
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