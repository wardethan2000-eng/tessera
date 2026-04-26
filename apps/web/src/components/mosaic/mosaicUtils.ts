import type { TreeHomeMemory, TreeHomeTodayHighlights } from "@/components/home/homeTypes";

export type DashboardTreeSummary = {
  tree: {
    id: string;
    name: string;
    role: string;
    createdAt: string;
    founderUserId?: string;
  };
  stats: { peopleCount: number; memoryCount: number; generationCount: number; peopleWithoutPortraitCount: number; peopleWithoutDirectMemoriesCount: number };
  coverage: { earliestYear: number | null; latestYear: number | null; decadeBuckets: Array<{ startYear: number; label: string; count: number }> };
  heroCandidates: TreeHomeMemory[];
  memories: TreeHomeMemory[];
  isFoundedByYou: boolean;
  today?: TreeHomeTodayHighlights | null;
};

export type PendingInvite = {
  id: string;
  treeId: string;
  treeName: string;
  invitedByName: string;
  invitedByEmail: string | null;
  proposedRole: string;
  linkedPersonName: string | null;
  expiresAt: string;
  createdAt: string;
};

export type MosaicMemoryTile = {
  memory: TreeHomeMemory;
  treeId: string;
  treeName: string;
  weight: "feature" | "compact";
};

export function selectMosaicMemories(
  summaries: DashboardTreeSummary[],
  maxTotal: number = 8,
  maxPerTree: number = 3,
): MosaicMemoryTile[] {
  const seen = new Set<string>();
  const tiles: MosaicMemoryTile[] = [];

  const preferPrimary = (summary: DashboardTreeSummary) =>
    summary.heroCandidates.length > 0 || summary.memories.some(
      (m) => (m.kind === "photo" && m.mediaUrl) || (m.kind === "voice" && m.transcriptText),
    );

  const sorted = [...summaries].sort((a, b) => {
    const aHas = preferPrimary(a) ? 1 : 0;
    const bHas = preferPrimary(b) ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return b.stats.memoryCount - a.stats.memoryCount;
  });

  const lastPersonId = (): string | null => {
    for (let i = tiles.length - 1; i >= 0; i--) {
      const pid = tiles[i]?.memory.primaryPersonId;
      if (pid) return pid;
    }
    return null;
  };

  const lastKind = (): string | null => {
    for (let i = tiles.length - 1; i >= 0; i--) {
      const kind = tiles[i]?.memory.kind;
      if (kind) return kind;
    }
    return null;
  };

  for (const summary of sorted) {
    let taken = 0;
    const candidates = [...summary.heroCandidates, ...summary.memories];
    for (const memory of candidates) {
      if (tiles.length >= maxTotal) break;
      if (seen.has(memory.id)) continue;

      const consecutiveSamePerson = memory.primaryPersonId && memory.primaryPersonId === lastPersonId();
      const consecutiveSameKind = memory.kind === lastKind();

      if (consecutiveSamePerson && consecutiveSameKind) continue;

      seen.add(memory.id);

      const hasMedia = Boolean(memory.mediaUrl ?? memory.mediaItems?.[0]?.mediaUrl);
      const weight: MosaicMemoryTile["weight"] =
        tiles.length === 0 && hasMedia ? "feature" :
        hasMedia ? "feature" : "compact";

      tiles.push({ memory, treeId: summary.tree.id, treeName: summary.tree.name, weight });
      taken++;
      if (taken >= maxPerTree) break;
    }
    if (tiles.length >= maxTotal) break;
  }

  return tiles;
}

export type TodayHighlight =
  | { kind: "birthday"; personName: string; yearsOld: number | null; isLiving: boolean; treeId: string; treeName: string }
  | { kind: "deathiversary"; personName: string; yearsAgo: number | null; treeId: string; treeName: string }
  | { kind: "anniversary"; title: string; yearsAgo: number | null; treeId: string; treeName: string };

export function collectTodayHighlights(summaries: DashboardTreeSummary[]): TodayHighlight[] {
  const highlights: TodayHighlight[] = [];
  for (const summary of summaries) {
    if (!summary.today) continue;
    for (const b of summary.today.birthdays) {
      highlights.push({ kind: "birthday", personName: b.name, yearsOld: b.yearsOld, isLiving: b.isLiving, treeId: summary.tree.id, treeName: summary.tree.name });
    }
    for (const d of summary.today.deathiversaries) {
      highlights.push({ kind: "deathiversary", personName: d.name, yearsAgo: d.yearsAgo, treeId: summary.tree.id, treeName: summary.tree.name });
    }
    for (const a of summary.today.memoryAnniversaries) {
      highlights.push({ kind: "anniversary", title: a.title, yearsAgo: a.yearsAgo, treeId: summary.tree.id, treeName: summary.tree.name });
    }
  }
  return highlights.slice(0, 3);
}

export function formatTodayNote(highlight: TodayHighlight): string | null {
  switch (highlight.kind) {
    case "birthday": {
      if (highlight.isLiving && highlight.yearsOld !== null) {
        return `${highlight.personName} turns ${highlight.yearsOld} today`;
      }
      if (highlight.isLiving) return `${highlight.personName}'s birthday today`;
      return `Remembering ${highlight.personName} today`;
    }
    case "deathiversary": {
      if (highlight.yearsAgo !== null) return `${highlight.yearsAgo} years since ${highlight.personName} passed`;
      return `Remembering ${highlight.personName} today`;
    }
    case "anniversary": {
      if (highlight.yearsAgo !== null) return `"${highlight.title}" — ${highlight.yearsAgo} years ago`;
      return `"${highlight.title}" — remembered today`;
    }
  }
}

export function isSparseArchive(stats: { peopleCount: number; memoryCount: number }): boolean {
  return stats.memoryCount < 3 && stats.peopleCount < 5;
}

export function formatGenerationsLabel(count: number | null): string {
  if (!count || count <= 1) return "";
  return `${count} generations`;
}

export function formatSpanLabel(earliest: number | null, latest: number | null): string | null {
  if (earliest === null && latest === null) return null;
  if (earliest !== null && latest !== null) {
    if (earliest === latest) return `${earliest}`;
    if (latest >= new Date().getFullYear() - 1) return `from ${earliest}`;
    return `${earliest}–${latest}`;
  }
  return `${earliest ?? latest}`;
}

export function formatUnfinishedNote(stats: { peopleWithoutPortraitCount: number; peopleWithoutDirectMemoriesCount: number }): string | null {
  const total = stats.peopleWithoutPortraitCount + stats.peopleWithoutDirectMemoriesCount;
  if (total === 0) return null;
  if (total <= 3) return `${total} stories still waiting to be told`;
  return `${total} stories still waiting`;
}