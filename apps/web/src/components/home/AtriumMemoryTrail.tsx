"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";
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

type SectionDepth = "opening" | "branch" | "widening";

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
    <section style={{ padding: "0 max(20px, 5vw) 80px" }}>
      <div
        style={{
          marginBottom: 28,
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
            marginBottom: 40,
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
            gap: 0,
          }}
        >
          {sections.map((section, sectionIndex) => {
            const depth: SectionDepth =
              sectionIndex === 0
                ? "opening"
                : sectionIndex === 1
                  ? "branch"
                  : "widening";

            return (
              <div key={section.id}>
                {sectionIndex > 0 && <ThresholdRule />}
                <TrailSection
                  section={section}
                  peopleById={peopleById}
                  depth={depth}
                  onMemoryClick={onMemoryClick}
                  onPersonClick={onPersonClick}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ThresholdRule() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "clamp(40px, 6vw, 72px) 0 clamp(32px, 5vw, 56px) 0",
      }}
    >
      <div
        style={{
          flex: 1,
          height: 1,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(176,139,62,0.28) 20%, rgba(176,139,62,0.28) 80%, transparent 100%)",
        }}
      />
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "rgba(176,139,62,0.44)",
          boxShadow: "0 0 0 3px rgba(176,139,62,0.10)",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          flex: 1,
          height: 1,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(176,139,62,0.28) 20%, rgba(176,139,62,0.28) 80%, transparent 100%)",
        }}
      />
    </div>
  );
}

