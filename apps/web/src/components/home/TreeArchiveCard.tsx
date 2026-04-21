"use client";

import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeCoverage, TreeHomeMemory, TreeHomeStats } from "./homeTypes";
import { getCoverageRangeLabel, getHeroExcerpt } from "./homeUtils";

export function TreeArchiveCard({
  treeName,
  role,
  stats,
  coverage,
  heroMemory,
  href,
  variant = "secondary",
}: {
  treeName: string;
  role: string;
  stats: TreeHomeStats;
  coverage: TreeHomeCoverage;
  heroMemory: TreeHomeMemory | null;
  href: string;
  variant?: "primary" | "secondary";
}) {
  const heroImage = getProxiedMediaUrl(heroMemory?.mediaUrl);
  const heroExcerpt = getHeroExcerpt(heroMemory);
  const isPrimary = variant === "primary";

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: isPrimary ? 24 : 18,
        border: "1px solid rgba(124,108,84,0.2)",
        background: isPrimary
          ? "linear-gradient(180deg, rgba(247,242,233,0.98) 0%, rgba(238,229,216,0.98) 100%)"
          : "linear-gradient(180deg, rgba(247,242,233,1) 0%, rgba(242,235,224,1) 100%)",
        minHeight: isPrimary ? 430 : 320,
        boxShadow: isPrimary
          ? "0 24px 60px rgba(40,30,18,0.12)"
          : "0 12px 30px rgba(40,30,18,0.08)",
      }}
    >
      {heroImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={heroMemory?.title ?? treeName}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: isPrimary ? 0.28 : 0.18,
              filter: "sepia(18%) saturate(0.85)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(247,242,233,0.72) 0%, rgba(237,228,214,0.96) 72%, rgba(235,225,210,1) 100%)",
            }}
          />
        </>
      )}

      {!heroImage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `
              radial-gradient(circle at 18% 20%, rgba(201,161,92,0.18), transparent 34%),
              radial-gradient(circle at 82% 18%, rgba(92,110,84,0.14), transparent 30%),
              linear-gradient(180deg, rgba(247,242,233,1) 0%, rgba(238,229,216,1) 100%)
            `,
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          padding: isPrimary ? "28px 28px 30px" : "22px 22px 24px",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: isPrimary ? 22 : 18,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(63,53,41,0.62)",
            }}
          >
            {isPrimary ? "Primary archive" : "Archive"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "rgba(63,53,41,0.46)",
            }}
          >
            •
          </span>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              textTransform: "capitalize",
              color: "rgba(63,53,41,0.62)",
            }}
          >
            {role}
          </span>
        </div>

        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: isPrimary ? "clamp(28px, 3vw, 40px)" : 28,
            lineHeight: 1.1,
            color: "var(--ink)",
            maxWidth: isPrimary ? "18ch" : "15ch",
          }}
        >
          {treeName}
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: isPrimary ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
            gap: 10,
            maxWidth: isPrimary ? 560 : "100%",
          }}
        >
          <Metric label="People" value={`${stats.peopleCount}`} />
          <Metric label="Memories" value={`${stats.memoryCount}`} />
          <Metric
            label="Span"
            value={isPrimary ? getCoverageRangeLabel(coverage) : `${coverage.decadeBuckets.length} eras`}
          />
        </div>

        <div
          style={{
            marginTop: isPrimary ? 26 : 20,
            padding: isPrimary ? "18px 18px 20px" : "16px 16px 18px",
            borderRadius: 16,
            background: "rgba(255,248,240,0.64)",
            border: "1px solid rgba(128,107,82,0.14)",
            maxWidth: isPrimary ? 620 : "100%",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(63,53,41,0.58)",
              marginBottom: 8,
            }}
          >
            {heroMemory ? "Featured memory" : "Archive overview"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: isPrimary ? 22 : 18,
              lineHeight: 1.2,
              color: "var(--ink)",
            }}
          >
            {heroMemory?.title ?? "A quieter archive, waiting for its next memory"}
          </div>
          <div
            style={{
              marginTop: 6,
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "rgba(63,53,41,0.62)",
            }}
          >
            {heroMemory?.personName ?? treeName}
            {heroMemory?.personName && heroMemory?.dateOfEventText ? " · " : ""}
            {heroMemory?.dateOfEventText ?? getCoverageRangeLabel(coverage)}
          </div>
          {heroExcerpt && (
            <div
              style={{
                marginTop: 10,
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.65,
                color: "rgba(53,44,33,0.8)",
                display: "-webkit-box",
                WebkitLineClamp: isPrimary ? 3 : 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {heroExcerpt}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 24,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <a
            href={href}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "white",
              background: "var(--ink)",
              borderRadius: 999,
              padding: "10px 16px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Enter atrium →
          </a>
          <a
            href={href.replace(/\/atrium$/, "")}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--moss)",
              textDecoration: "none",
            }}
          >
            Open constellation
          </a>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,252,247,0.56)",
        border: "1px solid rgba(128,107,82,0.12)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(63,53,41,0.52)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          lineHeight: 1.1,
          color: "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
