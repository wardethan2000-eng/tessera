"use client";

import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeMemory } from "@/components/home/homeTypes";
import { getHeroExcerpt } from "@/components/home/homeUtils";

interface MemoryTileProps {
  memory: TreeHomeMemory;
  treeName: string;
  href: string;
  weight: "feature" | "compact";
  index: number;
  stagger?: number;
}

export function MemoryTile({
  memory,
  treeName,
  href,
  weight,
  stagger = 0,
}: MemoryTileProps) {
  const imageUrl = getProxiedMediaUrl(memory.mediaUrl ?? memory.mediaItems?.[0]?.mediaUrl);
  const excerpt = getHeroExcerpt(memory);
  const isFeature = weight === "feature";

  return (
    <a
      href={href}
      aria-label={`${memory.title}${memory.kind !== "story" ? `, ${memory.kind}` : ""}. ${treeName}.`}
      className={`mosaic-piece mosaic-piece--memory ${isFeature ? "mosaic-piece--feature" : "mosaic-piece--compact"}`}
      style={{ "--mosaic-i": stagger } as React.CSSProperties}
    >
      {imageUrl && (
        <div className="mosaic-piece__img-wrap">
          <img src={imageUrl} alt="" className="mosaic-piece__img" />
          <div className="mosaic-piece__scrim mosaic-piece__scrim--medium" />
        </div>
      )}

      {!imageUrl && (
        <div className="mosaic-piece__texture" />
      )}

      <div className="mosaic-piece__body">
        <h3 className="mosaic-piece__title">{memory.title}</h3>
        {isFeature && excerpt && (
          <p className="mosaic-piece__excerpt">{excerpt}</p>
        )}
        <p className="mosaic-piece__meta">
          {memory.kind !== "story" && <>{memory.kind} · </>}
          {memory.dateOfEventText && <>{memory.dateOfEventText} · </>}
          {treeName}
        </p>
      </div>
    </a>
  );
}