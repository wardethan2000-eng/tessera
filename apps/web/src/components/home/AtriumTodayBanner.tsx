"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { TreeHomeTodayHighlights } from "./homeTypes";

type Props = {
  treeId: string;
  today: TreeHomeTodayHighlights | null | undefined;
  onStartRemembrance?: (personId: string) => void;
  onStartPersonDrift?: (personId: string) => void;
};

const cardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "10px 14px",
  borderRadius: 14,
  background: "rgba(217,208,188,0.08)",
  border: "1px solid rgba(217,208,188,0.18)",
  textDecoration: "none",
  color: "var(--paper-deep)",
  minWidth: 0,
};

const portraitStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
  background: "rgba(217,208,188,0.14)",
};

const labelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "var(--ink-faded)",
};

const headlineStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 16,
  lineHeight: 1.3,
  color: "var(--paper-deep)",
};

function formatYearsOld(years: number | null, isLiving: boolean): string {
  if (years === null) return isLiving ? "Today" : "Birthday";
  if (years === 0) return isLiving ? "Born today" : "0";
  return isLiving ? `Turns ${years}` : `Would have been ${years}`;
}

function formatYearsAgo(years: number | null): string {
  if (years === null) return "Today";
  if (years === 0) return "Today";
  if (years === 1) return "1 year ago today";
  return `${years} years ago today`;
}

export function AtriumTodayBanner({
  treeId,
  today,
  onStartRemembrance,
  onStartPersonDrift,
}: Props) {
  if (!today) return null;
  const { birthdays, deathiversaries, memoryAnniversaries } = today;
  const hasAny =
    birthdays.length > 0 ||
    deathiversaries.length > 0 ||
    memoryAnniversaries.length > 0;
  if (!hasAny) return null;

  return (
    <section
      aria-label={`Today, ${today.monthDayLabel}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "18px 20px",
        borderRadius: 18,
        background:
          "linear-gradient(180deg, rgba(217,208,188,0.06), rgba(217,208,188,0.02))",
        border: "1px solid rgba(217,208,188,0.18)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={labelStyle}>Today · {today.monthDayLabel}</div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--paper-deep)",
              lineHeight: 1.2,
            }}
          >
            On this day
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
        }}
      >
        {birthdays.map((person) => (
          <Link
            key={`birthday:${person.personId}`}
            href={`/trees/${treeId}/people/${person.personId}`}
            style={cardStyle}
            title={`Open ${person.name}`}
          >
            {person.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.portraitUrl}
                alt=""
                style={portraitStyle}
              />
            ) : (
              <div style={portraitStyle} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={labelStyle}>
                {person.isLiving ? "Birthday" : "Birthday remembered"}
              </div>
              <div style={headlineStyle}>{person.name}</div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                }}
              >
                {formatYearsOld(person.yearsOld, person.isLiving)}
              </div>
            </div>
            {onStartPersonDrift && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onStartPersonDrift(person.personId);
                }}
                style={driftButtonStyle}
              >
                Drift
              </button>
            )}
          </Link>
        ))}

        {deathiversaries.map((person) => (
          <Link
            key={`death:${person.personId}`}
            href={`/trees/${treeId}/people/${person.personId}`}
            style={cardStyle}
            title={`Open ${person.name}`}
          >
            {person.portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.portraitUrl}
                alt=""
                style={portraitStyle}
              />
            ) : (
              <div style={portraitStyle} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={labelStyle}>In memoriam</div>
              <div style={headlineStyle}>{person.name}</div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                }}
              >
                {formatYearsAgo(person.yearsAgo)}
              </div>
            </div>
            {onStartRemembrance && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onStartRemembrance(person.personId);
                }}
                style={driftButtonStyle}
              >
                Remember
              </button>
            )}
          </Link>
        ))}

        {memoryAnniversaries.map((memory) => (
          <Link
            key={`memory:${memory.memoryId}`}
            href={`/trees/${treeId}/memories/${memory.memoryId}`}
            style={cardStyle}
            title={memory.title}
          >
            <div style={portraitStyle} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={labelStyle}>
                {memory.yearsAgo !== null
                  ? `${memory.yearsAgo} year${memory.yearsAgo === 1 ? "" : "s"} ago`
                  : "On this day"}
              </div>
              <div style={headlineStyle}>{memory.title}</div>
              {memory.primaryPersonName && (
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                  }}
                >
                  {memory.primaryPersonName}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const driftButtonStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(217,208,188,0.35)",
  background: "transparent",
  color: "var(--paper-deep)",
  cursor: "pointer",
  flexShrink: 0,
};
