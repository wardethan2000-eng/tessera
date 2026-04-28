import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, isNull, notExists } from "drizzle-orm";
import * as schema from "@tessera/database";
import { db } from "../lib/db.js";
import { getIdentityStatusForUser } from "../lib/account-identity-service.js";
import { addPersonToTreeScope } from "../lib/cross-tree-write-service.js";
import {
  getTreeMemories,
  getTreeRelationships,
  getTreeScopedPeople,
  getTreeScopedPerson,
  isPersonInTreeScope,
} from "../lib/cross-tree-read-service.js";
import { getSession } from "../lib/session.js";
import { mediaUrl } from "../lib/storage.js";
import { checkTreeCanAdd } from "../lib/tree-usage-service.js";

const CreateTreeBody = z.object({
  name: z.string().min(1).max(160),
});

type HomePerson = Awaited<ReturnType<typeof getTreeScopedPeople>>[number];
type HomeMemory = Awaited<ReturnType<typeof getTreeMemories>>[number];
type HomeRelationship = Awaited<ReturnType<typeof getTreeRelationships>>[number];
type AtriumTrailSection = {
  id: string;
  title: string;
  description: string;
  memories: HomeMemory[];
};

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/\b(\d{4})\b/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// Best-effort month/day extraction from free-form date text.
// Recognizes ISO (1955-06-12), spelled month ("June 12, 1955" / "12 June 1955"),
// and US-style M/D/YYYY. Returns null when only a year is present.
function extractMonthDay(text?: string | null): { month: number; day: number } | null {
  if (!text) return null;
  const trimmed = text.trim();

  const iso = trimmed.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const month = Number.parseInt(iso[2]!, 10) - 1;
    const day = Number.parseInt(iso[3]!, 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) return { month, day };
  }

  const lower = trimmed.toLowerCase();
  for (const [name, idx] of Object.entries(MONTH_NAME_TO_INDEX)) {
    const re = new RegExp(`\\b${name}\\b[\\s.,-]*(\\d{1,2})\\b`);
    const m = lower.match(re);
    if (m) {
      const day = Number.parseInt(m[1]!, 10);
      if (day >= 1 && day <= 31) return { month: idx, day };
    }
    const re2 = new RegExp(`\\b(\\d{1,2})[\\s.,-]+${name}\\b`);
    const m2 = lower.match(re2);
    if (m2) {
      const day = Number.parseInt(m2[1]!, 10);
      if (day >= 1 && day <= 31) return { month: idx, day };
    }
  }

  // M/D/YYYY or M/D
  const slash = trimmed.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
  if (slash) {
    const month = Number.parseInt(slash[1]!, 10) - 1;
    const day = Number.parseInt(slash[2]!, 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) return { month, day };
  }

  return null;
}

function serializeHomePerson(person: HomePerson) {
  return {
    ...person,
    portraitUrl: person.portraitMedia ? mediaUrl(person.portraitMedia.objectKey) : null,
  };
}

function serializeHomeMemory(memory: HomeMemory) {
  const mediaItems =
    memory.mediaItems && memory.mediaItems.length > 0
      ? memory.mediaItems.map((item) => ({
          id: item.id,
          sortOrder: item.sortOrder,
          mediaId: item.mediaId,
          mediaUrl: item.media ? mediaUrl(item.media.objectKey) : item.linkedMediaPreviewUrl ?? null,
          mimeType: item.media?.mimeType ?? null,
          linkedMediaProvider: item.linkedMediaProvider,
          linkedMediaOpenUrl: item.linkedMediaOpenUrl,
          linkedMediaSourceUrl: item.linkedMediaSourceUrl,
          linkedMediaLabel: item.linkedMediaLabel,
        }))
      : [
          {
            id: "legacy-0",
            sortOrder: 0,
            mediaId: null,
            mediaUrl: memory.media ? mediaUrl(memory.media.objectKey) : memory.linkedMediaPreviewUrl ?? null,
            mimeType: memory.media?.mimeType ?? null,
            linkedMediaProvider: memory.linkedMediaProvider,
            linkedMediaOpenUrl: memory.linkedMediaOpenUrl,
            linkedMediaSourceUrl: memory.linkedMediaSourceUrl,
            linkedMediaLabel: memory.linkedMediaLabel,
          },
        ].filter((item) => item.mediaUrl || item.linkedMediaOpenUrl);
  const primaryItem = mediaItems[0] ?? null;
  const taggedPeople = memory.personTags
    .map((tag) => tag.person)
    .filter((person): person is NonNullable<typeof person> => Boolean(person));
  const fallbackPerson = taggedPeople[0] ?? null;

  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    transcriptText: memory.transcriptText ?? null,
    transcriptLanguage: memory.transcriptLanguage ?? null,
    transcriptStatus: memory.transcriptStatus,
    transcriptError: memory.transcriptError ?? null,
    dateOfEventText: memory.dateOfEventText ?? null,
    createdAt: memory.createdAt.toISOString(),
    primaryPersonId: memory.primaryPersonId,
    personName: memory.primaryPerson?.displayName ?? fallbackPerson?.displayName ?? null,
    personPortraitUrl: memory.primaryPerson?.portraitMedia
      ? mediaUrl(memory.primaryPerson.portraitMedia.objectKey)
      : fallbackPerson?.portraitMedia
        ? mediaUrl(fallbackPerson.portraitMedia.objectKey)
      : null,
    relatedPersonIds: getMemoryRelatedPersonIds(memory),
    mediaUrl: primaryItem?.mediaUrl ?? null,
    mimeType: primaryItem?.mimeType ?? null,
    linkedMediaProvider: primaryItem?.linkedMediaProvider ?? null,
    linkedMediaOpenUrl: primaryItem?.linkedMediaOpenUrl ?? null,
    linkedMediaSourceUrl: primaryItem?.linkedMediaSourceUrl ?? null,
    linkedMediaLabel: primaryItem?.linkedMediaLabel ?? null,
    mediaItems,
  };
}

