"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { TreeHomeMemory } from "../homeTypes";
import { isVideoMemory } from "../homeUtils";

interface TrailPerson {
  id: string;
  name: string;
  portraitUrl: string | null;
}

interface DominantColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

const FALLBACK_COLORS: DominantColors = {
  primary: "rgba(176,139,62,0.40)",
  secondary: "rgba(120,100,60,0.28)",
  tertiary: "rgba(90,72,42,0.20)",
};

function useDominantColors(src: string | null, isVideo: boolean): DominantColors {
  const [colors, setColors] = useState<DominantColors>(FALLBACK_COLORS);
  const extractedRef = useRef<string | null>(null);

  const extract = useCallback(() => {
    if (isVideo || !src) return;
    if (extractedRef.current === src) return;
    extractedRef.current = src;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const buckets: Array<[number, number, number, number]> = [];
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          const a = data[i + 3]!;
          if (a < 100) continue;
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          if (lum < 15 || lum > 245) continue;
          buckets.push([r, g, b, lum]);
        }

        if (buckets.length < 10) return;

        const weighted = buckets
            .map(([r, g, b, lum]) => {
              const centrality = 1 - Math.abs(lum - 128) / 128;
              const sat = Math.max(r, g, b) - Math.min(r, g, b);
              const weight = (0.3 + sat / 255 * 0.5) * (0.4 + centrality * 0.6);
              return { r, g, b, weight: weight };
            })
            .sort((a, b) => b.weight - a.weight);

        const topThird = Math.max(10, Math.floor(weighted.length * 0.3));
        const midStart = Math.floor(weighted.length * 0.3);
        const midEnd = Math.floor(weighted.length * 0.6);

        const avgChannel = (slice: typeof weighted, ch: "r" | "g" | "b") => {
          const totalW = slice.reduce((s, p) => s + p.weight, 0);
          return Math.round(slice.reduce((s, p) => s + p[ch] * p.weight, 0) / totalW);
        };

        const topSlice = weighted.slice(0, topThird);
        const midSlice = weighted.slice(midStart, midEnd);
        const bottomSlice = weighted.slice(midEnd);

        const rgba = (slice: typeof weighted, alpha: number) => {
          if (slice.length === 0) return `rgba(140,120,80,${alpha})`;
          return `rgba(${avgChannel(slice, "r")},${avgChannel(slice, "g")},${avgChannel(slice, "b")},${alpha})`;
        };

        setColors({
          primary: rgba(topSlice, 0.48),
          secondary: midSlice.length > 0 ? rgba(midSlice, 0.32) : rgba(topSlice, 0.24),
          tertiary: bottomSlice.length > 0 ? rgba(bottomSlice, 0.22) : rgba(topSlice, 0.18),
        });
      } catch {
        // CORS or canvas error – keep fallback
      }
    };
    img.src = src;
  }, [src, isVideo]);

  if (typeof window !== "undefined" && src && !isVideo && extractedRef.current !== src) {
    extract();
  }

  return colors;
}

