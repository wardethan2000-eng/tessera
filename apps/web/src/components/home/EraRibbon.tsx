"use client";

import { useState } from "react";
import type { TreeHomeCoverage } from "./homeTypes";
import { EASE } from "./homeUtils";

type EraValue = "all" | number;

export function EraRibbon({
  coverage,
  selectedEra,
  onSelectEra,
}: {
  coverage: TreeHomeCoverage | null;
  selectedEra: EraValue;
  onSelectEra: (value: EraValue) => void;
}) {
  if (!coverage || coverage.decadeBuckets.length === 0) return null;

  return (
    <section
      style={{
        padding: "28px max(20px, 5vw) 0",
      }}
    >
      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 18,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.92) 0%, rgba(242,235,224,0.88) 100%)",
          boxShadow: "0 10px 28px rgba(40,30,18,0.04)",
          padding: "16px clamp(14px, 3vw, 22px)",
        }}
      >
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            Browse by era
          </h2>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            Filter the atrium through the decades already present in the archive.
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
            scrollSnapType: "x proximity",
          }}
        >
          <EraChip
            label="All eras"
            detail={`${coverage.decadeBuckets.length} decades`}
            active={selectedEra === "all"}
            onClick={() => onSelectEra("all")}
          />
          {coverage.decadeBuckets.map((bucket) => (
            <EraChip
              key={bucket.startYear}
              label={bucket.label}
              detail={`${bucket.count} ${bucket.count === 1 ? "memory" : "memories"}`}
              active={selectedEra === bucket.startYear}
              onClick={() => onSelectEra(bucket.startYear)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function EraChip({
  label,
  detail,
  active,
  onClick,
}: {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const highlighted = active || hovered || focused;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        border: highlighted ? "1px solid var(--moss)" : "1px solid var(--rule)",
        background: highlighted ? "rgba(78,93,66,0.08)" : "var(--paper-deep)",
        color: highlighted ? "var(--ink)" : "var(--ink-faded)",
        borderRadius: 999,
        padding: "10px 14px",
        minWidth: "fit-content",
        cursor: "pointer",
        textAlign: "left",
        scrollSnapAlign: "start",
        outline: "none",
        boxShadow: highlighted ? "0 8px 18px rgba(78,93,66,0.08)" : "none",
        transition:
          `background 220ms ${EASE}, border-color 220ms ${EASE}, box-shadow 220ms ${EASE}, color 220ms ${EASE}, transform 220ms ${EASE}`,
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          opacity: 0.85,
        }}
      >
        {detail}
      </div>
    </button>
  );
}
