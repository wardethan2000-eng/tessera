"use client";

import { AnimatePresence, motion } from "framer-motion";
import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeMemory } from "./homeTypes";
import { getHeroExcerpt } from "./homeUtils";

const HERO_EASE = [0.22, 0.61, 0.36, 1] as const;

export function TreeHomeHero({
  treeName,
  featuredMemory,
  transitionKey,
  heroIndex,
  heroCount,
  onPauseChange,
  onSelectHero,
}: {
  treeName: string;
  featuredMemory: TreeHomeMemory | null;
  transitionKey: string;
  heroIndex: number;
  heroCount: number;
  onPauseChange: (paused: boolean) => void;
  onSelectHero: (index: number) => void;
}) {
  const featuredMemoryMediaUrl = getProxiedMediaUrl(featuredMemory?.mediaUrl);
  const heroExcerpt = getHeroExcerpt(featuredMemory);

  return (
    <section
      onMouseEnter={() => onPauseChange(true)}
      onMouseLeave={() => onPauseChange(false)}
      style={{
        position: "relative",
        height: "clamp(360px, 62vh, 560px)",
        overflow: "hidden",
        background: "var(--ink)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={transitionKey}
          initial={{ opacity: 0.35, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0.12, scale: 1.01 }}
          transition={{ duration: 0.85, ease: HERO_EASE }}
          style={{ position: "absolute", inset: 0 }}
        >
          {featuredMemory?.kind === "photo" && featuredMemoryMediaUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={featuredMemoryMediaUrl}
                alt={featuredMemory.title}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "sepia(20%) brightness(0.68)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(28,25,21,0.9) 0%, rgba(28,25,21,0.34) 54%, rgba(28,25,21,0.12) 76%, transparent 100%)",
                }}
              />
            </>
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `
                  radial-gradient(ellipse at 30% 60%, rgba(176,139,62,0.18) 0%, transparent 60%),
                  radial-gradient(ellipse at 80% 20%, rgba(78,93,66,0.15) 0%, transparent 50%),
                  #1C1915
                `,
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 14% 16%, rgba(255,255,255,0.08), transparent 22%), linear-gradient(180deg, rgba(246,241,231,0.08) 0%, transparent 18%, transparent 78%, rgba(246,241,231,0.08) 100%)",
          pointerEvents: "none",
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={`content-${transitionKey}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.52, ease: HERO_EASE }}
          style={{
            position: "absolute",
            bottom: "clamp(28px, 5vw, 46px)",
            left: "clamp(20px, 5vw, 52px)",
            right: "clamp(20px, 5vw, 52px)",
            maxWidth: 840,
          }}
        >
          {featuredMemory ? (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(28,25,21,0.28)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "rgba(246,241,231,0.55)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: 12,
                }}
              >
                {featuredMemory.kind === "photo"
                  ? "From the archive"
                  : featuredMemory.kind === "story"
                    ? "A story"
                    : featuredMemory.kind === "voice"
                      ? "A voice"
                      : "A memory"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 5vw, 46px)",
                  color: "rgba(246,241,231,0.95)",
                  lineHeight: 1.1,
                  marginBottom: 10,
                  maxWidth: "18ch",
                }}
              >
                {featuredMemory.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontStyle: "italic",
                  fontSize: 14,
                  color: "rgba(246,241,231,0.65)",
                }}
              >
                {featuredMemory.personName ?? ""}
                {featuredMemory.personName && featuredMemory.dateOfEventText ? " · " : ""}
                {featuredMemory.dateOfEventText ?? ""}
              </div>
              {heroExcerpt && (
                <div
                  style={{
                    marginTop: 14,
                    maxWidth: "58ch",
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "rgba(246,241,231,0.78)",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {heroExcerpt}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(28,25,21,0.22)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "rgba(246,241,231,0.45)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: 12,
                }}
              >
                A private family archive
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(32px, 6vw, 58px)",
                  color: "rgba(246,241,231,0.9)",
                  lineHeight: 1.06,
                  maxWidth: "12ch",
                }}
              >
                {treeName}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontStyle: "italic",
                  fontSize: 15,
                  color: "rgba(246,241,231,0.5)",
                  marginTop: 10,
                }}
              >
                Begin by adding the first memory.
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {heroCount > 1 && (
        <div
          style={{
            position: "absolute",
            right: "clamp(18px, 5vw, 40px)",
            bottom: "clamp(16px, 3vw, 26px)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 999,
            background: "rgba(28,25,21,0.22)",
            backdropFilter: "blur(8px)",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: "calc(100% - 40px)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "rgba(246,241,231,0.58)",
            }}
          >
            {heroIndex + 1} / {heroCount}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {Array.from({ length: heroCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show hero ${index + 1}`}
                onClick={() => onSelectHero(index)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  background:
                    index === heroIndex ? "rgba(246,241,231,0.95)" : "rgba(246,241,231,0.35)",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
