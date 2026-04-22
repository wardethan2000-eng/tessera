"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getProxiedMediaUrl } from "@/lib/media-url";
import type { TreeHomeCoverage, TreeHomeMemory } from "./homeTypes";
import { getHeroExcerpt, getVoiceTranscriptLabel } from "./homeUtils";

type EraValue = "all" | number;

interface TrailSection {
  id: string;
  title: string;
  description: string;
  memories: TreeHomeMemory[];
}

interface TrailPerson {
  id: string;
  name: string;
  portraitUrl: string | null;
}

type TrailVisualMediaItem = {
  mediaUrl: string;
  mimeType: string | null;
};

export function AtriumMemoryTrail({
  coverage,
  sections,
  people,
  selectedEra,
  selectedEraLabel,
  onSelectEra,
  onPersonClick,
  onMemoryClick,
  openArchiveHref,
}: {
  coverage: TreeHomeCoverage | null;
  sections: TrailSection[];
  people: TrailPerson[];
  selectedEra: EraValue;
  selectedEraLabel: string;
  onSelectEra: (value: EraValue) => void;
  onPersonClick: (personId: string) => void;
  onMemoryClick: (memory: TreeHomeMemory) => void;
  openArchiveHref: string;
}) {
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return (
    <section style={{ padding: "42px max(20px, 5vw) 64px" }}>
      <div
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
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
            marginBottom: 34,
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
        <div
          style={{
            display: "grid",
            gap: "clamp(28px, 4vw, 48px)",
          }}
        >
          {sections.map((section, sectionIndex) => (
            <TrailSectionThread
              key={section.id}
              section={section}
              peopleById={peopleById}
              sectionIndex={sectionIndex}
              onMemoryClick={onMemoryClick}
              onPersonClick={onPersonClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TrailSectionThread({
  section,
  peopleById,
  sectionIndex,
  onMemoryClick,
  onPersonClick,
}: {
  section: TrailSection;
  peopleById: Map<string, TrailPerson>;
  sectionIndex: number;
  onMemoryClick: (memory: TreeHomeMemory) => void;
  onPersonClick: (personId: string) => void;
}) {
  const [leadMemory, ...echoes] = section.memories;
  if (!leadMemory) return null;

  return (
    <section
      style={{
        position: "relative",
        minWidth: 0,
        marginTop: sectionIndex === 0 ? 0 : "clamp(-18px, -2vw, -10px)",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "grid",
          gap: "clamp(10px, 2vw, 18px)",
        }}
      >
        <TrailLeadScene
          memory={leadMemory}
          peopleById={peopleById}
          onMemoryClick={onMemoryClick}
          onPersonClick={onPersonClick}
        />

        {echoes.length > 0 && (
          <div
            style={{
              position: "relative",
              display: "grid",
              gap: "clamp(10px, 2vw, 18px)",
              paddingLeft: "clamp(20px, 4vw, 44px)",
              minWidth: 0,
              marginTop: "clamp(-40px, -5vw, -24px)",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 4,
                top: 8,
                bottom: 8,
                width: 1,
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(176,139,62,0.34) 12%, rgba(176,139,62,0.18) 88%, transparent 100%)",
              }}
            />

            {echoes.map((memory, index) => (
              <TrailEchoEntry
                key={memory.id}
                memory={memory}
                peopleById={peopleById}
                index={index}
                onMemoryClick={onMemoryClick}
                onPersonClick={onPersonClick}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrailLeadScene({
  memory,
  peopleById,
  onMemoryClick,
  onPersonClick,
}: {
  memory: TreeHomeMemory;
  peopleById: Map<string, TrailPerson>;
  onMemoryClick: (memory: TreeHomeMemory) => void;
  onPersonClick: (personId: string) => void;
}) {
  const visualItems = getMemoryVisualItems(memory);
  const mediaUrl = visualItems[0]?.mediaUrl ?? null;
  const mediaCount = visualItems.length;
  const excerpt = getMemoryExcerpt(memory);
  const usesMedia = Boolean(mediaUrl && (memory.kind === "photo" || memory.kind === "document"));
  const relatedPeople = getRelatedPeople(memory, peopleById);
  const [ref, visible] = useTrailReveal();

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        transform: visible ? "translateY(0)" : "translateY(38px)",
        opacity: visible ? 1 : 0.2,
        transition: "transform 900ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 900ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onMemoryClick(memory)}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(360px, 62vw, 620px)",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          overflow: "hidden",
          color: "inherit",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.96) 12%, rgba(0,0,0,0.96) 88%, transparent 100%)",
          maskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.96) 12%, rgba(0,0,0,0.96) 88%, transparent 100%)",
        }}
      >
        {usesMedia ? (
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
                filter: "grayscale(24%) sepia(10%) contrast(0.94)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(90deg, rgba(22,19,16,0.88) 0%, rgba(22,19,16,0.66) 44%, rgba(22,19,16,0.28) 100%), linear-gradient(180deg, rgba(22,19,16,0.10) 0%, rgba(22,19,16,0.42) 100%)",
              }}
            />
            {mediaCount > 1 && (
              <MemoryStackHint items={visualItems.slice(1, 3)} totalCount={mediaCount} light />
            )}
          </>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 16% 20%, rgba(201,161,92,0.18), transparent 28%), radial-gradient(circle at 78% 18%, rgba(91,104,74,0.14), transparent 24%), linear-gradient(180deg, rgba(39,33,27,0.98) 0%, rgba(20,17,14,0.98) 100%)",
            }}
          />
        )}

        <div
          style={{
            position: "relative",
            minHeight: "clamp(360px, 62vw, 620px)",
            display: "flex",
            alignItems: "flex-end",
            padding: "clamp(28px, 5vw, 54px) clamp(22px, 5vw, 40px)",
          }}
        >
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(246,241,231,0.64)",
              }}
            >
              <span>{memory.dateOfEventText ?? "Undated"}</span>
              {mediaCount > 1 && (
                <>
                  <span style={{ opacity: 0.46 }}>·</span>
                  <span>{mediaCount} items</span>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(34px, 7vw, 78px)",
                lineHeight: 0.98,
                color: "rgba(246,241,231,0.98)",
                maxWidth: "13ch",
                textWrap: "balance",
              }}
            >
              {memory.title}
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "rgba(246,241,231,0.76)",
              }}
            >
              {memory.personName && <span>{memory.personName}</span>}
            </div>

            {excerpt && (
              <p
                style={{
                  margin: "20px 0 0",
                  maxWidth: "58ch",
                  fontFamily: "var(--font-body)",
                  fontSize: 18,
                  lineHeight: 1.85,
                  color: "rgba(246,241,231,0.84)",
                }}
              >
                {excerpt}
              </p>
            )}

            {relatedPeople.length > 0 && (
              <div
                style={{
                  marginTop: 22,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {relatedPeople.map((person) => (
                  <PersonBubble
                    key={person.id}
                    person={person}
                    light
                    onClick={() => onPersonClick(person.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function TrailEchoEntry({
  memory,
  peopleById,
  index,
  onMemoryClick,
  onPersonClick,
}: {
  memory: TreeHomeMemory;
  peopleById: Map<string, TrailPerson>;
  index: number;
  onMemoryClick: (memory: TreeHomeMemory) => void;
  onPersonClick: (personId: string) => void;
}) {
  const visualItems = getMemoryVisualItems(memory);
  const mediaUrl = visualItems[0]?.mediaUrl ?? null;
  const mediaCount = visualItems.length;
  const excerpt = getMemoryExcerpt(memory);
  const relatedPeople = getRelatedPeople(memory, peopleById);
  const alignsRight = index % 2 === 1;
  const [ref, visible] = useTrailReveal();

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        display: "flex",
        justifyContent: alignsRight ? "flex-end" : "flex-start",
        transform: visible ? "translateY(0)" : "translateY(30px)",
        opacity: visible ? 1 : 0.18,
        transition: "transform 900ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 900ms ease",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -2,
          top: 18,
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "rgba(176,139,62,0.62)",
          boxShadow: "0 0 0 6px rgba(176,139,62,0.08)",
        }}
      />

      <button
        type="button"
        onClick={() => onMemoryClick(memory)}
        style={{
          width: "min(100%, 860px)",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 18,
            alignItems: "start",
            gridTemplateColumns:
              mediaUrl && memory.kind === "photo"
                ? alignsRight
                  ? "minmax(0, 1fr) minmax(200px, 320px)"
                  : "minmax(200px, 320px) minmax(0, 1fr)"
                : "minmax(0, 1fr)",
          }}
        >
          {mediaUrl && memory.kind === "photo" && !alignsRight && (
            <TrailEchoImage items={visualItems} title={memory.title} />
          )}

          <div
            style={{
              paddingTop: 2,
              maxWidth: 560,
              justifySelf: alignsRight ? "end" : "start",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--ink-faded)",
              }}
            >
              <span>{memory.dateOfEventText ?? "Undated"}</span>
              {mediaCount > 1 && (
                <>
                  <span style={{ opacity: 0.42 }}>·</span>
                  <span>{mediaCount} items</span>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 10,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(28px, 4vw, 42px)",
                lineHeight: 1.05,
                color: "var(--ink)",
                textWrap: "balance",
              }}
            >
              {memory.title}
            </div>

            {excerpt && (
              <p
                style={{
                  margin: "14px 0 0",
                  fontFamily: "var(--font-body)",
                  fontSize: 17,
                  lineHeight: 1.85,
                  color: "var(--ink-soft)",
                }}
              >
                {excerpt}
              </p>
            )}

            {relatedPeople.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {relatedPeople.map((person) => (
                  <PersonBubble key={person.id} person={person} onClick={() => onPersonClick(person.id)} />
                ))}
              </div>
            )}
          </div>

          {mediaUrl && memory.kind === "photo" && alignsRight && (
            <TrailEchoImage items={visualItems} title={memory.title} />
          )}
        </div>
      </button>
    </div>
  );
}

function TrailEchoImage({
  items,
  title,
}: {
  items: TrailVisualMediaItem[];
  title: string;
}) {
  const primary = items[0] ?? null;
  const layered = items.slice(1, 3);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "4 / 5",
        overflow: "hidden",
        background: "rgba(237,230,214,0.72)",
        WebkitMaskImage:
          "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.96) 12%, rgba(0,0,0,0.96) 88%, transparent 100%)",
        maskImage:
          "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.96) 12%, rgba(0,0,0,0.96) 88%, transparent 100%)",
      }}
    >
      {layered.length > 0 && (
        <MemoryStackHint items={layered} totalCount={items.length} compact />
      )}
      {primary && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={primary.mediaUrl}
            alt={title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "grayscale(20%) sepia(10%)",
            }}
          />
        </>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(19,17,14,0.04) 0%, rgba(19,17,14,0.18) 100%)",
        }}
      />
    </div>
  );
}

