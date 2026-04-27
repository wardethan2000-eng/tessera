export function extractYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  let m: RegExpMatchArray | null;

  m = trimmed.match(/^(\d{4})-\d{2}-\d{2}/);
  if (m) return Number(m[1]);

  m = trimmed.match(/^\d{2}\/\d{2}\/(\d{4})$/);
  if (m) return Number(m[1]);

  m = trimmed.match(/^\d{1,2}\s+\w+\s+(\d{4})$/);
  if (m) return Number(m[1]);

  m = trimmed.match(/^\w+\s+\d{1,2},?\s+(\d{4})$/);
  if (m) return Number(m[1]);

  m = trimmed.match(/^(\d{4})$/);
  if (m) return Number(m[1]);

  const allFour = trimmed.match(/\b(\d{4})\b/g);
  if (allFour && allFour.length > 0) return Number(allFour[0]);

  const twoDigit = trimmed.match(/(?:^|\D)(\d{2})(?:\D|$)/g);
  if (twoDigit) {
    for (const frag of twoDigit) {
      const num = parseInt(frag.replace(/\D/g, ""), 10);
      const expanded = num > 50 ? 1900 + num : 2000 + num;
      if (expanded >= 1800 && expanded <= new Date().getFullYear() + 1) return expanded;
    }
  }

  return null;
}

export const LIFELINE_ERAS = [
  { label: "Childhood", ageStart: 0, ageEnd: 12, hue: "var(--lifeline-childhood)" },
  { label: "Teen years", ageStart: 13, ageEnd: 19, hue: "var(--lifeline-teen)" },
  { label: "Young adult", ageStart: 20, ageEnd: 35, hue: "var(--lifeline-young-adult)" },
  { label: "Mid life", ageStart: 36, ageEnd: 55, hue: "var(--lifeline-mid-life)" },
  { label: "Later years", ageStart: 56, ageEnd: 75, hue: "var(--lifeline-later)" },
  { label: "Elder years", ageStart: 76, ageEnd: 200, hue: "var(--lifeline-elder)" },
] as const;

export type LifelineEra = (typeof LIFELINE_ERAS)[number];

export function eraForAge(age: number): LifelineEra {
  return LIFELINE_ERAS.find((e) => age >= e.ageStart && age <= e.ageEnd) ?? LIFELINE_ERAS[LIFELINE_ERAS.length - 1]!;
}