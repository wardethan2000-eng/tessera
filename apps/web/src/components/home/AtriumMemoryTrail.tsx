"use client";

import Link from "next/link";
import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeCoverage, TreeHomeMemory } from "./homeTypes";
import { EASE, getHeroExcerpt, getVoiceTranscriptLabel } from "./homeUtils";

type EraValue = "all" | number;

interface TrailSection {
  id: string;
  title: string;
  description: string;
  memories: TreeHomeMemory[];
}

export function AtriumMemoryTrail({
  coverage,
  sections,
  selectedEra,
  selectedEraLabel,
  onSelectEra,
  onMemoryClick,
  openArchiveHref,
}: {
  coverage: TreeHomeCoverage | null;
  sections: TrailSection[];
  selectedEra: EraValue;
  selectedEraLabel: string;
  onSelectEra: (value: EraValue) => void;
  onMemoryClick: (memory: TreeHomeMemory) => void;
  openArchiveHref: string;
}) {
  return (
    <section style={{ padding: "30px max(20px, 5vw) 0" }}>
      <div
        style={{
          marginBottom: 18,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 3vw, 34px)",
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            Follow the thread
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              maxWidth: 720,
              fontFamily: "var(--font-body)",
              fontSize: 15,
              lineHeight: 1.75,
              color: "var(--ink-soft)",
            }}
          >
            Begin with one memory, stay close to its branch, and let the archive widen outward from
            there.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <Link
          href={openArchiveHref}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "var(--moss)",
            textDecoration: "none",
          }}
        >
          Open the full archive →
        </Link>
      </div>

      {coverage && coverage.decadeBuckets.length > 0 && (
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            gap: 10,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
          }}
        >
          <EraChip
            label="All eras"
            active={selectedEra === "all"}
            onClick={() => onSelectEra("all")}
          />
          {coverage.decadeBuckets.map((bucket) => (
            <EraChip
              key={bucket.startYear}
              label={`${bucket.label} · ${bucket.count}`}
              active={selectedEra === bucket.startYear}
              onClick={() => onSelectEra(bucket.startYear)}
            />
          ))}
        </div>
      )}

      {sections.length === 0 ? (
        <div
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 18,
            background:
              "linear-gradient(180deg, rgba(255,250,244,0.98) 0%, rgba(242,235,224,0.94) 100%)",
            padding: "24px clamp(18px, 3vw, 28px)",
            boxShadow: "0 10px 26px rgba(40,30,18,0.04)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              color: "var(--ink)",
            }}
          >
            Nothing surfaced for {selectedEraLabel.toLowerCase()} yet
          </div>
          <p
            style={{
              margin: "10px 0 0",
              maxWidth: 620,
              fontFamily: "var(--font-body)",
              fontSize: 15,
              lineHeight: 1.75,
              color: "var(--ink-soft)",
            }}
          >
            Try another era, or open the full archive while this branch gathers more dated memories.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 22, minWidth: 0 }}>
          {sections.map((section) => (
            <article
              key={section.id}
              style={{
                width: "100%",
                minWidth: 0,
                border: "1px solid rgba(122,108,88,0.18)",
                borderRadius: 20,
                background:
                  "linear-gradient(180deg, rgba(255,250,244,0.92) 0%, rgba(247,241,231,0.72) 100%)",
                padding: "18px 0 18px",
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  padding: "0 clamp(18px, 3vw, 28px)",
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--ink-faded)",
                    marginBottom: 6,
                  }}
                >
                  {section.title}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: "var(--ink-soft)",
                    maxWidth: 720,
                  }}
                >
                  {section.description}
                </div>
              </div>

              <TrailSectionLayout section={section} onMemoryClick={onMemoryClick} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TrailSectionLayout({
  section,
  onMemoryClick,
}: {
  section: TrailSection;
  onMemoryClick: (memory: TreeHomeMemory) => void;
}) {
  const [leadMemory, ...echoes] = section.memories;
  if (!leadMemory) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        minWidth: 0,
      }}
    >
      <TrailLeadMemory
        memory={leadMemory}
        sectionTitle={section.title}
        onClick={() => onMemoryClick(leadMemory)}
      />

      {echoes.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 14,
            minWidth: 0,
            maxWidth: "100%",
            overflowX: "auto",
            padding: "0 clamp(18px, 3vw, 28px)",
            paddingBottom: 6,
            scrollSnapType: "x proximity",
            scrollbarWidth: "none",
          }}
        >
          {echoes.map((memory) => (
            <TrailEchoCard key={memory.id} memory={memory} onClick={() => onMemoryClick(memory)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrailLeadMemory({
  memory,
  sectionTitle,
  onClick,
}: {
  memory: TreeHomeMemory;
  sectionTitle: string;
  onClick: () => void;
}) {
  const mediaUrl = getProxiedMediaUrl(memory.mediaUrl);
  const excerpt = getMemoryExcerpt(memory);
  const usesMedia = Boolean(mediaUrl && (memory.kind === "photo" || memory.kind === "document"));

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        border: "none",
        borderRadius: 24,
        overflow: "hidden",
        cursor: "pointer",
        padding: 0,
        width: "100%",
        background:
          usesMedia
            ? "#181410"
            : "linear-gradient(135deg, rgba(35,30,24,0.98) 0%, rgba(21,18,15,0.98) 100%)",
        color: "rgba(246,241,231,0.96)",
        textAlign: "left",
        boxShadow: "0 18px 48px rgba(28,25,21,0.14)",
      }}
    >
      {usesMedia && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl ?? ""}
            alt={memory.title}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.42,
              filter: "grayscale(22%) sepia(10%) contrast(0.92)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(19,17,14,0.94) 0%, rgba(19,17,14,0.76) 46%, rgba(19,17,14,0.46) 100%), linear-gradient(180deg, rgba(19,17,14,0.12) 0%, rgba(19,17,14,0.38) 100%)",
            }}
          />
        </>
      )}

      {!usesMedia && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 18% 22%, rgba(201,161,92,0.14), transparent 30%), radial-gradient(circle at 78% 20%, rgba(105,120,85,0.14), transparent 28%), linear-gradient(180deg, rgba(36,31,26,0.98) 0%, rgba(21,18,15,0.98) 100%)",
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          minHeight: "clamp(280px, 48vw, 420px)",
          display: "grid",
          alignItems: "end",
          padding: "clamp(24px, 4vw, 34px)",
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(246,241,231,0.08)",
              backdropFilter: "blur(10px)",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "rgba(246,241,231,0.68)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            <span>{sectionTitle}</span>
            {memory.kind && <span style={{ opacity: 0.58 }}>{formatMemoryKind(memory.kind)}</span>}
          </div>

          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(30px, 5vw, 54px)",
              lineHeight: 1.03,
              maxWidth: "14ch",
            }}
          >
            {memory.title}
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "rgba(246,241,231,0.74)",
            }}
          >
            {(memory.personName || memory.dateOfEventText) && (
              <span>
                {memory.personName ?? ""}
                {memory.personName && memory.dateOfEventText ? " · " : ""}
                {memory.dateOfEventText ?? ""}
              </span>
            )}
            <span
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(246,241,231,0.08)",
              }}
            >
              {getLeadDescriptor(memory)}
            </span>
          </div>

          {excerpt && (
            <p
              style={{
                margin: "18px 0 0",
                maxWidth: "58ch",
                fontFamily: "var(--font-body)",
                fontSize: 17,
                lineHeight: 1.8,
                color: "rgba(246,241,231,0.84)",
              }}
            >
              {excerpt}
            </p>
          )}

          <div
            style={{
              marginTop: 22,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "rgba(246,241,231,0.88)",
            }}
          >
            <span
              style={{
                width: 42,
                height: 1,
                background: "rgba(246,241,231,0.35)",
              }}
            />
            <span>Open this memory</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function TrailEchoCard({
  memory,
  onClick,
}: {
  memory: TreeHomeMemory;
  onClick: () => void;
}) {
  const mediaUrl = getProxiedMediaUrl(memory.mediaUrl);
  const excerpt = getMemoryExcerpt(memory);

  return (
    <article
      style={{
        flexShrink: 0,
        width: "min(320px, calc(100vw - 72px))",
        scrollSnapAlign: "start",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          border: "1px solid rgba(122,108,88,0.18)",
          borderRadius: 18,
          overflow: "hidden",
          padding: 0,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.98) 0%, rgba(244,237,226,0.92) 100%)",
          textAlign: "left",
          cursor: "pointer",
          boxShadow: "0 10px 26px rgba(28,25,21,0.06)",
          transition: `transform 220ms ${EASE}, box-shadow 220ms ${EASE}, border-color 220ms ${EASE}`,
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.transform = "translateY(-2px)";
          event.currentTarget.style.boxShadow = "0 16px 34px rgba(28,25,21,0.10)";
          event.currentTarget.style.borderColor = "rgba(78,93,66,0.28)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
          event.currentTarget.style.boxShadow = "0 10px 26px rgba(28,25,21,0.06)";
          event.currentTarget.style.borderColor = "rgba(122,108,88,0.18)";
        }}
      >
        <div
          style={{
            position: "relative",
            height: 196,
            background:
              "radial-gradient(circle at 18% 24%, rgba(201,161,92,0.12), transparent 30%), linear-gradient(180deg, rgba(244,237,226,1) 0%, rgba(236,229,216,1) 100%)",
            overflow: "hidden",
          }}
        >
          {mediaUrl && memory.kind === "photo" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt={memory.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "grayscale(18%) sepia(8%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(180deg, rgba(19,17,14,0.06) 0%, rgba(19,17,14,0.18) 100%)",
                }}
              />
            </>
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: 42,
                color: "rgba(201,161,92,0.34)",
              }}
            >
              {memory.kind === "story" ? "✦" : memory.kind === "voice" ? "◉" : "▤"}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--ink-faded)",
              marginBottom: 8,
            }}
          >
            {memory.personName ?? "Family memory"}
            {memory.personName && memory.dateOfEventText ? " · " : ""}
            {memory.dateOfEventText ?? ""}
          </div>

          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 23,
              lineHeight: 1.2,
              color: "var(--ink)",
            }}
          >
            {memory.title}
          </div>

          {excerpt && (
            <p
              style={{
                margin: "10px 0 0",
                fontFamily: "var(--font-body)",
                fontSize: 15,
                lineHeight: 1.7,
                color: "var(--ink-soft)",
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {excerpt}
            </p>
          )}
        </div>
      </button>
    </article>
  );
}