function serializeHomeRelationship(relationship: HomeRelationship) {
  return {
    id: relationship.id,
    fromPersonId: relationship.fromPersonId,
    toPersonId: relationship.toPersonId,
    type: relationship.type,
    spouseStatus: relationship.spouseStatus ?? null,
    startDateText: relationship.startDateText ?? null,
    endDateText: relationship.endDateText ?? null,
  };
}

function scoreHeroMemory(memory: HomeMemory): number {
  let score = 0;

  if (memory.kind === "photo") score += 30;
  if (memory.kind === "voice") score += 26;
  if (memory.kind === "story") score += 24;
  if (memory.kind === "document") score += 18;
  if (memory.media || memory.linkedMediaPreviewUrl || memory.mediaItems.length > 0) score += 18;
  if (memory.transcriptText) score += 10;
  if (memory.body) score += Math.min(8, Math.floor(memory.body.trim().length / 240));
  if (memory.dateOfEventText) score += 8;
  if (memory.primaryPersonId) score += 4;
  if (memory.title.trim().length >= 12) score += 4;

  return score;
}

function selectHeroCandidates(memories: HomeMemory[], limit = 6) {
  const sorted = [...memories].sort((left, right) => {
    const scoreDiff = scoreHeroMemory(right) - scoreHeroMemory(left);
    if (scoreDiff !== 0) return scoreDiff;
    return right.createdAt.getTime() - left.createdAt.getTime();
  });

  const selected: HomeMemory[] = [];
  const kindCounts = new Map<string, number>();
  const personCounts = new Map<string, number>();

  for (const memory of sorted) {
    if (selected.length >= limit) break;

    const nextKindCount = (kindCounts.get(memory.kind) ?? 0) + 1;
    const nextPersonCount = memory.primaryPersonId
      ? (personCounts.get(memory.primaryPersonId) ?? 0) + 1
      : 0;

    if (selected.length >= 2 && nextKindCount > 3) continue;
    if (memory.primaryPersonId && selected.length >= 2 && nextPersonCount > 2) continue;

    selected.push(memory);
    kindCounts.set(memory.kind, nextKindCount);
    if (memory.primaryPersonId) {
      personCounts.set(memory.primaryPersonId, nextPersonCount);
    }
  }

  return selected.length > 0 ? selected : sorted.slice(0, limit);
}

