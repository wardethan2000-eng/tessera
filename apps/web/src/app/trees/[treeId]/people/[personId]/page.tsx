"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { MemoryLightbox, type LightboxMemory } from "@/components/tree/MemoryLightbox";
import { PromptComposer } from "@/components/tree/PromptComposer";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import { type TreeVisibilityLevel } from "@/components/tree/MemoryVisibilityControl";
import { PlacePicker } from "@/components/tree/PlacePicker";
import { getProxiedMediaUrl } from "@/lib/media-url";
import {
  isCanonicalPersonId,
  isCanonicalTreeId,
  resolveCanonicalPersonId,
  resolveCanonicalTreeId,
} from "@/lib/tree-route";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";
type RelationshipType = "parent_child" | "sibling" | "spouse";

type ParsedDate = { month: string; day: string; year: string };

function parseDateText(text: string | null | undefined): ParsedDate {
  if (!text) return { month: "", day: "", year: "" };
  const parts = text.split(/[\/\-\.]/);
  if (parts.length === 3) {
    return { month: parts[0] ?? "", day: parts[1] ?? "", year: parts[2] ?? "" };
  }
  const yearMatch = text.match(/\b(\d{4})\b/);
  if (yearMatch) return { month: "", day: "", year: yearMatch[1] ?? "" };
  return { month: "", day: "", year: text.trim() };
}

function formatDateText(parsed: ParsedDate): string | null {
  const { month, day, year } = parsed;
  if (!month && !day && !year) return null;
  if (month && day && year) return `${month}/${day}/${year}`;
  if (!month && !day && year) return year;
  if (month && year && !day) return `${month}/${year}`;
  return [month, day, year].filter(Boolean).join("/");
}
type ResolvedPlace = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string | null;
  adminRegion?: string | null;
  locality?: string | null;
};

type Person = {
  id: string;
  displayName: string;
  canonicalDisplayName?: string | null;
  displayNameOverride?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  maidenName?: string | null;
  essenceLine: string | null;
  birthDateText: string | null;
  deathDateText: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  birthPlaceId?: string | null;
  deathPlaceId?: string | null;
  birthPlaceResolved?: ResolvedPlace | null;
  deathPlaceResolved?: ResolvedPlace | null;
  isLiving: boolean;
  linkedUserId: string | null;
  homeTreeId?: string | null;
  portraitUrl: string | null;
  memories: Memory[];
  directMemories?: Memory[];
  contextualMemories?: Memory[];
  suppressedContextualMemories?: Memory[];
  relationships: Relationship[];
};

type Memory = {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText: string | null;
  placeId?: string | null;
  place?: ResolvedPlace | null;
  mediaUrl: string | null;
  mimeType?: string | null;
  linkedMediaProvider?: "google_drive" | null;
  linkedMediaOpenUrl?: string | null;
  linkedMediaSourceUrl?: string | null;
  linkedMediaLabel?: string | null;
  createdAt: string;
  memoryContext?: "direct" | "contextual";
  memoryReasonLabel?: string | null;
  featuredOnPersonPage?: boolean;
  curatedSortOrder?: number | null;
  treeVisibilityLevel?: TreeVisibilityLevel;
  treeVisibilityIsOverride?: boolean;
  treeVisibilityUnlockDate?: string | null;
};

type Relationship = {
  id: string;
  type: RelationshipType;
  fromPerson: { id: string; displayName: string; portraitUrl?: string | null };
  toPerson: { id: string; displayName: string; portraitUrl?: string | null };
};

type PersonSummary = { id: string; displayName: string };
type PersonTreeMembership = {
  id: string;
  name: string;
  role: string;
  tier?: string | null;
  subscriptionStatus?: string | null;
};
type DuplicateCandidate = {
  id: string;
  displayName: string;
  essenceLine: string | null;
  birthDateText: string | null;
  deathDateText: string | null;
  linkedUserId: string | null;
  homeTreeId: string | null;
  portraitUrl: string | null;
  score: number;
  reasons: string[];
  visibleTrees: PersonTreeMembership[];
  alreadyInTree: boolean;
};
type CrossTreeLink = {
  connectionId: string | null;
  treeId: string;
  treeName: string | null;
  linkedPerson: {
    id: string;
    displayName: string;
    treeId?: string;
    portraitUrl: string | null;
    essenceLine?: string | null;
  };
  memories: Memory[];
};

type EditFormState = {
  displayName: string;
  firstName: string;
  lastName: string;
  maidenName: string;
  essenceLine: string;
  birthDateText: string;
  deathDateText: string;
  birthPlace: string;
  deathPlace: string;
  birthPlaceId: string;
  deathPlaceId: string;
  isLiving: boolean;
};

type RelationshipFormState = {
  otherPersonId: string;
  type: RelationshipType;
  direction: "from" | "to";
};

function relationshipLabel(r: Relationship, personId: string): string {
  const labels: Record<RelationshipType, [string, string]> = {
    parent_child: ["Parent of", "Child of"],
    sibling: ["Sibling of", "Sibling of"],
    spouse: ["Spouse of", "Spouse of"],
  };
  const [fromLabel, toLabel] = labels[r.type];
  const other = r.fromPerson.id === personId ? r.toPerson : r.fromPerson;
  const label = r.fromPerson.id === personId ? fromLabel : toLabel;
  return `${label} ${other.displayName}`;
}

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const m = text.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1]!, 10) : null;
}

