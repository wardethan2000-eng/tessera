"use client";

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { getProxiedMediaUrl } from "@/lib/media-url";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string | null;
  dateOfEventText: string | null;
  mediaUrl: string | null;
  mimeType?: string | null;
  place?: { label: string } | null;
  memoryContext?: "direct" | "contextual";
}

interface Person {
  id: string;
  displayName: string;
  essenceLine: string | null;
  birthDateText: string | null;
  deathDateText: string | null;
  isLiving: boolean;
  portraitUrl: string | null;
  memories: Memory[];
  directMemories?: Memory[];
  contextualMemories?: Memory[];
}

function extractYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : null;
}

const ERAS: Array<{
  label: string;
  ageStart: number;
  ageEnd: number;
  hue: string;
}> = [
  { label: "Childhood", ageStart: 0, ageEnd: 12, hue: "#C9A26A" },
  { label: "Teen years", ageStart: 13, ageEnd: 19, hue: "#A88B57" },
  { label: "Young adult", ageStart: 20, ageEnd: 35, hue: "#7A7A4F" },
  { label: "Mid life", ageStart: 36, ageEnd: 55, hue: "#4E5D42" },
  { label: "Later years", ageStart: 56, ageEnd: 75, hue: "#5C4F3A" },
  { label: "Elder years", ageStart: 76, ageEnd: 200, hue: "#3F3424" },
];

function eraForAge(age: number): { label: string; hue: string } {
  return ERAS.find((e) => age >= e.ageStart && age <= e.ageEnd) ?? ERAS[ERAS.length - 1]!;
}

