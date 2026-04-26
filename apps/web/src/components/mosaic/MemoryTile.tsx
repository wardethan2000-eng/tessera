"use client";

import { useState } from "react";
import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeMemory } from "@/components/home/homeTypes";
import { EASE, getHeroExcerpt } from "@/components/home/homeUtils";

interface MemoryTileProps {
  memory: TreeHomeMemory;
  treeName: string;
  href: string;
  weight: "feature" | "compact";
  index: number;
}

export function MemoryTile({
  memory,
  treeName,
  href,
  weight,
  index,
}: MemoryTileProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = hovered || focused;
  const imageUrl = getProxiedMediaUrl(memory.mediaUrl ?? memory.mediaItems?.[0]?.mediaUrl);
  const excerpt = getHeroExcerpt(memory);
  const hasImage = Boolean(imageUrl);
  const isFeature = weight === "feature";

  const colSpan = isFeature ? 5 : 4;
  const rowSpan = isFeature ? 4 : 3;

  return (
    <a
      href={href}
      aria-label={`${memory.title}${memory.kind !== "story" ? `, ${memory.kind}` : ""}${memory.personName ? `, ${memory.personName}` : ""}, from ${treeName}`}
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
        minHeight: isFeature ? 280 : 200,
        borderRadius: 14,
        border: active
          ? "1px solid rgba(168,93,93,0.34)"
          : "1px solid rgba(128,107,82,0.12)",
        background: hasImage
          ? "rgba(24,21,18,0.8)"
          : "linear-gradient(145deg, rgba(252,248,242,0.96) 0%, rgba(240,232,220,0.92) 100%)",
        boxShadow: active ? "0 18px 42px rgba(40,30,18,0.14)" : "0 4px 12px rgba(40,30,18,0.04)",
        color: hasImage ? "white" : "var(--ink)",
        textDecoration: "none",
        transform: active ? "translateY(-2px)" : "none",
        transition: `transform 380ms ${EASE}, box-shadow 380ms ${EASE}, border-color 380ms ${EASE}`,
        animation: `bloom 600ms ${EASE} ${80 + index * 60}ms both`,
      }}
    >
      {imageUrl && (
        <>
          <img
            src={imageUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "sepia(6%) saturate(0.88)",
              transform: active ? "scale(1.04)" : "scale(1)",
              transition: `transform 800ms ${EASE}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: isFeature
                ? "linear-gradient(to top, rgba(18,15,12,0.78) 0%, rgba(18,15,12,0.32) 38%, rgba(18,15,12,0.08) 68%, transparent 100%)"
                : "linear-gradient(to top, rgba(18,15,12,0.72) 0%, rgba(18,15,12,0.22) 45%, transparent 100%)",
            }}
          />
        </>
      )}

      {!imageUrl && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `
              linear-gradient(90deg, rgba(168,93,93,0.06) 0 1px, transparent 1px 100%),
              linear-gradient(180deg, rgba(78,93,66,0.06) 0 1px, transparent 1px 100%),
              linear-gradient(145deg, rgba(252,248,242,0.96) 0%, rgba(238,230,218,0.92) 100%)
            `,
            backgroundSize: "20px 20px, 20px 20px, auto",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
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
          padding: isFeature ? "clamp(16px, 2.5vw, 24px)" : "clamp(14px, 2vw, 18px)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: isFeature ? "clamp(20px, 2.5vw, 30px)" : "clamp(16px, 1.8vw, 22px)",
            lineHeight: 1.1,
            color: "inherit",
            maxWidth: isFeature ? "14ch" : "11ch",
          }}
        >
          {memory.title}
        </div>

        {(isFeature || active) && excerpt && (
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              lineHeight: 1.45,
              color: hasImage ? "rgba(255,250,244,0.78)" : "var(--ink-soft)",
              display: "-webkit-box",
              WebkitLineClamp: isFeature ? 3 : 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {excerpt}
          </div>
        )}

        <div
          style={{
            marginTop: isFeature ? 10 : 6,
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: hasImage ? "rgba(255,250,244,0.62)" : "var(--ink-faded)",
          }}
        >
          {memory.kind !== "story" && <span>{memory.kind}</span>}
          {memory.dateOfEventText && <span>{memory.dateOfEventText}</span>}
          {memory.personName && (
            <span style={{ textTransform: "none", letterSpacing: "0.02em" }}>
              {memory.personName}
            </span>
          )}
          <span style={{ textTransform: "none", letterSpacing: "0.02em" }}>
            {treeName}
          </span>
        </div>
      </div>
    </a>
  );
}