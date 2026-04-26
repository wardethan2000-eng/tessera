"use client";

import { type ReactNode } from "react";
import { EASE } from "@/components/home/homeUtils";

export function MosaicSurface({ children }: { children: ReactNode }) {
  return (
    <div className="mosaic-surface">
      {children}
    </div>
  );
}

interface MosaicTileProps {
  children: ReactNode;
  colSpan?: number;
  rowSpan?: number;
  href?: string;
  accent?: "moss" | "rose" | "gilt" | "ink-soft" | null;
  onHover?: (hovered: boolean) => void;
  onFocus?: (focused: boolean) => void;
  staggerIndex?: number;
  as?: "article" | "div" | "a";
}

const ACCENT_MAP: Record<string, { rest: string; hover: string }> = {
  moss: { rest: "rgba(78,93,66,0.18)", hover: "rgba(78,93,66,0.38)" },
  rose: { rest: "rgba(168,93,93,0.16)", hover: "rgba(168,93,93,0.36)" },
  gilt: { rest: "rgba(176,139,62,0.18)", hover: "rgba(176,139,62,0.4)" },
  "ink-soft": { rest: "rgba(64,58,46,0.14)", hover: "rgba(64,58,46,0.34)" },
};

export function MosaicTile({
  children,
  colSpan = 3,
  rowSpan = 3,
  href,
  accent,
  onHover,
  onFocus,
  staggerIndex = 0,
}: MosaicTileProps) {
  const accentStyles = accent ? ACCENT_MAP[accent] : null;

  const style: React.CSSProperties = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${rowSpan}`,
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    border: `1px solid ${accentStyles?.rest ?? "rgba(128,107,82,0.12)"}`,
    background: accentStyles
      ? `linear-gradient(135deg, ${accentStyles.rest} 0%, rgba(246,241,231,0.92) 100%)`
      : "linear-gradient(180deg, rgba(249,245,238,0.96) 0%, rgba(237,230,218,0.92) 100%)",
    transition: `transform 360ms ${EASE}, box-shadow 360ms ${EASE}, border-color 360ms ${EASE}`,
    animation: `bloom 640ms ${EASE} ${staggerIndex * 70}ms both`,
    minHeight: rowSpan * 64,
  };

  return (
    <a
      href={href}
      className="mosaic-tile-link"
      style={style}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 18px 44px rgba(40,30,18,0.14)";
        if (accentStyles) e.currentTarget.style.borderColor = accentStyles.hover;
        onHover?.(true);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(40,30,18,0.04)";
        if (accentStyles) e.currentTarget.style.borderColor = accentStyles.rest;
        onHover?.(false);
      }}
      onFocusCapture={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 18px 44px rgba(40,30,18,0.14)";
        onFocus?.(true);
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(40,30,18,0.04)";
          onFocus?.(false);
        }
      }}
    >
      {children}
    </a>
  );
}