"use client";

import { useMemo } from "react";
import {
  computeLayout,
  getConstellationFocusIds,
  getFocusBoundsForIds,
} from "@/components/tree/treeLayout";
import type { ApiPerson, ApiRelationship } from "@/components/tree/treeTypes";

const NODE_W = 112;
const PORTRAIT_R = 32;

export function ConstellationPreview({
  people,
  relationships,
  focusPersonId,
  href,
}: {
  people: ApiPerson[];
  relationships: ApiRelationship[];
  focusPersonId: string | null;
  href: string;
}) {
  const { visiblePeople, visibleRelationships, positions, bounds, activeFocusId } = useMemo(() => {
    const fallbackFocusId = focusPersonId ?? people[0]?.id ?? null;
    const focusedIds = fallbackFocusId
      ? getConstellationFocusIds(fallbackFocusId, relationships) ?? new Set([fallbackFocusId])
      : null;
    const selectedIds =
      focusedIds && focusedIds.size > 0
        ? focusedIds
        : new Set(people.slice(0, 10).map((person) => person.id));

    const focusedPeople = people.filter((person) => selectedIds.has(person.id));
    const focusedRelationships = relationships.filter(
      (relationship) =>
        selectedIds.has(relationship.fromPersonId) && selectedIds.has(relationship.toPersonId),
    );
    const nextPositions = computeLayout(focusedPeople, focusedRelationships);
    const nextBounds = getFocusBoundsForIds(selectedIds, nextPositions);

    return {
      visiblePeople: focusedPeople,
      visibleRelationships: focusedRelationships,
      positions: nextPositions,
      bounds: nextBounds,
      activeFocusId: fallbackFocusId,
    };
  }, [focusPersonId, people, relationships]);

  if (!bounds || visiblePeople.length === 0) return null;

  return (
    <section style={{ padding: "28px max(24px, 5vw) 0" }}>
      <div
        style={{
          marginBottom: 14,
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
          Family shape
        </h2>
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          A focused preview of the constellation around {labelForFocus(activeFocusId, visiblePeople)}.
        </span>
        <div style={{ flex: 1 }} />
        <a
          href={href}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--moss)",
            textDecoration: "none",
          }}
        >
          Open full constellation →
        </a>
      </div>

      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 16,
          overflow: "hidden",
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6), transparent 32%), linear-gradient(180deg, #f7f2e9 0%, #efe7da 100%)",
        }}
      >
        <svg
          viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
          style={{
            display: "block",
            width: "100%",
            height: "clamp(260px, 38vw, 420px)",
          }}
          role="img"
          aria-label="Constellation preview"
        >
          {visibleRelationships.map((relationship) => {
            const from = centerFor(relationship.fromPersonId, positions);
            const to = centerFor(relationship.toPersonId, positions);
            if (!from || !to) return null;
            return (
              <line
                key={relationship.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={strokeForRelationship(relationship.type)}
                strokeWidth={relationship.type === "parent_child" ? 2 : 1.5}
                strokeDasharray={
                  relationship.type === "sibling"
                    ? "4 5"
                    : relationship.type === "spouse"
                      ? "6 4"
                      : undefined
                }
                opacity={0.7}
              />
            );
          })}

          {visiblePeople.map((person) => {
            const position = positions.get(person.id);
            if (!position) return null;
            const cx = position.x + NODE_W / 2;
            const cy = position.y + 44;
            const isFocus = person.id === activeFocusId;
            return (
              <g key={person.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={PORTRAIT_R + (isFocus ? 5 : 0)}
                  fill={isFocus ? "rgba(78,93,66,0.12)" : "rgba(255,255,255,0.72)"}
                  stroke={isFocus ? "var(--moss)" : "rgba(130,116,96,0.55)"}
                  strokeWidth={isFocus ? 2.25 : 1.25}
                />
                <text
                  x={cx}
                  y={cy + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    fill: "var(--ink)",
                  }}
                >
                  {person.name.charAt(0)}
                </text>
                <text
                  x={cx}
                  y={position.y + 98}
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                    fill: "var(--ink)",
                  }}
                >
                  {truncateLabel(person.name)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function centerFor(personId: string, positions: Map<string, { x: number; y: number }>) {
  const position = positions.get(personId);
  if (!position) return null;
  return {
    x: position.x + NODE_W / 2,
    y: position.y + 44,
  };
}

function strokeForRelationship(type: ApiRelationship["type"]) {
  if (type === "parent_child") return "rgba(98,82,58,0.72)";
  if (type === "spouse") return "rgba(78,93,66,0.72)";
  return "rgba(133,118,96,0.62)";
}

function truncateLabel(name: string) {
  const first = name.split(" ")[0] ?? name;
  return first.length > 12 ? `${first.slice(0, 11)}…` : first;
}

function labelForFocus(focusPersonId: string | null, people: ApiPerson[]) {
  if (!focusPersonId) return "the archive";
  return people.find((person) => person.id === focusPersonId)?.name ?? "this branch";
}
