"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { CorkboardMemory, DetectedKind, PinPosition } from "./corkboardTypes";
import { getProxiedMediaUrl } from "@/lib/media-url";

interface CorkboardPinProps {
  pin: PinPosition;
  memory: CorkboardMemory;
  isExpanded: boolean;
  isCurrent: boolean;
  isVisited: boolean;
  isUnfocused: boolean;
  isContextual: boolean;
  isPlaying: boolean;
  onExpand: (id: string) => void;
  onContract: () => void;
  onSelect: (memoryId: string, pinId?: string, expand?: boolean) => void;
  reduceMotion: boolean;
  delay: number;
  visible: boolean;
  expandedWidth: number;
  expandedMinHeight: number;
  onMediaEnded?: () => void;
}

function formatKindLabel(kind: DetectedKind, memory: CorkboardMemory["memory"]): string {
  switch (kind) {
    case "image": return "Photo";
    case "video": return "Video";
    case "audio": return memory.kind === "voice" ? "Voice" : "Audio";
    case "link": return "Linked media";
    case "text":
    default: return memory.kind === "story" ? "Story" : "Memory";
  }
}

export const CorkboardPin = memo(function CorkboardPin({
  pin,
  memory,
  isExpanded,
  isCurrent,
  isVisited,
  isUnfocused,
  isContextual,
  isPlaying,
  onExpand,
  onContract,
  onSelect,
  reduceMotion,
  delay,
  visible,
  expandedWidth,
  expandedMinHeight,
  onMediaEnded,
}: CorkboardPinProps) {
  const rawMediaUrl = memory.primaryMedia?.mediaUrl ?? memory.memory.mediaUrl ?? null;
  const rawPreviewUrl = memory.primaryMedia?.linkedMediaPreviewUrl ?? rawMediaUrl;
  const resolvedMediaUrl = getProxiedMediaUrl(rawMediaUrl);
  const resolvedPreviewUrl = getProxiedMediaUrl(rawPreviewUrl);
  const kindLabel = formatKindLabel(memory.kind, memory.memory);
  const personName = memory.person.name;
  const dateText = memory.memory.dateOfEventText;
  const title = memory.memory.title;

  const kindClass = `corkboard-pin--${memory.kind}`;
  const visitedClass = isVisited && !isCurrent ? " corkboard-pin--visited" : "";
  const unfocusedClass = isUnfocused ? " corkboard-pin--unfocused" : "";
  const expandedClass = isExpanded ? " corkboard-pin--expanded" : "";
  const startClass = pin.isStartPin ? " corkboard-pin--start" : "";
  const currentClass = isCurrent ? " corkboard-pin--current" : "";
  const contextClass = isContextual ? " corkboard-pin--context" : "";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      onContract();
    } else if (isCurrent) {
      onExpand(pin.id);
    } else {
      onSelect(memory.id, pin.id, true);
    }
  };

  const targetOpacity = isExpanded ? 1 : isContextual ? 0.58 : isUnfocused ? 0.22 : 1;
  const targetScale = isExpanded ? 1 : isCurrent ? 1.25 : isContextual ? pin.scale * 1.06 : pin.scale;

  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && expandedRef.current) {
      const closeBtn = expandedRef.current.querySelector<HTMLElement>("[data-corkboard-close]");
      if (closeBtn) closeBtn.focus();
    }
  }, [isExpanded]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // React's `muted` JSX prop sets the attribute but doesn't reliably sync the
  // property — and browsers gate autoplay on the property, not the attribute.
  // Set it via the ref callback so it's true before the browser evaluates
  // autoplay; otherwise the play() promise rejects and the .catch() below
  // hides the failure.
  const setExpandedVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node) node.muted = true;
  }, []);

  const setPreviewVideoRef = useCallback((node: HTMLVideoElement | null) => {
    previewVideoRef.current = node;
    if (node) node.muted = true;
  }, []);

  useEffect(() => {
    if (isExpanded && isPlaying) {
      if (memory.kind === "video" && videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      if (memory.kind === "audio" && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
    if (!isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
    }
  }, [isExpanded, isPlaying, memory.kind]);

  useEffect(() => {
    if (memory.kind !== "video" || isExpanded || !previewVideoRef.current) return;
    const video = previewVideoRef.current;
    video.muted = true;
    video.play().catch(() => {});
  }, [isExpanded, memory.kind, resolvedMediaUrl]);

  const ariaLabel = `${kindLabel}: ${title} by ${personName}${dateText ? `, ${dateText}` : ""}`;

  return (
    <motion.div
      className={`corkboard-pin ${kindClass}${visitedClass}${unfocusedClass}${expandedClass}${startClass}${currentClass}${contextClass}`}
      style={{
        left: pin.x - (isExpanded ? expandedWidth : pin.width) / 2,
        top: pin.y - (isExpanded ? expandedMinHeight : pin.height) / 2,
        width: isExpanded ? expandedWidth : pin.width,
        minHeight: isExpanded ? expandedMinHeight : pin.height,
        height: isExpanded ? "auto" : pin.height,
        zIndex: isExpanded ? 50 : isCurrent ? 10 : undefined,
        transformOrigin: "center center",
      }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.5, y: 20, rotate: pin.rotation }}
      animate={{
        opacity: visible ? targetOpacity : 0,
        scale: visible ? targetScale : 0.5,
        y: visible ? 0 : 20,
        rotate: isExpanded ? 0 : pin.rotation,
      }}
      transition={{
        opacity: { duration: isExpanded ? 0.6 : 0.4, ease: [0.22, 0.61, 0.36, 1] },
        scale: { duration: isExpanded ? 0.6 : 0.4, ease: [0.22, 0.61, 0.36, 1] },
        rotate: { duration: isExpanded ? 0.6 : 0.4, ease: [0.22, 0.61, 0.36, 1] },
        y: { duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay: reduceMotion ? 0 : delay / 1000 },
      }}
      onClick={handleClick}
      role="button"
      tabIndex={isCurrent || isExpanded ? 0 : -1}
      aria-label={ariaLabel}
      aria-expanded={isExpanded}
    >
      <div className="corkboard-pin-content">
        {!isExpanded && (
          <>
            {memory.kind === "image" && resolvedPreviewUrl && (
              <div className="corkboard-pin-photo">
                <img src={resolvedPreviewUrl} alt={title} loading="lazy" decoding="async" />
              </div>
            )}
            {memory.kind === "video" && (resolvedMediaUrl || resolvedPreviewUrl) && (
              <div className="corkboard-pin-video-preview" aria-hidden="true">
                {resolvedMediaUrl ? (
                  <video
                    ref={setPreviewVideoRef}
                    src={resolvedMediaUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    onCanPlay={(e) => {
                      e.currentTarget.muted = true;
                      e.currentTarget.play().catch(() => {});
                    }}
                  />
                ) : (
                  resolvedPreviewUrl && <img src={resolvedPreviewUrl} alt="" loading="lazy" decoding="async" />
                )}
                <span className="corkboard-pin-video-play">&#9654;</span>
              </div>
            )}
            {memory.kind === "link" && resolvedPreviewUrl && (
              <div className="corkboard-pin-photo corkboard-pin-link-preview">
                <img src={resolvedPreviewUrl} alt={title} loading="lazy" decoding="async" />
              </div>
            )}
            {memory.kind === "audio" && (
              <div className="corkboard-pin-audio-icon" aria-hidden="true">
                <span>&#8776;</span>
              </div>
            )}
            <div className="corkboard-pin-title">{title}</div>
            {memory.kind === "text" && memory.memory.body && (
              <div className="corkboard-pin-snippet">
                {memory.memory.body.slice(0, 80)}{memory.memory.body.length > 80 ? "\u2026" : ""}
              </div>
            )}
            <div className="corkboard-pin-meta">
              {personName}{dateText ? ` \u00b7 ${dateText}` : ""}
            </div>
          </>
        )}

        {isExpanded && (
          <motion.div
            ref={expandedRef}
            className="corkboard-pin-expanded"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1] }}
            role="dialog"
            aria-label={title}
          >
            <button
              data-corkboard-close
              className="corkboard-pin-expanded-close"
              onClick={(e) => { e.stopPropagation(); onContract(); }}
              aria-label="Close expanded memory"
            >
              &times;
            </button>

            <div className="corkboard-pin-expanded-header">
              <span className="corkboard-pin-expanded-kind">{kindLabel}</span>
              {dateText && <span className="corkboard-pin-expanded-date">{dateText}</span>}
            </div>

            {memory.kind === "image" && resolvedPreviewUrl && (
              <div className="corkboard-pin-expanded-photo">
                <img src={resolvedPreviewUrl} alt={title} />
              </div>
            )}

            {memory.kind === "video" && resolvedMediaUrl && (
              <video
                ref={setExpandedVideoRef}
                src={resolvedMediaUrl}
                autoPlay
                playsInline
                muted
                controls
                preload="auto"
                onCanPlay={(e) => {
                  e.currentTarget.muted = true;
                  e.currentTarget.play().catch(() => {});
                }}
                onEnded={onMediaEnded}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="corkboard-pin-expanded-video"
              />
            )}

            {memory.kind === "video" && !resolvedMediaUrl && resolvedPreviewUrl && (
              <div className="corkboard-pin-expanded-photo">
                <img src={resolvedPreviewUrl} alt={title} />
              </div>
            )}

            {memory.kind === "audio" && resolvedMediaUrl && (
              <div className="corkboard-pin-expanded-audio">
                <div className={`corkboard-audio-orb${isPlaying ? " corkboard-audio-orb--playing" : ""}`}>
                  Listening
                </div>
                <audio
                  ref={audioRef}
                  src={resolvedMediaUrl}
                  autoPlay
                  controls={false}
                  onEnded={onMediaEnded}
                />
                {memory.memory.transcriptText && (
                  <p className="corkboard-pin-expanded-transcript">{memory.memory.transcriptText}</p>
                )}
              </div>
            )}

            {(memory.kind === "text" || memory.kind === "link") && memory.memory.body && (
              <p className="corkboard-pin-expanded-body">{memory.memory.body}</p>
            )}

            {memory.kind === "link" && resolvedPreviewUrl && (
              <div className="corkboard-pin-expanded-photo">
                <img src={resolvedPreviewUrl} alt={title} />
              </div>
            )}

            {memory.kind === "link" && memory.primaryMedia?.linkedMediaOpenUrl && (
              <a
                href={memory.primaryMedia.linkedMediaOpenUrl}
                target="_blank"
                rel="noreferrer"
                className="corkboard-pin-expanded-link"
                onClick={(e) => e.stopPropagation()}
              >
                {memory.primaryMedia.linkedMediaLabel || "Open in Drive \u2197"}
              </a>
            )}

            <div className="corkboard-pin-expanded-attribution">
              <span className="corkboard-pin-expanded-name">{personName}</span>
              <span className="corkboard-pin-expanded-title">{title}</span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
});
