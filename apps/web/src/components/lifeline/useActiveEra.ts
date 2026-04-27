import { useEffect, useState } from "react";
import { LIFELINE_ERAS } from "@/lib/date-utils";

export function useActiveEra(yearElementIds: string[]) {
  const [activeEra, setActiveEra] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observers: IntersectionObserver[] = [];

    for (const id of yearElementIds) {
      const el = document.getElementById(id);
      if (!el) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            const yearAttr = el.dataset.year;
            if (yearAttr) {
              const year = Number(yearAttr);
              const era = LIFELINE_ERAS.find((e) => {
                const birthYearAttr = el.dataset.birthYear;
                if (!birthYearAttr) return false;
                const age = year - Number(birthYearAttr);
                return age >= e.ageStart && age <= e.ageEnd;
              });
              if (era) setActiveEra(era.label);
            }
          }
        },
        { rootMargin: "-30% 0px -60% 0px" }
      );

      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, [yearElementIds]);

  return activeEra;
}