function TrailSection({
  section,
  peopleById,
  depth,
  onMemoryClick,
  onPersonClick,
}: {
  section: TrailSection;
  peopleById: Map<string, TrailPerson>;
  depth: SectionDepth;
  onMemoryClick: (memory: TreeHomeMemory) => void;
  onPersonClick: (personId: string) => void;
}) {
  const [leadMemory, ...rest] = section.memories;
  if (!leadMemory) return null;

  if (depth === "widening") {
    return (
      <TrailWideningSection
        section={section}
        onMemoryClick={onMemoryClick}
      />
    );
  }

  const echoes = rest;

  return (
    <section style={{ position: "relative", minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--ink-faded)",
          marginBottom: depth === "opening" ? 8 : 20,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span>{section.title}</span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            textTransform: "none",
            letterSpacing: "normal",
            color: "var(--ink-soft)",
            fontStyle: "italic",
          }}
        >
          {section.description}
        </span>
      </div>

      {depth === "opening" ? (
        <OpeningRoom
          memory={leadMemory}
          peopleById={peopleById}
          onMemoryClick={onMemoryClick}
          onPersonClick={onPersonClick}
        />
      ) : (
        <MountedLead
          memory={leadMemory}
          peopleById={peopleById}
          onMemoryClick={onMemoryClick}
          onPersonClick={onPersonClick}
        />
      )}

      {echoes.length > 0 && (
        <div
          style={{
            position: "relative",
            display: "grid",
            gap: "clamp(18px, 3vw, 28px)",
            marginTop: depth === "opening" ? "clamp(36px, 5vw, 56px)" : "clamp(24px, 3vw, 36px)",
            paddingLeft: depth === "opening" ? "clamp(28px, 5vw, 56px)" : "clamp(20px, 4vw, 44px)",
            minWidth: 0,
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
                "linear-gradient(180deg, transparent 0%, rgba(176,139,62,0.30) 14%, rgba(176,139,62,0.16) 86%, transparent 100%)",
            }}
          />

          {echoes.map((memory) => (
            <WallLabel
              key={memory.id}
              memory={memory}
              peopleById={peopleById}
              onMemoryClick={onMemoryClick}
              onPersonClick={onPersonClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OpeningRoom({
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
        transform: visible ? "translateY(0)" : "translateY(44px)",
        opacity: visible ? 1 : 0.15,
        transition: "transform 1100ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 1100ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onMemoryClick(memory)}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(420px, 72vh, 700px)",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          overflow: "hidden",
          color: "inherit",
          borderRadius: 0,
        }}
      >
        {usesMedia ? (
          <>
            <ContainedMediaImage
              src={mediaUrl ?? ""}
              mimeType={visualItems[0]?.mimeType ?? null}
              alt={memory.title}
              foregroundFilter="grayscale(18%) sepia(10%) contrast(0.96)"
              backdropFilter="blur(28px) grayscale(28%) sepia(12%) contrast(0.9) brightness(0.58)"
              backdropScale={1.08}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(100deg, rgba(16,14,12,0.92) 0%, rgba(16,14,12,0.68) 38%, rgba(16,14,12,0.22) 72%, rgba(16,14,12,0.06) 100%), linear-gradient(180deg, rgba(16,14,12,0.06) 0%, rgba(16,14,12,0.48) 100%)",
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
                "radial-gradient(ellipse at 14% 24%, rgba(201,161,92,0.22), transparent 32%), radial-gradient(ellipse at 82% 14%, rgba(78,93,66,0.16), transparent 26%), linear-gradient(180deg, rgba(32,28,24,0.98) 0%, rgba(16,14,11,0.98) 100%)",
            }}
          />
        )}

        <div
          style={{
            position: "relative",
            minHeight: "clamp(420px, 72vh, 700px)",
            display: "flex",
            alignItems: "flex-end",
            padding: "clamp(36px, 6vw, 72px) clamp(28px, 5vw, 52px)",
          }}
        >
          <div style={{ maxWidth: 740 }}>
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
                color: "rgba(246,241,231,0.56)",
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
                marginTop: 18,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(36px, 7vw, 80px)",
                lineHeight: 0.96,
                color: "rgba(246,241,231,0.97)",
                maxWidth: "13ch",
                textWrap: "balance",
              }}
            >
              {memory.title}
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
              }}
            >
              {memory.personName && (
                <NamePlate light personName={memory.personName} />
              )}
              {relatedPeople.length > 0 && (
                <>
                  {relatedPeople.slice(0, 3).map((person) => (
                    <NamePlate
                      key={person.id}
                      light
                      personName={person.name}
                      portraitUrl={person.portraitUrl}
                      onClick={() => onPersonClick(person.id)}
                    />
                  ))}
                </>
              )}
            </div>

            {excerpt && (
              <p
                style={{
                  margin: "24px 0 0",
                  maxWidth: "56ch",
                  fontFamily: "var(--font-body)",
                  fontSize: 19,
                  lineHeight: 1.82,
                  color: "rgba(246,241,231,0.80)",
                }}
              >
                {excerpt}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function MountedLead({
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
        opacity: visible ? 1 : 0.15,
        transition: "transform 900ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 900ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onMemoryClick(memory)}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "clamp(300px, 50vw, 520px)",
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          overflow: "hidden",
          color: "inherit",
          borderRadius: 14,
        }}
      >
        {usesMedia ? (
          <>
            <ContainedMediaImage
              src={mediaUrl ?? ""}
              mimeType={visualItems[0]?.mimeType ?? null}
              alt={memory.title}
              foregroundFilter="grayscale(14%) sepia(8%) contrast(0.98)"
              backdropFilter="blur(24px) grayscale(22%) sepia(10%) contrast(0.92) brightness(0.62)"
              backdropScale={1.08}
              borderRadius={14}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(95deg, rgba(22,19,16,0.86) 0%, rgba(22,19,16,0.62) 42%, rgba(22,19,16,0.22) 100%), linear-gradient(180deg, rgba(22,19,16,0.06) 0%, rgba(22,19,16,0.40) 100%)",
                borderRadius: 14,
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
                "radial-gradient(circle at 20% 28%, rgba(201,161,92,0.18), transparent 30%), radial-gradient(circle at 76% 20%, rgba(78,93,66,0.14), transparent 24%), linear-gradient(180deg, rgba(34,29,24,0.97) 0%, rgba(18,16,13,0.97) 100%)",
              borderRadius: 14,
            }}
          />
        )}

        <div
          style={{
            position: "relative",
            minHeight: "clamp(300px, 50vw, 520px)",
            display: "flex",
            alignItems: "flex-end",
            padding: "clamp(28px, 5vw, 48px) clamp(24px, 5vw, 40px)",
            borderRadius: 14,
          }}
        >
          <div style={{ maxWidth: 700 }}>
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
                color: "rgba(246,241,231,0.58)",
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
                marginTop: 14,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(32px, 6vw, 64px)",
                lineHeight: 0.98,
                color: "rgba(246,241,231,0.96)",
                maxWidth: "13ch",
                textWrap: "balance",
              }}
            >
              {memory.title}
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
              }}
            >
              {memory.personName && (
                <NamePlate light personName={memory.personName} />
              )}
              {relatedPeople.length > 0 && relatedPeople.slice(0, 3).map((person) => (
                <NamePlate
                  key={person.id}
                  light
                  personName={person.name}
                  portraitUrl={person.portraitUrl}
                  onClick={() => onPersonClick(person.id)}
                />
              ))}
            </div>

            {excerpt && (
              <p
                style={{
                  margin: "18px 0 0",
                  maxWidth: "56ch",
                  fontFamily: "var(--font-body)",
                  fontSize: 17,
                  lineHeight: 1.82,
                  color: "rgba(246,241,231,0.80)",
                }}
              >
                {excerpt}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function WallLabel({
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
  const excerpt = getMemoryExcerpt(memory);
  const relatedPeople = getRelatedPeople(memory, peopleById);
  const [ref, visible] = useTrailReveal();

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        transform: visible ? "translateY(0)" : "translateY(28px)",
        opacity: visible ? 1 : 0.12,
        transition: "transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 800ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onMemoryClick(memory)}
        style={{
          width: "100%",
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
            gridTemplateColumns: mediaUrl && memory.kind === "photo"
              ? "minmax(200px, 280px) minmax(0, 1fr)"
              : "minmax(0, 1fr)",
          }}
        >
          {mediaUrl && memory.kind === "photo" && (
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "4 / 5",
                overflow: "hidden",
                background: "var(--paper-deep)",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(40,30,18,0.10)",
              }}
            >
              <ContainedMediaImage
                src={mediaUrl}
                mimeType={visualItems[0]?.mimeType ?? null}
                alt={memory.title}
                foregroundFilter="grayscale(10%) sepia(6%)"
                backdropFilter="blur(18px) grayscale(18%) sepia(8%) brightness(0.78)"
                backdropScale={1.06}
                borderRadius={10}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(19,17,14,0.02) 0%, rgba(19,17,14,0.14) 100%)",
                  borderRadius: 10,
                }}
              />
            </div>
          )}

          <div style={{ paddingTop: 2, maxWidth: 540 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--ink-faded)",
              }}
            >
              <span>{memory.dateOfEventText ?? "Undated"}</span>
            </div>

            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(22px, 3vw, 32px)",
                lineHeight: 1.08,
                color: "var(--ink)",
                textWrap: "balance",
              }}
            >
              {memory.title}
            </div>

            {memory.personName && (
              <NamePlate personName={memory.personName} />
            )}

            {excerpt && (
              <p
                style={{
                  margin: "12px 0 0",
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  lineHeight: 1.78,
                  color: "var(--ink-soft)",
                  maxWidth: "50ch",
                }}
              >
                {excerpt}
              </p>
            )}

            {relatedPeople.length > 1 && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {relatedPeople.slice(0, 3).map((person) => (
                  <NamePlate
                    key={person.id}
                    personName={person.name}
                    portraitUrl={person.portraitUrl}
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

function TrailWideningSection({
  section,
  onMemoryClick,
}: {
  section: TrailSection;
  onMemoryClick: (memory: TreeHomeMemory) => void;
}) {
  return (
    <section style={{ position: "relative", minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--ink-faded)",
          marginBottom: 20,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span>{section.title}</span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            textTransform: "none",
            letterSpacing: "normal",
            color: "var(--ink-soft)",
            fontStyle: "italic",
          }}
        >
          {section.description}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
          gap: "clamp(16px, 3vw, 24px)",
        }}
      >
        {section.memories.map((memory) => (
          <WideningCard
            key={memory.id}
            memory={memory}
            onMemoryClick={onMemoryClick}
          />
        ))}
      </div>
    </section>
  );
}

function WideningCard({
  memory,
  onMemoryClick,
}: {
  memory: TreeHomeMemory;
  onMemoryClick: (memory: TreeHomeMemory) => void;
}) {
  const visualItems = getMemoryVisualItems(memory);
  const mediaUrl = visualItems[0]?.mediaUrl ?? null;
  const excerpt = getMemoryExcerpt(memory);
  const [ref, visible] = useTrailReveal();

  return (
    <div
      ref={ref}
      style={{
        transform: visible ? "translateY(0)" : "translateY(20px)",
        opacity: visible ? 1 : 0.12,
        transition: "transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 700ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => onMemoryClick(memory)}
        style={{
          width: "100%",
          border: "1px solid rgba(122,108,88,0.14)",
          borderRadius: 14,
          background:
            "linear-gradient(180deg, rgba(255,250,244,0.98) 0%, rgba(244,237,226,0.92) 100%)",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          overflow: "hidden",
        }}
      >
        {mediaUrl && memory.kind === "photo" ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "3 / 2",
              overflow: "hidden",
            }}
          >
            <ContainedMediaImage
              src={mediaUrl}
              mimeType={visualItems[0]?.mimeType ?? null}
              alt={memory.title}
              foregroundFilter="grayscale(8%) sepia(6%)"
              backdropFilter="blur(18px) grayscale(16%) sepia(8%) brightness(0.82)"
              backdropScale={1.06}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, transparent 50%, rgba(244,237,226,0.40) 100%)",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              padding: "20px 18px 0",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--ink-faded)",
              }}
            >
              <span>{memory.dateOfEventText ?? "Undated"}</span>
            </div>
          </div>
        )}

        <div style={{ padding: "14px 18px 18px" }}>
          {mediaUrl && memory.kind === "photo" && (
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                textTransform: "uppercase" as const,
                letterSpacing: "0.10em",
                color: "var(--ink-faded)",
                marginBottom: 6,
              }}
            >
              {memory.dateOfEventText ?? "Undated"}
            </div>
          )}

          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(18px, 2.5vw, 22px)",
              lineHeight: 1.15,
              color: "var(--ink)",
            }}
          >
            {memory.title}
          </div>

          {memory.personName && (
            <div style={{ marginTop: 6 }}>
              <NamePlate personName={memory.personName} />
            </div>
          )}

          {excerpt && (
            <p
              style={{
                margin: "8px 0 0",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.65,
                color: "var(--ink-soft)",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {excerpt}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}

function NamePlate({
  light = false,
  personName,
  portraitUrl,
  onClick,
}: {
  light?: boolean;
  personName: string;
  portraitUrl?: string | null;
  onClick?: () => void;
}) {
  const content = (
    <>
      {portraitUrl ? (
        <div
          style={{
            width: light ? 24 : 22,
            height: light ? 24 : 22,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: light ? "rgba(246,241,231,0.14)" : "var(--paper-deep)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitUrl}
            alt={personName}
            onError={handleMediaError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      ) : (
        <div
          style={{
            width: light ? 24 : 22,
            height: light ? 24 : 22,
            borderRadius: "50%",
            background: light ? "rgba(246,241,231,0.12)" : "rgba(122,108,88,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: light ? 11 : 10,
            color: light ? "rgba(246,241,231,0.8)" : "var(--ink-faded)",
            flexShrink: 0,
          }}
        >
          {personName.charAt(0)}
        </div>
      )}
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: light ? 12 : 12,
          color: light ? "rgba(246,241,231,0.80)" : "var(--ink-soft)",
          letterSpacing: "0.02em",
        }}
      >
        {personName}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          border: light ? "1px solid rgba(246,241,231,0.16)" : "1px solid rgba(122,108,88,0.12)",
          background: light ? "rgba(246,241,231,0.06)" : "rgba(255,255,255,0.50)",
          borderRadius: 999,
          padding: "4px 10px 4px 5px",
          cursor: "pointer",
          backdropFilter: light ? "blur(8px)" : undefined,
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-ui)",
        fontSize: light ? 12 : 12,
        color: light ? "rgba(246,241,231,0.76)" : "var(--ink-soft)",
      }}
    >
      {content}
    </span>
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
              onError={handleMediaError}
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

function ContainedMediaImage({
  src,
  mimeType,
  alt,
  foregroundFilter,
  backdropFilter,
  backdropScale = 1.06,
  borderRadius = 0,
}: {
  src: string;
  mimeType?: string | null;
  alt: string;
  foregroundFilter: string;
  backdropFilter: string;
  backdropScale?: number;
  borderRadius?: number;
}) {
  const isVideo = mimeType?.toLowerCase().startsWith("video/") ?? false;

  return (
    <>
      {isVideo ? (
        <>
          <video
            src={src}
            aria-hidden="true"
            muted
            loop
            playsInline
            autoPlay
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: backdropFilter,
              transform: `scale(${backdropScale})`,
              borderRadius,
            }}
          />
          <video
            src={src}
            muted
            loop
            playsInline
            autoPlay
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: foregroundFilter,
              display: "block",
              borderRadius,
            }}
          />
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            aria-hidden="true"
            onError={handleMediaError}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: backdropFilter,
              transform: `scale(${backdropScale})`,
              borderRadius,
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onError={handleMediaError}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: foregroundFilter,
              display: "block",
              borderRadius,
            }}
          />
        </>
      )}
    </>
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
