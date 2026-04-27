export function extractYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = text.match(/\b(\d{4})\b/g);
  if (!matches || matches.length === 0) return null;
  return Number(matches[matches.length - 1]);
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