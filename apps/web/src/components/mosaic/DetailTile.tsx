"use client";

import { EASE } from "@/components/home/homeUtils";

interface DetailTileProps {
  label: string;
  value: string;
  note?: string;
  colSpan: number;
  accent?: "moss" | "gilt" | "rose";
  staggerIndex: number;
}

const ACCENTS = {
  moss: {
    border: "rgba(78,93,66,0.2)",
    text: "var(--moss)",
    background: "rgba(78,93,66,0.05)",
  },
  gilt: {
    border: "rgba(176,139,62,0.22)",
    text: "var(--gilt)",
    background: "rgba(176,139,62,0.06)",
  },
  rose: {
    border: "rgba(168,93,93,0.18)",
    text: "var(--rose)",
    background: "rgba(168,93,93,0.05)",
  },
};

export function DetailTile({
  label,
  value,
  note,
  colSpan,
  accent = "moss",
  staggerIndex,
}: DetailTileProps) {
  const colors = ACCENTS[accent];

  return (
    <div
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow: "span 2",
        minHeight: 128,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        background: `linear-gradient(145deg, ${colors.background} 0%, rgba(249,245,238,0.7) 100%)`,
        padding: "clamp(14px, 2vw, 20px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        animation: `bloom 560ms ${EASE} ${staggerIndex * 60}ms both`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: colors.text,
        }}
      >
        {label}
      </div>
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(24px, 3vw, 38px)",
            lineHeight: 1,
            color: "var(--ink)",
          }}
        >
          {value}
        </div>
        {note && (
          <div
            style={{
              marginTop: 5,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--ink-faded)",
            }}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
}