"use client";

import type { TreeHomeMemory } from "./homeTypes";
import { MemoryCard } from "./MemoryCard";

export function MemoryLane({
  title,
  countLabel,
  memories,
  onMemoryClick,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  countLabel: string;
  memories: TreeHomeMemory[];
  onMemoryClick: (memory: TreeHomeMemory) => void;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  if (memories.length === 0) return null;

  return (
    <section style={{ padding: "32px 0 0" }}>
      <div
        style={{
          padding: "0 max(20px, 5vw)",
          marginBottom: 18,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            color: "var(--ink)",
            margin: 0,
            fontWeight: 400,
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          {countLabel}
        </span>
      </div>

      <div
        style={{
          overflowX: "auto",
          paddingBottom: 18,
          paddingLeft: "max(20px, 5vw)",
          paddingRight: "max(20px, 5vw)",
          display: "flex",
          gap: 14,
          scrollbarWidth: "none",
          scrollSnapType: "x proximity",
        }}
      >
        {memories.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            onClick={() => onMemoryClick(memory)}
          />
        ))}
        {viewAllHref && viewAllLabel && (
          <a
            href={viewAllHref}
            style={{
              background:
                "linear-gradient(180deg, rgba(244,237,226,1) 0%, rgba(236,229,216,1) 100%)",
              border: "1px solid var(--rule)",
              borderRadius: 14,
              flexShrink: 0,
              width: "min(240px, calc(100vw - 72px))",
              minHeight: 184,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textDecoration: "none",
              cursor: "pointer",
              scrollSnapAlign: "start",
              boxShadow: "0 10px 28px rgba(40,30,18,0.04)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                color: "var(--ink-faded)",
                textAlign: "center",
                maxWidth: 140,
              }}
            >
              {viewAllLabel}
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
