"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { TreeHomeMemory } from "../homeTypes";
import { isVideoMemory } from "../homeUtils";

export function ImmersivePhotoSection({
  memory,
  mediaUrl,
  href,
}: {
  memory: TreeHomeMemory;
  mediaUrl: string;
  href: string;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0.1, 0.35], [0.35, 1]);
  const borderRadius = useTransform(scrollYProgress, [0.1, 0.35], [16, 0]);
  const captionOpacity = useTransform(scrollYProgress, [0.35, 0.48], [0, 1]);
  const captionY = useTransform(captionOpacity, [0, 1], [20, 0]);
  const vignetteOpacity = useTransform(scrollYProgress, [0.15, 0.35], [0, 1]);
  const cardOpacity = useTransform(scrollYProgress, [0, 0.1, 0.88, 1], [0, 1, 1, 0]);
  const isVideo = isVideoMemory(memory);

  return (
    <div
      ref={sectionRef}
      style={{ position: "relative", height: "180vh" }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Blurred backdrop from the media itself */}
        {isVideo ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              filter: "blur(50px) saturate(0.3) brightness(0.25)",
              transform: "scale(1.06)",
              zIndex: 0,
            }}
          >
            <video
              src={mediaUrl}
              muted
              playsInline
              autoPlay
              loop
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ) : (
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${mediaUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(50px) saturate(0.3) brightness(0.25)",
              transform: "scale(1.06)",
              zIndex: 0,
            }}
          />
        )}

        {/* Warm atmospheric overlay */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(176,139,62,0.04), transparent 60%), rgba(15,13,10,0.75)",
            zIndex: 1,
          }}
        />

        <motion.a
          href={href}
          style={{
            display: "block",
            position: "relative",
            zIndex: 2,
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
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "rgba(15,13,10,0.34)",
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={memory.title}
              onError={handleMediaError}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "rgba(15,13,10,0.34)",
                filter: "sepia(8%) brightness(0.76)",
              }}
            />
          )}

          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(15,13,10,0.7) 100%), linear-gradient(180deg, rgba(15,13,10,0.2) 0%, rgba(15,13,10,0.05) 40%, rgba(15,13,10,0.05) 60%, rgba(15,13,10,0.85) 100%)",
              opacity: vignetteOpacity,
            }}
          />

          <motion.div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "clamp(28px, 5vw, 64px) max(24px, 5vw)",
              opacity: captionOpacity,
              y: captionY,
            }}
          >
            <div style={{ maxWidth: 720 }}>
              <div
                style={{
                  display: "flex",
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
                {memory.dateOfEventText && (
                  <>
                    <span>·</span>
                    <span>{memory.dateOfEventText}</span>
                  </>
                )}
              </div>

              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(24px, 4vw, 48px)",
                  lineHeight: 1.12,
                  color: "rgba(246,241,231,0.95)",
                  maxWidth: "18ch",
                  textWrap: "balance",
                }}
              >
                {memory.title}
              </div>

              {memory.personName && (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: "var(--font-ui)",
                    fontSize: 14,
                    color: "rgba(246,241,231,0.50)",
                  }}
                >
                  {memory.personName}
                </div>
              )}
            </div>
          </motion.div>
        </motion.a>
      </div>
    </div>
  );
}

function handleMediaError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}