export default function LifelinePage({
  params,
}: {
  params: Promise<{ treeId: string; personId: string }>;
}) {
  const { treeId, personId } = use(params);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API}/api/trees/${treeId}/people/${personId}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load person (${res.status})`);
        return res.json();
      })
      .then((data: Person) => {
        if (cancelled) return;
        setPerson(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, personId]);

  const directMemories = useMemo(() => {
    if (!person) return [] as Memory[];
    return (
      person.directMemories ??
      person.memories.filter((m) => m.memoryContext !== "contextual")
    );
  }, [person]);

  const birthYear = useMemo(() => extractYear(person?.birthDateText), [person]);
  const deathYear = useMemo(() => extractYear(person?.deathDateText), [person]);
  const currentYear = new Date().getFullYear();
  const endYear = deathYear ?? (person?.isLiving ? currentYear : currentYear);

  // Group memories by year
  const grouped = useMemo(() => {
    type YearGroup = { year: number; memories: Memory[] };
    const map = new Map<number, Memory[]>();
    const undated: Memory[] = [];
    for (const memory of directMemories) {
      const y = extractYear(memory.dateOfEventText);
      if (y === null) {
        undated.push(memory);
      } else {
        if (!map.has(y)) map.set(y, []);
        map.get(y)!.push(memory);
      }
    }
    const years: YearGroup[] = Array.from(map.entries())
      .map(([year, memories]) => ({ year, memories }))
      .sort((a, b) => a.year - b.year);
    return { years, undated };
  }, [directMemories]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={mutedStyle}>Loading lifeline…</p>
      </main>
    );
  }
  if (error || !person) {
    return (
      <main style={pageStyle}>
        <p style={mutedStyle}>{error ?? "Could not load this person."}</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <Link href={`/trees/${treeId}/people/${personId}`} style={backLinkStyle}>
          ← Back to {person.displayName}
        </Link>
        <h1 style={titleStyle}>{person.displayName}</h1>
        {(person.birthDateText || person.deathDateText) && (
          <p style={subtitleStyle}>
            {person.birthDateText ?? "?"} — {person.deathDateText ?? (person.isLiving ? "present" : "?")}
            {birthYear && (deathYear || person.isLiving) && (
              <span style={{ marginLeft: 10, color: "var(--ink-faded)" }}>
                · {(endYear - birthYear).toString()} years
              </span>
            )}
          </p>
        )}
        {person.essenceLine && <p style={essenceStyle}>{person.essenceLine}</p>}
      </header>

      {grouped.years.length === 0 && grouped.undated.length === 0 ? (
        <div style={emptyStyle}>
          <p style={mutedStyle}>No memories yet for {person.displayName}.</p>
          <Link href={`/trees/${treeId}/people/${personId}`} style={primaryLinkStyle}>
            Add the first memory
          </Link>
        </div>
      ) : (
        <div style={timelineWrapStyle}>
          <div style={spineStyle} aria-hidden />

          {/* Birth marker */}
          {birthYear && (
            <AnchorRow
              year={birthYear}
              label="Born"
              accent="var(--gilt)"
              detail={person.birthDateText ?? String(birthYear)}
            />
          )}

          {grouped.years.map((group) => {
            const age = birthYear ? group.year - birthYear : null;
            const era = age !== null ? eraForAge(age) : null;
            return (
              <YearRow
                key={group.year}
                year={group.year}
                age={age}
                era={era}
                memories={group.memories}
              />
            );
          })}

          {/* Death marker */}
          {deathYear && (
            <AnchorRow
              year={deathYear}
              label="Passed"
              accent="#5C4F3A"
              detail={person.deathDateText ?? String(deathYear)}
            />
          )}

          {grouped.undated.length > 0 && (
            <section style={undatedSectionStyle}>
              <h2 style={sectionHeadingStyle}>Undated memories</h2>
              <div style={cardGridStyle}>
                {grouped.undated.map((m) => (
                  <MemoryCard key={m.id} memory={m} treeId={treeId} personId={personId} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function AnchorRow({
  year,
  label,
  accent,
  detail,
}: {
  year: number;
  label: string;
  accent: string;
  detail: string;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ ...yearColStyle, color: accent }}>
        <span style={anchorLabelStyle}>{label}</span>
        <span style={yearTextStyle}>{year}</span>
      </div>
      <div style={{ ...nodeStyle, background: accent, borderColor: accent }} />
      <div style={anchorBodyStyle}>{detail}</div>
    </div>
  );
}

function YearRow({
  year,
  age,
  era,
  memories,
}: {
  year: number;
  age: number | null;
  era: { label: string; hue: string } | null;
  memories: Memory[];
}) {
  return (
    <div style={rowStyle}>
      <div style={yearColStyle}>
        <span style={yearTextStyle}>{year}</span>
        {age !== null && age >= 0 && (
          <span style={ageStyle}>
            age {age}
            {era && (
              <>
                <br />
                <span style={{ color: era.hue }}>{era.label}</span>
              </>
            )}
          </span>
        )}
      </div>
      <div
        style={{
          ...nodeStyle,
          background: era?.hue ?? "var(--paper)",
          borderColor: era?.hue ?? "var(--rule)",
        }}
      />
      <div style={cardGridStyle}>
        {memories.map((m) => (
          <MemoryCard key={m.id} memory={m} treeId="" personId="" />
        ))}
      </div>
    </div>
  );
}

function MemoryCard({
  memory,
  treeId,
  personId,
}: {
  memory: Memory;
  treeId: string;
  personId: string;
}) {
  const mediaUrl = getProxiedMediaUrl(memory.mediaUrl);
  const isVideo = memory.mimeType?.startsWith("video/");
  const kindIcon: Record<MemoryKind, string> = {
    story: "✎",
    photo: "◻",
    voice: "🎙",
    document: "□",
    other: "✦",
  };
  // Anchor link for back nav from full memory pages would be nice; for now, just visual cards.
  void treeId;
  void personId;
  return (
    <article style={cardStyle}>
      {mediaUrl && memory.kind === "photo" && !isVideo && (
        <img src={mediaUrl} alt={memory.title} style={mediaThumbStyle} loading="lazy" />
      )}
      {mediaUrl && isVideo && (
        <video src={mediaUrl} style={mediaThumbStyle} controls preload="metadata" />
      )}
      {memory.kind === "voice" && mediaUrl && (
        <audio src={mediaUrl} controls style={{ width: "100%" }} preload="metadata" />
      )}
      <div style={cardBodyStyle}>
        <div style={kindRowStyle}>
          <span aria-hidden>{kindIcon[memory.kind]}</span>
          <span style={kindLabelStyle}>{memory.kind}</span>
          {memory.dateOfEventText && (
            <span style={dateChipStyle}>{memory.dateOfEventText}</span>
          )}
        </div>
        <h3 style={cardTitleStyle}>{memory.title}</h3>
        {memory.body && <p style={cardBodyTextStyle}>{memory.body}</p>}
        {memory.place?.label && <p style={placeStyle}>📍 {memory.place.label}</p>}
      </div>
    </article>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "32px 24px 80px",
  maxWidth: 980,
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  marginBottom: 32,
};

const backLinkStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  textDecoration: "none",
};

const titleStyle: CSSProperties = {
  margin: "10px 0 4px",
  fontFamily: "var(--font-display)",
  fontSize: 38,
  fontWeight: 400,
  lineHeight: 1.15,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-soft)",
};

const essenceStyle: CSSProperties = {
  margin: "10px 0 0",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  fontStyle: "italic",
  color: "var(--ink-soft)",
};

const mutedStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-faded)",
};

const emptyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 16,
  padding: "60px 0",
};

const primaryLinkStyle: CSSProperties = {
  background: "var(--moss)",
  color: "#fff",
  borderRadius: 8,
  padding: "10px 16px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  textDecoration: "none",
};

const timelineWrapStyle: CSSProperties = {
  position: "relative",
  paddingLeft: 0,
};

const spineStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: 122,
  width: 2,
  background: "linear-gradient(to bottom, var(--gilt), var(--rule) 10%, var(--rule) 90%, #5C4F3A)",
  borderRadius: 1,
};

const rowStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "100px 24px 1fr",
  gap: 14,
  alignItems: "flex-start",
  marginBottom: 28,
};

const yearColStyle: CSSProperties = {
  textAlign: "right",
  fontFamily: "var(--font-ui)",
  paddingTop: 4,
};

const yearTextStyle: CSSProperties = {
  display: "block",
  fontSize: 22,
  fontFamily: "var(--font-display)",
  fontWeight: 500,
  color: "var(--ink)",
  lineHeight: 1.1,
};

const ageStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 11,
  color: "var(--ink-faded)",
  lineHeight: 1.4,
};

const anchorLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 4,
};

const anchorBodyStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 16,
  fontStyle: "italic",
  color: "var(--ink-soft)",
  paddingTop: 10,
};

const nodeStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid var(--rule)",
  marginTop: 14,
  marginLeft: 5,
  zIndex: 1,
};

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 12,
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 10,
  background: "var(--paper-deep)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const mediaThumbStyle: CSSProperties = {
  width: "100%",
  height: 140,
  objectFit: "cover",
  display: "block",
  background: "var(--paper)",
};

const cardBodyStyle: CSSProperties = {
  padding: "10px 12px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const kindRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-faded)",
  flexWrap: "wrap",
};

const kindLabelStyle: CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const dateChipStyle: CSSProperties = {
  marginLeft: "auto",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 999,
  padding: "1px 8px",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 16,
  fontWeight: 500,
  color: "var(--ink)",
  lineHeight: 1.3,
};

const cardBodyTextStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--ink-soft)",
  lineHeight: 1.5,
  display: "-webkit-box",
  WebkitLineClamp: 4,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const placeStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-faded)",
};

const undatedSectionStyle: CSSProperties = {
  marginTop: 40,
  paddingTop: 24,
  borderTop: "1px solid var(--rule)",
};

const sectionHeadingStyle: CSSProperties = {
  margin: "0 0 12px",
  fontFamily: "var(--font-display)",
  fontSize: 20,
  fontWeight: 400,
  color: "var(--ink-soft)",
};
