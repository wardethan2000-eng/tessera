"use client";

import { LIFELINE_ERAS } from "@/lib/date-utils";
import styles from "./lifeline.module.css";

interface EraRailProps {
  eraCounts: Record<string, number>;
  activeEra: string | null;
  onEraClick: (eraLabel: string) => void;
}

export function LifelineEraRail({ eraCounts, activeEra, onEraClick }: EraRailProps) {
  return (
    <>
      <nav className={styles.eraRail} aria-label="Lifeline eras">
        {LIFELINE_ERAS.map((era) => {
          const count = eraCounts[era.label] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={era.label}
              className={`${styles.eraRailItem} ${
                activeEra === era.label ? styles.eraRailItemActive : ""
              }`}
              onClick={() => onEraClick(era.label)}
              data-era={era.label}
            >
              {era.label}
              <span className={styles.eraRailCount}>{count}</span>
            </button>
          );
        })}
      </nav>
      <div className={styles.eraRibbonMobile}>
        {LIFELINE_ERAS.map((era) => {
          const count = eraCounts[era.label] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={era.label}
              className={`${styles.eraChip} ${
                activeEra === era.label ? styles.eraChipActive : ""
              }`}
              onClick={() => onEraClick(era.label)}
            >
              {era.label}
            </button>
          );
        })}
      </div>
    </>
  );
}