function getMemoryExcerpt(memory: TreeHomeMemory) {
  const transcriptLabel = getVoiceTranscriptLabel(memory);
  const excerpt =
    memory.kind === "voice" ? transcriptLabel : getHeroExcerpt(memory) ?? transcriptLabel ?? null;
  if (!excerpt) return null;
  return excerpt.length > 220 ? `${excerpt.slice(0, 217).trimEnd()}…` : excerpt;
}

function formatMemoryKind(kind: TreeHomeMemory["kind"]) {
  switch (kind) {
    case "photo":
      return "Photograph";
    case "voice":
      return "Voice";
    case "story":
      return "Story";
    case "document":
      return "Document";
    default:
      return "Memory";
  }
}

function getLeadDescriptor(memory: TreeHomeMemory) {
  switch (memory.kind) {
    case "photo":
      return "Held as an image";
    case "voice":
      return "Heard in a voice";
    case "story":
      return "Told as a story";
    case "document":
      return "Saved as an artifact";
    default:
      return "Preserved in the archive";
  }
}

function EraChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? "1px solid var(--moss)" : "1px solid var(--rule)",
        background: active ? "rgba(78,93,66,0.08)" : "var(--paper-deep)",
        color: active ? "var(--ink)" : "var(--ink-faded)",
        borderRadius: 999,
        padding: "9px 13px",
        minWidth: "fit-content",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-ui)",
        fontSize: 12,
      }}
    >
      {label}
    </button>
  );
}
