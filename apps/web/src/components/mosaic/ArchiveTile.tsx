"use client";

import { useState } from "react";
import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeCoverage, TreeHomeMemory, TreeHomeStats } from "@/components/home/homeTypes";
import { EASE, getCoverageRangeLabel, getHeroExcerpt } from "@/components/home/homeUtils";

interface ArchiveTileProps {
  treeName: string;
  role: string;
  stats: TreeHomeStats;
  coverage: TreeHomeCoverage;
  heroMemory: TreeHomeMemory | null;
  isFoundedByYou: boolean;
  isPrimary: boolean;
  isSparse: boolean;
  href: string;
}

export function ArchiveTile({
  treeName,
  role,
  stats,
  coverage,
  heroMemory,
  isFoundedByYou,
  isPrimary,
  isSparse,
  href,
}: ArchiveTileProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = hovered || focused;
  const heroImage = getProxiedMediaUrl(heroMemory?.mediaUrl);
  const heroExcerpt = getHeroExcerpt(heroMemory);
  const spanLabel = getCoverageRangeLabel(coverage);

  const colSpan = isPrimary ? 7 : 5;
  const rowSpan = isPrimary ? 5 : 4;

  return (
    <a
      href={href}
      aria-label={`${isPrimary ? "Primary" : ""} archive: ${treeName}. ${stats.peopleCount} people, ${stats.memoryCount} memories${spanLabel !== "Dates are still gathering." ? `, ${spanLabel}` : ""}. Enter archive.`}
      className="mosaic-tile-link"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow: `span ${rowSpan}`,
        position: "relative",
        overflow: "hidden",
        borderRadius: isPrimary ? 18 : 14,
        border: active
          ? "1px solid rgba(78,93,66,0.36)"
          : "1px solid rgba(128,107,82,0.14)",
        background: !heroImage
          ? `linear-gradient(135deg, rgba(249,245,238,1) 0%, rgba(234,226,212,1) 100%)`
          : undefined,
        transform: active ? "translateY(-3px)" : "none",
        boxShadow: active
          ? "0 22px 52px rgba(40,30,18,0.16)"
          : isPrimary
            ? "0 8px 24px rgba(40,30,18,0.08)"
            : "0 4px 12px rgba(40,30,18,0.04)",
        transition: `transform 420ms ${EASE}, box-shadow 420ms ${EASE}, border-color 420ms ${EASE}`,
        animation: `bloom 640ms ${EASE} 0ms both`,
        textDecoration: "none",
        cursor: "pointer",
        minHeight: isPrimary ? 380 : 260,
      }}
    >
      {heroImage && (
        <>
          <img
            src={heroImage}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: isPrimary ? 0.78 : 0.62,
              filter: "sepia(8%) saturate(0.88)",
              transform: active ? "scale(1.03)" : "scale(1)",
              transition: `transform 900ms ${EASE}, opacity 400ms ${EASE}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: isPrimary
                ? "linear-gradient(to top, rgba(20,17,14,0.82) 0%, rgba(20,17,14,0.38) 32%, rgba(20,17,14,0.12) 58%, rgba(244,236,223,0.04) 100%)"
                : "linear-gradient(to top, rgba(20,17,14,0.78) 0%, rgba(20,17,14,0.28) 40%, rgba(244,236,223,0.08) 100%)",
            }}
          />
        </>
      )}

      {!heroImage && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `
              linear-gradient(90deg, rgba(78,93,66,0.06) 0 1px, transparent 1px 100%),
              linear-gradient(180deg, rgba(176,139,62,0.07) 0 1px, transparent 1px 100%),
              linear-gradient(135deg, rgba(249,245,238,1) 0%, rgba(234,226,212,1) 100%)
            `,
            backgroundSize: "28px 28px, 28px 28px, auto",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3)",
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          height: "100%",
          padding: isPrimary ? "clamp(20px, 3vw, 32px)" : "clamp(16px, 2.5vw, 24px)",
          color: heroImage ? "white" : "var(--ink)",
        }}
      >
        {isSparse && !heroImage && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: isPrimary ? 15 : 13,
              lineHeight: 1.55,
              color: "var(--ink-soft)",
              marginBottom: 8,
              fontStyle: "italic",
            }}
          >
            Just beginning — add a memory to bring it to life.
          </div>
        )}

        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: isPrimary ? "clamp(26px, 3.2vw, 40px)" : "clamp(20px, 2vw, 28px)",
            lineHeight: 1.05,
            color: "inherit",
            maxWidth: isPrimary ? "16ch" : "12ch",
          }}
        >
          {treeName}
        </div>

        {isPrimary && heroExcerpt && active && (
          <div
            style={{
              marginTop: 10,
              fontFamily: "var(--font-body)",
              fontSize: 14,
              lineHeight: 1.55,
              color: heroImage ? "rgba(255,250,244,0.82)" : "var(--ink-soft)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              maxWidth: 480,
            }}
          >
            {heroExcerpt}
          </div>
        )}

        <div
          style={{
            marginTop: isPrimary ? 14 : 8,
            display: "flex",
            flexWrap: "wrap",
            gap: isPrimary ? 12 : 8,
            alignItems: "baseline",
            color: heroImage ? "rgba(255,250,244,0.72)" : "var(--ink-faded)",
          }}
        >
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {isFoundedByYou ? "Your archive" : role}
          </span>
          {spanLabel && spanLabel !== "Dates are still gathering." && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.06em" }}>
                {spanLabel}
              </span>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: isPrimary ? 16 : 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: isPrimary ? 13 : 12,
              color: heroImage ? "rgba(255,250,244,0.92)" : "var(--moss)",
              transition: `color 300ms ${EASE}`,
            }}
          >
            Open archive
          </span>
          <span
            aria-hidden="true"
            style={{
              fontSize: isPrimary ? 16 : 14,
              color: heroImage ? "rgba(255,250,244,0.7)" : "var(--moss)",
              transform: active ? "translateX(3px)" : "none",
              transition: `transform 280ms ${EASE}`,
            }}
          >
            →
          </span>
        </div>
      </div>
    </a>
  );
}