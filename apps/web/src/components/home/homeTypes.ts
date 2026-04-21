export type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

export interface TreeHomeTree {
  id: string;
  name: string;
  role?: string;
  createdAt?: string;
}

export interface TreeHomePersonRecord {
  id: string;
  name?: string;
  displayName?: string;
  portraitUrl: string | null;
  essenceLine: string | null;
  birthDateText?: string | null;
  deathDateText?: string | null;
  linkedUserId: string | null;
}

export interface TreeHomeMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  personName?: string | null;
  primaryPersonId?: string | null;
  personPortraitUrl?: string | null;
  createdAt?: string;
}

export interface TreeHomeStats {
  peopleCount: number;
  memoryCount: number;
  generationCount: number;
  peopleWithoutPortraitCount: number;
  peopleWithoutDirectMemoriesCount: number;
}

export interface TreeHomeCoverage {
  earliestYear: number | null;
  latestYear: number | null;
  decadeBuckets: Array<{
    startYear: number;
    label: string;
    count: number;
  }>;
}

export interface TreeHomeRelationship {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  type: "parent_child" | "sibling" | "spouse";
  spouseStatus?: "active" | "former" | "deceased_partner" | null;
  startDateText?: string | null;
  endDateText?: string | null;
}

export interface TreeHomePayload {
  tree: TreeHomeTree;
  people: TreeHomePersonRecord[];
  memories: TreeHomeMemory[];
  heroCandidates: TreeHomeMemory[];
  inboxCount: number;
  curationCount: number;
  currentUserPersonId: string | null;
  stats: TreeHomeStats;
  coverage: TreeHomeCoverage;
  relationships: TreeHomeRelationship[];
}
