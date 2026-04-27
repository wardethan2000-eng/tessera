"use client";

import { useScrollReveal } from "./useScrollReveal";
import styles from "./lifeline.module.css";

interface LifelineAnchorRowProps {
  year: number;
  label: "Born" | "Passed";
  accent: string;
  detail: string;
  place?: string | null;
}

export function LifelineAnchorRow({ year, label, accent, detail, place }: LifelineAnchorRowProps) {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <div
      ref={ref}
      id={`lifeline-anchor-${label.toLowerCase()}`}
      className={`${styles.anchorRow} ${visible ? styles.anchorRowVisible : ""}`}
    >
      <div className={styles.yearCol} style={{ color: accent }}>
        <span className={styles.anchorLabel}>{label}</span>
        <span className={styles.anchorYear}>{year}</span>
      </div>
      <div
        className={styles.node}
        style={{ background: accent, borderColor: accent }}
      />
      <div>
        <div className={styles.anchorDetail}>{detail}</div>
        {place && <span className={styles.anchorPlace}>{place}</span>}
      </div>
    </div>
  );
}