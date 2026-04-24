"use client";

import Link from "next/link";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";
import type { TreeHomeMemory, TreeHomeTodayBirthday, TreeHomeTodayDeathiversary, TreeHomeTodayMemoryAnniversary } from "./homeTypes";
import { EASE, getHeroExcerpt } from "./homeUtils";

export function AtriumStage({
  treeName,
  featuredMemory,
  branchCue,
  memoryHref,
  branchHref,
  fullTreeHref,
  resurfacingCount,
  onDrift,
  scaleLabel,
  historicalLabel,
  today,
  treeId,
}: {
  treeName: string;
  featuredMemory: TreeHomeMemory | null;
  branchCue: string;
  memoryHref: string | null;
  branchHref: string | null;
  fullTreeHref: string;
  resurfacingCount: number;
  onDrift: () => void;
  scaleLabel: string;
  historicalLabel: string;
  today: {
    birthdays: TreeHomeTodayBirthday[];
    deathiversaries: TreeHomeTodayDeathiversary[];
    memoryAnniversaries: TreeHomeTodayMemoryAnniversary[];
    monthDayLabel: string;
  } | null | undefined;
  treeId: string;
}) {
  const mediaUrl = getProxiedMediaUrl(featuredMemory?.mediaUrl);
  const excerpt = getHeroExcerpt(featuredMemory);
  const usesMedia = Boolean(mediaUrl && featuredMemory?.kind === "photo");

  const todayBirthdayItems = (today?.birthdays.filter((p) => p.daysUntil === 0) ?? []).slice(0, 2).map((p) => ({
    id: p.personId,
    name: p.name,
    portraitUrl: p.portraitUrl,
    kind: "birthday" as const,
    detail: p.yearsOld !== null ? `Turns ${p.yearsOld}` : null,
  }));

  const todayMemorialItems = (today?.deathiversaries.filter((p) => p.daysUntil === 0) ?? []).slice(0, 2 - todayBirthdayItems.length).map((p) => ({
    id: p.personId,
    name: p.name,
    portraitUrl: p.portraitUrl,
    kind: "memorial" as const,
    detail: p.yearsAgo !== null ? `${p.yearsAgo} year${p.yearsAgo === 1 ? "" : "s"} ago` : null,
  }));

  const todayItems = [...todayBirthdayItems, ...todayMemorialItems];

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#1c1915",
      }}
    >
      {usesMedia ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl ?? ""}
            alt={featuredMemory?.title ?? ""}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(24px) sepia(18%) brightness(0.38) saturate(0.9)",
              transform: "scale(1.08)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl ?? ""}
            alt=""
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "sepia(12%) brightness(0.72)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(175deg, rgba(22,19,16,0.94) 0%, rgba(22,19,16,0.78) 36%, rgba(22,19,16,0.52) 72%, rgba(22,19,16,0.34) 100%), linear-gradient(180deg, rgba(22,19,16,0.04) 0%, rgba(22,19,16,0.28) 100%)",
            }}
          />
        </>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 16% 24%, rgba(201,161,92,0.20), transparent 32%), radial-gradient(ellipse at 82% 16%, rgba(78,93,66,0.16), transparent 28%), linear-gradient(180deg, #201c17 0%, #141210 100%)",
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          minHeight: "max(100vh, 580px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "clamp(28px, 5vw, 56px) max(20px, 5vw) clamp(48px, 8vw, 96px)",
        }}
      >
        {/* Today notices — woven into the opening space */}
        {todayItems.length > 0 && (
          <div
            style={{
              marginBottom: "clamp(20px, 3vw, 32px)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {todayItems.map((item) => (
              <Link
                key={item.id}
                href={`/trees/${treeId}/people/${item.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 12px 5px 5px",
                  borderRadius: 999,
                  border: item.kind === "birthday"
                    ? "1px solid rgba(176,139,62,0.30)"
                    : "1px solid rgba(168,93,93,0.28)",
                  background: item.kind === "birthday"
                    ? "rgba(176,139,62,0.12)"
                    : "rgba(168,93,93,0.10)",
                  textDecoration: "none",
                  backdropFilter: "blur(6px)",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: "rgba(246,241,231,0.12)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {item.portraitUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.portraitUrl}
                      alt={item.name}
                      onError={handleMediaError}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 10,
                        color: "rgba(246,241,231,0.7)",
                      }}
                    >
                      {item.name.charAt(0)}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "rgba(246,241,231,0.88)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {item.kind === "birthday" ? "Birthday" : "In memoriam"} · {item.name}
                  {item.detail ? ` — ${item.detail}` : ""}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* The main content */}
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(246,241,231,0.06)",
              backdropFilter: "blur(8px)",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "rgba(246,241,231,0.56)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            <span>{featuredMemory ? "Featured memory" : treeName}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{treeName}</span>
          </div>

          <div
            style={{
              marginTop: 18,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(38px, 8vw, 84px)",
              lineHeight: 0.96,
              color: "rgba(246,241,231,0.97)",
              maxWidth: "14ch",
              textWrap: "balance",
            }}
          >
            {featuredMemory?.title ?? treeName}
          </div>

          {(featuredMemory?.personName || featuredMemory?.dateOfEventText) && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                color: "rgba(246,241,231,0.68)",
              }}
            >
              {featuredMemory?.personName && <span>{featuredMemory.personName}</span>}
              {featuredMemory?.personName && featuredMemory?.dateOfEventText && (
                <span style={{ opacity: 0.4 }}>·</span>
              )}
              {featuredMemory?.dateOfEventText && <span>{featuredMemory.dateOfEventText}</span>}
            </div>
          )}

          {excerpt && (
            <p
              style={{
                margin: "20px 0 0",
                maxWidth: "56ch",
                fontFamily: "var(--font-body)",
                fontSize: 18,
                lineHeight: 1.82,
                color: "rgba(246,241,231,0.78)",
              }}
            >
              {excerpt}
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {memoryHref && (
              <Link
                href={memoryHref}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink)",
                  background: "rgba(246,241,231,0.94)",
                  borderRadius: 999,
                  padding: "14px 22px",
                  textDecoration: "none",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.20)",
                }}
              >
                Continue with this memory
              </Link>
            )}

            {branchHref && (
              <Link href={branchHref} style={secondaryLinkStyle}>
                Follow this branch
              </Link>
            )}

            <Link href={fullTreeHref} style={secondaryLinkStyle}>
              Open full tree
            </Link>
          </div>

          <button
            type="button"
            onClick={onDrift}
            style={{
              marginTop: 14,
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontStyle: "italic",
              color: "rgba(246,241,231,0.72)",
            }}
          >
            Drift through the archive
          </button>

          {resurfacingCount > 1 && (
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "rgba(246,241,231,0.44)",
              }}
            >
              Quietly resurfacing from {resurfacingCount} featured memories.
            </div>
          )}
        </div>

        {/* Context woven into the bottom of the opening space */}
        <div
          style={{
            marginTop: "clamp(28px, 4vw, 48px)",
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <ContextMark label="Family scale" value={scaleLabel} />
          <ContextMark label="Historical span" value={historicalLabel} />
          <ContextMark label="Branch focus" value={branchCue} />
        </div>
      </div>
    </section>
  );
}

function ContextMark({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: "rgba(246,241,231,0.40)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          lineHeight: 1.6,
          color: "rgba(246,241,231,0.62)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const secondaryLinkStyle = {
  fontFamily: "var(--font-ui)" as const,
  fontSize: 14,
  color: "rgba(246,241,231,0.88)",
  background: "rgba(246,241,231,0.06)",
  border: "1px solid rgba(246,241,231,0.16)",
  borderRadius: 999,
  padding: "13px 20px",
  textDecoration: "none",
  transition: `background 200ms ${EASE}, border-color 200ms ${EASE}`,
} as const;