function getDecade(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function getVoiceTranscriptLabel(memory: Memory): string | null {
  if (memory.kind !== "voice") return null;
  if (memory.transcriptStatus === "completed" && memory.transcriptText) {
    return memory.transcriptText;
  }
  if (memory.transcriptStatus === "completed") {
    return "Transcript unavailable.";
  }
  if (memory.transcriptStatus === "failed") {
    return memory.transcriptError ? `Transcription failed: ${memory.transcriptError}` : "Transcription failed.";
  }
  if (memory.transcriptStatus === "queued" || memory.transcriptStatus === "processing") {
    return "Transcribing…";
  }
  return null;
}

function getMemoryPreviewText(memory: Memory): string | null {
  const body = memory.body?.trim();
  if (body) {
    return body;
  }

  const transcript = getVoiceTranscriptLabel(memory)?.trim();
  if (transcript) {
    return transcript;
  }

  const linkedLabel = memory.linkedMediaLabel?.trim();
  if (linkedLabel) {
    return linkedLabel;
  }

  return null;
}

type ChapterSectionId = "life" | "stories" | "archive" | "family" | "questions" | "context";

export default function PersonPage({
  params,
}: {
  params: Promise<{ treeId: string; personId: string }>;
}) {
  const { treeId, personId } = use(params);
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chapterSectionRefs = useRef<Map<ChapterSectionId, HTMLElement>>(new Map());
  const [normalizingTreeId, setNormalizingTreeId] = useState(!isCanonicalTreeId(treeId));
  const [normalizingPersonId, setNormalizingPersonId] = useState(
    !isCanonicalPersonId(personId),
  );

  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allPeople, setAllPeople] = useState<PersonSummary[]>([]);
  const [visibleTrees, setVisibleTrees] = useState<PersonTreeMembership[]>([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxMemories, setLightboxMemories] = useState<LightboxMemory[]>([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    displayName: "",
    firstName: "",
    lastName: "",
    maidenName: "",
    essenceLine: "",
    birthDateText: "",
    deathDateText: "",
    birthPlace: "",
    deathPlace: "",
    birthPlaceId: "",
    deathPlaceId: "",
    isLiving: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPerson, setDeletingPerson] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Portrait upload
  const [uploadingPortrait, setUploadingPortrait] = useState(false);

  // Add memory
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [memoryComposerKind, setMemoryComposerKind] = useState<MemoryKind | undefined>(undefined);
  const [updatingMemorySuppressionId, setUpdatingMemorySuppressionId] = useState<string | null>(null);
  const [updatingMemoryVisibilityId, setUpdatingMemoryVisibilityId] = useState<string | null>(null);

  // Add relationship
  const [showRelForm, setShowRelForm] = useState(false);
  const [relForm, setRelForm] = useState<RelationshipFormState>({
    otherPersonId: "",
    type: "parent_child" as RelationshipType,
    direction: "from" as "from" | "to",
  });
  const [savingRel, setSavingRel] = useState(false);

  // Prompts for this person
  const [personPrompts, setPersonPrompts] = useState<Array<{
    id: string;
    questionText: string;
    status: "pending" | "answered" | "dismissed";
    createdAt: string;
    fromUserName: string | null;
    replies?: Array<{ id: string; kind: string; title: string }>;
  }>>([]);
  const [promptComposerOpen, setPromptComposerOpen] = useState(false);

  // Cross-tree linked people
  const [crossTreeLinks, setCrossTreeLinks] = useState<CrossTreeLink[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [mergingDuplicateId, setMergingDuplicateId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Add-to-another-lineage workflow
  type AvailableTree = {
    treeId: string;
    treeName: string;
    role: string;
    alreadyInScope: boolean;
    canAddToScope: boolean;
  };
  type ScopeConflictResponse = {
    targetTree: { id: string; name: string };
    existingScopedMatch: boolean;
    canAddToScope: boolean;
    duplicateCandidates: Array<{
      personId: string;
      displayName: string;
      confidence: number;
      reasons: string[];
      portraitUrl: string | null;
      birthDateText: string | null;
      deathDateText: string | null;
    }>;
  };
  const [addLineageOpen, setAddLineageOpen] = useState(false);
  const [availableLineages, setAvailableLineages] = useState<AvailableTree[]>([]);
  const [availableLineagesLoading, setAvailableLineagesLoading] = useState(false);
  const [selectedTargetTreeId, setSelectedTargetTreeId] = useState<string | null>(null);
  const [scopeConflict, setScopeConflict] = useState<ScopeConflictResponse | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [submittingScopeAdd, setSubmittingScopeAdd] = useState(false);
  const [addLineageError, setAddLineageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    const needsNormalization = !isCanonicalTreeId(treeId);
    setNormalizingTreeId(needsNormalization);
    if (!session || !needsNormalization) return;

    let cancelled = false;
    void (async () => {
      const resolvedTreeId = await resolveCanonicalTreeId(API, treeId);
      if (cancelled) return;
      if (resolvedTreeId && resolvedTreeId !== treeId) {
        router.replace(`/trees/${resolvedTreeId}/people/${personId}`);
        return;
      }
      if (!resolvedTreeId) {
        setLoadError("This tree link is invalid or no longer points to an available tree.");
        setLoading(false);
      }
      setNormalizingTreeId(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [personId, router, session, treeId]);

  useEffect(() => {
    const needsNormalization = !isCanonicalPersonId(personId);
    setNormalizingPersonId(needsNormalization);
    if (!session || !isCanonicalTreeId(treeId) || !needsNormalization) return;

    let cancelled = false;
    void (async () => {
      const resolvedPersonId = await resolveCanonicalPersonId(API, treeId, personId);
      if (cancelled) return;
      if (resolvedPersonId && resolvedPersonId !== personId) {
        router.replace(`/trees/${treeId}/people/${resolvedPersonId}`);
        return;
      }
      if (!resolvedPersonId) {
        setLoadError("This chapter link is invalid or no longer points to a person in this tree.");
        setLoading(false);
      }
      setNormalizingPersonId(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [personId, router, session, treeId]);

  useEffect(() => {
    if (session && isCanonicalTreeId(treeId) && isCanonicalPersonId(personId)) {
      loadPerson();
      loadAllPeople();
      loadVisibleTrees();
      loadCrossTreeLinks();
      loadDuplicateCandidates();
      loadPersonPrompts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, treeId, personId]);

  async function loadPerson() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people/${personId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        router.replace(`/dashboard?treeId=${treeId}`);
        return;
      }
      const data = (await res.json()) as Person;
      setPerson(data);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load this person's chapter.",
      );
    } finally {
      setLoading(false);
    }
  }

  usePendingVoiceTranscriptionRefresh({
    items: person?.memories ?? [],
    refresh: loadPerson,
    enabled: Boolean(session && person),
  });

  async function loadAllPeople() {
    const res = await fetch(`${API}/api/trees/${treeId}/people`, {
      credentials: "include",
    });
    if (res.ok) setAllPeople((await res.json()) as PersonSummary[]);
  }

  async function loadVisibleTrees() {
    const res = await fetch(`${API}/api/people/${personId}/trees`, {
      credentials: "include",
    });
    if (res.ok) {
      setVisibleTrees((await res.json()) as PersonTreeMembership[]);
    }
  }

  async function loadCrossTreeLinks() {
    const res = await fetch(
      `${API}/api/trees/${treeId}/people/${personId}/cross-tree`,
      { credentials: "include" },
    );
    if (res.ok) setCrossTreeLinks((await res.json()) as CrossTreeLink[]);
  }

  async function openAddLineageDialog() {
    setAddLineageOpen(true);
    setAddLineageError(null);
    setSelectedTargetTreeId(null);
    setScopeConflict(null);
    setAvailableLineagesLoading(true);
    try {
      const res = await fetch(`${API}/api/people/${personId}/available-trees`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Could not load your lineages.");
      }
      setAvailableLineages((await res.json()) as AvailableTree[]);
    } catch (error) {
      setAddLineageError(
        error instanceof Error ? error.message : "Could not load your lineages.",
      );
      setAvailableLineages([]);
    } finally {
      setAvailableLineagesLoading(false);
    }
  }

  function closeAddLineageDialog() {
    if (submittingScopeAdd) return;
    setAddLineageOpen(false);
    setScopeConflict(null);
    setSelectedTargetTreeId(null);
    setAddLineageError(null);
  }

  async function selectTargetLineage(targetTreeId: string) {
    setSelectedTargetTreeId(targetTreeId);
    setScopeConflict(null);
    setConflictLoading(true);
    setAddLineageError(null);
    try {
      const res = await fetch(
        `${API}/api/trees/${treeId}/people/${personId}/scope-conflicts?targetTreeId=${targetTreeId}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        throw new Error("Could not check for duplicates in that lineage.");
      }
      setScopeConflict((await res.json()) as ScopeConflictResponse);
    } catch (error) {
      setAddLineageError(
        error instanceof Error ? error.message : "Could not check for duplicates.",
      );
    } finally {
      setConflictLoading(false);
    }
  }

  async function confirmAddToLineage() {
    if (!selectedTargetTreeId) return;
    setSubmittingScopeAdd(true);
    setAddLineageError(null);
    try {
      const res = await fetch(
        `${API}/api/trees/${selectedTargetTreeId}/scope/people`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not add to that lineage.");
      }
      setAddLineageOpen(false);
      setScopeConflict(null);
      setSelectedTargetTreeId(null);
      await Promise.all([loadVisibleTrees(), loadCrossTreeLinks()]);
    } catch (error) {
      setAddLineageError(
        error instanceof Error ? error.message : "Could not add to that lineage.",
      );
    } finally {
      setSubmittingScopeAdd(false);
    }
  }

  async function loadDuplicateCandidates() {
    setLoadingDuplicates(true);
    const res = await fetch(
      `${API}/api/trees/${treeId}/people/${personId}/duplicates`,
      { credentials: "include" },
    );
    if (res.ok) {
      setDuplicateCandidates((await res.json()) as DuplicateCandidate[]);
    } else {
      setDuplicateCandidates([]);
    }
    setLoadingDuplicates(false);
  }

  async function loadPersonPrompts() {
    const res = await fetch(`${API}/api/trees/${treeId}/prompts`, { credentials: "include" });
    if (res.ok) {
      const all = (await res.json()) as Array<{ id: string; questionText: string; status: "pending" | "answered" | "dismissed"; createdAt: string; fromUserName: string | null; toPersonId: string; replies?: Array<{ id: string; kind: string; title: string }> }>;
      setPersonPrompts(all.filter((p) => p.toPersonId === personId));
    }
  }

  function startEditing(p: Person) {
    setDeleteError(null);
    setEditForm({
      displayName: p.displayName,
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      maidenName: p.maidenName ?? "",
      essenceLine: p.essenceLine ?? "",
      birthDateText: p.birthDateText ?? "",
      deathDateText: p.deathDateText ?? "",
      birthPlace: p.birthPlace ?? "",
      deathPlace: p.deathPlace ?? "",
      birthPlaceId: p.birthPlaceId ?? "",
      deathPlaceId: p.deathPlaceId ?? "",
      isLiving: p.isLiving,
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    setDeleteError(null);
    const res = await fetch(`${API}/api/trees/${treeId}/people/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        displayName: editForm.displayName,
        firstName: editForm.firstName || null,
        lastName: editForm.lastName || null,
        maidenName: editForm.maidenName || null,
        essenceLine: editForm.essenceLine || null,
        birthDateText: editForm.birthDateText || null,
        deathDateText: editForm.deathDateText || null,
        birthPlace: editForm.birthPlace || null,
        deathPlace: editForm.deathPlace || null,
        birthPlaceId: editForm.birthPlaceId || null,
        deathPlaceId: editForm.deathPlaceId || null,
        isLiving: editForm.isLiving,
      }),
    });
    if (res.ok) {
      setEditing(false);
      await loadPerson();
    }
    setSavingEdit(false);
  }

  async function deletePerson() {
    if (!person) return;

    const confirmed = window.confirm(
      `Delete ${person.displayName}? This also removes their relationships, memories, prompts, and cross-tree links from this tree.`,
    );
    if (!confirmed) return;

    setDeletingPerson(true);
    setDeleteError(null);

    const res = await fetch(`${API}/api/trees/${treeId}/people/${personId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setDeleteError(err?.error ?? "Failed to delete person");
      setDeletingPerson(false);
      return;
    }

    router.replace(`/trees/${treeId}`);
  }

  async function uploadPortrait(file: File) {
    setUploadingPortrait(true);
    const presignRes = await fetch(`${API}/api/trees/${treeId}/media/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
    });
    if (!presignRes.ok) { setUploadingPortrait(false); return; }
    const { mediaId, uploadUrl } = (await presignRes.json()) as { mediaId: string; uploadUrl: string };
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    await fetch(`${API}/api/trees/${treeId}/people/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ portraitMediaId: mediaId }),
    });
    await loadPerson();
    setUploadingPortrait(false);
  }

  async function saveRelationship(e: React.FormEvent) {
    e.preventDefault();
    setSavingRel(true);
    const res = await fetch(`${API}/api/trees/${treeId}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fromPersonId: relForm.direction === "from" ? personId : relForm.otherPersonId,
        toPersonId: relForm.direction === "from" ? relForm.otherPersonId : personId,
        type: relForm.type,
      }),
    });
    if (res.ok) {
      setShowRelForm(false);
      setRelForm({ otherPersonId: "", type: "parent_child", direction: "from" });
      await loadPerson();
    }
    setSavingRel(false);
  }

  async function setMemorySurfaceSuppression(
    memoryId: string,
    suppressed: boolean,
  ) {
    setUpdatingMemorySuppressionId(memoryId);
    const res = await fetch(
      `${API}/api/trees/${treeId}/people/${personId}/memories/${memoryId}/suppression`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ suppressed }),
      },
    );
    if (res.ok) {
      setLightboxMemories((current) =>
        current.map((memory) =>
          memory.id === memoryId ? { ...memory, surfaceSuppressed: suppressed } : memory,
        ),
      );
      await loadPerson();
    }
    setUpdatingMemorySuppressionId(null);
  }

  async function setMemoryTreeVisibility(
    memoryId: string,
    visibility: TreeVisibilityLevel | null,
    options?: { closeLightbox?: boolean },
  ) {
    setUpdatingMemoryVisibilityId(memoryId);
    const res = await fetch(`${API}/api/trees/${treeId}/memories/${memoryId}/visibility`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        visibilityOverride: visibility,
      }),
    });
    if (res.ok) {
      setLightboxMemories((current) =>
        current.map((memory) =>
          memory.id === memoryId
            ? {
                ...memory,
                treeVisibilityLevel: visibility ?? memory.treeVisibilityLevel,
                treeVisibilityIsOverride: visibility !== null,
              }
            : memory,
        ),
      );
      if (options?.closeLightbox) {
        setLightboxIndex(null);
      }
      await loadPerson();
    }
    setUpdatingMemoryVisibilityId(null);
  }

  async function mergeDuplicate(candidate: DuplicateCandidate) {
    const confirmed = window.confirm(
      `Merge ${candidate.displayName} into ${person?.displayName}? This keeps the current person record and moves the duplicate's shared data onto it.`,
    );
    if (!confirmed) return;

    setMergingDuplicateId(candidate.id);
    setMergeError(null);

    const res = await fetch(`${API}/api/trees/${treeId}/people/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        survivorPersonId: personId,
        mergedAwayPersonId: candidate.id,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setMergeError(body?.error ?? "Failed to merge duplicate");
      setMergingDuplicateId(null);
      return;
    }

    await Promise.all([
      loadPerson(),
      loadVisibleTrees(),
      loadCrossTreeLinks(),
      loadDuplicateCandidates(),
    ]);
    setMergingDuplicateId(null);
  }

  const toLightboxMemory = useCallback(
    (memory: Memory): LightboxMemory => ({
      id: memory.id,
      kind: memory.kind,
      title: memory.title,
      body: memory.body,
      transcriptText: memory.transcriptText,
      transcriptLanguage: memory.transcriptLanguage,
      transcriptStatus: memory.transcriptStatus,
      transcriptError: memory.transcriptError,
      dateOfEventText: memory.dateOfEventText,
      mediaUrl: memory.mediaUrl,
      mimeType: memory.mimeType,
      linkedMediaProvider: memory.linkedMediaProvider,
      linkedMediaOpenUrl: memory.linkedMediaOpenUrl,
      linkedMediaSourceUrl: memory.linkedMediaSourceUrl,
      linkedMediaLabel: memory.linkedMediaLabel,
      treeVisibilityLevel: memory.treeVisibilityLevel,
      treeVisibilityIsOverride: memory.treeVisibilityIsOverride,
      memoryContext: memory.memoryContext,
      memoryReasonLabel: memory.memoryReasonLabel,
      surfaceSuppressed: false,
    }),
    [],
  );

  useEffect(() => {
    if (!person || lightboxIndex === null) {
      return;
    }

    const latestById = new Map(
      person.memories.map((memory) => [memory.id, toLightboxMemory(memory)]),
    );

    setLightboxMemories((current) =>
      current.map((memory) => ({
        ...(latestById.get(memory.id) ?? memory),
        surfaceSuppressed: memory.surfaceSuppressed ?? false,
      })),
    );
  }, [lightboxIndex, person, toLightboxMemory]);

  // Open lightbox for a list of memories at a given index
  const openLightbox = useCallback(
    (
      memories: Memory[],
      startIndex: number,
      options?: { surfaceSuppressed?: boolean },
    ) => {
      setLightboxMemories(
        memories.map((memory) => ({
          ...toLightboxMemory(memory),
          surfaceSuppressed: options?.surfaceSuppressed ?? false,
        })),
      );
      setLightboxIndex(startIndex);
    },
    [toLightboxMemory],
  );

  const registerChapterSection = useCallback(
    (sectionId: ChapterSectionId, el: HTMLElement | null) => {
      if (el) {
        chapterSectionRefs.current.set(sectionId, el);
      } else {
        chapterSectionRefs.current.delete(sectionId);
      }
    },
    [],
  );

  const scrollToChapterSection = useCallback((sectionId: ChapterSectionId) => {
    chapterSectionRefs.current.get(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const openMemoryComposer = useCallback((kind?: MemoryKind) => {
    setMemoryComposerKind(kind);
    setShowMemoryForm(true);
  }, []);

  const openMemoryPage = useCallback(
    (targetMemoryId: string) => {
      router.push(`/trees/${treeId}/memories/${targetMemoryId}`);
    },
    [router, treeId],
  );

  const renderQuickViewControl = useCallback(
    (memories: Memory[], startIndex: number) => (
      <button
        type="button"
        onClick={() => openLightbox(memories, startIndex)}
        style={{
          ...secondaryBtnStyle,
          width: "100%",
          justifyContent: "center",
          fontSize: 12,
          padding: "8px 10px",
        }}
      >
        Quick view
      </button>
    ),
    [openLightbox],
  );

  if (isPending || loading || normalizingTreeId || normalizingPersonId) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[160, 240, 200].map((w, i) => (
            <div key={i} style={{ width: w, height: 12, borderRadius: 4, background: "var(--paper-deep)", backgroundImage: "linear-gradient(90deg, var(--paper-deep) 25%, var(--rule) 50%, var(--paper-deep) 75%)", backgroundSize: "400px 100%", animation: "shimmer 1.5s infinite" }} />
          ))}
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h1
            style={{
              margin: "0 0 10px",
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            This chapter could not be opened.
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: 17,
              lineHeight: 1.7,
              color: "var(--ink-soft)",
            }}
          >
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  if (!person) return null;

  const otherPeople = allPeople.filter((p) => p.id !== personId);

  // Decade grouping
  const directMemories =
    person.directMemories ??
    person.memories.filter((memory) => memory.memoryContext !== "contextual");
  const contextualMemories =
    person.contextualMemories ??
    person.memories.filter((memory) => memory.memoryContext === "contextual");
  const suppressedContextualMemories = person.suppressedContextualMemories ?? [];

  const decadeMap = new Map<string, Memory[]>();
  const storyMemories = directMemories.filter((m) => m.kind === "story");
  const contextualStoryMemories = contextualMemories.filter((m) => m.kind === "story");
  const archiveMemories = directMemories.filter((memory) => memory.kind !== "story");
  const contextualArchiveMemories = contextualMemories.filter(
    (memory) => memory.kind !== "story",
  );
  const featureStory = storyMemories[0] ?? null;
  const supportingStories = storyMemories.slice(1);
  const contextualFeatureStory = contextualStoryMemories[0] ?? null;
  const contextualSupportingStories = contextualStoryMemories.slice(1);
  for (const m of archiveMemories) {
    const year = extractYear(m.dateOfEventText);
    if (year) {
      const decade = getDecade(year);
      if (!decadeMap.has(decade)) decadeMap.set(decade, []);
      decadeMap.get(decade)!.push(m);
    }
  }
  const decades = Array.from(decadeMap.keys()).sort();
  const undatedMemories = archiveMemories.filter((m) => !extractYear(m.dateOfEventText));

  const dateRange =
    person.birthDateText && person.deathDateText
      ? `${person.birthDateText} – ${person.deathDateText}`
      : person.birthDateText
      ? `${person.birthDateText} –`
      : person.deathDateText
      ? `– ${person.deathDateText}`
      : null;

  const sortedVisibleTrees = [...visibleTrees].sort((left, right) => {
    if (left.id === treeId) return -1;
    if (right.id === treeId) return 1;
    if (left.id === person.homeTreeId) return -1;
    if (right.id === person.homeTreeId) return 1;
    return left.name.localeCompare(right.name);
  });
  const currentTreeRole =
    sortedVisibleTrees.find((tree) => tree.id === treeId)?.role ?? null;
  const canManageDuplicates =
    currentTreeRole === "founder" || currentTreeRole === "steward";
  const canManageTreeVisibility = canManageDuplicates;
  const canSuppressFromSurface =
    canManageDuplicates || person.linkedUserId === session?.user?.id;
  const memoryWizardPeople = [
    { id: person.id, name: person.displayName },
    ...allPeople
      .filter((candidate) => candidate.id !== person.id)
      .map((candidate) => ({ id: candidate.id, name: candidate.displayName })),
  ];
  const lifeFacts = ([
    ["Birth", person.birthDateText],
    ["Birthplace", person.birthPlace],
    ["Birthplace on the map", person.birthPlaceResolved?.label ?? null],
    ["Death", person.deathDateText],
    ["Death place", person.deathPlace],
    ["Death place on the map", person.deathPlaceResolved?.label ?? null],
    ["Status", person.isLiving ? "Living" : "Deceased"],
  ] as [string, string | null][])
    .filter(([, value]) => value);
  const chapterSections: Array<{ id: ChapterSectionId; label: string }> = [
    { id: "life", label: "Life" },
    { id: "stories", label: "Stories" },
    { id: "archive", label: "Archive" },
    { id: "family", label: "Family" },
    { id: "questions", label: "Questions" },
    ...(crossTreeLinks.length > 0 ? [{ id: "context" as const, label: "Shared context" }] : []),
  ];

  const handleEditFormFieldChange = <K extends keyof EditFormState>(
    field: K,
    value: EditFormState[K],
  ) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>

      {/* Back nav */}
      <header style={{ padding: "16px 24px", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 16, background: "rgba(246,241,231,0.88)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 20 }}>
        <a
          href={`/trees/${treeId}`}
          style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-faded)", textDecoration: "none" }}
        >
          ← Constellation
        </a>
        <span style={{ color: "var(--rule)" }}>·</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink-soft)" }}>
          {person.displayName}
        </span>
        <div style={{ flex: 1 }} />
        {!editing && (
          <>
            <button
              onClick={() => startEditing(person)}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", background: "none", border: "1px solid var(--rule)", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}
            >
              Edit biography
            </button>
            <button
              type="button"
              onClick={deletePerson}
              disabled={deletingPerson}
              style={{ ...dangerBtnStyle, borderRadius: 999, padding: "8px 14px", fontSize: 13 }}
            >
              {deletingPerson ? "Deleting…" : "Delete person"}
            </button>
          </>
        )}
        <a
          href={`/trees/${treeId}/map?personId=${personId}`}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", background: "none", border: "1px solid var(--rule)", borderRadius: 999, padding: "8px 14px", cursor: "pointer", textDecoration: "none" }}
        >
          View on the map
        </a>
        <button
          onClick={() => setPromptComposerOpen(true)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 999, padding: "8px 14px", cursor: "pointer", marginLeft: 8 }}
        >
          Request a memory
        </button>
      </header>

      {deleteError && !editing && (
        <div
          style={{
            padding: "12px 24px",
            background: "rgba(154,79,70,0.08)",
            borderBottom: "1px solid rgba(154,79,70,0.18)",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "#9a4f46",
          }}
        >
          {deleteError}
        </div>
      )}

      {/* Portrait header */}
      <div style={{ position: "relative", height: 360, overflow: "hidden", flexShrink: 0 }}>
        {person.portraitUrl ? (
          <img
            src={person.portraitUrl}
            alt={person.displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6) sepia(0.2)" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg, var(--paper-deep) 0%, var(--rule) 100%)" }} />
        )}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "56px 40px 36px", background: "linear-gradient(to top, rgba(28,25,21,0.7) 0%, transparent 100%)" }}>
          <div style={{ maxWidth: 1240, margin: "0 auto" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 54, fontWeight: 400, color: "#F6F1E7", lineHeight: 1.05, margin: 0 }}>
              {person.displayName}
            </h1>
            {dateRange && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 16, color: "rgba(246,241,231,0.74)", marginTop: 8 }}>{dateRange}</p>
            )}
            {person.essenceLine && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 20, fontStyle: "italic", color: "rgba(246,241,231,0.88)", marginTop: 10, maxWidth: 760, lineHeight: 1.6 }}>
                {person.essenceLine}
              </p>
            )}
            {sortedVisibleTrees.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
                {sortedVisibleTrees.map((tree) => {
                  const isCurrentTree = tree.id === treeId;
                  return (
                    <button
                      key={tree.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrentTree) {
                          router.push(`/trees/${tree.id}/people/${person.id}`);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 999,
                        border: isCurrentTree
                          ? "1px solid rgba(246,241,231,0.55)"
                          : "1px solid rgba(246,241,231,0.22)",
                        background: isCurrentTree
                          ? "rgba(246,241,231,0.18)"
                          : "rgba(28,25,21,0.18)",
                        color: "#F6F1E7",
                        padding: "8px 12px",
                        cursor: isCurrentTree ? "default" : "pointer",
                      }}
                    >
                         <span style={{ fontFamily: "var(--font-ui)", fontSize: 13 }}>
                           {tree.name}
                         </span>
                      {tree.id === person.homeTreeId && (
                        <span
                          style={{
                            fontFamily: "var(--font-ui)",
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            opacity: 0.8,
                          }}
                        >
                          home
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          opacity: 0.68,
                        }}
                      >
                        {isCurrentTree ? "current" : tree.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPortrait}
           style={{ position: "absolute", top: 20, right: 20, background: "rgba(246,241,231,0.85)", border: "1px solid var(--rule)", borderRadius: 999, padding: "8px 14px", fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", cursor: "pointer" }}
        >
          {uploadingPortrait ? "Uploading…" : "Change portrait"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadPortrait(file); }}
        />
      </div>

      <BiographyDrawer
        editing={editing}
        person={person}
        editForm={editForm}
        savingEdit={savingEdit}
        deletingPerson={deletingPerson}
        deleteError={deleteError}
        treeId={treeId}
        apiBase={API}
        onClose={() => setEditing(false)}
        onSubmit={saveEdit}
        onDelete={deletePerson}
        onChangeField={handleEditFormFieldChange}
      />

      <div style={{ flex: 1, maxWidth: 1240, margin: "0 auto", width: "100%", padding: "56px 40px 120px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 56, alignItems: "start" }}>
          <aside style={{ position: "sticky", top: 112, display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                border: "1px solid var(--rule)",
                borderRadius: 16,
                background: "var(--paper-deep)",
                padding: "18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: 0,
                }}
              >
                Jump through the chapter
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {chapterSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToChapterSection(section.id)}
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 14,
                      color: "var(--ink-soft)",
                      background: "var(--paper)",
                      border: "1px solid var(--rule)",
                      borderRadius: 999,
                      padding: "10px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            <MemoryStudioRail
              personName={person.displayName}
              onOpenStory={() => openMemoryComposer("story")}
              onOpenPhoto={() => openMemoryComposer("photo")}
              onOpenVoice={() => openMemoryComposer("voice")}
              onOpenDocument={() => openMemoryComposer("document")}
              onOpenStudio={() => openMemoryComposer()}
            />
          </aside>

          <main style={{ display: "flex", flexDirection: "column", gap: 96 }}>
          <section
            ref={(el) => registerChapterSection("life", el)}
            style={{ scrollMarginTop: 120 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 30 }}>
              <div>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                  Chapter opening
                </p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Life
                </h2>
              </div>
              <button
                type="button"
                onClick={() => startEditing(person)}
                style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 999, padding: "10px 18px", cursor: "pointer" }}
              >
                Edit biography
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
              {person.essenceLine && (
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 22,
                    lineHeight: 1.75,
                    color: "var(--ink-soft)",
                    margin: 0,
                    maxWidth: 760,
                  }}
                >
                  {person.essenceLine}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {lifeFacts.map(([label, value]) => (
                  <div key={label} style={{ display: "flex", gap: 30, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", width: 120, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 20, color: "var(--ink)", lineHeight: 1.5 }}>{value}</span>
                  </div>
                ))}
                {person.linkedUserId === session?.user.id && (
                  <div style={{ display: "flex", gap: 30, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", width: 120, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account</span>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: "var(--moss)" }}>This is you</span>
                  </div>
                )}
                {sortedVisibleTrees.length > 0 && (
                  <div style={{ display: "flex", gap: 30, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", width: 120, textTransform: "uppercase", letterSpacing: "0.05em" }}>Lineages</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      {sortedVisibleTrees.map((tree) => (
                        <div
                          key={tree.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => router.push(`/trees/${tree.id}/people/${person.id}`)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              border: "none",
                              background: "none",
                              padding: 0,
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <span style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--ink)" }}>
                              {tree.name}
                            </span>
                            {tree.id === person.homeTreeId && (
                              <span style={pillStyle}>home</span>
                            )}
                            {tree.id === treeId && (
                              <span style={pillStyle}>current</span>
                            )}
                          </button>
                          {tree.id !== treeId && (
                            <a
                              href={`/trees/${tree.id}?focusPersonId=${person.id}`}
                              style={{
                                fontFamily: "var(--font-ui)",
                                fontSize: 12,
                                color: "var(--moss)",
                                textDecoration: "none",
                              }}
                            >
                              Open in tree →
                            </a>
                          )}
                        </div>
                      ))}
                      {canManageTreeVisibility && (
                        <button
                          type="button"
                          onClick={openAddLineageDialog}
                          style={{
                            alignSelf: "flex-start",
                            fontFamily: "var(--font-ui)",
                            fontSize: 13,
                            color: "var(--moss)",
                            background: "none",
                            border: "1px solid var(--moss)",
                            borderRadius: 999,
                            padding: "6px 12px",
                            cursor: "pointer",
                            marginTop: 4,
                          }}
                        >
                          + Add to another lineage
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {lifeFacts.length === 0 && sortedVisibleTrees.length === 0 && !person.linkedUserId && (
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--ink-faded)", margin: 0, lineHeight: 1.6 }}>
                    This chapter is still waiting for the first details of {person.displayName.split(" ")[0]}'s life.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section
            ref={(el) => registerChapterSection("stories", el)}
            style={{ scrollMarginTop: 120 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 28 }}>
              <div>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                  Written memories
                </p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Stories
                </h2>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {canSuppressFromSurface && (
                  <a
                    href={`/trees/${treeId}/curation?personId=${personId}`}
                    style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 999, padding: "10px 18px", textDecoration: "none" }}
                  >
                    Edit chapter order
                  </a>
                )}
                <button
                  onClick={() => openMemoryComposer("story")}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 999, padding: "10px 18px", cursor: "pointer" }}
                >
                  + Add story
                </button>
              </div>
            </div>

            {storyMemories.length === 0 && contextualStoryMemories.length === 0 ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--ink-faded)", margin: 0, lineHeight: 1.6 }}>
                No stories have been recorded yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                {featureStory && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    <MemoryCard
                      memory={featureStory}
                      onClick={() => openMemoryPage(featureStory.id)}
                      emphasis="feature"
                    />
                    {supportingStories.length > 0 && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                          gap: 18,
                        }}
                      >
                        {supportingStories.map((story) => (
                          <MemoryCard
                            key={story.id}
                            memory={story}
                            onClick={() => openMemoryPage(story.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {contextualStoryMemories.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-soft)", fontStyle: "italic" }}>
                        Shared through family context
                      </span>
                      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                      {contextualFeatureStory && (
                        <MemoryCard
                          memory={contextualFeatureStory}
                          onClick={() => openMemoryPage(contextualFeatureStory.id)}
                          emphasis="feature"
                        />
                      )}
                      {contextualSupportingStories.length > 0 && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                            gap: 18,
                          }}
                        >
                          {contextualSupportingStories.map((story) => (
                            <MemoryCard
                              key={story.id}
                              memory={story}
                              onClick={() => openMemoryPage(story.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section
            ref={(el) => registerChapterSection("archive", el)}
            style={{ scrollMarginTop: 120 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 28 }}>
              <div>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                  Images, voice, and keepsakes
                </p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Archive
                </h2>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => openMemoryComposer("photo")}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 999, padding: "10px 18px", cursor: "pointer" }}
                >
                  + Add photo or video
                </button>
                <button
                  onClick={() => openMemoryComposer("voice")}
                  style={{ ...secondaryBtnStyle, borderRadius: 999, padding: "10px 18px", fontSize: 14 }}
                >
                  + Add voice
                </button>
                <button
                  onClick={() => openMemoryComposer("document")}
                  style={{ ...secondaryBtnStyle, borderRadius: 999, padding: "10px 18px", fontSize: 14 }}
                >
                  + Add document
                </button>
              </div>
            </div>

            {archiveMemories.length === 0 && contextualArchiveMemories.length === 0 && suppressedContextualMemories.length === 0 ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--ink-faded)", margin: 0, lineHeight: 1.6 }}>
                No archive items have been added yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
                {decades.map((decade) => {
                  const mems = decadeMap.get(decade)!;
                  return (
                    <section key={decade}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink-soft)", fontStyle: "italic" }}>{decade}</span>
                        <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
                        {mems.map((m, i) => (
                          <MemoryCard
                            key={m.id}
                            memory={m}
                            onClick={() => openMemoryPage(m.id)}
                            extraControls={renderQuickViewControl(mems, i)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}

                {undatedMemories.length > 0 && (
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                       <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink-soft)", fontStyle: "italic" }}>Undated</span>
                      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
                      {undatedMemories.map((m, i) => (
                        <MemoryCard
                          key={m.id}
                          memory={m}
                          onClick={() => openMemoryPage(m.id)}
                          extraControls={renderQuickViewControl(undatedMemories, i)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {contextualArchiveMemories.length > 0 && (
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                       <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink-soft)", fontStyle: "italic" }}>
                         Shared through family context
                       </span>
                      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                    </div>
                     <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
                       These memories appear here because they were shared through family or lineage context, not because this page owns them.
                     </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
                      {contextualArchiveMemories.map((memory, index) => (
                        <MemoryCard
                          key={memory.id}
                          memory={memory}
                          onClick={() => openMemoryPage(memory.id)}
                          extraControls={renderQuickViewControl(contextualArchiveMemories, index)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {canSuppressFromSurface && suppressedContextualMemories.length > 0 && (
                  <section>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                       <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink-soft)", fontStyle: "italic" }}>
                         Hidden from this page
                       </span>
                      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                    </div>
                     <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
                       These memories still live in the archive, but they no longer surface on this page.
                     </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
                      {suppressedContextualMemories.map((memory, index) => (
                        <MemoryCard
                          key={memory.id}
                          memory={memory}
                          onClick={() => openMemoryPage(memory.id)}
                          extraControls={
                            <button
                              type="button"
                              onClick={() =>
                                openLightbox(suppressedContextualMemories, index, {
                                  surfaceSuppressed: true,
                                })
                              }
                              style={{
                                ...secondaryBtnStyle,
                                width: "100%",
                                justifyContent: "center",
                                fontSize: 12,
                                padding: "8px 10px",
                              }}
                            >
                              Quick view
                            </button>
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </section>

          <section
            ref={(el) => registerChapterSection("family", el)}
            style={{ scrollMarginTop: 120 }}
          >
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                Family web
              </p>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                People around {person.displayName.split(" ")[0]}
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <RelationshipsSection
                person={person}
                personId={personId}
                treeId={treeId}
                otherPeople={otherPeople}
                showRelForm={showRelForm}
                relForm={relForm}
                savingRel={savingRel}
                onToggleForm={() => setShowRelForm((value) => !value)}
                onChangeType={(value) => setRelForm((current) => ({ ...current, type: value }))}
                onChangeDirection={(value) =>
                  setRelForm((current) => ({ ...current, direction: value }))
                }
                onChangeOtherPersonId={(value) =>
                  setRelForm((current) => ({ ...current, otherPersonId: value }))
                }
                onSubmit={saveRelationship}
              />
              <DuplicateCandidatesSection
                canManageDuplicates={canManageDuplicates}
                loadingDuplicates={loadingDuplicates}
                mergeError={mergeError}
                duplicateCandidates={duplicateCandidates}
                mergingDuplicateId={mergingDuplicateId}
                onRefresh={loadDuplicateCandidates}
                onMerge={mergeDuplicate}
                onOpenPerson={(candidateTreeId, candidatePersonId) =>
                  router.push(`/trees/${candidateTreeId}/people/${candidatePersonId}`)
                }
              />
            </div>
          </section>

          <section
            ref={(el) => registerChapterSection("questions", el)}
            style={{ scrollMarginTop: 120 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 28 }}>
              <div>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                  Memory requests
                </p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Requests for {person.displayName.split(" ")[0]}
                </h2>
              </div>
              <button
                onClick={() => setPromptComposerOpen(true)}
                style={{ padding: "10px 18px", borderRadius: 999, border: "none", background: "var(--moss)", fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 500, color: "#fff", cursor: "pointer" }}
              >
                + Request a memory
              </button>
            </div>
            {personPrompts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-faded)", fontFamily: "var(--font-body)" }}>
                  <p style={{ fontSize: 28, marginBottom: 10 }}>✦</p>
                  <p style={{ fontSize: 19 }}>No requests yet.</p>
                  <p style={{ fontSize: 15 }}>Request a memory from {person.displayName.split(" ")[0]}.</p>
                </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {personPrompts.map((p) => (
                  <div key={p.id} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 18px", background: "var(--paper)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
                        Asked by {p.fromUserName ?? "a family member"} · {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 500, color: p.status === "answered" ? "var(--moss)" : p.status === "dismissed" ? "var(--ink-faded)" : "var(--gilt)", padding: "2px 8px", borderRadius: 20, border: `1px solid ${p.status === "answered" ? "var(--moss)" : p.status === "dismissed" ? "var(--rule)" : "var(--gilt)"}` }}>
                        {p.status === "answered" ? "Replied" : p.status === "dismissed" ? "Dismissed" : "Awaiting reply"}
                      </span>
                    </div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--ink)", margin: "0 0 8px", lineHeight: 1.65 }}>
                      {p.questionText}
                    </p>
                    {p.replies && p.replies.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {p.replies.map((r) => (
                          <div key={r.id} style={{ background: "rgba(78,93,66,0.06)", borderRadius: 6, padding: "8px 12px", fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)" }}>
                            ↳ {r.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {crossTreeLinks.length > 0 && (
            <section
              ref={(el) => registerChapterSection("context", el)}
              style={{ scrollMarginTop: 120 }}
            >
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
                  Shared identity
                </p>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 38, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Shared context from other trees
                </h2>
              </div>
              <CrossTreeContextSection crossTreeLinks={crossTreeLinks} />
            </section>
          )}
          </main>
        </div>
      </div>

      {/* Memory lightbox */}
      {lightboxIndex !== null && (
        <MemoryLightbox
          memories={lightboxMemories}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          canManageTreeVisibility={canManageTreeVisibility}
          canSuppressFromSurface={canSuppressFromSurface}
          updatingTreeVisibilityId={updatingMemoryVisibilityId}
          updatingSurfaceSuppressionId={updatingMemorySuppressionId}
          onSetTreeVisibility={(memoryId, visibility) =>
            void setMemoryTreeVisibility(memoryId, visibility)
          }
          onSetSurfaceSuppression={(memoryId, suppressed) =>
            void setMemorySurfaceSuppression(memoryId, suppressed)
          }
        />
      )}

      {/* Prompt composer */}
      <PromptComposer
        open={promptComposerOpen}
        onClose={() => setPromptComposerOpen(false)}
        treeId={treeId}
        people={[{ id: person.id, displayName: person.displayName, essenceLine: person.essenceLine, portraitUrl: person.portraitUrl, linkedUserId: person.linkedUserId }]}
        defaultPersonId={person.id}
        onPromptSent={loadPersonPrompts}
      />

      {showMemoryForm && (
        <AddMemoryWizard
          treeId={treeId}
          people={memoryWizardPeople}
          apiBase={API}
          onClose={() => setShowMemoryForm(false)}
          onSuccess={loadPerson}
          defaultPersonId={person.id}
          defaultKind={memoryComposerKind}
          subjectName={person.displayName}
        />
      )}

      {addLineageOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeAddLineageDialog}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(28,25,21,0.55)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: 540,
              width: "100%",
              background: "rgba(252,248,242,0.98)",
              borderRadius: 18,
              border: "1px solid rgba(128,107,82,0.2)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 24px 60px rgba(40,30,18,0.3)",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 24,
                  color: "var(--ink)",
                }}
              >
                Add {person.displayName} to another lineage
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "rgba(53,44,33,0.72)",
                }}
              >
                Shared people bridge lineages. Choose a lineage below. If a likely match
                already lives there, you&apos;ll see it before anything is saved.
              </div>
            </div>

            {availableLineagesLoading ? (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>
                Loading your lineages…
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {availableLineages
                  .filter((lineage) => lineage.treeId !== treeId)
                  .map((lineage) => {
                    const disabled =
                      lineage.alreadyInScope || !lineage.canAddToScope;
                    const isSelected = selectedTargetTreeId === lineage.treeId;
                    return (
                      <button
                        key={lineage.treeId}
                        type="button"
                        disabled={disabled}
                        onClick={() => selectTargetLineage(lineage.treeId)}
                        style={{
                          textAlign: "left",
                          fontFamily: "var(--font-body)",
                          fontSize: 15,
                          color: disabled ? "var(--ink-faded)" : "var(--ink)",
                          background: isSelected
                            ? "rgba(210,182,133,0.22)"
                            : "rgba(255,250,244,0.74)",
                          border: `1px solid ${isSelected ? "var(--moss)" : "rgba(128,107,82,0.2)"}`,
                          borderRadius: 12,
                          padding: "10px 14px",
                          cursor: disabled ? "not-allowed" : "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span>{lineage.treeName}</span>
                        <span
                          style={{
                            fontFamily: "var(--font-ui)",
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--ink-faded)",
                          }}
                        >
                          {lineage.alreadyInScope
                            ? "Already here"
                            : lineage.canAddToScope
                            ? lineage.role
                            : `${lineage.role} · no permission`}
                        </span>
                      </button>
                    );
                  })}
                {availableLineages.filter((l) => l.treeId !== treeId).length === 0 && (
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>
                    You don&apos;t belong to any other lineages yet. Create one from your
                    lineage foyer to bring {person.displayName.split(" ")[0]} along.
                  </div>
                )}
              </div>
            )}

            {conflictLoading && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>
                Checking for possible duplicates in that lineage…
              </div>
            )}

            {scopeConflict && !conflictLoading && (
              <div
                style={{
                  border: "1px solid rgba(128,107,82,0.2)",
                  borderRadius: 12,
                  padding: 14,
                  background: "rgba(245,238,228,0.72)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {scopeConflict.existingScopedMatch ? (
                  <div
                    style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)" }}
                  >
                    {person.displayName} is already in {scopeConflict.targetTree.name}.
                  </div>
                ) : scopeConflict.duplicateCandidates.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#8a5a1c",
                      }}
                    >
                      Possible duplicates in {scopeConflict.targetTree.name}
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {scopeConflict.duplicateCandidates.map((candidate) => (
                        <li
                          key={candidate.personId}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 14,
                            color: "var(--ink)",
                          }}
                        >
                          <a
                            href={`/trees/${scopeConflict.targetTree.id}/people/${candidate.personId}`}
                            style={{ color: "var(--moss)", textDecoration: "underline" }}
                          >
                            {candidate.displayName}
                          </a>
                          {(candidate.birthDateText || candidate.deathDateText) && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontFamily: "var(--font-ui)",
                                fontSize: 12,
                                color: "var(--ink-faded)",
                              }}
                            >
                              {[candidate.birthDateText, candidate.deathDateText]
                                .filter(Boolean)
                                .join(" – ")}
                            </span>
                          )}
                          {candidate.reasons.length > 0 && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontFamily: "var(--font-ui)",
                                fontSize: 11,
                                color: "var(--ink-faded)",
                              }}
                            >
                              ({candidate.reasons.join(", ")})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 12,
                        color: "var(--ink-faded)",
                      }}
                    >
                      Review and merge from the person page in that lineage if any of these
                      are the same person, or continue to add this shared record alongside
                      them.
                    </div>
                  </>
                ) : (
                  <div
                    style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)" }}
                  >
                    No likely duplicates found in {scopeConflict.targetTree.name}.
                  </div>
                )}
              </div>
            )}

            {addLineageError && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "#8a2a1c" }}>
                {addLineageError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={submittingScopeAdd}
                onClick={closeAddLineageDialog}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  background: "transparent",
                  color: "var(--ink-faded)",
                  border: "1px solid rgba(128,107,82,0.2)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !selectedTargetTreeId ||
                  submittingScopeAdd ||
                  conflictLoading ||
                  (scopeConflict?.existingScopedMatch ?? false) ||
                  !(scopeConflict?.canAddToScope ?? true)
                }
                onClick={confirmAddToLineage}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  background: "var(--ink)",
                  color: "white",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 16px",
                  cursor:
                    !selectedTargetTreeId ||
                    submittingScopeAdd ||
                    conflictLoading ||
                    (scopeConflict?.existingScopedMatch ?? false)
                      ? "default"
                      : "pointer",
                  opacity:
                    !selectedTargetTreeId ||
                    (scopeConflict?.existingScopedMatch ?? false) ||
                    !(scopeConflict?.canAddToScope ?? true)
                      ? 0.55
                      : 1,
                }}
              >
                {submittingScopeAdd
                  ? "Adding…"
                  : scopeConflict?.duplicateCandidates.length
                  ? "Add anyway"
                  : "Add to lineage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 6,
  border: "1px solid var(--rule)",
  padding: "9px 12px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink)",
  background: "var(--paper)",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--ink)",
  color: "var(--paper)",
  border: "none",
  borderRadius: 6,
  padding: "9px 20px",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  background: "none",
  color: "var(--ink-soft)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "9px 20px",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cursor: "pointer",
};

const dangerBtnStyle: React.CSSProperties = {
  background: "rgba(154,79,70,0.08)",
  color: "#9a4f46",
  border: "1px solid rgba(154,79,70,0.28)",
  borderRadius: 6,
  padding: "9px 20px",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cursor: "pointer",
};

const railPrimaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "var(--moss)",
  borderRadius: 999,
  padding: "11px 16px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  fontWeight: 500,
  color: "#fff",
  cursor: "pointer",
  textAlign: "left",
};

const railSecondaryButtonStyle: React.CSSProperties = {
  border: "1px solid var(--rule)",
  background: "var(--paper-deep)",
  borderRadius: 999,
  padding: "10px 16px",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-soft)",
  cursor: "pointer",
  textAlign: "left",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid var(--rule)",
  padding: "2px 7px",
  fontFamily: "var(--font-ui)",
  fontSize: 10,
  color: "var(--ink-faded)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function MemoryCard({
  memory,
  onClick,
  extraControls,
  emphasis = "supporting",
}: {
  memory: Memory;
  onClick?: () => void;
  extraControls?: React.ReactNode;
  emphasis?: "feature" | "supporting";
}) {
  const mime = memory.mimeType?.toLowerCase() ?? "";
  const isVideo = mime.startsWith("video/");
  const resolvedMediaUrl = getProxiedMediaUrl(memory.mediaUrl);
  const previewText = getMemoryPreviewText(memory);
  const isFeature = emphasis === "feature";
  const kindIcon: Record<MemoryKind, string> = {
    photo: "◻",
    story: "✦",
    voice: "🎙",
    document: "□",
    other: "·",
  };

  return (
    <article
      onClick={onClick}
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 18,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 200ms, transform 200ms",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = "0 4px 16px rgba(28,25,21,0.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
    >
      {resolvedMediaUrl && memory.kind === "photo" && !isVideo && (
        <img
          src={resolvedMediaUrl}
          alt={memory.title}
          style={{
            width: "100%",
            height: isFeature ? 320 : 224,
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      {resolvedMediaUrl && isVideo && (
        <video
          src={resolvedMediaUrl}
          style={{
            width: "100%",
            height: isFeature ? 320 : 224,
            objectFit: "cover",
            display: "block",
            background: "var(--ink)",
          }}
          muted
          playsInline
          preload="metadata"
        />
      )}
      {memory.kind === "voice" && (
        <div
          style={{
            height: isFeature ? 140 : 88,
            background: "var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 4,
                height: 12 + Math.abs(Math.sin(i * 0.8) * (isFeature ? 44 : 26)),
                borderRadius: 2,
                background: "rgba(246,241,231,0.3)",
              }}
            />
          ))}
        </div>
      )}
      {!resolvedMediaUrl && memory.kind !== "voice" && (
        <div
          style={{
            minHeight: isFeature ? 160 : 120,
            background: "linear-gradient(180deg, var(--paper-deep), var(--paper))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: isFeature ? 54 : 38,
              color: "rgba(28,25,21,0.18)",
            }}
          >
            {kindIcon[memory.kind]}
          </div>
        </div>
      )}
      <div style={{ padding: isFeature ? "24px 26px 26px" : "18px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 11, opacity: 0.4 }}>{kindIcon[memory.kind]}</span>
          {memory.memoryContext === "contextual" && memory.memoryReasonLabel && (
            <span style={pillStyle}>{memory.memoryReasonLabel}</span>
          )}
          {memory.featuredOnPersonPage && memory.memoryContext !== "contextual" && (
            <span style={pillStyle}>Featured</span>
          )}
          {isVideo && (
            <span style={pillStyle}>Video</span>
          )}
          {memory.linkedMediaProvider === "google_drive" && (
            <span style={pillStyle}>Linked from Drive</span>
          )}
        </div>
        <div style={{ marginBottom: previewText ? 12 : 16 }}>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: isFeature ? 34 : 24,
              color: "var(--ink)",
              margin: "0 0 10px",
              fontWeight: 400,
              lineHeight: 1.15,
              maxWidth: isFeature ? "18ch" : "none",
            }}
          >
            {memory.title}
          </h3>
          {(memory.dateOfEventText || memory.place?.label) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
              }}
            >
              {memory.dateOfEventText && <span>{memory.dateOfEventText}</span>}
              {memory.place?.label && <span>{memory.place.label}</span>}
            </div>
          )}
        </div>
        {previewText && (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: isFeature ? 19 : 16,
              lineHeight: isFeature ? 1.85 : 1.75,
              color: memory.kind === "voice" ? "var(--ink-faded)" : "var(--ink-soft)",
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: isFeature ? 5 : 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              maxWidth: isFeature ? "54ch" : "none",
            }}
          >
            {previewText}
          </p>
        )}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--moss)",
            }}
          >
            Open memory →
          </div>
        {extraControls && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            onClick={(event) => event.stopPropagation()}
          >
            {extraControls}
          </div>
        )}
        </div>
      </div>
    </article>
  );
}

function MemoryStudioRail({
  personName,
  onOpenStory,
  onOpenPhoto,
  onOpenVoice,
  onOpenDocument,
  onOpenStudio,
}: {
  personName: string;
  onOpenStory: () => void;
  onOpenPhoto: () => void;
  onOpenVoice: () => void;
  onOpenDocument: () => void;
  onOpenStudio: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 16,
        background: "var(--paper)",
        padding: "18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 8px",
          }}
        >
          Memory studio
        </p>
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            color: "var(--ink)",
            fontWeight: 400,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Add to {personName.split(" ")[0]}'s chapter
        </h3>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.65, color: "var(--ink-soft)", margin: 0 }}>
        Start with a story, upload a photo or video, drop in a document, or record a voice note.
        Everything begins anchored to {personName.split(" ")[0]}, then you can tag others and choose
        how far it should travel through the family archive.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button type="button" onClick={onOpenStory} style={railPrimaryButtonStyle}>
          + Add a story
        </button>
        <button type="button" onClick={onOpenPhoto} style={railSecondaryButtonStyle}>
          Upload photo or video
        </button>
        <button type="button" onClick={onOpenVoice} style={railSecondaryButtonStyle}>
          Record or upload voice
        </button>
        <button type="button" onClick={onOpenDocument} style={railSecondaryButtonStyle}>
          Add a document
        </button>
      </div>
      <button type="button" onClick={onOpenStudio} style={{ ...secondaryBtnStyle, borderRadius: 999, fontSize: 13, padding: "9px 14px" }}>
        Open full memory studio
      </button>
    </div>
  );
}

function DateSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string | null) => void;
}) {
  const [parsed, setParsed] = useState<ParsedDate>(() => parseDateText(value));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setParsed(parseDateText(value)); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayValue = [parsed.month && MONTHS[Number(parsed.month)] ? MONTHS[Number(parsed.month)]?.slice(0, 3) : "", parsed.day, parsed.year].filter(Boolean).join(" ") || (parsed.year || "—");

  return (
    <div style={{ marginBottom: 8, position: "relative" }} ref={ref}>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", marginBottom: 2 }}>{label}</div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          fontFamily: "var(--font-body)", fontSize: 14, color: displayValue !== "—" ? "var(--ink)" : "var(--ink-faded)",
          background: open ? "rgba(78,93,66,0.05)" : "transparent", border: open ? "1px solid rgba(78,93,66,0.3)" : "1px dashed var(--rule)",
          borderRadius: 6, padding: "6px 10px", cursor: "pointer", width: "100%", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "all 150ms cubic-bezier(0.22, 0.61, 0.36, 1)",
        }}
      >
        <span>{displayValue}</span>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", marginLeft: 8 }}>✎</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, zIndex: 30,
            background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(28,25,21,0.12)", padding: "12px 14px", minWidth: 220,
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <select
              value={parsed.month}
              onChange={(e) => setParsed({ ...parsed, month: e.target.value })}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 6px", flex: 1 }}
            >
              <option value="">Month</option>
              {MONTHS.slice(1).map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
            <input
              type="text"
              inputMode="numeric"
              placeholder="DD"
              value={parsed.day}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 2); setParsed({ ...parsed, day: v }); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", width: 40, background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 6px", textAlign: "center" }}
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="YYYY"
              value={parsed.year}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setParsed({ ...parsed, year: v }); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", width: 52, background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 6px", textAlign: "center" }}
            />
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", marginBottom: 8 }}>
            Format: MM/DD/YYYY or year only
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              onClick={() => { setParsed({ month: "", day: "", year: "" }); onChange(null); setOpen(false); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", background: "transparent", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
            >Clear</button>
            <button
              type="button"
              onClick={() => { onChange(formatDateText(parsed)); setOpen(false); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "white", background: "var(--moss)", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}
            >Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BiographyDrawer({
  editing,
  person,
  editForm,
  savingEdit,
  deletingPerson,
  deleteError,
  treeId,
  apiBase,
  onClose,
  onSubmit,
  onDelete,
  onChangeField,
}: {
  editing: boolean;
  person: Person;
  editForm: EditFormState;
  savingEdit: boolean;
  deletingPerson: boolean;
  deleteError: string | null;
  treeId: string;
  apiBase: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onDelete: () => void;
  onChangeField: <K extends keyof EditFormState>(field: K, value: EditFormState[K]) => void;
}) {
  if (!editing) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,25,21,0.32)",
        backdropFilter: "blur(4px)",
        zIndex: 40,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          height: "100%",
          overflowY: "auto",
          background: "var(--paper)",
          borderLeft: "1px solid var(--rule)",
          boxShadow: "-18px 0 48px rgba(28,25,21,0.14)",
          padding: "28px 28px 36px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 6px",
              }}
            >
              Edit biography
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 400,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {person.displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid var(--rule)",
              background: "var(--paper-deep)",
              borderRadius: 999,
              padding: "6px 10px",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: 0,
              }}
            >
              Identity
            </p>
            <input
              type="text"
              required
              value={editForm.displayName}
              onChange={(event) => onChangeField("displayName", event.target.value)}
              placeholder="Full name"
              style={inputStyle}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(event) => onChangeField("firstName", event.target.value)}
                placeholder="First name"
                style={inputStyle}
              />
              <input
                type="text"
                value={editForm.lastName}
                onChange={(event) => onChangeField("lastName", event.target.value)}
                placeholder="Last name"
                style={inputStyle}
              />
            </div>
            <input
              type="text"
              value={editForm.maidenName}
              onChange={(event) => onChangeField("maidenName", event.target.value)}
              placeholder="Maiden name"
              style={inputStyle}
            />
            <input
              type="text"
              value={editForm.essenceLine}
              onChange={(event) => onChangeField("essenceLine", event.target.value)}
              placeholder="Essence line (one sentence)"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: 0,
              }}
            >
              Life details
            </p>
            <DateSelector
              label="Birth date"
              value={editForm.birthDateText}
              onChange={(val) => onChangeField("birthDateText", val ?? "")}
            />
            <DateSelector
              label="Death date"
              value={editForm.deathDateText}
              onChange={(val) => onChangeField("deathDateText", val ?? "")}
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "var(--ink-soft)",
              }}
            >
              <input
                type="checkbox"
                checked={editForm.isLiving}
                onChange={(event) => onChangeField("isLiving", event.target.checked)}
              />
              Still living
            </label>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: 0,
              }}
            >
              Places
            </p>
            <input
              type="text"
              value={editForm.birthPlace}
              onChange={(event) => onChangeField("birthPlace", event.target.value)}
              placeholder="Birthplace"
              style={inputStyle}
            />
            <PlacePicker
              treeId={treeId}
              apiBase={apiBase}
              value={editForm.birthPlaceId}
              onChange={(birthPlaceId) => onChangeField("birthPlaceId", birthPlaceId)}
              label="Birthplace on the map"
              emptyLabel="No mapped birthplace"
            />
            <input
              type="text"
              value={editForm.deathPlace}
              onChange={(event) => onChangeField("deathPlace", event.target.value)}
              placeholder="Death place"
              style={inputStyle}
            />
            <PlacePicker
              treeId={treeId}
              apiBase={apiBase}
              value={editForm.deathPlaceId}
              onChange={(deathPlaceId) => onChangeField("deathPlaceId", deathPlaceId)}
              label="Death place on the map"
              emptyLabel="No mapped death place"
            />
          </div>

          <div
            style={{
              borderTop: "1px solid var(--rule)",
              paddingTop: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {deleteError && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "#9a4f46" }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" disabled={savingEdit} style={primaryBtnStyle}>
                {savingEdit ? "Saving…" : "Save biography"}
              </button>
              <button type="button" onClick={onClose} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={savingEdit || deletingPerson}
                style={dangerBtnStyle}
              >
                {deletingPerson ? "Deleting…" : "Delete person"}
              </button>
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
              Deleting a person also removes their relationships, memories, prompts, and cross-tree
              links.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function RelationshipsSection({
  person,
  personId,
  treeId,
  otherPeople,
  showRelForm,
  relForm,
  savingRel,
  onToggleForm,
  onChangeType,
  onChangeDirection,
  onChangeOtherPersonId,
  onSubmit,
}: {
  person: Person;
  personId: string;
  treeId: string;
  otherPeople: PersonSummary[];
  showRelForm: boolean;
  relForm: RelationshipFormState;
  savingRel: boolean;
  onToggleForm: () => void;
  onChangeType: (value: RelationshipType) => void;
  onChangeDirection: (value: "from" | "to") => void;
  onChangeOtherPersonId: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 30,
            color: "var(--ink)",
            margin: 0,
            fontWeight: 400,
          }}
        >
          Relationships
        </h3>
        {otherPeople.length > 0 && (
          <button
            type="button"
            onClick={onToggleForm}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 14,
              color: "var(--moss)",
              background: "none",
              border: "1px solid var(--moss)",
              borderRadius: 999,
              padding: "10px 16px",
              cursor: "pointer",
            }}
          >
            {showRelForm ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>

      {showRelForm && (
        <form
          onSubmit={onSubmit}
          style={{
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <select
            value={relForm.type}
            onChange={(event) => onChangeType(event.target.value as RelationshipType)}
            style={inputStyle}
          >
            <option value="parent_child">Parent / Child</option>
            <option value="sibling">Sibling</option>
            <option value="spouse">Spouse / Partner</option>
          </select>
          {relForm.type === "parent_child" && (
            <select
              value={relForm.direction}
              onChange={(event) => onChangeDirection(event.target.value as "from" | "to")}
              style={inputStyle}
            >
              <option value="from">{person.displayName} is the parent</option>
              <option value="to">{person.displayName} is the child</option>
            </select>
          )}
          <select
            required
            value={relForm.otherPersonId}
            onChange={(event) => onChangeOtherPersonId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Select person…</option>
            {otherPeople.map((otherPerson) => (
              <option key={otherPerson.id} value={otherPerson.id}>
                {otherPerson.displayName}
              </option>
            ))}
          </select>
          <button type="submit" disabled={savingRel} style={primaryBtnStyle}>
            {savingRel ? "Saving…" : "Add relationship"}
          </button>
        </form>
      )}

      {person.relationships.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--ink-faded)", lineHeight: 1.6 }}>
          No relationships recorded.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {person.relationships.map((relationship) => {
            const other =
              relationship.fromPerson.id === personId ? relationship.toPerson : relationship.fromPerson;
            const label = relationshipLabel(relationship, personId);
            const initials = other.displayName
              .split(" ")
              .map((word) => word[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <a
                key={relationship.id}
                href={`/trees/${treeId}/people/${other.id}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  padding: "24px 18px",
                  background: "var(--paper-deep)",
                  border: "1px solid var(--rule)",
                  borderRadius: 14,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--paper)",
                    border: "1.5px solid var(--rule)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {other.portraitUrl ? (
                    <img
                      src={other.portraitUrl}
                      alt={other.displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink-faded)" }}
                    >
                      {initials}
                    </span>
                  )}
                </div>
                <div>
                  <div
                    style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", lineHeight: 1.3 }}
                  >
                    {other.displayName}
                  </div>
                  <div
                    style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", marginTop: 4 }}
                  >
                    {label.split(" ")[0]}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DuplicateCandidatesSection({
  canManageDuplicates,
  loadingDuplicates,
  mergeError,
  duplicateCandidates,
  mergingDuplicateId,
  onRefresh,
  onMerge,
  onOpenPerson,
}: {
  canManageDuplicates: boolean;
  loadingDuplicates: boolean;
  mergeError: string | null;
  duplicateCandidates: DuplicateCandidate[];
  mergingDuplicateId: string | null;
  onRefresh: () => void;
  onMerge: (candidate: DuplicateCandidate) => void;
  onOpenPerson: (treeId: string, personId: string) => void;
}) {
  if (!canManageDuplicates) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
        <h3
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
            fontWeight: 500,
          }}
        >
          Possible duplicates
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loadingDuplicates}
          style={{
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            borderRadius: 999,
            padding: "5px 10px",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            cursor: "pointer",
          }}
        >
          {loadingDuplicates ? "Checking…" : "Refresh"}
        </button>
      </div>
      {mergeError && (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "#9a4f46", margin: "0 0 12px" }}>
          {mergeError}
        </p>
      )}
      {duplicateCandidates.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", margin: 0 }}>
          No likely duplicates found for this person right now.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {duplicateCandidates.map((candidate) => (
            <div
              key={candidate.id}
              style={{
                border: "1px solid var(--rule)",
                borderRadius: 10,
                padding: "14px 16px",
                background: "var(--paper-deep)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {candidate.portraitUrl ? (
                    <img
                      src={candidate.portraitUrl}
                      alt={candidate.displayName}
                      style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--rule)" }}
                    />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--paper)", border: "1px solid var(--rule)" }} />
                  )}
                  <div>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--ink)", margin: 0 }}>
                      {candidate.displayName}
                    </p>
                    <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "4px 0 0" }}>
                      Match score {candidate.score}
                      {candidate.birthDateText ? ` · b. ${candidate.birthDateText}` : ""}
                      {candidate.deathDateText ? ` · d. ${candidate.deathDateText}` : ""}
                    </p>
                    {candidate.essenceLine && (
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 0" }}>
                        {candidate.essenceLine}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onMerge(candidate)}
                  disabled={mergingDuplicateId === candidate.id}
                  style={{
                    border: "1px solid var(--moss)",
                    background: "var(--paper)",
                    borderRadius: 999,
                    padding: "7px 12px",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--moss)",
                    cursor: "pointer",
                  }}
                >
                  {mergingDuplicateId === candidate.id ? "Merging…" : "Merge into this person"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {candidate.reasons.map((reason) => (
                  <span key={reason} style={pillStyle}>
                    {reason}
                  </span>
                ))}
                {candidate.alreadyInTree && <span style={pillStyle}>already in this tree</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {candidate.visibleTrees.map((tree) => (
                  <button
                    key={tree.id}
                    type="button"
                    onClick={() => onOpenPerson(tree.id, candidate.id)}
                    style={{ ...pillStyle, background: "var(--paper)", cursor: "pointer" }}
                  >
                    {tree.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CrossTreeContextSection({ crossTreeLinks }: { crossTreeLinks: CrossTreeLink[] }) {
  if (crossTreeLinks.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {crossTreeLinks.map((link, index) => (
        <div
          key={link.connectionId ?? `${link.treeId}-${index}`}
          style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "16px 20px", background: "var(--paper-deep)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                {link.treeName ?? "Other tree"}
              </p>
            </div>
            <a
              href={`/trees/${link.treeId}/people/${link.linkedPerson.id}`}
              style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", textDecoration: "none" }}
            >
              Open in this tree →
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: link.memories.length > 0 ? 14 : 0 }}>
            {link.linkedPerson.portraitUrl && (
              <img
                src={link.linkedPerson.portraitUrl}
                alt={link.linkedPerson.displayName}
                style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--rule)" }}
              />
            )}
            <div>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: 0 }}>
                {link.linkedPerson.displayName}
              </p>
              {link.linkedPerson.essenceLine && (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--ink-faded)", margin: "2px 0 0" }}>
                  {link.linkedPerson.essenceLine}
                </p>
              )}
            </div>
          </div>
          {link.memories.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {link.memories.slice(0, 3).map((memory) => (
                <div
                  key={memory.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--paper)", borderRadius: 6, border: "1px solid var(--rule)" }}
                >
                  <span style={{ fontSize: 13, opacity: 0.4 }}>
                    {memory.kind === "photo" ? "◻" : memory.kind === "voice" ? "🎙" : memory.kind === "document" ? "□" : "✦"}
                  </span>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", flex: 1 }}>
                    {memory.title}
                  </span>
                  {memory.dateOfEventText && (
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
                      {memory.dateOfEventText}
                    </span>
                  )}
                </div>
              ))}
              {link.memories.length > 3 && (
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "4px 0 0", textAlign: "right" }}>
                  +{link.memories.length - 3} more
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
