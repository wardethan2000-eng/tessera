"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ApiMemory, ApiPerson } from "./treeTypes";
import { getProxiedMediaUrl } from "@/lib/media-url";

interface DriftEntry {
  memory: ApiMemory;
  person: ApiPerson;
}

interface DriftModeProps {
  treeId: string;
  people: ApiPerson[];
  onClose: () => void;
  onPersonDetail: (personId: string) => void;
  apiBase: string;
}

const DRIFT_DURATION = 25; // seconds per memory

export function DriftMode({
  treeId,
  people,
  onClose,
  onPersonDetail,
  apiBase,
}: DriftModeProps) {
  const [entries, setEntries] = useState<DriftEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all memories on open
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      const byMemoryId = new Map<string, DriftEntry>();
      const peopleById = new Map(people.map((p) => [p.id, p]));
      await Promise.all(
        people.map(async (person) => {
          try {
            const res = await fetch(
              `${apiBase}/api/trees/${treeId}/people/${person.id}`,
              { credentials: "include" }
            );
            if (!res.ok) return;
            const data = await res.json();
            for (const memory of data.memories ?? []) {
              if (byMemoryId.has(memory.id)) continue;
              const subject =
                peopleById.get(memory.primaryPersonId) ?? person;
              byMemoryId.set(memory.id, {
                memory: {
                  ...memory,
                  personId: subject.id,
                },
                person: subject,
              });
            }
          } catch {
            // ignore individual failures
          }
        })
      );
      const allEntries = Array.from(byMemoryId.values());
      // Shuffle
      for (let i = allEntries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allEntries[i], allEntries[j]] = [allEntries[j]!, allEntries[i]!];
      }
      setEntries(allEntries);
      setCurrentIndex(0);
      setIsLoading(false);
    };
    fetchAll();
  }, [treeId, people, apiBase]);

  const advance = useCallback(() => {
    setProgress(0);
    setCurrentIndex((i) => (i + 1) % Math.max(entries.length, 1));
  }, [entries.length]);

  const stepBack = useCallback(() => {
    setProgress(0);
    setCurrentIndex((i) => (i - 1 + entries.length) % Math.max(entries.length, 1));
  }, [entries.length]);

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || entries.length === 0) return;

    progressRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100;
        return p + 100 / (DRIFT_DURATION * 20);
      });
    }, 50);

    timerRef.current = setTimeout(advance, DRIFT_DURATION * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [isPlaying, currentIndex, advance, entries.length]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") stepBack();
      if (e.key === " ") { e.preventDefault(); setIsPlaying((p) => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance, stepBack, onClose]);

  const current = entries[currentIndex];
  const resolvedCurrentMediaUrl = getProxiedMediaUrl(current?.memory.mediaUrl);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "var(--ink)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "none",
          border: "none",
          color: "var(--ink-faded)",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          cursor: "pointer",
          zIndex: 10,
        }}
      >
        × Exit drift
      </button>

      {/* Autoplay toggle */}
      <button
        onClick={() => setIsPlaying((p) => !p)}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          background: "none",
          border: "1px solid rgba(217,208,188,0.3)",
          borderRadius: 20,
          color: "var(--paper-deep)",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          cursor: "pointer",
          padding: "5px 14px",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isPlaying ? "var(--moss)" : "var(--ink-faded)",
            display: "inline-block",
          }}
        />
        Autoplay
      </button>

      {/* Left / right navigation */}
      <button
        onClick={stepBack}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "30%",
          height: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "0 24px",
          color: "transparent",
        }}
        aria-label="Previous memory"
      >
        ←
      </button>
      <button
        onClick={advance}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "30%",
          height: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 24px",
          color: "transparent",
        }}
        aria-label="Next memory"
      >
        →
      </button>

      {/* Loading shimmer */}
      {isLoading && (
        <div
          style={{
            width: 200,
            height: 20,
            borderRadius: 4,
            background: "rgba(246,241,231,0.1)",
            backgroundImage:
              "linear-gradient(90deg, rgba(246,241,231,0.05) 25%, rgba(246,241,231,0.15) 50%, rgba(246,241,231,0.05) 75%)",
            backgroundSize: "400px 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      )}

      {/* Memory content */}
      <AnimatePresence mode="wait">
        {!isLoading && current && (
          <motion.div
            key={`${current.memory.id}-${currentIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              maxWidth: 760,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0 40px",
              gap: 20,
            }}
          >
            {/* Photo */}
            {current.memory.kind === "photo" && resolvedCurrentMediaUrl && (
              <img
                src={resolvedCurrentMediaUrl}
                alt={current.memory.title}
                style={{
                  maxHeight: "55vh",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            )}

            {/* Title */}
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                color: "var(--paper)",
                fontWeight: 400,
                textAlign: "center",
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {current.memory.title}
            </h2>

            {/* Story body */}
            {current.memory.kind === "story" && current.memory.body && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 17,
                  color: "var(--paper-deep)",
                  lineHeight: 1.8,
                  maxWidth: "60ch",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                {current.memory.body}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom attribution + person link */}
      {current && !isLoading && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 40,
            right: 40,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--paper-deep)" }}>
              {current.person.name}
            </div>
            <div>
              {current.memory.title}
              {current.memory.dateOfEventText ? ` · ${current.memory.dateOfEventText}` : ""}
            </div>
          </div>

          <button
            onClick={() => onPersonDetail(current.person.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--paper-deep)",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Open {current.person.name}'s archive →
          </button>
        </div>
      )}

      {/* Progress bar — bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "rgba(217,208,188,0.15)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--moss)",
            transition: "width 50ms linear",
          }}
        />
      </div>
    </motion.div>
  );
}
