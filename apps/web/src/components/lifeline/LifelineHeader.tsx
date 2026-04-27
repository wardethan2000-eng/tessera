"use client";

import Link from "next/link";
import type { LifelinePerson } from "./lifelineTypes";
import styles from "./lifeline.module.css";

interface LifelineHeaderProps {
  person: LifelinePerson;
  treeId: string;
  personId: string;
  lifespanYears: number | null;
  onDrift: () => void;
  onAddMemory: () => void;
}

export function LifelineHeader({
  person,
  treeId,
  personId,
  lifespanYears,
  onDrift,
  onAddMemory,
}: LifelineHeaderProps) {
  const hasPortrait = !!person.portraitUrl;

  if (hasPortrait) {
    return (
      <header className={styles.header}>
        <div className={styles.portraitHeader}>
          <div
            className={styles.portraitBg}
            style={{ backgroundImage: `url(${person.portraitUrl})` }}
          />
          <div className={styles.portraitGradient} />
          <div className={styles.portraitContent}>
            <Link
              href={`/trees/${treeId}/people/${personId}?section=overview`}
              className={`${styles.backLink} ${styles.actionBtnOnPortrait}`}
            >
              ← Back to {person.displayName}
            </Link>
            <h1 className={styles.nameOnPortrait}>{person.displayName}</h1>
            <p className={styles.datesOnPortrait}>
              {person.birthDateText ?? "?"} — {person.deathDateText ?? (person.isLiving ? "present" : "?")}
              {lifespanYears !== null && (
                <span style={{ marginLeft: 10 }}>
                  · {lifespanYears} years
                </span>
              )}
            </p>
            {person.essenceLine && (
              <p className={styles.essenceOnPortrait}>{person.essenceLine}</p>
            )}
            <div className={styles.actions}>
              <button
                onClick={onDrift}
                className={`${styles.actionBtn} ${styles.actionBtnPrimary} ${styles.actionBtnOnPortrait}`}
              >
                Drift this life
              </button>
              <button
                onClick={onAddMemory}
                className={`${styles.actionBtn} ${styles.actionBtnOnPortrait}`}
              >
                Add a memory
              </button>
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={styles.header}>
      <Link
        href={`/trees/${treeId}/people/${personId}?section=overview`}
        className={styles.backLink}
      >
        ← Back to {person.displayName}
      </Link>
      <h1 className={styles.name}>{person.displayName}</h1>
      <p className={styles.dates}>
        {person.birthDateText ?? "?"} — {person.deathDateText ?? (person.isLiving ? "present" : "?")}
        {lifespanYears !== null && (
          <span style={{ marginLeft: 10 }}>
            · {lifespanYears} years
          </span>
        )}
      </p>
      {person.essenceLine && <p className={styles.essence}>{person.essenceLine}</p>}
      <div className={styles.actions}>
        <button onClick={onDrift} className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
          Drift this life
        </button>
        <button onClick={onAddMemory} className={styles.actionBtn}>
          Add a memory
        </button>
      </div>
    </header>
  );
}
