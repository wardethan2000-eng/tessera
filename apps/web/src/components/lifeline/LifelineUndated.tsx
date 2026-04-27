"use client";

import { type LifelineMemory } from "./lifelineTypes";
import { LifelineMemoryCard } from "./LifelineMemoryCard";
import styles from "./lifeline.module.css";

interface LifelineUndatedProps {
  memories: LifelineMemory[];
  treeId: string;
  personId: string;
}

export function LifelineUndated({ memories, treeId, personId }: LifelineUndatedProps) {
  if (memories.length === 0) return null;

  return (
    <section className={styles.undatedSection}>
      <h2 className={styles.undatedHeading}>Time unknown</h2>
      <p className={styles.undatedSub}>
        Some memories arrive without a date. They belong here.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {memories.map((m) => (
          <LifelineMemoryCard
            key={m.id}
            memory={m}
            treeId={treeId}
            personId={personId}
          />
        ))}
      </div>
    </section>
  );
}