"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import {
  MemoryVisibilityControl,
  type TreeVisibilityLevel,
} from "@/components/tree/MemoryVisibilityControl";

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

export interface LightboxMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  treeVisibilityLevel?: TreeVisibilityLevel;
  treeVisibilityIsOverride?: boolean;
}

interface MemoryLightboxProps {
  memories: LightboxMemory[];
  initialIndex: number;
  onClose: () => void;
  canManageTreeVisibility?: boolean;
  updatingTreeVisibilityId?: string | null;
  onSetTreeVisibility?: (
    memoryId: string,
    visibility: TreeVisibilityLevel | null,
  ) => void;
}

export function MemoryLightbox({
  memories,
  initialIndex,
  onClose,
  canManageTreeVisibility,
  updatingTreeVisibilityId,
  onSetTreeVisibility,
}: MemoryLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const memory = memories[index];

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (i < memories.length - 1 ? i + 1 : i));
  }, [memories.length]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  // Reset audio when index changes
  useEffect(() => {
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [index]);

  // Scroll filmstrip to keep active thumb in view
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const thumb = strip.children[index] as HTMLElement | undefined;
    if (thumb) thumb.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  if (!memory) return null;

  const mime = memory.mimeType?.toLowerCase() ?? "";
  const isPhoto = memory.kind === "photo" || mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isPdf = mime === "application/pdf";
  const isVoice = memory.kind === "voice" && !isVideo;
  const isStory = memory.kind === "story" || memory.kind === "document";
  const transcriptText =
    memory.transcriptStatus === "completed" ? memory.transcriptText?.trim() : null;

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => null);
      setPlaying(true);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(28, 25, 21, 0.96)",
        display: "flex",
        flexDirection: "column",
        animation: "fadeIn 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
      }}
      onClick={onClose}
    >
      {/* Top bar: close + title */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px 24px",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "rgba(246,241,231,0.5)",
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
            letterSpacing: "0.02em",
          }}
        >
          × Close
        </button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              color: "rgba(246,241,231,0.85)",
            }}
          >
            {memory.title}
          </span>
          {memory.dateOfEventText && (
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "rgba(246,241,231,0.4)",
                marginLeft: 10,
              }}
            >
              {memory.dateOfEventText}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {canManageTreeVisibility && onSetTreeVisibility && (
            <div style={{ minWidth: 220 }}>
              <MemoryVisibilityControl
                memory={memory}
                disabled={updatingTreeVisibilityId === memory.id}
                onChange={(visibility) => onSetTreeVisibility(memory.id, visibility)}
              />
            </div>
          )}
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "rgba(246,241,231,0.35)",
            }}
          >
            {index + 1} / {memories.length}
          </span>
        </div>
      </div>

      {/* Main content area */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Prev arrow */}
        <NavArrow direction="left" disabled={index === 0} onClick={prev} />

        {/* Content */}
        {isPhoto && memory.mediaUrl && (
          <img
            key={memory.id}
            src={memory.mediaUrl}
            alt={memory.title}
            style={{
              maxWidth: "calc(100vw - 160px)",
              maxHeight: "calc(100vh - 220px)",
              objectFit: "contain",
              userSelect: "none",
              animation: "fadeIn 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
            }}
          />
        )}

        {isVideo && memory.mediaUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            key={memory.id}
            src={memory.mediaUrl}
            controls
            style={{
              maxWidth: "calc(100vw - 160px)",
              maxHeight: "calc(100vh - 220px)",
              borderRadius: 6,
              animation: "fadeIn 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
            }}
          />
        )}

        {isPdf && memory.mediaUrl && (
          <div
            key={memory.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              animation: "fadeIn 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
            }}
          >
            <iframe
              src={memory.mediaUrl}
              title={memory.title}
              style={{
                width: "min(760px, calc(100vw - 160px))",
                height: "calc(100vh - 280px)",
                border: "1px solid rgba(246,241,231,0.15)",
                borderRadius: 6,
                background: "#fff",
              }}
            />
            <a
              href={memory.mediaUrl}
              download={memory.title}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "rgba(246,241,231,0.55)",
                textDecoration: "none",
              }}
            >
              ↓ Download PDF
            </a>
          </div>
        )}

        {isVoice && (
          <div
            key={memory.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 32,
              maxWidth: 520,
              padding: "0 24px",
              animation: "fadeIn 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
            }}
          >
            {/* Waveform visualizer */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
              {Array.from({ length: 40 }, (_, i) => {
                const height = 20 + Math.abs(Math.sin(i * 0.7) * 45) + Math.abs(Math.cos(i * 1.3) * 20);
                return (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height,
                      borderRadius: 2,
                      background: playing
                        ? i < (index / memories.length) * 40
                          ? "var(--moss)"
                          : "rgba(246,241,231,0.3)"
                        : "rgba(246,241,231,0.25)",
                      transition: "background 400ms",
                      animation: playing ? `wavePulse ${0.6 + (i % 5) * 0.1}s ease-in-out infinite alternate` : "none",
                    }}
                  />
                );
              })}
            </div>

            {/* Play button */}
            <button
              onClick={toggleAudio}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(246,241,231,0.1)",
                border: "1px solid rgba(246,241,231,0.25)",
                color: "rgba(246,241,231,0.9)",
                fontFamily: "var(--font-ui)",
                fontSize: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {playing ? "⏸" : "▶"}
            </button>

            {memory.mediaUrl && (
              <audio
                ref={audioRef}
                src={memory.mediaUrl}
                onEnded={() => setPlaying(false)}
              />
            )}

            {memory.body && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  lineHeight: 1.85,
                  color: "rgba(246,241,231,0.6)",
                  textAlign: "center",
                  fontStyle: "italic",
                  margin: 0,
                }}
              >
                {memory.body}
              </p>
            )}
            {memory.transcriptStatus && memory.transcriptStatus !== "none" && (
              <div
                style={{
                  marginTop: 18,
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(246,241,231,0.14)",
                  background: "rgba(246,241,231,0.05)",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(246,241,231,0.45)",
                    marginBottom: 8,
                  }}
                >
                  Transcript
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    lineHeight: 1.85,
                    color: "rgba(246,241,231,0.7)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {memory.transcriptStatus === "completed"
                    ? transcriptText ?? "Transcript unavailable."
                    : memory.transcriptStatus === "failed"
                    ? memory.transcriptError ?? "Transcription failed."
                    : "Transcribing…"}
                </div>
                {memory.transcriptLanguage && transcriptText && (
                  <div
                    style={{
                      marginTop: 10,
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      color: "rgba(246,241,231,0.4)",
                    }}
                  >
                    Language: {memory.transcriptLanguage}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(isStory || (!isPhoto && !isVideo && !isPdf && !isVoice)) && (
          <div
            key={memory.id}
            style={{
              maxWidth: 640,
              padding: "0 48px",
              animation: "fadeIn 300ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 400,
                color: "rgba(246,241,231,0.92)",
                margin: "0 0 20px",
                lineHeight: 1.3,
              }}
            >
              {memory.title}
            </h2>
            {memory.body && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 17,
                  lineHeight: 1.95,
                  color: "rgba(246,241,231,0.65)",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {memory.body}
              </p>
            )}
          </div>
        )}

        {/* Next arrow */}
        <NavArrow direction="right" disabled={index === memories.length - 1} onClick={next} />
      </div>

      {/* Filmstrip */}
      {memories.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          ref={filmstripRef}
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 24px",
            overflowX: "auto",
            flexShrink: 0,
            scrollbarWidth: "none",
            justifyContent: memories.length <= 8 ? "center" : "flex-start",
          }}
        >
          {memories.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setIndex(i)}
              style={{
                width: 52,
                height: 40,
                borderRadius: 3,
                overflow: "hidden",
                flexShrink: 0,
                border: i === index ? "1.5px solid rgba(246,241,231,0.6)" : "1.5px solid transparent",
                padding: 0,
                cursor: "pointer",
                background:
                  m.kind === "photo" && m.mediaUrl
                    ? "none"
                    : "rgba(246,241,231,0.08)",
                transition: "border-color 200ms",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {m.kind === "photo" && m.mediaUrl ? (
                <img
                  src={m.mediaUrl}
                  alt={m.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 16, opacity: 0.5 }}>
                  {m.kind === "voice" ? "🎙" : m.kind === "story" ? "✦" : "◻"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "absolute",
        [direction]: 16,
        top: "50%",
        transform: "translateY(-50%)",
        background: "rgba(246,241,231,0.06)",
        border: "1px solid rgba(246,241,231,0.1)",
        borderRadius: 4,
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "rgba(246,241,231,0.15)" : "rgba(246,241,231,0.7)",
        fontFamily: "var(--font-ui)",
        fontSize: 18,
        transition: "background 150ms",
        zIndex: 5,
      }}
    >
      {direction === "left" ? "←" : "→"}
    </button>
  );
}
