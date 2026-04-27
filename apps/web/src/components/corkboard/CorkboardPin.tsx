"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { CorkboardMemory, DetectedKind, PinPosition } from "./corkboardTypes";
import { getProxiedMediaUrl } from "@/lib/media-url";

interface CorkboardPinProps {
  pin: PinPosition;
  memory: CorkboardMemory;
  isExpanded: boolean;
  isVisited: boolean;
  isUnfocused: boolean;
  isAdjacent: boolean;
  isPlaying: boolean;
  onExpand: (id: string) => void;
  onContract: () => void;
  reduceMotion: boolean;
  delay: number;
  visible: boolean;
  cameraX: number;
  cameraY: number;
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
  isVisited,
  isUnfocused,
  isAdjacent,
  isPlaying,
  onExpand,
  onContract,
  reduceMotion,
  delay,
  visible,
  cameraX,
  cameraY,
  onMediaEnded,
}: CorkboardPinProps) {
  const resolvedMediaUrl = getProxiedMediaUrl(memory.primaryMedia?.mediaUrl ?? null);
  const kindLabel = formatKindLabel(memory.kind, memory.memory);
  const personName = memory.person.name;
  const dateText = memory.memory.dateOfEventText;
  const title = memory.memory.title;

  const kindClass = `corkboard-pin--${memory.kind}`;
  const visitedClass = isVisited ? " corkboard-pin--visited" : "";
  const unfocusedClass = isUnfocused ? " corkboard-pin--unfocused" : "";
  const adjacentClass = isAdjacent ? " corkboard-pin--adjacent" : "";
  const expandedClass = isExpanded ? " corkboard-pin--expanded" : "";
  const startClass = pin.isStartPin ? " corkboard-pin--start" : "";
  const currentClass = (!isUnfocused && !isExpanded && isVisited) ? " corkboard-pin--current" : "";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      onContract();
    } else {
      onExpand(pin.id);
    }
  };

  const targetOpacity = isExpanded ? 1 : isUnfocused ? (isAdjacent ? 0.7 : 0.4) : isVisited ? 0.85 : 1;
  const targetScale = isExpanded ? 1.4 : pin.scale;

  const parallaxBoost = reduceMotion || isExpanded || isUnfocused
    ? 0
    : (() => {
        const dx = pin.x - cameraX;
        const dy = pin.y - cameraY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return Math.max(0, 0.02 * (1 - Math.min(1, dist / 800)));
      })();

  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && expandedRef.current) {
      const closeBtn = expandedRef.current.querySelector<HTMLElement>("[data-corkboard-close]");
      if (closeBtn) closeBtn.focus();
    }
  }, [isExpanded]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (isExpanded && isPlaying) {
      if (memory.kind === "video" && videoRef.current) {
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

  const ariaLabel = `${kindLabel}: ${title} by ${personName}${dateText ? `, ${dateText}` : ""}`;

  return (
    <motion.div
      className={`corkboard-pin ${kindClass}${visitedClass}${unfocusedClass}${adjacentClass}${expandedClass}${startClass}${currentClass}`}
      style={{
        left: pin.x - pin.width / 2,
        top: pin.y - pin.height / 2,
        width: isExpanded ? 480 : pin.width,
        minHeight: isExpanded ? 320 : pin.height,
        height: isExpanded ? "auto" : pin.height,
        transform: isExpanded ? "none" : `rotate(${pin.rotation}deg)`,
        zIndex: isExpanded ? 50 : undefined,
        transformOrigin: "center center",
      }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.5, y: 20 }}
      animate={{
        opacity: visible ? targetOpacity : 0,
        scale: visible ? targetScale + parallaxBoost : 0.5,
        y: visible ? 0 : 20,
      }}
      transition={{
        opacity: { duration: isExpanded ? 0.6 : 0.4, ease: [0.22, 0.61, 0.36, 1] },
        scale: { duration: isExpanded ? 0.6 : 0.4, ease: [0.22, 0.61, 0.36, 1] },
        y: { duration: 0.6, ease: [0.22, 0.61, 0.36, 1], delay: reduceMotion ? 0 : delay / 1000 },
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-expanded={isExpanded}
    >
      <div className="corkboard-pushpin" aria-hidden="true" />
      <div className="corkboard-pin-content">
        {!isExpanded && (
          <>
            {memory.kind === "image" && resolvedMediaUrl && (
              <div className="corkboard-pin-photo">
                <img src={resolvedMediaUrl} alt={title} loading="lazy" decoding="async" />
              </div>
            )}
            {memory.kind === "video" && resolvedMediaUrl && (
              <div className="corkboard-pin-video-icon" aria-hidden="true">
                <span>&#9654;</span>
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

            {memory.kind === "image" && resolvedMediaUrl && (
              <div className="corkboard-pin-expanded-photo">
                <img src={resolvedMediaUrl} alt={title} />
              </div>
            )}

            {memory.kind === "video" && resolvedMediaUrl && (
              <video
                ref={videoRef}
                src={resolvedMediaUrl}
                autoPlay
                playsInline
                muted
                controls
                onEnded={onMediaEnded}
                className="corkboard-pin-expanded-video"
              />
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