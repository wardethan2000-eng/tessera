"use client";

import type { PinPosition, ThreadConnection, ThreadType } from "./corkboardTypes";
import { getThreadPath } from "./CorkboardLayout";

interface CorkboardThreadProps {
  from: PinPosition;
  to: PinPosition;
  type: ThreadType;
  strength: number;
  isActive: boolean;
  visible: boolean;
}

const THREAD_COLORS: Record<ThreadType, string> = {
  temporal: "var(--ink-faded)",
  person: "var(--moss)",
  branch: "var(--rose)",
};

const THREAD_OPACITY: Record<ThreadType, number> = {
  temporal: 0.5,
  person: 0.35,
  branch: 0.3,
};

const THREAD_WIDTH: Record<ThreadType, number> = {
  temporal: 1.5,
  person: 1.2,
  branch: 1.0,
};

export function CorkboardThread({
  from,
  to,
  type,
  strength,
  isActive,
  visible,
}: CorkboardThreadProps) {
  if (!visible) return null;

  const pathD = getThreadPath(from, to, type);
  const color = THREAD_COLORS[type];
  const baseOpacity = THREAD_OPACITY[type] * strength;
  const baseWidth = THREAD_WIDTH[type];
  const width = isActive ? baseWidth + 1 : baseWidth;
  const opacity = isActive ? Math.min(1, baseOpacity + 0.4) : baseOpacity;

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
        className={isActive ? "corkboard-thread-path--active" : "corkboard-thread-path"}
      />
      <circle cx={from.x} cy={from.y} r={3} fill={color} opacity={opacity * 0.8} />
      <circle cx={to.x} cy={to.y} r={3} fill={color} opacity={opacity * 0.8} />
    </g>
  );
}

interface CorkboardThreadLayerProps {
  threads: ThreadConnection[];
  pins: PinPosition[];
  activeThreadId: string | null;
  visibility: { temporal: boolean; person: boolean; branch: boolean };
  width: number;
  height: number;
}

export function CorkboardThreadLayer({
  threads,
  pins,
  activeThreadId,
  visibility,
  width,
  height,
}: CorkboardThreadLayerProps) {
  const pinById = new Map(pins.map((p) => [p.memoryId, p]));

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
        if (!visibility[thread.type]) return null;
        return (
          <CorkboardThread
            key={thread.id}
            from={fromPin}
            to={toPin}
            type={thread.type}
            strength={thread.strength}
            isActive={thread.id === activeThreadId}
            visible={true}
          />
        );
      })}
    </svg>
  );
}