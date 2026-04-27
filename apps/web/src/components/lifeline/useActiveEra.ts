import { useEffect, useState } from "react";
import { LIFELINE_ERAS } from "@/lib/date-utils";

export function useActiveEra(yearElementIds: string[]): {
  era: string | null;
  year: number | null;
} {
  const [active, setActive] = useState<{ era: string | null; year: number | null }>({
    era: null,
    year: null,
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const intersecting = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.add(entry.target as HTMLElement);
          } else {
            intersecting.delete(entry.target as HTMLElement);
          }
        }

        const top = [...intersecting].sort(
          (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
        )[0];

        if (!top) {
          setActive({ era: null, year: null });
          return;
        }

        const year = Number(top.dataset.year);
        const birthYear = Number(top.dataset.birthYear);
        if (!Number.isFinite(year) || !Number.isFinite(birthYear)) return;

        const age = year - birthYear;
        const era = LIFELINE_ERAS.find(
          (e) => age >= e.ageStart && age <= e.ageEnd
        );
        setActive({ era: era?.label ?? null, year });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );

    for (const id of yearElementIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [yearElementIds]);

  return active;
}