function buildDecadeBuckets(memories: HomeMemory[]) {
  const buckets = new Map<number, number>();

  for (const memory of memories) {
    const year = extractYear(memory.dateOfEventText);
    if (year === null) continue;
    const decade = Math.floor(year / 10) * 10;
    buckets.set(decade, (buckets.get(decade) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([startYear, count]) => ({
      startYear,
      label: `${startYear}s`,
      count,
    }));
}

function computeGenerationCount(
  people: HomePerson[],
  relationships: HomeRelationship[],
): number {
  if (people.length === 0) return 0;

  const parentIdsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent_child") continue;
    const parentIds = parentIdsByChild.get(relationship.toPersonId) ?? [];
    parentIds.push(relationship.fromPersonId);
    parentIdsByChild.set(relationship.toPersonId, parentIds);
  }

  const depthMemo = new Map<string, number>();
  const visit = (personId: string, visiting: Set<string>): number => {
    const cached = depthMemo.get(personId);
    if (cached) return cached;
    if (visiting.has(personId)) return 1;

    visiting.add(personId);
    const parentIds = parentIdsByChild.get(personId) ?? [];
    const depth =
      parentIds.length === 0
        ? 1
        : 1 + Math.max(...parentIds.map((parentId) => visit(parentId, visiting)));
    visiting.delete(personId);
    depthMemo.set(personId, depth);
    return depth;
  };

  return Math.max(...people.map((person) => visit(person.id, new Set())));
}

function labelForPerson(person: HomePerson | null | undefined): string | null {
  if (!person) return null;
  return person.displayName ?? null;
}

function buildBranchLabel(person: HomePerson | null | undefined): string | null {
  const label = labelForPerson(person);
  return label ? `Centered around ${label}'s branch` : null;
}

function getMemoryRelatedPersonIds(memory: HomeMemory | null | undefined): string[] {
  if (!memory) return [];
  return [
    ...new Set(
      [memory.primaryPersonId, ...memory.personTags.map((tag) => tag.personId)].filter(Boolean),
    ),
  ] as string[];
}

function getMemoryAnchorPersonId(memory: HomeMemory | null | undefined): string | null {
  return getMemoryRelatedPersonIds(memory)[0] ?? null;
}

function getBranchFocusIds(
  personId: string | null,
  relationships: HomeRelationship[],
): Set<string> {
  if (!personId) return new Set();

  const focused = new Set<string>([personId]);
  const queue = [{ id: personId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const relationship of relationships) {
      let neighborId: string | null = null;
      if (relationship.fromPersonId === current.id) neighborId = relationship.toPersonId;
      if (relationship.toPersonId === current.id) neighborId = relationship.fromPersonId;
      if (!neighborId || focused.has(neighborId)) continue;

      const maxDepth = relationship.type === "parent_child" ? 2 : 1;
      if (current.depth >= maxDepth) continue;

      focused.add(neighborId);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }

  return focused;
}

function selectFeaturedMemory(memories: HomeMemory[], heroCandidates: HomeMemory[]): HomeMemory | null {
  return (
    heroCandidates[0] ??
    memories.find((memory) => memory.kind === "photo" && (memory.media || memory.mediaItems.length > 0)) ??
    memories.find((memory) => memory.kind === "story") ??
    memories[0] ??
    null
  );
}

function scoreTrailMemory(
  memory: HomeMemory,
  featuredMemory: HomeMemory | null,
  featuredYear: number | null,
  focusIds: Set<string>,
) {
  let score = 0;
  const memoryRelatedIds = getMemoryRelatedPersonIds(memory);

  if (featuredMemory) {
    const featuredRelatedIds = new Set(getMemoryRelatedPersonIds(featuredMemory));
    const featuredAnchorId = getMemoryAnchorPersonId(featuredMemory);
    const memoryAnchorId = getMemoryAnchorPersonId(memory);

    if (memory.id === featuredMemory.id) score += 120;
    if (memoryAnchorId && featuredAnchorId && memoryAnchorId === featuredAnchorId) score += 48;
    if (memoryRelatedIds.some((personId) => featuredRelatedIds.has(personId))) score += 28;
    if (memoryRelatedIds.some((personId) => focusIds.has(personId))) score += 28;

    const year = extractYear(memory.dateOfEventText);
    if (year !== null && featuredYear !== null) {
      score += Math.max(0, 20 - Math.min(20, Math.floor(Math.abs(year - featuredYear) / 5)));
    } else if (year !== null || featuredYear !== null) {
      score += 4;
    }

    if (memory.kind !== featuredMemory.kind) score += 6;
  }

  if (memory.kind === "voice") score += 5;
  if (memory.media || memory.mediaItems.length > 0 || memory.linkedMediaPreviewUrl) score += 4;
  if (memory.body?.trim()) score += Math.min(6, Math.floor(memory.body.trim().length / 180));
  if (memory.transcriptText?.trim()) score += 4;
  if (memory.dateOfEventText) score += 3;

  return score;
}

function rankTrailMemories(
  memories: HomeMemory[],
  featuredMemory: HomeMemory | null,
  focusIds: Set<string>,
) {
  const featuredYear = extractYear(featuredMemory?.dateOfEventText);

  return [...memories].sort((left, right) => {
    const scoreDiff =
      scoreTrailMemory(right, featuredMemory, featuredYear, focusIds) -
      scoreTrailMemory(left, featuredMemory, featuredYear, focusIds);
    if (scoreDiff !== 0) return scoreDiff;
    return right.createdAt.getTime() - left.createdAt.getTime();
  });
}

function takeMemories(memories: HomeMemory[], limit: number, usedIds: Set<string>) {
  const selected: HomeMemory[] = [];

  for (const memory of memories) {
    if (selected.length >= limit) break;
    if (usedIds.has(memory.id)) continue;
    usedIds.add(memory.id);
    selected.push(memory);
  }

  return selected;
}

function buildAtriumTrailSections({
  featuredMemory,
  memories,
  focusIds,
  focusPerson,
}: {
  featuredMemory: HomeMemory | null;
  memories: HomeMemory[];
  focusIds: Set<string>;
  focusPerson: HomePerson | null;
}): AtriumTrailSection[] {
  if (memories.length === 0) return [];

  const usedIds = new Set<string>();
  const sections: AtriumTrailSection[] = [];

  const beginHere: HomeMemory[] = [];
  const featuredRelatedIds = new Set(getMemoryRelatedPersonIds(featuredMemory));
  if (featuredMemory) {
    beginHere.push(featuredMemory);
    usedIds.add(featuredMemory.id);
  }
  beginHere.push(
    ...takeMemories(
      rankTrailMemories(
        memories.filter(
          (memory) =>
            !usedIds.has(memory.id) &&
            getMemoryRelatedPersonIds(memory).some((personId) => featuredRelatedIds.has(personId)),
        ),
        featuredMemory,
        focusIds,
      ),
      2,
      usedIds,
    ),
  );
  if (beginHere.length === 0) {
    beginHere.push(
      ...takeMemories(rankTrailMemories(memories, featuredMemory, focusIds), 3, usedIds),
    );
  }
  if (beginHere.length > 0) {
    sections.push({
      id: "begin-here",
      title: "Begin here",
      description: "Stay with the opening memory, then step into the first nearby stories.",
      memories: beginHere,
    });
  }

  const branchMemories = takeMemories(
    rankTrailMemories(
      memories.filter(
        (memory) =>
          !usedIds.has(memory.id) &&
          getMemoryRelatedPersonIds(memory).some((personId) => focusIds.has(personId)),
      ),
      featuredMemory,
      focusIds,
    ),
    4,
    usedIds,
  );
  if (branchMemories.length > 0) {
    sections.push({
      id: "from-this-branch",
      title: "From this branch",
      description: focusPerson
        ? `Stories and artifacts that stay close to ${labelForPerson(focusPerson) ?? "this branch"}.`
        : "Stories that stay close to the branch around the featured memory.",
      memories: branchMemories,
    });
  }

  const crossGenerations = takeMemories(
    rankTrailMemories(
      memories.filter((memory) => !usedIds.has(memory.id)),
      featuredMemory,
      focusIds,
    ),
    4,
    usedIds,
  );
  if (crossGenerations.length > 0) {
    sections.push({
      id: "across-generations",
      title: "Across generations",
      description: "Let the trail widen beyond the immediate branch and across the family timeline.",
      memories: crossGenerations,
    });
  }

  return sections;
}

function buildFamilyPresenceGroups({
  focusPersonId,
  focusIds,
  people,
  relationships,
}: {
  focusPersonId: string | null;
  focusIds: Set<string>;
  people: HomePerson[];
  relationships: HomeRelationship[];
}) {
  if (!focusPersonId) return [];

  const peopleIds = new Set(people.map((person) => person.id));
  const directIds = new Set<string>();
  const groups: Array<{ id: string; label: string; personIds: string[] }> = [];

  const collectGroup = (id: string, label: string, personIds: string[]) => {
    const uniqueIds = [...new Set(personIds)].filter(
      (personId) => personId !== focusPersonId && peopleIds.has(personId),
    );
    if (uniqueIds.length === 0) return;
    uniqueIds.forEach((personId) => directIds.add(personId));
    groups.push({ id, label, personIds: uniqueIds.slice(0, 8) });
  };

  collectGroup(
    "partnered-with",
    "Partnered with",
    relationships
      .filter(
        (relationship) =>
          relationship.type === "spouse" &&
          (relationship.fromPersonId === focusPersonId || relationship.toPersonId === focusPersonId),
      )
      .map((relationship) =>
        relationship.fromPersonId === focusPersonId
          ? relationship.toPersonId
          : relationship.fromPersonId,
      ),
  );

  collectGroup(
    "raised-by",
    "Raised by",
    relationships
      .filter(
        (relationship) =>
          relationship.type === "parent_child" && relationship.toPersonId === focusPersonId,
      )
      .map((relationship) => relationship.fromPersonId),
  );

  collectGroup(
    "alongside",
    "Alongside",
    relationships
      .filter(
        (relationship) =>
          relationship.type === "sibling" &&
          (relationship.fromPersonId === focusPersonId || relationship.toPersonId === focusPersonId),
      )
      .map((relationship) =>
        relationship.fromPersonId === focusPersonId
          ? relationship.toPersonId
          : relationship.fromPersonId,
      ),
  );

  collectGroup(
    "carried-forward",
    "Carried forward by",
    relationships
      .filter(
        (relationship) =>
          relationship.type === "parent_child" && relationship.fromPersonId === focusPersonId,
      )
      .map((relationship) => relationship.toPersonId),
  );

  collectGroup(
    "nearby-in-branch",
    "Nearby in this branch",
    [...focusIds].filter((personId) => personId !== focusPersonId && !directIds.has(personId)),
  );

  if (groups.length > 0) return groups;

  const fallbackIds = people
    .map((person) => person.id)
    .filter((personId) => personId !== focusPersonId)
    .slice(0, 8);
  return fallbackIds.length > 0
    ? [{ id: "family", label: "Elsewhere in this family", personIds: fallbackIds }]
    : [];
}

type TodayBirthdayHighlight = {
  personId: string;
  name: string;
  portraitUrl: string | null;
  yearsOld: number | null;
  isLiving: boolean;
  daysUntil: number;
  relativeLabel: string | null;
};

type TodayDeathiversaryHighlight = {
  personId: string;
  name: string;
  portraitUrl: string | null;
  yearsAgo: number | null;
  daysUntil: number;
  relativeLabel: string | null;
};

type TodayMemoryAnniversaryHighlight = {
  memoryId: string;
  title: string;
  yearsAgo: number | null;
  primaryPersonId: string | null;
  primaryPersonName: string | null;
  daysUntil: number;
  relativeLabel: string | null;
};

type TodayHighlights = {
  monthDayLabel: string;
  birthdays: TodayBirthdayHighlight[];
  deathiversaries: TodayDeathiversaryHighlight[];
  memoryAnniversaries: TodayMemoryAnniversaryHighlight[];
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildTodayHighlights({
  people,
  memories,
  upcomingDays = 7,
}: {
  people: HomePerson[];
  memories: HomeMemory[];
  upcomingDays?: number;
}): TodayHighlights {
  const now = new Date();
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();
  const todayYear = now.getFullYear();

  function relativeLabel(daysUntil: number): string | null {
    if (daysUntil === 0) return null;
    if (daysUntil === 1) return "Tomorrow";
    return `In ${daysUntil} days`;
  }

  function computeDaysAhead(targetMonth: number, targetDay: number): number | null {
    const target = new Date(todayYear, targetMonth, targetDay);
    const today = new Date(todayYear, todayMonth, todayDay);
    if (target < today) target.setFullYear(target.getFullYear() + 1);
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff <= upcomingDays) return diff;
    return null;
  }

  const birthdays: TodayBirthdayHighlight[] = [];
  const deathiversaries: TodayDeathiversaryHighlight[] = [];

  for (const person of people) {
    const birth = extractMonthDay(person.birthDateText);
    if (birth) {
      const daysUntil = computeDaysAhead(birth.month, birth.day);
      if (daysUntil !== null) {
        const birthYear = extractYear(person.birthDateText);
        const deathYear = extractYear(person.deathDateText);
        const isLiving = !person.deathDateText;
        birthdays.push({
          personId: person.id,
          name: person.displayName ?? "",
          portraitUrl: person.portraitMedia
            ? mediaUrl(person.portraitMedia.objectKey)
            : null,
          yearsOld:
            birthYear !== null
              ? (deathYear ?? todayYear) - birthYear
              : null,
          isLiving,
          daysUntil,
          relativeLabel: relativeLabel(daysUntil),
        });
      }
    }
    const death = extractMonthDay(person.deathDateText);
    if (death) {
      const daysUntil = computeDaysAhead(death.month, death.day);
      if (daysUntil !== null) {
        const deathYear = extractYear(person.deathDateText);
        deathiversaries.push({
          personId: person.id,
          name: person.displayName ?? "",
          portraitUrl: person.portraitMedia
            ? mediaUrl(person.portraitMedia.objectKey)
            : null,
          yearsAgo: deathYear !== null ? todayYear - deathYear : null,
          daysUntil,
          relativeLabel: relativeLabel(daysUntil),
        });
      }
    }
  }

  const memoryAnniversaries: TodayMemoryAnniversaryHighlight[] = [];
  for (const memory of memories) {
    const md = extractMonthDay(memory.dateOfEventText);
    if (!md) continue;
    const daysUntil = computeDaysAhead(md.month, md.day);
    if (daysUntil === null) continue;
    const year = extractYear(memory.dateOfEventText);
    if (year !== null && todayYear - year < 1 && daysUntil === 0) continue;
    const primary = memory.primaryPersonId
      ? people.find((p) => p.id === memory.primaryPersonId) ?? null
      : null;
    memoryAnniversaries.push({
      memoryId: memory.id,
      title: memory.title ?? "Untitled memory",
      yearsAgo: year !== null ? todayYear - year : null,
      primaryPersonId: primary?.id ?? null,
      primaryPersonName: primary
        ? primary.displayName ?? null
        : null,
      daysUntil,
      relativeLabel: relativeLabel(daysUntil),
    });
  }

  const milestoneScore = (n: number | null) => {
    if (n === null) return 0;
    if (n === 0) return 1;
    if (n % 100 === 0) return 100;
    if (n % 50 === 0) return 60;
    if (n % 25 === 0) return 40;
    if (n % 10 === 0) return 20;
    if (n % 5 === 0) return 10;
    return 1;
  };

  const todayFirst = (a: { daysUntil: number }, b: { daysUntil: number }) => a.daysUntil - b.daysUntil;

  birthdays.sort((a, b) => todayFirst(a, b) || milestoneScore(b.yearsOld) - milestoneScore(a.yearsOld));
  deathiversaries.sort((a, b) => todayFirst(a, b) || milestoneScore(b.yearsAgo) - milestoneScore(a.yearsAgo));
  memoryAnniversaries.sort((a, b) => todayFirst(a, b) || milestoneScore(b.yearsAgo) - milestoneScore(a.yearsAgo));

  return {
    monthDayLabel: `${MONTH_LABELS[todayMonth]} ${todayDay}`,
    birthdays,
    deathiversaries,
    memoryAnniversaries: memoryAnniversaries.slice(0, 10),
  };
}

function buildArchiveSummary({
  people,
  relationships,
  earliestYear,
  latestYear,
  focusPerson,
}: {
  people: HomePerson[];
  relationships: HomeRelationship[];
  earliestYear: number | null;
  latestYear: number | null;
  focusPerson: HomePerson | null;
}) {
  return {
    peopleCount: people.length,
    generationCount: computeGenerationCount(people, relationships),
    earliestYear,
    latestYear,
    branchLabel: buildBranchLabel(focusPerson),
  };
}

async function getCurationCount(treeId: string): Promise<number> {
  const baseWhere = eq(schema.memories.treeId, treeId);

  const [needsDate, needsPlace, needsPeople] = await Promise.all([
    db.query.memories.findMany({
      where: and(baseWhere, isNull(schema.memories.dateOfEventText)),
      columns: { id: true },
      limit: 20,
      orderBy: (memory, operators) => [operators.desc(memory.createdAt)],
    }),
    db.query.memories.findMany({
      where: and(
        baseWhere,
        isNull(schema.memories.placeId),
        isNull(schema.memories.placeLabelOverride),
      ),
      columns: { id: true },
      limit: 20,
      orderBy: (memory, operators) => [operators.desc(memory.createdAt)],
    }),
    db.query.memories.findMany({
      where: and(
        baseWhere,
        notExists(
          db
            .select({ id: schema.memoryPersonTags.memoryId })
            .from(schema.memoryPersonTags)
            .where(eq(schema.memoryPersonTags.memoryId, schema.memories.id)),
        ),
      ),
      columns: { id: true },
      limit: 20,
      orderBy: (memory, operators) => [operators.desc(memory.createdAt)],
    }),
  ]);

  return new Set([
    ...needsDate.map((memory) => memory.id),
    ...needsPlace.map((memory) => memory.id),
    ...needsPeople.map((memory) => memory.id),
  ]).size;
}

async function verifyMembership(treeId: string, userId: string) {
  return db.query.treeMemberships.findFirst({
    where: (membership) =>
      and(eq(membership.treeId, treeId), eq(membership.userId, userId)),
    with: { tree: true },
  });
}

export async function treesPlugin(app: FastifyInstance): Promise<void> {
  app.get("/api/me/identity", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const identity = await getIdentityStatusForUser(session.user.id);

    return reply.send({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      ...identity,
    });
  });

  app.post("/api/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const parsed = CreateTreeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const [tree] = await db
      .insert(schema.trees)
      .values({ name: parsed.data.name, founderUserId: session.user.id })
      .returning();

    if (!tree) {
      return reply.status(500).send({ error: "Failed to create tree" });
    }

    await db.insert(schema.treeMemberships).values({
      treeId: tree.id,
      userId: session.user.id,
      role: "founder",
    });

    return reply.status(201).send(tree);
  });

  app.get("/api/trees", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const memberships = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.userId, session.user.id),
      with: { tree: true },
    });

    return reply.send(memberships.map((m) => ({ ...m.tree, role: m.role })));
  });

  app.get("/api/trees/summaries", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const memberships = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.userId, session.user.id),
      with: { tree: true },
    });

    // Fetch pending invitations in parallel with tree data
    const [pendingInvites, ...treeResults] = await Promise.all([
      (async () => {
        const email = session.user.email.toLowerCase();
        const now = new Date();
        const invites = await db.query.invitations.findMany({
          where: (inv, { and, eq }) =>
            and(eq(inv.email, email), eq(inv.status, "pending")),
          with: { tree: true, invitedBy: true, linkedPerson: true },
          orderBy: (inv, { desc }) => [desc(inv.createdAt)],
        });
        return invites
          .filter((inv) => inv.expiresAt > now)
          .map((inv) => ({
            id: inv.id,
            treeId: inv.treeId,
            treeName: inv.tree?.name ?? "Unknown",
            invitedByName: inv.invitedBy?.name ?? inv.invitedBy?.email ?? "Unknown",
            invitedByEmail: inv.invitedBy?.email ?? null,
            proposedRole: inv.proposedRole,
            linkedPersonName: inv.linkedPerson?.displayName ?? null,
            expiresAt: inv.expiresAt.toISOString(),
            createdAt: inv.createdAt.toISOString(),
          }));
      })(),
      // Per-tree data: people, memories, relationships, hero candidates, today highlights
      ...memberships.map(async (m) => {
        const tree = m.tree;
        const [people, memories, relationships] = await Promise.all([
          getTreeScopedPeople(tree.id),
          getTreeMemories(tree.id, { limit: 50, viewerUserId: session.user.id }),
          getTreeRelationships(tree.id),
        ]);

        const directMemoryPersonIds = new Set<string>();
        for (const memory of memories) {
          if (memory.primaryPersonId) directMemoryPersonIds.add(memory.primaryPersonId);
          for (const tag of memory.personTags) directMemoryPersonIds.add(tag.personId);
        }

        const years = [
          ...people.flatMap((p) =>
            [p.birthDateText, p.deathDateText]
              .map((v) => extractYear(v))
              .filter((v): v is number => v !== null),
          ),
          ...memories.map((m) => extractYear(m.dateOfEventText)).filter((v): v is number => v !== null),
        ];
        const earliestYear = years.length > 0 ? Math.min(...years) : null;
        const latestYear = years.length > 0 ? Math.max(...years) : null;

        const heroCandidates = selectHeroCandidates(memories, 1);

        const todayHighlights = buildTodayHighlights({ people, memories });
        const hasTodayHighlights =
          todayHighlights.birthdays.length > 0 ||
          todayHighlights.deathiversaries.length > 0 ||
          todayHighlights.memoryAnniversaries.length > 0;

        return {
          tree: {
            id: tree.id,
            name: tree.name,
            role: m.role,
            createdAt: tree.createdAt.toISOString(),
            founderUserId: tree.founderUserId,
          },
          stats: {
            peopleCount: people.length,
            memoryCount: memories.length,
            generationCount: computeGenerationCount(people, relationships),
            peopleWithoutPortraitCount: people.filter((p) => !p.portraitMedia).length,
            peopleWithoutDirectMemoriesCount: people.filter(
              (p) => !directMemoryPersonIds.has(p.id),
            ).length,
          },
          coverage: {
            earliestYear,
            latestYear,
            decadeBuckets: buildDecadeBuckets(memories),
          },
          heroCandidates: heroCandidates.map(serializeHomeMemory),
          isFoundedByYou: !!tree.founderUserId && tree.founderUserId === session.user.id,
          today: hasTodayHighlights ? todayHighlights : null,
        };
      }),
    ]);

    return reply.send({ trees: treeResults, pendingInvites });
  });

  app.get("/api/trees/:treeId/home", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };
    const membership = await verifyMembership(treeId, session.user.id);

    if (!membership) {
      return reply.status(404).send({ error: "Tree not found" });
    }

    const [people, memories, relationships] = await Promise.all([
      getTreeScopedPeople(treeId),
      getTreeMemories(treeId, {
        limit: 200,
        viewerUserId: session.user.id,
      }),
      getTreeRelationships(treeId),
    ]);

    const currentUserPersonId =
      people.find((person) => person.linkedUserId === session.user.id)?.id ?? null;

    const [inboxCount, curationCount] = await Promise.all([
      currentUserPersonId
        ? db.query.prompts
            .findMany({
              where: (prompt) =>
                and(
                  eq(prompt.treeId, treeId),
                  eq(prompt.toPersonId, currentUserPersonId),
                  eq(prompt.status, "pending"),
                ),
              columns: { id: true },
            })
            .then((prompts) => prompts.length)
        : Promise.resolve(0),
      getCurationCount(treeId),
    ]);

    const directMemoryPersonIds = new Set<string>();
    for (const memory of memories) {
      if (memory.primaryPersonId) {
        directMemoryPersonIds.add(memory.primaryPersonId);
      }
      for (const tag of memory.personTags) {
        directMemoryPersonIds.add(tag.personId);
      }
    }

    const years = [
      ...people.flatMap((person) =>
        [person.birthDateText, person.deathDateText]
          .map((value) => extractYear(value))
          .filter((value): value is number => value !== null),
      ),
      ...memories
        .map((memory) => extractYear(memory.dateOfEventText))
        .filter((value): value is number => value !== null),
    ];
    const earliestYear = years.length > 0 ? Math.min(...years) : null;
    const latestYear = years.length > 0 ? Math.max(...years) : null;

    const heroCandidates = selectHeroCandidates(memories);
    const featuredMemory = selectFeaturedMemory(memories, heroCandidates);
    const focusPersonId =
      getMemoryAnchorPersonId(featuredMemory) ?? currentUserPersonId ?? people[0]?.id ?? null;
    const focusPerson = people.find((person) => person.id === focusPersonId) ?? null;
    const focusIds = getBranchFocusIds(focusPersonId, relationships);
    const relatedPersonIds = focusPersonId
      ? [focusPersonId, ...[...focusIds].filter((personId) => personId !== focusPersonId)]
      : [...focusIds];
    const relatedMemoryTrail = buildAtriumTrailSections({
      featuredMemory,
      memories,
      focusIds,
      focusPerson,
    });
    const familyPresenceGroups = buildFamilyPresenceGroups({
      focusPersonId,
      focusIds,
      people,
      relationships,
    });
    const archiveSummary = buildArchiveSummary({
      people,
      relationships,
      earliestYear,
      latestYear,
      focusPerson,
    });

    const todayHighlights = buildTodayHighlights({ people, memories });

    return reply.send({
      tree: {
        ...membership.tree,
        role: membership.role,
      },
      currentUserPersonId,
      inboxCount,
      curationCount,
      featuredMemory: featuredMemory ? serializeHomeMemory(featuredMemory) : null,
      featuredBranch: {
        focusPersonId,
        relatedPersonIds,
        branchLabel: buildBranchLabel(focusPerson),
      },
      relatedMemoryTrail: relatedMemoryTrail.map((section) => ({
        ...section,
        memories: section.memories.map(serializeHomeMemory),
      })),
      familyPresence: {
        focusPersonId,
        groups: familyPresenceGroups,
      },
      archiveSummary,
      today: todayHighlights,
      stats: {
        peopleCount: people.length,
        memoryCount: memories.length,
        generationCount: computeGenerationCount(people, relationships),
        peopleWithoutPortraitCount: people.filter((person) => !person.portraitMedia).length,
        peopleWithoutDirectMemoriesCount: people.filter(
          (person) => !directMemoryPersonIds.has(person.id),
        ).length,
      },
      coverage: {
        earliestYear,
        latestYear,
        decadeBuckets: buildDecadeBuckets(memories),
      },
      relationships: relationships.map(serializeHomeRelationship),
      heroCandidates: heroCandidates.map(serializeHomeMemory),
      people: people.map(serializeHomePerson),
      memories: memories.map(serializeHomeMemory),
    });
  });

  app.get("/api/trees/:treeId", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await verifyMembership(treeId, session.user.id);

    if (!membership) return reply.status(404).send({ error: "Tree not found" });

    return reply.send({ ...membership.tree, role: membership.role });
  });

  app.post("/api/trees/:treeId/identity/bootstrap", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const membership = await db.query.treeMemberships.findFirst({
      where: (t, { and: opAnd, eq: opEq }) =>
        opAnd(opEq(t.treeId, treeId), opEq(t.userId, session.user.id)),
    });
    if (!membership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const identity = await getIdentityStatusForUser(session.user.id);
    if (identity.status === "unclaimed") {
      return reply.send({
        status: "unclaimed",
        wasAddedToScope: false,
        person: null,
      });
    }

    if (identity.status === "conflict") {
      return reply.status(409).send({
        error:
          "This account is linked to multiple people. Resolve the duplicate identity before bootstrapping into a new tree.",
        ...identity,
      });
    }

    const claimedPerson = identity.canonicalPerson;
    const alreadyInScope = await isPersonInTreeScope(treeId, claimedPerson.id);

    if (!alreadyInScope) {
      const capacity = await checkTreeCanAdd(treeId, "person");
      if (!capacity.allowed) {
        return reply.status(capacity.status).send({ error: capacity.reason });
      }

      await addPersonToTreeScope({
        treeId,
        personId: claimedPerson.id,
        addedByUserId: session.user.id,
      });
    }

    const person = await getTreeScopedPerson(treeId, claimedPerson.id);
    if (!person) {
      return reply.status(500).send({ error: "Failed to load claimed person in this tree" });
    }

    return reply.send({
      status: "claimed",
      wasAddedToScope: !alreadyInScope,
      person,
    });
  });

  /** GET /api/trees/:treeId/members — list all members of a tree */
  app.get("/api/trees/:treeId/members", async (request, reply) => {
    const session = await getSession(request.headers);
    if (!session) return reply.status(401).send({ error: "Unauthorized" });

    const { treeId } = request.params as { treeId: string };

    const userMembership = await db.query.treeMemberships.findFirst({
      where: (t, { and: opAnd, eq: opEq }) =>
        opAnd(opEq(t.treeId, treeId), opEq(t.userId, session.user.id)),
    });
    if (!userMembership) {
      return reply.status(403).send({ error: "Not a member of this tree" });
    }

    const members = await db.query.treeMemberships.findMany({
      where: (t, { eq }) => eq(t.treeId, treeId),
      with: { user: true },
    });

    return reply.send(
      members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user?.name ?? null,
        email: (userMembership.role === "founder" || userMembership.role === "steward")
          ? (m.user?.email ?? "")
          : null,
        joinedAt: m.joinedAt,
      }))
    );
  });
}
