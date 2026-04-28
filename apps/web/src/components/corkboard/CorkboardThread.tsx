"use client";

import type { PinPosition, ThreadConnection, ThreadType } from "./corkboardTypes";
import { getThreadPath } from "./CorkboardLayout";

interface CorkboardThreadProps {
  from: PinPosition;
  to: PinPosition;
  isActive: boolean;
  visible: boolean;
  onThreadClick?: (thread: ThreadConnection) => void;
  thread: ThreadConnection;
  currentMemId?: string | null;
}

const THREAD_COLOR = "rgba(232, 224, 208, 0.35)";
const THREAD_WIDTH = 0.6;
const THREAD_OPACITY = 0.14;
const THREAD_ACTIVE_OPACITY = 0.28;
const THREAD_ACTIVE_WIDTH = 1.0;
const THREAD_CONNECTED_OPACITY = 0.2;

export function CorkboardThread({
  from,
  to,
  isActive,
  visible,
  onThreadClick,
  thread,
  currentMemId,
}: CorkboardThreadProps) {
  if (!visible) return null;

  const pathD = getThreadPath(from, to, "temporal");
  const isConnectedToCurrent =
    currentMemId != null && (thread.from === currentMemId || thread.to === currentMemId);
  const opacity = isActive ? THREAD_ACTIVE_OPACITY : isConnectedToCurrent ? THREAD_CONNECTED_OPACITY : THREAD_OPACITY;
  const width = isActive ? THREAD_ACTIVE_WIDTH : THREAD_WIDTH;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onThreadClick?.(thread);
  };

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        strokeLinecap="round"
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onClick={handleClick}
      />
      <path
        d={pathD}
        fill="none"
        stroke={THREAD_COLOR}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
        className={isActive ? "corkboard-thread-path--active" : "corkboard-thread-path"}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

interface CorkboardThreadLayerProps {
  threads: ThreadConnection[];
  pins: PinPosition[];
  activeThreadId: string | null;
  activeRoute?: { from: string; to: string } | null;
  visibility: { temporal: boolean; person: boolean; branch: boolean; era: boolean; place: boolean };
  width: number;
  height: number;
  onThreadClick?: (thread: ThreadConnection) => void;
  currentMemId: string | null;
}

const VISIBILITY_MAP: Record<ThreadType, keyof CorkboardThreadLayerProps["visibility"]> = {
  temporal: "temporal",
  person: "person",
  branch: "branch",
  era: "era",
  "co-subject": "person",
  place: "place",
};

export function CorkboardThreadLayer({
  threads,
  pins,
  activeThreadId,
  activeRoute,
  visibility,
  width,
  height,
  onThreadClick,
  currentMemId,
}: CorkboardThreadLayerProps) {
  const pinById = new Map(pins.map((p) => [p.memoryId, p]));
  const renderedPairs = new Set<string>();
  const pairKey = (from: string, to: string) => [from, to].sort().join("|");

  return (
    <svg
      className="corkboard-thread-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      {threads.map((thread) => {
        const fromPin = pinById.get(thread.from);
        const toPin = pinById.get(thread.to);
        if (!fromPin || !toPin) return null;
        const visKey = VISIBILITY_MAP[thread.type];
        if (!visKey || !visibility[visKey]) return null;
        renderedPairs.add(pairKey(thread.from, thread.to));

        return (
          <CorkboardThread
            key={thread.id}
            from={fromPin}
            to={toPin}
            isActive={thread.id === activeThreadId}
            visible
            onThreadClick={onThreadClick}
            thread={thread}
            currentMemId={currentMemId}
          />
        );
      })}
      {activeRoute &&
        !renderedPairs.has(pairKey(activeRoute.from, activeRoute.to)) &&
        (() => {
          const fromPin = pinById.get(activeRoute.from);
          const toPin = pinById.get(activeRoute.to);
          if (!fromPin || !toPin) return null;
          const syntheticThread: ThreadConnection = {
            id: "active-route",
            from: activeRoute.from,
            to: activeRoute.to,
            type: "temporal",
            strength: 1,
          };
          return (
            <CorkboardThread
              from={fromPin}
              to={toPin}
              isActive
              visible
              onThreadClick={onThreadClick}
              thread={syntheticThread}
              currentMemId={currentMemId}
            />
          );
        })()}
    </svg>
  );
}
