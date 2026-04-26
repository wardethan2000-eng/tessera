"use client";

import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeCoverage, TreeHomeMemory, TreeHomeStats } from "@/components/home/homeTypes";
import { getCoverageRangeLabel } from "@/components/home/homeUtils";

interface ArchiveTileProps {
  treeName: string;
  role: string;
  stats: TreeHomeStats;
  coverage: TreeHomeCoverage;
  heroMemory: TreeHomeMemory | null;
  isFoundedByYou: boolean;
  isPrimary: boolean;
  isSparse: boolean;
  href: string;
  stagger?: number;
}

export function ArchiveTile({
  treeName,
  stats,
  coverage,
  heroMemory,
  isFoundedByYou,
  isPrimary,
  isSparse,
  href,
  stagger = 0,
}: ArchiveTileProps) {
  const heroImage = getProxiedMediaUrl(heroMemory?.mediaUrl);
  const spanLabel = getCoverageRangeLabel(coverage);

  return (
    <a
      href={href}
      aria-label={`Archive: ${treeName}. ${stats.peopleCount} people, ${stats.memoryCount} memories.`}
      className={`mosaic-piece mosaic-piece--archive ${isPrimary ? "mosaic-piece--primary" : "mosaic-piece--secondary"}`}
      style={{ "--mosaic-i": stagger } as React.CSSProperties}
    >
      {heroImage && (
        <div className="mosaic-piece__img-wrap">
          <img
            src={heroImage}
            alt=""
            className="mosaic-piece__img"
          />
          <div className={`mosaic-piece__scrim ${isPrimary ? "mosaic-piece__scrim--deep" : "mosaic-piece__scrim--shallow"}`} />
        </div>
      )}

      {!heroImage && (
        <div className="mosaic-piece__texture" />
      )}

      <div className="mosaic-piece__body">
        {isSparse && !heroImage && (
          <p className="mosaic-piece__hint">Just beginning — add a memory to bring it to life.</p>
        )}

        <h2 className="mosaic-piece__name">{treeName}</h2>

        <p className="mosaic-piece__meta">
          {isFoundedByYou ? "Your archive" : ""}
          {isFoundedByYou && spanLabel && spanLabel !== "Dates are still gathering." ? " · " : ""}
          {spanLabel && spanLabel !== "Dates are still gathering." ? spanLabel : ""}
        </p>

        <span className="mosaic-piece__cta">Open archive →</span>
      </div>
    </a>
  );
}