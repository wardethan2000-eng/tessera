"use client";

import type { TreeHomeCoverage, TreeHomeStats } from "./homeTypes";
import { getCoverageRangeLabel } from "./homeUtils";

export function HomeSummaryBand({
  stats,
  coverage,
}: {
  stats: TreeHomeStats | null;
  coverage: TreeHomeCoverage | null;
}) {
  if (!stats && !coverage) return null;

  return (
    <section
      style={{
        padding: "24px max(20px, 5vw) 0",
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      <article
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.92) 0%, rgba(242,235,224,0.88) 100%)",
          padding: "18px clamp(16px, 3vw, 22px)",
          boxShadow: "0 10px 28px rgba(40,30,18,0.04)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Archive scale
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
          }}
        >
          {stats?.peopleCount ?? 0} people
          {stats?.generationCount ? ` across ${stats.generationCount} generations` : ""}
        </div>
      </article>

      <article
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.92) 0%, rgba(242,235,224,0.88) 100%)",
          padding: "18px clamp(16px, 3vw, 22px)",
          boxShadow: "0 10px 28px rgba(40,30,18,0.04)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Historical span
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
          }}
        >
          {getCoverageRangeLabel(coverage)}
        </div>
        {coverage && coverage.decadeBuckets.length > 0 && (
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            {coverage.decadeBuckets.length} dated eras in the archive
          </div>
        )}
      </article>

      <article
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.92) 0%, rgba(242,235,224,0.88) 100%)",
          padding: "18px clamp(16px, 3vw, 22px)",
          boxShadow: "0 10px 28px rgba(40,30,18,0.04)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Still unfolding
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
          }}
        >
          {stats?.peopleWithoutDirectMemoriesCount ?? 0} people still need direct memories
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          {stats?.peopleWithoutPortraitCount ?? 0} are still missing portraits
        </div>
      </article>
    </section>
  );
}
