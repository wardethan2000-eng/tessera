"use client";

interface NewArchiveTileProps {
  onClick: () => void;
  stagger?: number;
}

export function NewArchiveTile({ onClick, stagger = 0 }: NewArchiveTileProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Start a new archive"
      className="mosaic-piece mosaic-piece--new"
      style={{ "--mosaic-i": stagger } as React.CSSProperties}
    >
      <span className="mosaic-piece__new-plus">+</span>
      <span className="mosaic-piece__new-label">New archive</span>
    </button>
  );
}