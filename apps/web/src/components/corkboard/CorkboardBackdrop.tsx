"use client";

export function CorkboardBackdrop({ width, height, isRemembrance }: { width: number; height: number; isRemembrance: boolean }) {
  return (
    <div
      className={`corkboard-backdrop${isRemembrance ? " corkboard-backdrop--remembrance" : ""}`}
      style={{ width, height }}
    />
  );
}