function MemoryStackHint({
  items,
  totalCount,
  compact = false,
  light = false,
}: {
  items: TrailVisualMediaItem[];
  totalCount: number;
  compact?: boolean;
  light?: boolean;
}) {
  if (items.length === 0 || totalCount <= 1) return null;

  return (
    <div
      style={{
        position: "absolute",
        right: compact ? 12 : "clamp(18px, 4vw, 32px)",
        top: compact ? 12 : "clamp(18px, 4vw, 32px)",
        width: compact ? 96 : "clamp(130px, 16vw, 200px)",
        aspectRatio: "4 / 5",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      {items
        .slice(0, 2)
        .reverse()
        .map((item, index) => (
          <div
            key={`${item.mediaUrl}-${index}`}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${index * -10}px, ${index * 10}px) rotate(${index === 0 ? -3 : 3}deg)`,
              borderRadius: 16,
              overflow: "hidden",
              border: light
                ? "1px solid rgba(246,241,231,0.22)"
                : "1px solid rgba(122,108,88,0.16)",
              boxShadow: light
                ? "0 16px 30px rgba(8,7,6,0.24)"
                : "0 12px 24px rgba(35,28,19,0.12)",
              background: light ? "rgba(246,241,231,0.08)" : "rgba(255,255,255,0.66)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.mediaUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                filter: compact ? "grayscale(28%) sepia(10%)" : "grayscale(18%) sepia(10%)",
              }}
            />
          </div>
        ))}

      <div
        style={{
          position: "absolute",
          left: compact ? 8 : 10,
          bottom: compact ? 8 : 10,
          borderRadius: 999,
          padding: compact ? "4px 8px" : "6px 10px",
          background: light ? "rgba(22,19,16,0.74)" : "rgba(255,255,255,0.82)",
          color: light ? "rgba(246,241,231,0.92)" : "var(--ink)",
          fontFamily: "var(--font-ui)",
          fontSize: compact ? 11 : 12,
          backdropFilter: "blur(8px)",
          border: light
            ? "1px solid rgba(246,241,231,0.16)"
            : "1px solid rgba(122,108,88,0.12)",
        }}
      >
        {totalCount} items
      </div>
    </div>
  );
}

function PersonBubble({
  person,
  light = false,
  onClick,
}: {
  person: TrailPerson;
  light?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        border: light ? "1px solid rgba(246,241,231,0.18)" : "1px solid rgba(122,108,88,0.14)",
        background: light ? "rgba(246,241,231,0.08)" : "rgba(255,255,255,0.62)",
        color: light ? "rgba(246,241,231,0.92)" : "var(--ink)",
        borderRadius: 999,
        padding: "6px 10px 6px 6px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        backdropFilter: light ? "blur(10px)" : undefined,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: light ? "rgba(246,241,231,0.14)" : "var(--paper-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {person.portraitUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={person.portraitUrl}
              alt={person.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              color: light ? "rgba(246,241,231,0.88)" : "var(--ink-faded)",
            }}
          >
            {person.name.charAt(0)}
          </span>
        )}
      </div>
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 12,
        }}
      >
        {person.name}
      </span>
    </button>
  );
}

function getRelatedPeople(memory: TreeHomeMemory, peopleById: Map<string, TrailPerson>) {
  return [...new Set(memory.relatedPersonIds ?? [])]
    .map((personId) => peopleById.get(personId))
    .filter((person): person is TrailPerson => Boolean(person))
    .slice(0, 5);
}

function useTrailReveal(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

function getMemoryExcerpt(memory: TreeHomeMemory) {
  const transcriptLabel = getVoiceTranscriptLabel(memory);
  const excerpt =
    memory.kind === "voice" ? transcriptLabel : getHeroExcerpt(memory) ?? transcriptLabel ?? null;
  if (!excerpt) return null;
  return excerpt.length > 260 ? `${excerpt.slice(0, 257).trimEnd()}…` : excerpt;
}

function getMemoryVisualItems(memory: TreeHomeMemory) {
  const candidates =
    memory.mediaItems && memory.mediaItems.length > 0
      ? memory.mediaItems
      : memory.mediaUrl
        ? [
            {
              id: `${memory.id}-primary`,
              sortOrder: 0,
              mediaId: null,
              mediaUrl: memory.mediaUrl,
              mimeType: memory.mimeType ?? null,
            },
          ]
        : [];

  const normalized = candidates
    .map((item) => ({
      mediaUrl: getProxiedMediaUrl(item.mediaUrl) ?? null,
      mimeType: item.mimeType ?? null,
    }))
    .filter((item): item is TrailVisualMediaItem => item.mediaUrl !== null);

  const images = normalized.filter(
    (item) =>
      item.mimeType?.toLowerCase().startsWith("image/") ||
      memory.kind === "photo" ||
      memory.kind === "document",
  );

  return images.length > 0 ? images : normalized;
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
