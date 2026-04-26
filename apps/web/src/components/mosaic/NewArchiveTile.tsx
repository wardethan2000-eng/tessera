"use client";

import { EASE } from "@/components/home/homeUtils";

interface NewArchiveTileProps {
  onClick: () => void;
}

export function NewArchiveTile({ onClick }: NewArchiveTileProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Start a new archive"
      style={{
        gridColumn: "span 4",
        gridRow: "span 3",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 180,
        borderRadius: 14,
        border: "1px dashed rgba(128,107,82,0.22)",
        background: "linear-gradient(135deg, rgba(249,245,238,0.5) 0%, rgba(237,230,218,0.3) 100%)",
        cursor: "pointer",
        transition: `border-color 320ms ${EASE}, background 320ms ${EASE}`,
        animation: `bloom 640ms ${EASE} 300ms both`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(78,93,66,0.36)";
        e.currentTarget.style.background = "linear-gradient(135deg, rgba(249,245,238,0.7) 0%, rgba(232,223,207,0.4) 100%)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(128,107,82,0.22)";
        e.currentTarget.style.background = "linear-gradient(135deg, rgba(249,245,238,0.5) 0%, rgba(237,230,218,0.3) 100%)";
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          lineHeight: 1,
          color: "var(--ink-faded)",
        }}
      >
        +
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--ink-faded)",
          fontStyle: "italic",
        }}
      >
        New archive
      </span>
    </button>
  );
}