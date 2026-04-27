export type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

export interface LifelineMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string | null;
  dateOfEventText: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  place: { label: string } | null;
  memoryContext: "direct" | "contextual";
  memoryReasonLabel: string | null;
}

export interface LifelineRelationshipEvent {
  id: string;
  type: "parent_child" | "sibling" | "spouse";
  spouseStatus: "active" | "former" | "deceased_partner" | null;
  startDateText: string | null;
  endDateText: string | null;
  fromPerson: { id: string; displayName: string; portraitUrl: string | null };
  toPerson: { id: string; displayName: string; portraitUrl: string | null };
}

export interface LifelinePerson {
  id: string;
  displayName: string;
  essenceLine: string | null;
  birthDateText: string | null;
  deathDateText: string | null;
  isLiving: boolean;
  portraitUrl: string | null;
  memories: LifelineMemory[];
  directMemories?: LifelineMemory[];
  contextualMemories?: LifelineMemory[];
  relationships: LifelineRelationshipEvent[];
}

export interface LifelineYearGroup {
  year: number;
  age: number | null;
  era: { label: string; hue: string } | null;
  memories: LifelineMemory[];
  relationshipEvents: LifelineRelationshipEvent[];
}

export interface LifelineData {
  person: LifelinePerson;
  yearGroups: LifelineYearGroup[];
  undated: LifelineMemory[];
  birthYear: number | null;
  deathYear: number | null;
  lifespanYears: number | null;
}

export const KIND_ICONS: Record<MemoryKind, string> = {
  story: "\u270E",
  photo: "\u25FB",
  voice: "\uD83C\uDFA4",
  document: "\u25A1",
  other: "\u2726",
};

export const KIND_LABELS: Record<MemoryKind, string> = {
  story: "Story",
  photo: "Photo",
  voice: "Voice",
  document: "Document",
  other: "Other",
};