"use client";

import { memo, useMemo } from "react";
import { Handle, Position, useViewport, type NodeProps } from "@xyflow/react";
import type { PersonFlowNode } from "./treeTypes";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";
import { NODE_HEIGHT, NODE_WIDTH, PORTRAIT_SIZE } from "./treeLayout";

type ZoomLevel = "very-low" | "low" | "medium" | "high";

function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.3) return "very-low";
  if (zoom < 0.6) return "low";
  if (zoom < 1.0) return "medium";
  return "high";
}

function PersonNodeComponent({ data }: NodeProps<PersonFlowNode>) {
  const {
    name,
    birthYear,
    deathYear,
    portraitUrl,
    essenceLine,
    isYou,
    isFocused,
    isDimmed,
    decadeRelevance,
  } = data;

  const viewport = useViewport();
  const zoomLevel = useMemo(() => getZoomLevel(Math.round(viewport.zoom * 10) / 10), [viewport.zoom]);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const dateLabel =
    birthYear && deathYear
      ? `${birthYear} – ${deathYear}`
      : birthYear
        ? `${birthYear} –`
        : null;

  const decadeScale = decadeRelevance != null ? 0.8 + 0.2 * decadeRelevance : 1;
  const decadeOpacity = decadeRelevance != null ? 0.25 + 0.75 * decadeRelevance : 1;
  const combinedOpacity = isDimmed ? 0.24 : decadeOpacity;
  const dimBlur = isDimmed
    ? zoomLevel === "very-low" ? "" : zoomLevel === "low" ? "blur(0.8px)" : "blur(1.5px)"
    : "";
  const dimFilter = isDimmed ? `saturate(0.75) ${dimBlur}`.trim() : "none";

  const ringStyle: React.CSSProperties = isYou
    ? { border: "2px solid var(--moss)" }
    : isFocused
      ? { border: "1.5px dashed var(--ink)" }
      : { border: "1.5px solid var(--rule)" };

  const resolvedPortraitUrl = getProxiedMediaUrl(portraitUrl);

  if (zoomLevel === "very-low") {
    return (
      <div
        style={{
          position: "relative",
          transition: "opacity var(--duration-focus) var(--ease-tessera), transform var(--duration-camera) var(--ease-tessera)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          width: 48,
          userSelect: "none",
          opacity: combinedOpacity,
          filter: dimFilter,
          transform: `scale(${decadeScale})`,
          transformOrigin: "center top",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: isFocused
              ? "var(--ink)"
              : isYou
                ? "var(--moss)"
                : "var(--rule)",
            boxShadow: isDimmed
              ? "none"
              : isYou
                ? "0 0 8px rgba(78,93,66,0.5)"
                : isFocused
                  ? "0 0 10px rgba(28,25,21,0.35)"
                  : "0 0 6px rgba(212,190,159,0.4)",
            transition: "box-shadow var(--duration-micro) var(--ease-tessera), background var(--duration-focus) var(--ease-tessera)",
          }}
        />
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 8,
            color: isDimmed ? "var(--ink-faded)" : "var(--ink)",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 64,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name.split(" ")[0]}
        </div>
        <Handle type="target" position={Position.Top} style={{ opacity: 0, top: 0, bottom: "auto" }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: 0, top: "auto" }} />
      </div>
    );
  }

  if (zoomLevel === "low") {
    return (
      <div
        style={{
          position: "relative",
          transition: "opacity var(--duration-focus) var(--ease-tessera), transform var(--duration-camera) var(--ease-tessera)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          width: 74,
          userSelect: "none",
          opacity: combinedOpacity,
          filter: dimFilter,
          transform: `scale(${decadeScale})`,
          transformOrigin: "center top",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: "var(--paper-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...ringStyle,
            boxShadow: isDimmed
              ? "none"
              : isYou
                ? "0 0 10px rgba(78,93,66,0.5)"
                : isFocused
                  ? "0 0 12px rgba(28,25,21,0.25)"
                  : "0 0 8px rgba(212,190,159,0.35)",
            transition: "box-shadow var(--duration-micro) var(--ease-tessera), border-color var(--duration-focus) var(--ease-tessera)",
          }}
        >
          {resolvedPortraitUrl ? (
            <img
              src={resolvedPortraitUrl}
              alt={name}
              onError={handleMediaError}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                color: "var(--ink-faded)",
                fontWeight: 400,
              }}
            >
              {initials}
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            color: "var(--ink)",
            textAlign: "center",
            lineHeight: 1.25,
            maxWidth: 74,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <Handle type="target" position={Position.Top} style={{ opacity: 0, top: 0, bottom: "auto" }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, bottom: 0, top: "auto" }} />
      </div>
    );
  }

  const showEssence = zoomLevel === "high" && essenceLine;

  return (
    <div
      style={{
        position: "relative",
        transition: "opacity var(--duration-focus) var(--ease-tessera), transform var(--duration-camera) var(--ease-tessera)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        userSelect: "none",
        opacity: combinedOpacity,
        filter: dimFilter,
        transform: `scale(${decadeScale})`,
        transformOrigin: "center top",
      }}
    >
      <div
        style={{
          width: PORTRAIT_SIZE,
          height: PORTRAIT_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: "var(--paper-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...ringStyle,
          transition:
            "box-shadow var(--duration-micro) var(--ease-tessera), border-color var(--duration-focus) var(--ease-tessera)",
          boxShadow: isFocused
            ? "0 0 0 4px rgba(212,190,159,0.28), 0 0 14px rgba(212,190,159,0.3)"
            : isYou
              ? "0 0 10px rgba(78,93,66,0.45)"
              : "0 0 8px rgba(212,190,159,0.25)",
        }}
      >
        {resolvedPortraitUrl ? (
          <img
            src={resolvedPortraitUrl}
            alt={name}
            onError={handleMediaError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              color: "var(--ink-faded)",
              fontWeight: 400,
            }}
          >
            {initials}
          </span>
        )}
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          color: "var(--ink)",
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: NODE_WIDTH,
          minHeight: 34,
          wordBreak: "break-word",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden",
        }}
      >
        {name}
      </div>

      {dateLabel && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textAlign: "center",
            minHeight: 14,
          }}
        >
          {dateLabel}
        </div>
      )}

      {essenceLine && (
        <div
          className="essence-line"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            fontStyle: "italic",
            color: "var(--ink-faded)",
            textAlign: "center",
            maxWidth: 88,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minHeight: 12,
            opacity: showEssence ? 1 : 0,
            transition: "opacity var(--duration-focus) var(--ease-tessera)",
            height: showEssence ? undefined : 0,
          }}
        >
          {essenceLine.slice(0, 40)}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, top: 0, bottom: "auto" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, bottom: 0, top: "auto" }}
      />
    </div>
  );
}

export const PersonNode = memo(PersonNodeComponent);