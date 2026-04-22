"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

interface DecadeRailProps {
  decades: number[];
  activeDecade: number | null;
  onSelectDecade: (decade: number | null) => void;
}

export function DecadeRail({
  decades,
  activeDecade,
  onSelectDecade,
}: DecadeRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [hoveredDecade, setHoveredDecade] = useState<number | null>(null);
  const scrollAccumulator = useRef(0);
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      scrollAccumulator.current += e.deltaY;

      const friction = 80;
      if (Math.abs(scrollAccumulator.current) >= friction) {
        const direction = scrollAccumulator.current > 0 ? 1 : -1;
        scrollAccumulator.current = 0;

        if (activeDecade === null) {
          const startDecade = direction === 1 ? decades[0] : decades[decades.length - 1];
          if (startDecade != null) onSelectDecade(startDecade);
          return;
        }

        const currentIndex = decades.indexOf(activeDecade);
        if (currentIndex === -1) return;

        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < decades.length) {
          onSelectDecade(decades[newIndex]!);
        }
      }

      if (wheelTimeout.current) clearTimeout(wheelTimeout.current);
      wheelTimeout.current = setTimeout(() => {
        scrollAccumulator.current = 0;
      }, 300);
    },
    [activeDecade, decades, onSelectDecade],
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      rail.removeEventListener("wheel", handleWheel);
      if (wheelTimeout.current) clearTimeout(wheelTimeout.current);
    };
  }, [handleWheel]);

  if (decades.length === 0) return null;

  return (
    <div
      ref={railRef}
      style={{
        position: "absolute",
        left: 20,
        top: 72,
        bottom: 80,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          height: "100%",
          justifyContent: "space-evenly",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 8,
            bottom: 8,
            width: 1,
            background: "var(--rule)",
            transform: "translateX(-50%)",
            opacity: activeDecade !== null ? 0.4 : 0.2,
            transition: `opacity 400ms ${EASE}`,
          }}
        />

        {decades.map((decade) => {
          const isActive = decade === activeDecade;
          const isHovered = decade === hoveredDecade;
          const distance = activeDecade !== null
            ? Math.abs(decades.indexOf(decade) - decades.indexOf(activeDecade))
            : 0;

          let fontSize: number;
          let fontWeight: number;
          let fontFamily: string;
          let opacity: number;
          let color: string;
          let letterSpacing = 0;

          if (isActive) {
            fontSize = 18;
            fontWeight = 500;
            fontFamily = "var(--font-display)";
            opacity = 1;
            color = "var(--moss)";
            letterSpacing = 0.04;
          } else if (isHovered) {
            fontSize = 15;
            fontWeight = 400;
            fontFamily = "var(--font-display)";
            opacity = 1;
            color = "var(--ink)";
            letterSpacing = 0.02;
          } else if (activeDecade === null) {
            fontSize = 12;
            fontWeight = 400;
            fontFamily = "var(--font-ui)";
            opacity = 0.45;
            color = "var(--ink-faded)";
          } else if (distance === 1) {
            fontSize = 14;
            fontWeight = 400;
            fontFamily = "var(--font-display)";
            opacity = 0.65;
            color = "var(--ink-soft)";
          } else if (distance === 2) {
            fontSize = 12;
            fontWeight = 400;
            fontFamily = "var(--font-ui)";
            opacity = 0.4;
            color = "var(--ink-faded)";
          } else {
            fontSize = 11;
            fontWeight = 400;
            fontFamily = "var(--font-ui)";
            opacity = Math.max(0.2, 0.5 - distance * 0.04);
            color = "var(--ink-faded)";
          }

          return (
            <button
              key={decade}
              type="button"
              onClick={() => {
                onSelectDecade(activeDecade === decade ? null : decade);
              }}
              onMouseEnter={() => setHoveredDecade(decade)}
              onMouseLeave={() => setHoveredDecade(null)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontFamily,
                fontSize,
                fontWeight,
                color,
                letterSpacing,
                opacity,
                transition: `all 400ms ${EASE}`,
                position: "relative",
                zIndex: isActive ? 2 : 1,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    left: -14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--moss)",
                    transition: `opacity 300ms ${EASE}`,
                  }}
                />
              )}
              {decade}s
            </button>
          );
        })}

        {activeDecade !== null && (
          <button
            type="button"
            onClick={() => onSelectDecade(null)}
            onMouseEnter={() => setHoveredDecade(null)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 9,
              color: "var(--ink-faded)",
              opacity: 0.35,
              letterSpacing: 0.06,
              textTransform: "uppercase",
              transition: `all 250ms ${EASE}`,
              marginTop: 4,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = "0.7";
              e.currentTarget.style.color = "var(--moss)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = "0.35";
              e.currentTarget.style.color = "var(--ink-faded)";
            }}
          >
            All
          </button>
        )}
      </div>
    </div>
  );
}