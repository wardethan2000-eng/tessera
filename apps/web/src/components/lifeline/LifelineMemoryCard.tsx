"use client";

import Link from "next/link";
import { getProxiedMediaUrl } from "@/lib/media-url";
import { KIND_ICONS, KIND_LABELS, type LifelineMemory } from "./lifelineTypes";
import styles from "./lifeline.module.css";

interface LifelineMemoryCardProps {
  memory: LifelineMemory;
  treeId: string;
  personId: string;
}

export function LifelineMemoryCard({ memory, treeId, personId }: LifelineMemoryCardProps) {
  const href = `/trees/${treeId}/memories/${memory.id}?from=lifeline&personId=${personId}`;
  const isContextual = memory.memoryContext === "contextual";
  const mediaUrl = getProxiedMediaUrl(memory.mediaUrl);
  const isVideo = memory.mimeType?.startsWith("video/");

  if (memory.kind === "photo" && mediaUrl && !isVideo) {
    return (
      <Link href={href} className={styles.photoCard}>
        <div className={styles.photoMatte}>
          <img
            src={mediaUrl}
            alt={memory.title}
            className={styles.photoMatteImg}
            loading="lazy"
          />
        </div>
        <div className={styles.photoCardBody}>
          <div className={styles.cardMeta}>
            <span aria-hidden="true">{KIND_ICONS.photo}</span>
            <span className={styles.cardKind}>{KIND_LABELS.photo}</span>
            {memory.dateOfEventText && (
              <span className={styles.cardDate}>{memory.dateOfEventText}</span>
            )}
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>
            {memory.title}
          </span>
          {memory.place?.label && <p className={styles.cardPlace}>{memory.place.label}</p>}
          {isContextual && memory.memoryReasonLabel && (
            <span className={styles.contextBadge}>{memory.memoryReasonLabel}</span>
          )}
        </div>
      </Link>
    );
  }

  if (memory.kind === "voice" && mediaUrl) {
    return (
      <article className={`${styles.voiceCard} ${isContextual ? styles.memoryCardContextual : ""}`}>
        <Link href={href} className={styles.mediaCardLink}>
          <div className={styles.voiceHeader}>
            <div className={styles.voiceIcon}>
              <span aria-hidden="true">{KIND_ICONS.voice}</span>
            </div>
            <span className={styles.voiceTitle}>{memory.title}</span>
          </div>
        </Link>
        <audio src={mediaUrl} controls className={styles.audioPlayer} preload="none" onClick={(e) => e.stopPropagation()} />
        <Link href={href} className={styles.mediaCardLink}>
          {memory.body && <p className={styles.voiceExcerpt}>{memory.body}</p>}
          <div className={styles.cardMeta}>
            <span className={styles.cardKind}>{KIND_LABELS.voice}</span>
            {memory.dateOfEventText && (
              <span className={styles.cardDate}>{memory.dateOfEventText}</span>
            )}
          </div>
          {isContextual && memory.memoryReasonLabel && (
            <span className={styles.contextBadge}>{memory.memoryReasonLabel}</span>
          )}
        </Link>
      </article>
    );
  }

  if (memory.kind === "story") {
    return (
      <Link href={href} className={`${styles.storyCard} ${isContextual ? styles.memoryCardContextual : ""}`}>
        <div className={styles.cardMeta}>
          <span aria-hidden="true">{KIND_ICONS.story}</span>
          <span className={styles.cardKind}>{KIND_LABELS.story}</span>
          {memory.dateOfEventText && (
            <span className={styles.cardDate}>{memory.dateOfEventText}</span>
          )}
        </div>
        <h3 className={styles.storyTitle}>{memory.title}</h3>
        {memory.body && <p className={styles.storyBody}>{memory.body}</p>}
        {memory.place?.label && <p className={styles.cardPlace}>{memory.place.label}</p>}
        {isContextual && memory.memoryReasonLabel && (
          <span className={styles.contextBadge}>{memory.memoryReasonLabel}</span>
        )}
      </Link>
    );
  }

  if (memory.kind === "document" && mediaUrl) {
    return (
      <Link href={href} className={`${styles.documentCard} ${isContextual ? styles.memoryCardContextual : ""}`}>
        <img src={mediaUrl} alt={memory.title} className={styles.documentThumb} loading="lazy" />
        <div className={styles.documentBody}>
          <div className={styles.cardMeta}>
            <span aria-hidden="true">{KIND_ICONS.document}</span>
            <span className={styles.cardKind}>{KIND_LABELS.document}</span>
            {memory.dateOfEventText && (
              <span className={styles.cardDate}>{memory.dateOfEventText}</span>
            )}
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>
            {memory.title}
          </span>
          {isContextual && memory.memoryReasonLabel && (
            <span className={styles.contextBadge}>{memory.memoryReasonLabel}</span>
          )}
        </div>
      </Link>
    );
  }

  if (mediaUrl && isVideo) {
    return (
      <article className={`${styles.memoryCard} ${isContextual ? styles.memoryCardContextual : ""}`}>
        <video src={mediaUrl} className={styles.videoPlayer} controls preload="none" onClick={(e) => e.stopPropagation()} />
        <Link href={href} className={styles.mediaCardLink} style={{ padding: "10px 14px 12px", gap: 4 }}>
          <div className={styles.cardMeta}>
            <span aria-hidden="true">{KIND_ICONS[memory.kind]}</span>
            <span className={styles.cardKind}>{KIND_LABELS[memory.kind]}</span>
            {memory.dateOfEventText && (
              <span className={styles.cardDate}>{memory.dateOfEventText}</span>
            )}
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>
            {memory.title}
          </span>
          {isContextual && memory.memoryReasonLabel && (
            <span className={styles.contextBadge}>{memory.memoryReasonLabel}</span>
          )}
        </Link>
      </article>
    );
  }

  return (
    <Link href={href} className={`${styles.memoryCard} ${isContextual ? styles.memoryCardContextual : ""}`}>
      <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div className={styles.cardMeta}>
          <span aria-hidden="true">{KIND_ICONS[memory.kind]}</span>
          <span className={styles.cardKind}>{KIND_LABELS[memory.kind]}</span>
          {memory.dateOfEventText && (
            <span className={styles.cardDate}>{memory.dateOfEventText}</span>
          )}
        </div>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>
          {memory.title}
        </span>
        {memory.body && (
          <p className={styles.storyBody}>{memory.body}</p>
        )}
        {isContextual && memory.memoryReasonLabel && (
          <span className={styles.contextBadge}>{memory.memoryReasonLabel}</span>
        )}
      </div>
    </Link>
  );
}
