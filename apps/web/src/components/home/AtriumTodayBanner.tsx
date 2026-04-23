"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";
import type { TreeHomeTodayHighlights } from "./homeTypes";

type Props = {
  treeId: string;
  today: TreeHomeTodayHighlights | null | undefined;
  onStartRemembrance?: (personId: string) => void;
  onStartPersonDrift?: (personId: string) => void;
};

function formatYearsOld(years: number | null, isLiving: boolean): string {
  if (years === null) return isLiving ? "Birthday" : "Born this day";
  if (years === 0) return isLiving ? "Born today" : "0";
  return isLiving ? `Turns ${years}` : `Would have been ${years}`;
}

function formatYearsAgo(years: number | null): string {
  if (years === null) return "Today";
  if (years === 0) return "Today";
  if (years === 1) return "1 year ago today";
  return `${years} years ago today`;
}

function formatUpcomingYearsOld(years: number | null, isLiving: boolean, daysUntil: number, relativeLabel: string | null): string {
  const label = relativeLabel ?? (daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`);
  if (years === null) return isLiving ? `${label} — Birthday` : `${label} — Birthday remembered`;
  return isLiving ? `${label} — Turns ${years}` : `${label} — Would have been ${years}`;
}

function formatUpcomingYearsAgo(years: number | null, daysUntil: number, relativeLabel: string | null): string {
  const label = relativeLabel ?? (daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`);
  if (years === null) return label;
  if (years === 1) return `${label} — 1 year ago`;
  return `${label} — ${years} years ago`;
}

