"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ApiPerson } from "./treeTypes";

interface CinematicPersonOverlayProps {
  person: ApiPerson | null;
  onClose: () => void;
  onEnter: (personId: string) => void;
}

export function CinematicPersonOverlay({
  person,
  onClose,
  onEnter,
}: CinematicPersonOverlayProps) {
  useEffect(() => {
    if (!person) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onEnter(person.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [person, onClose, onEnter]);

  const initials = person
    ? person.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  const dateLabel = person
    ? person.birthYear && person.deathYear
      ? `${person.birthYear} – ${person.deathYear}`
      : person.birthYear
        ? `b. ${person.birthYear}`
        : null
    : null;

  return (
    <AnimatePresence>
      {person && (
        <motion.div
          key="cinematic-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(28, 25, 21, 0.72)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Card — stop propagation so clicking card doesn't close */}
          <motion.div
            key={person.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
              padding: "40px 48px 36px",
              background: "var(--paper)",
              borderRadius: 4,
              boxShadow: "0 24px 80px rgba(28,25,21,0.4)",
              maxWidth: 360,
              width: "100%",
              textAlign: "center",
            }}
          >
            {/* Portrait */}
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                overflow: "hidden",
                border: "1.5px solid var(--rule)",
                background: "var(--paper-deep)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {person.portraitUrl ? (
                <img
                  src={person.portraitUrl}
                  alt={person.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 40,
                    color: "var(--ink-faded)",
                    fontWeight: 400,
                    lineHeight: 1,
                  }}
                >
                  {initials}
                </span>
              )}
            </div>

            {/* Name */}
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  color: "var(--ink)",
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                }}
              >
                {person.name}
              </div>

              {dateLabel && (
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    color: "var(--ink-faded)",
                    marginTop: 6,
                  }}
                >
                  {dateLabel}
                </div>
              )}

              {person.essenceLine && (
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    fontStyle: "italic",
                    color: "var(--ink-soft)",
                    marginTop: 10,
                    lineHeight: 1.5,
                  }}
                >
                  {person.essenceLine}
                </div>
              )}
            </div>

            {/* Divider */}
            <div
              style={{
                width: 40,
                height: 1,
                background: "var(--rule)",
                flexShrink: 0,
              }}
            />

            {/* CTA */}
            <button
              onClick={() => onEnter(person.id)}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                color: "var(--paper)",
                background: "var(--ink)",
                border: "none",
                borderRadius: 3,
                padding: "11px 28px",
                cursor: "pointer",
                letterSpacing: "0.02em",
                transition: "background 150ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--ink-soft)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--ink)")
              }
            >
              Enter life story →
            </button>

            {/* Dismiss hint */}
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                marginTop: -8,
              }}
            >
              Press Esc or click outside to return
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
