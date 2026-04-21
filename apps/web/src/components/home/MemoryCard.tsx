"use client";

import { useState } from "react";
import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeMemory } from "./homeTypes";
import { EASE, getVoiceTranscriptLabel } from "./homeUtils";

export function MemoryCard({
  memory,
  onClick,
  extraControls,
}: {
  memory: TreeHomeMemory;
  onClick: () => void;
  extraControls?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const resolvedMediaUrl = getProxiedMediaUrl(memory.mediaUrl);

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 14,
        padding: 0,
        textAlign: "left",
        flexShrink: 0,
        width: "min(240px, calc(100vw - 72px))",
        overflow: "hidden",
        boxShadow: hovered
          ? "0 10px 28px rgba(28,25,21,0.12)"
          : "0 3px 10px rgba(28,25,21,0.06)",
        transform: hovered ? "translateY(-3px)" : "none",
        transition: `box-shadow 200ms ${EASE}, transform 200ms ${EASE}`,
        scrollSnapAlign: "start",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          width: "100%",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {memory.kind === "photo" && resolvedMediaUrl ? (
          <div style={{ height: "clamp(126px, 18vw, 156px)", overflow: "hidden", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedMediaUrl}
              alt={memory.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ) : (
          <div
            style={{
              height: "clamp(126px, 18vw, 156px)",
              background:
                "radial-gradient(circle at 18% 24%, rgba(201,161,92,0.14), transparent 30%), linear-gradient(180deg, rgba(244,237,226,1) 0%, rgba(236,229,216,1) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 36,
                color: "var(--rule)",
              }}
            >
              {memory.kind === "story" ? "✦" : memory.kind === "voice" ? "◉" : "▤"}
            </div>
          </div>
        )}
        <div style={{ padding: "12px 14px 14px" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              color: "var(--ink)",
              lineHeight: 1.3,
              marginBottom: 4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {memory.title}
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--ink-faded)",
            }}
          >
            {memory.personName ?? ""}
            {memory.personName && memory.dateOfEventText ? " · " : ""}
            {memory.dateOfEventText ?? ""}
          </div>
          {memory.kind === "voice" && (
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-body)",
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--ink-faded)",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {getVoiceTranscriptLabel(memory)}
            </div>
          )}
        </div>
      </button>
      {extraControls && <div style={{ padding: "0 12px 12px" }}>{extraControls}</div>}
    </article>
  );
}