export function ImmersivePhotoSection({
  memory,
  mediaUrl,
  href,
  people,
  onPersonClick,
  onMemoryClick,
}: {
  memory: TreeHomeMemory;
  mediaUrl: string;
  href: string;
  people: TrailPerson[];
  onPersonClick: (personId: string) => void;
  onMemoryClick: (memory: TreeHomeMemory) => void;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const [contextVisible, setContextVisible] = useState(false);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0.1, 0.35], [0.35, 1]);
  const borderRadius = useTransform(scrollYProgress, [0.1, 0.35], [16, 6]);
  const vignetteOpacity = useTransform(scrollYProgress, [0.15, 0.35], [0, 1]);
  const cardOpacity = useTransform(scrollYProgress, [0, 0.1, 0.88, 1], [0, 1, 1, 0]);

  const isVideo = isVideoMemory(memory);
  const relatedPeople = getRelatedPeople(memory, people);
  const commentary = getMemoryCommentary(memory);
  const mediaCount = memory.mediaItems?.length ?? (memory.mediaUrl ? 1 : 0);
  const colors = useDominantColors(isVideo ? null : mediaUrl, isVideo);

  useEffect(() => {
    const el = contextRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setContextVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="immersive-photo-section"
      style={{ position: "relative", height: "180vh" }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: "#0d0b08",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              `radial-gradient(ellipse 80% 70% at 25% 45%, ${colors.primary}, transparent 70%), ` +
              `radial-gradient(ellipse 70% 65% at 75% 35%, ${colors.secondary}, transparent 65%), ` +
              `radial-gradient(ellipse 60% 55% at 50% 90%, ${colors.tertiary}, transparent 60%), ` +
              "#0d0b08",
            transition: "background 1.8s cubic-bezier(0.22, 0.61, 0.36, 1)",
          }}
        />

        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), " +
              "linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            mixBlendMode: "soft-light",
            opacity: 0.6,
            pointerEvents: "none",
          }}
        />

        <div
          className="immersive-layout"
          style={{
            position: "relative",
            zIndex: 2,
            display: "grid",
            gridTemplateColumns: "1fr clamp(200px, 22vw, 300px)",
            height: "100vh",
            alignItems: "center",
          }}
        >
          <motion.a
            href={href}
            aria-label={`Open ${memory.title}`}
            className="immersive-media-frame"
            style={{
              display: "block",
              position: "relative",
              width: "100%",
              height: "100%",
              scale,
              borderRadius,
              opacity: cardOpacity,
              overflow: "hidden",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {isVideo ? (
              <video
                src={mediaUrl}
                muted
                playsInline
                autoPlay
                loop
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt={memory.title}
                onError={handleMediaError}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            )}

            <motion.div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(13,11,8,0.6) 100%), " +
                  "linear-gradient(180deg, rgba(13,11,8,0.12) 0%, transparent 30%, transparent 55%, rgba(13,11,8,0.8) 100%)",
                opacity: vignetteOpacity,
                pointerEvents: "none",
              }}
            />

            <motion.div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "clamp(28px, 5vw, 64px) clamp(28px, 4vw, 56px)",
                zIndex: 3,
              }}
            >
              <div style={{ maxWidth: 580 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    color: "rgba(246,241,231,0.40)",
                    marginBottom: 10,
                  }}
                >
                  <span>{isVideo ? "Video" : "Photo"}</span>
                  {mediaCount > 1 && (
                    <>
                      <span style={{ opacity: 0.42 }}>·</span>
                      <span>{mediaCount} items</span>
                    </>
                  )}
                  {memory.dateOfEventText && (
                    <>
                      <span style={{ opacity: 0.42 }}>·</span>
                      <span>{memory.dateOfEventText}</span>
                    </>
                  )}
                </div>

                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(22px, 3.5vw, 44px)",
                    lineHeight: 1.12,
                    color: "rgba(246,241,231,0.95)",
                    maxWidth: "16ch",
                    textWrap: "balance",
                  }}
                >
                  {memory.title}
                </div>
              </div>
            </motion.div>
          </motion.a>

          <aside
            ref={contextRef}
            className={`immersive-context-rail ${contextVisible ? "immersive-context-rail--visible" : ""}`}
            style={{
              height: "100vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "clamp(20px, 3vw, 40px) clamp(14px, 2vw, 28px)",
              gap: 16,
            }}
          >
            {memory.primaryPersonId && (
              <button
                type="button"
                onClick={() => onPersonClick(memory.primaryPersonId!)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  border: "1px solid rgba(246,241,231,0.10)",
                  borderRadius: 10,
                  background: "rgba(246,241,231,0.04)",
                  backdropFilter: "blur(18px)",
                  color: "rgba(246,241,231,0.85)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  textAlign: "left",
                  transition: "background 200ms, border-color 200ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(246,241,231,0.10)";
                  e.currentTarget.style.borderColor = "rgba(246,241,231,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(246,241,231,0.04)";
                  e.currentTarget.style.borderColor = "rgba(246,241,231,0.10)";
                }}
              >
                {memory.personPortraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={memory.personPortraitUrl}
                    alt={memory.personName ?? ""}
                    style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: "rgba(246,241,231,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      color: "rgba(246,241,231,0.55)",
                      flexShrink: 0,
                    }}
                  >
                    {memory.personName?.charAt(0) ?? "?"}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
                    {memory.personName ?? "View person"}
                  </div>
                  {memory.dateOfEventText && (
                    <div style={{ fontSize: 11, color: "rgba(246,241,231,0.40)", marginTop: 2 }}>
                      {memory.dateOfEventText}
                    </div>
                  )}
                </div>
              </button>
            )}

            {relatedPeople.length > 0 && (
              <div
                style={{
                  border: "1px solid rgba(246,241,231,0.08)",
                  borderRadius: 10,
                  background: "rgba(246,241,231,0.03)",
                  backdropFilter: "blur(14px)",
                  padding: "10px 10px 8px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "rgba(246,241,231,0.28)",
                    marginBottom: 6,
                  }}
                >
                  Tagged
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {relatedPeople.slice(0, 5).map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => onPersonClick(person.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        border: "none",
                        borderRadius: 6,
                        background: "transparent",
                        color: "rgba(246,241,231,0.62)",
                        padding: "5px 6px",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 12,
                        textAlign: "left",
                        transition: "background 180ms, color 180ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(246,241,231,0.08)";
                        e.currentTarget.style.color = "rgba(246,241,231,0.92)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "rgba(246,241,231,0.62)";
                      }}
                    >
                      {person.portraitUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={person.portraitUrl}
                          alt={person.name}
                          style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "rgba(246,241,231,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "var(--font-display)",
                            fontSize: 10,
                            color: "rgba(246,241,231,0.35)",
                            flexShrink: 0,
                          }}
                        >
                          {person.name.charAt(0)}
                        </div>
                      )}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {person.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {commentary && (
              <div
                style={{
                  border: "1px solid rgba(246,241,231,0.06)",
                  borderRadius: 10,
                  background: "rgba(246,241,231,0.02)",
                  backdropFilter: "blur(12px)",
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "rgba(246,241,231,0.28)",
                    marginBottom: 6,
                  }}
                >
                  Context
                </div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: "rgba(246,241,231,0.58)",
                    display: "-webkit-box",
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {commentary}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => onMemoryClick(memory)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                border: "1px solid rgba(246,241,231,0.10)",
                borderRadius: 10,
                background: "rgba(246,241,231,0.05)",
                backdropFilter: "blur(10px)",
                color: "rgba(246,241,231,0.72)",
                padding: "9px 14px",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                letterSpacing: "0.04em",
                transition: "background 200ms, color 200ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(246,241,231,0.14)";
                e.currentTarget.style.color = "rgba(246,241,231,0.95)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(246,241,231,0.05)";
                e.currentTarget.style.color = "rgba(246,241,231,0.72)";
              }}
            >
              Open memory
            </button>
          </aside>
        </div>

        <style jsx>{`
          .immersive-context-rail {
            opacity: 0;
            transform: translateX(28px);
            transition: opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1),
                        transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1);
          }
          .immersive-context-rail--visible {
            opacity: 1;
            transform: translateX(0);
          }
          @media (max-width: 1024px) {
            .immersive-layout {
              grid-template-columns: 1fr clamp(160px, 18vw, 240px) !important;
            }
          }
          @media (max-width: 768px) {
            .immersive-layout {
              grid-template-columns: 1fr !important;
            }
            .immersive-context-rail {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

function getRelatedPeople(memory: TreeHomeMemory, people: TrailPerson[]) {
  const personIds = [
    memory.primaryPersonId,
    ...(memory.relatedPersonIds ?? []),
  ].filter((id): id is string => Boolean(id));
  const uniqueIds = [...new Set(personIds)];
  return uniqueIds
    .map((personId) => people.find((person) => person.id === personId))
    .filter((person): person is TrailPerson => Boolean(person))
    .slice(0, 5);
}

function getMemoryCommentary(memory: TreeHomeMemory): string | null {
  const text =
    memory.kind === "voice"
      ? memory.transcriptText?.trim() || memory.body?.trim()
      : memory.body?.trim() || memory.transcriptText?.trim();
  if (!text) return null;
  return text.length > 380 ? `${text.slice(0, 377).trimEnd()}...` : text;
}

function handleMediaError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}