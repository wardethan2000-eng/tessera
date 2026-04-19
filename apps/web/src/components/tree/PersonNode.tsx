"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PersonFlowNode } from "./treeTypes";

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
  } = data;

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

  const ringStyle: React.CSSProperties = isYou
    ? { border: "2px solid var(--moss)" }
    : isFocused
      ? { border: "1.5px dashed var(--ink)" }
      : { border: "1.5px solid var(--rule)" };

  return (
    <div
      style={{
        transition: "opacity 500ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        width: 96,
        userSelect: "none",
        opacity: isDimmed ? 0.24 : 1,
        filter: isDimmed ? "saturate(0.75)" : "none",
      }}
    >
      {/* Portrait circle */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: "var(--paper-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...ringStyle,
          transition:
            "box-shadow 150ms cubic-bezier(0.22, 0.61, 0.36, 1), border-color 500ms cubic-bezier(0.22, 0.61, 0.36, 1)",
          boxShadow: isFocused ? "0 0 0 4px rgba(212,190,159,0.28)" : "none",
        }}
      >
        {portraitUrl ? (
          <img
            src={portraitUrl}
            alt={name}
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

      {/* Name */}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          color: "var(--ink)",
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: 96,
          wordBreak: "break-word",
        }}
      >
        {name}
      </div>

      {/* Dates */}
      {dateLabel && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textAlign: "center",
          }}
        >
          {dateLabel}
        </div>
      )}

      {/* Essence line — only at higher zoom, shown via CSS class from parent */}
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
          }}
        >
          {essenceLine.slice(0, 40)}
        </div>
      )}

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export const PersonNode = memo(PersonNodeComponent);