export function AtriumTodayBanner({
  treeId,
  today,
  onStartRemembrance,
  onStartPersonDrift,
}: Props) {
  if (!today) return null;
  const { birthdays, deathiversaries, memoryAnniversaries } = today;

  const todayBirthdays = birthdays.filter((p) => p.daysUntil === 0);
  const todayDeathiversaries = deathiversaries.filter((p) => p.daysUntil === 0);
  const todayMemoryAnniversaries = memoryAnniversaries.filter((p) => p.daysUntil === 0);

  const upcomingBirthdays = birthdays.filter((p) => p.daysUntil > 0);
  const upcomingDeathiversaries = deathiversaries.filter((p) => p.daysUntil > 0);
  const upcomingMemoryAnniversaries = memoryAnniversaries.filter((p) => p.daysUntil > 0);

  const hasToday = todayBirthdays.length > 0 || todayDeathiversaries.length > 0 || todayMemoryAnniversaries.length > 0;
  const hasUpcoming = upcomingBirthdays.length > 0 || upcomingDeathiversaries.length > 0 || upcomingMemoryAnniversaries.length > 0;

  if (!hasToday && !hasUpcoming) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "clamp(24px, 4vw, 40px) max(20px, 5vw)" }}>
      {hasToday && (
        <section
          aria-label={`Today, ${today.monthDayLabel}`}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(22px, 3vw, 28px)",
                fontWeight: 400,
                color: "var(--ink)",
                lineHeight: 1.15,
              }}
            >
              On this day
            </div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                letterSpacing: "0.08em",
                color: "var(--ink-faded)",
                textTransform: "uppercase",
              }}
            >
              {today.monthDayLabel}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
              gap: 12,
            }}
          >
            {todayBirthdays.map((person) => (
              <NoticeCard
                key={`birthday:${person.personId}`}
                href={`/trees/${treeId}/people/${person.personId}`}
                portraitUrl={person.portraitUrl}
                label={person.isLiving ? "Birthday" : "Birthday remembered"}
                name={person.name}
                detail={formatYearsOld(person.yearsOld, person.isLiving)}
                isMilestone={person.yearsOld !== null && person.yearsOld > 0 && person.yearsOld % 10 === 0}
                action={onStartPersonDrift ? { label: "Drift", onClick: () => onStartPersonDrift(person.personId) } : undefined}
              />
            ))}

            {todayDeathiversaries.map((person) => (
              <NoticeCard
                key={`death:${person.personId}`}
                href={`/trees/${treeId}/people/${person.personId}`}
                portraitUrl={person.portraitUrl}
                label="In memoriam"
                name={person.name}
                detail={formatYearsAgo(person.yearsAgo)}
                isMilestone={person.yearsAgo !== null && person.yearsAgo > 0 && person.yearsAgo % 10 === 0}
                action={onStartRemembrance ? { label: "Remember", onClick: () => onStartRemembrance(person.personId) } : undefined}
                tone="memorial"
              />
            ))}

            {todayMemoryAnniversaries.map((memory) => (
              <NoticeCard
                key={`memory:${memory.memoryId}`}
                href={`/trees/${treeId}/memories/${memory.memoryId}`}
                label={memory.yearsAgo !== null ? `${memory.yearsAgo} year${memory.yearsAgo === 1 ? "" : "s"} ago` : "On this day"}
                name={memory.title}
                detail={memory.primaryPersonName ?? undefined}
                isMilestone={memory.yearsAgo !== null && memory.yearsAgo > 0 && memory.yearsAgo % 10 === 0}
              />
            ))}
          </div>
        </section>
      )}

      {hasUpcoming && (
        <section
          aria-label="Coming up"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(18px, 2.5vw, 22px)",
                fontWeight: 400,
                color: "var(--ink-soft)",
                lineHeight: 1.2,
              }}
            >
              Coming up
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
              gap: 8,
            }}
          >
            {upcomingBirthdays.map((person) => (
              <CompactNoticeCard
                key={`birthday-upcoming:${person.personId}`}
                href={`/trees/${treeId}/people/${person.personId}`}
                portraitUrl={person.portraitUrl}
                name={person.name}
                detail={formatUpcomingYearsOld(person.yearsOld, person.isLiving, person.daysUntil, person.relativeLabel)}
                action={onStartPersonDrift ? { label: "Drift", onClick: () => onStartPersonDrift(person.personId) } : undefined}
              />
            ))}

            {upcomingDeathiversaries.map((person) => (
              <CompactNoticeCard
                key={`death-upcoming:${person.personId}`}
                href={`/trees/${treeId}/people/${person.personId}`}
                portraitUrl={person.portraitUrl}
                name={person.name}
                detail={formatUpcomingYearsAgo(person.yearsAgo, person.daysUntil, person.relativeLabel)}
                tone="memorial"
                action={onStartRemembrance ? { label: "Remember", onClick: () => onStartRemembrance(person.personId) } : undefined}
              />
            ))}

            {upcomingMemoryAnniversaries.map((memory) => (
              <CompactNoticeCard
                key={`memory-upcoming:${memory.memoryId}`}
                href={`/trees/${treeId}/memories/${memory.memoryId}`}
                name={memory.title}
                detail={memory.yearsAgo !== null ? `${memory.yearsAgo} year${memory.yearsAgo === 1 ? "" : "s"} ago` : "Anniversary"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function NoticeCard({
  href,
  portraitUrl,
  label,
  name,
  detail,
  isMilestone,
  action,
  tone = "default",
}: {
  href: string;
  portraitUrl?: string | null;
  label: string;
  name: string;
  detail?: string;
  isMilestone?: boolean;
  action?: { label: string; onClick: () => void };
  tone?: "default" | "memorial";
}) {
  const isMemorial = tone === "memorial";

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 14,
        background: isMemorial
          ? "linear-gradient(135deg, rgba(168,93,93,0.06) 0%, rgba(244,237,226,0.06) 100%)"
          : isMilestone
            ? "linear-gradient(135deg, rgba(176,139,62,0.10) 0%, rgba(244,237,226,0.06) 100%)"
            : "linear-gradient(180deg, rgba(255,250,244,0.96) 0%, rgba(244,237,226,0.88) 100%)",
        border: isMemorial
          ? "1px solid rgba(168,93,93,0.16)"
          : isMilestone
            ? "1px solid rgba(176,139,62,0.22)"
            : "1px solid rgba(122,108,88,0.12)",
        textDecoration: "none",
        color: "var(--ink)",
        minWidth: 0,
        boxShadow: isMilestone
          ? "0 4px 16px rgba(176,139,62,0.10)"
          : "0 2px 8px rgba(40,30,18,0.04)",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
      }}
    >
      {portraitUrl !== undefined && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: isMemorial
              ? "rgba(168,93,93,0.08)"
              : "var(--paper-deep)",
            border: isMilestone
              ? "2px solid rgba(176,139,62,0.30)"
              : "1px solid rgba(122,108,88,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {portraitUrl ? (
            <img
              src={getProxiedMediaUrl(portraitUrl) ?? portraitUrl}
              alt={name}
              onError={handleMediaError}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                color: isMemorial ? "rgba(168,93,93,0.6)" : "var(--ink-faded)",
              }}
            >
              {name.charAt(0)}
            </span>
          )}
        </div>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: isMemorial
              ? "rgba(168,93,93,0.70)"
              : isMilestone
                ? "rgba(176,139,62,0.80)"
                : "var(--ink-faded)",
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 17,
            lineHeight: 1.25,
            color: isMemorial ? "rgba(120,50,50,0.92)" : "var(--ink)",
          }}
        >
          {name}
        </div>
        {detail && (
          <div
            style={{
              marginTop: 2,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--ink-soft)",
              lineHeight: 1.4,
            }}
          >
            {detail}
          </div>
        )}
      </div>

      {action && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            action.onClick();
          }}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            letterSpacing: 1,
            textTransform: "uppercase" as const,
            padding: "6px 12px",
            borderRadius: 999,
            border: isMemorial
              ? "1px solid rgba(168,93,93,0.28)"
              : "1px solid rgba(122,108,88,0.22)",
            background: "transparent",
            color: isMemorial ? "rgba(168,93,93,0.80)" : "var(--ink-soft)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {action.label}
        </button>
      )}
    </Link>
  );
}

function CompactNoticeCard({
  href,
  portraitUrl,
  name,
  detail,
  action,
  tone = "default",
}: {
  href: string;
  portraitUrl?: string | null;
  name: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  tone?: "default" | "memorial";
}) {
  const isMemorial = tone === "memorial";

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        background: isMemorial
          ? "rgba(168,93,93,0.03)"
          : "rgba(255,250,244,0.60)",
        border: isMemorial
          ? "1px solid rgba(168,93,93,0.10)"
          : "1px solid rgba(122,108,88,0.08)",
        textDecoration: "none",
        color: "var(--ink)",
        minWidth: 0,
      }}
    >
      {portraitUrl && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: "var(--paper-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={getProxiedMediaUrl(portraitUrl) ?? portraitUrl}
            alt={name}
            onError={handleMediaError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 15,
            lineHeight: 1.2,
            color: isMemorial ? "rgba(120,50,50,0.85)" : "var(--ink)",
          }}
        >
          {name}
        </div>
        {detail && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--ink-soft)",
              lineHeight: 1.3,
            }}
          >
            {detail}
          </div>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            action.onClick();
          }}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: "uppercase" as const,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(122,108,88,0.16)",
            background: "transparent",
            color: "var(--ink-faded)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {action.label}
        </button>
      )}
    </Link>
  );
}