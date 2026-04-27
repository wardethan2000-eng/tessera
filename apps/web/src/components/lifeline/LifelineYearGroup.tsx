"use client";

import Link from "next/link";
import { extractYear } from "@/lib/date-utils";
import { useScrollReveal } from "./useScrollReveal";
import { type LifelineYearGroup as YearGroupData, type LifelineRelationshipEvent } from "./lifelineTypes";
import { LifelineMemoryCard } from "./LifelineMemoryCard";
import styles from "./lifeline.module.css";

interface LifelineYearGroupProps {
  group: YearGroupData;
  treeId: string;
  personId: string;
  birthYear: number | null;
}

export function LifelineYearGroup({ group, treeId, personId, birthYear }: LifelineYearGroupProps) {
  const { ref, visible } = useScrollReveal(0.16);

  return (
    <div
      ref={ref}
      id={`lifeline-year-${group.year}`}
      data-year={group.year}
      data-birth-year={birthYear ?? ""}
      className={`${styles.yearGroup} ${visible ? styles.yearGroupVisible : ""}`}
    >
      <div className={styles.yearCol}>
        <span className={styles.yearText}>{group.year}</span>
        {group.age !== null && group.age >= 0 && (
          <span className={styles.ageLine}>
            age {group.age}
            {group.era && (
              <>
                <br />
                <span className={styles.eraLabelInline} style={{ color: group.era.hue }}>
                  {group.era.label}
                </span>
              </>
            )}
          </span>
        )}
      </div>
      <div
        className={styles.node}
        style={{
          background: group.era?.hue ?? "var(--paper)",
          borderColor: group.era?.hue ?? "var(--rule)",
        }}
      />
      <div className={styles.yearContent}>
        {group.relationshipEvents.map((rel) => (
          <RelationshipMarker key={rel.id} event={rel} treeId={treeId} personId={personId} />
        ))}
        {group.memories.map((m) => (
          <LifelineMemoryCard
            key={m.id}
            memory={m}
            treeId={treeId}
            personId={personId}
          />
        ))}
      </div>
    </div>
  );
}

function RelationshipMarker({
  event,
  treeId,
  personId,
}: {
  event: LifelineRelationshipEvent;
  treeId: string;
  personId: string;
}) {
  if (event.type !== "spouse") return null;

  const partner =
    event.fromPerson.id === personId ? event.toPerson : event.fromPerson;
  const year = extractYear(event.startDateText);

  if (!event.startDateText) return null;

  let symbol = "\u221E";
  let label = "Married";
  if (event.spouseStatus === "former") {
    symbol = "\u2194";
    label = "Partnership ended with";
  } else if (event.spouseStatus === "deceased_partner") {
    symbol = "\u221E";
    label = "Married";
  }

  return (
    <div className={styles.relationshipMarker}>
      <span className={styles.relationshipSymbol} style={{ color: "var(--rose)" }}>
        {symbol}
      </span>
      <span>{label}</span>
      <Link
        href={`/trees/${treeId}/people/${partner.id}`}
        className={styles.relationshipPartnerLink}
      >
        {partner.displayName}
      </Link>
      {year && <span className={styles.relationshipDate}>{event.startDateText}</span>}
    </div>
  );
}