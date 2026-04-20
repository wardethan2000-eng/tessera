"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { MemoryLightbox, type LightboxMemory } from "@/components/tree/MemoryLightbox";
import { PromptComposer } from "@/components/tree/PromptComposer";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import {
  MemoryVisibilityControl,
  type TreeVisibilityLevel,
} from "@/components/tree/MemoryVisibilityControl";
import { PlacePicker } from "@/components/tree/PlacePicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";
type RelationshipType = "parent_child" | "sibling" | "spouse";
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
  createdAt: string;
  memoryContext?: "direct" | "contextual";
  memoryReasonLabel?: string | null;
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

type Tab = "memories" | "stories" | "connections" | "about" | "prompts";

export default function PersonPage({
  params,
}: {
  params: Promise<{ treeId: string; personId: string }>;
}) {
  const { treeId, personId } = use(params);
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [allPeople, setAllPeople] = useState<PersonSummary[]>([]);
  const [visibleTrees, setVisibleTrees] = useState<PersonTreeMembership[]>([]);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("memories");
  const [activeDecade, setActiveDecade] = useState<string | null>(null);

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxMemories, setLightboxMemories] = useState<LightboxMemory[]>([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: "",
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
  const [memoryComposerKind, setMemoryComposerKind] = useState<MemoryKind>("photo");
  const [updatingMemorySuppressionId, setUpdatingMemorySuppressionId] = useState<string | null>(null);
  const [updatingMemoryVisibilityId, setUpdatingMemoryVisibilityId] = useState<string | null>(null);

  // Add relationship
  const [showRelForm, setShowRelForm] = useState(false);
  const [relForm, setRelForm] = useState({
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

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      loadPerson();
      loadAllPeople();
      loadVisibleTrees();
      loadCrossTreeLinks();
      loadDuplicateCandidates();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, treeId, personId]);

  async function loadPerson() {
    setLoading(true);
    const res = await fetch(`${API}/api/trees/${treeId}/people/${personId}`, {
      credentials: "include",
    });
    if (!res.ok) {
      router.replace(`/dashboard?treeId=${treeId}`);
      return;
    }
    const data = (await res.json()) as Person;
    setPerson(data);
    const firstYear = data.memories
      .map((m) => extractYear(m.dateOfEventText))
      .find((y) => y !== null);
    if (firstYear) setActiveDecade(getDecade(firstYear));
    setLoading(false);
  }

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

  async function setMemorySurfaceSuppression(memoryId: string, suppressed: boolean) {
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

  // Open lightbox for a list of memories at a given index
  const openLightbox = useCallback((memories: Memory[], startIndex: number) => {
    setLightboxMemories(memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      body: m.body,
      transcriptText: m.transcriptText,
      transcriptLanguage: m.transcriptLanguage,
      transcriptStatus: m.transcriptStatus,
      transcriptError: m.transcriptError,
      dateOfEventText: m.dateOfEventText,
      mediaUrl: m.mediaUrl,
      mimeType: m.mimeType,
      treeVisibilityLevel: m.treeVisibilityLevel,
      treeVisibilityIsOverride: m.treeVisibilityIsOverride,
    })));
    setLightboxIndex(startIndex);
  }, []);

  // IntersectionObserver for decade sidebar
  const decadeSectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerDecadeSection = useCallback((decade: string, el: HTMLElement | null) => {
    if (el) decadeSectionRefs.current.set(decade, el);
  }, []);

  useEffect(() => {
    const sections = Array.from(decadeSectionRefs.current.entries());
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const decade = [...decadeSectionRefs.current.entries()].find(
              ([, el]) => el === entry.target
            )?.[0];
            if (decade) setActiveDecade(decade);
          }
        }
      },
      { threshold: 0.3, root: mainRef.current }
    );
    sections.forEach(([, el]) => observer.observe(el));
    return () => observer.disconnect();
  }, [person]);

  if (isPending || loading) {
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
  for (const m of directMemories) {
    const year = extractYear(m.dateOfEventText);
    if (year) {
      const decade = getDecade(year);
      if (!decadeMap.has(decade)) decadeMap.set(decade, []);
      decadeMap.get(decade)!.push(m);
    }
  }
  const decades = Array.from(decadeMap.keys()).sort();
  const undatedMemories = directMemories.filter((m) => !extractYear(m.dateOfEventText));
  const storyMemories = directMemories.filter((m) => m.kind === "story");
  const contextualStoryMemories = contextualMemories.filter((m) => m.kind === "story");

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

  // Per-decade stats for the "In this chapter" sidebar
  const decadeStats = activeDecade
    ? (() => {
        const mems = decadeMap.get(activeDecade) ?? [];
        return {
          photos: mems.filter((m) => m.kind === "photo").length,
          voice: mems.filter((m) => m.kind === "voice").length,
          stories: mems.filter((m) => m.kind === "story").length,
          documents: mems.filter((m) => m.kind === "document").length,
          total: mems.length,
        };
      })()
    : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "memories", label: `Memories${person.memories.length > 0 ? ` ${person.memories.length}` : ""}` },
    {
      id: "stories",
      label: `Stories${storyMemories.length + contextualStoryMemories.length > 0 ? ` ${storyMemories.length + contextualStoryMemories.length}` : ""}`,
    },
    { id: "connections", label: `Connections${person.relationships.length > 0 ? ` ${person.relationships.length}` : ""}` },
    { id: "about", label: "About" },
    { id: "prompts", label: `Questions${personPrompts.length > 0 ? ` ${personPrompts.length}` : ""}` },
  ];

  function renderTreeVisibilityControl(memory: Memory) {
    if (!canManageTreeVisibility) return null;

    return (
      <MemoryVisibilityControl
        memory={memory}
        disabled={updatingMemoryVisibilityId === memory.id}
        onChange={(visibility) => {
          void setMemoryTreeVisibility(memory.id, visibility);
        }}
      />
    );
  }

  function renderMemoryCardControls(memory: Memory) {
    if (!canManageTreeVisibility && !(canSuppressFromSurface && memory.memoryContext === "contextual")) {
      return null;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {renderTreeVisibilityControl(memory)}
        {canSuppressFromSurface && memory.memoryContext === "contextual" && (
          <button
            type="button"
            onClick={() => setMemorySurfaceSuppression(memory.id, true)}
            disabled={updatingMemorySuppressionId === memory.id}
            style={{
              ...secondaryBtnStyle,
              padding: "6px 10px",
              fontSize: 12,
            }}
          >
            {updatingMemorySuppressionId === memory.id ? "Hiding…" : "Hide from this page"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>

      {/* Back nav */}
      <header style={{ padding: "16px 24px", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 16, background: "rgba(246,241,231,0.88)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 20 }}>
        <a
          href={`/trees/${treeId}`}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", textDecoration: "none" }}
        >
          ← Constellation
        </a>
        <span style={{ color: "var(--rule)" }}>·</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--ink-soft)" }}>
          {person.displayName}
        </span>
        <div style={{ flex: 1 }} />
        {!editing && (
          <>
            <button
              onClick={() => startEditing(person)}
              style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", background: "none", border: "1px solid var(--rule)", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}
            >
              Edit this page
            </button>
            <button
              type="button"
              onClick={deletePerson}
              disabled={deletingPerson}
              style={{ ...dangerBtnStyle, borderRadius: 20, padding: "5px 12px" }}
            >
              {deletingPerson ? "Deleting…" : "Delete person"}
            </button>
          </>
        )}
        <a
          href={`/trees/${treeId}/map?personId=${personId}`}
          style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", background: "none", border: "1px solid var(--rule)", borderRadius: 20, padding: "5px 12px", cursor: "pointer", textDecoration: "none" }}
        >
          View on the map
        </a>
        <button
          onClick={() => setPromptComposerOpen(true)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 20, padding: "5px 12px", cursor: "pointer", marginLeft: 8 }}
        >
          Ask a question
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
      <div style={{ position: "relative", height: 320, overflow: "hidden", flexShrink: 0 }}>
        {person.portraitUrl ? (
          <img
            src={person.portraitUrl}
            alt={person.displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6) sepia(0.2)" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg, var(--paper-deep) 0%, var(--rule) 100%)" }} />
        )}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "48px 40px 32px", background: "linear-gradient(to top, rgba(28,25,21,0.7) 0%, transparent 100%)" }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 400, color: "#F6F1E7", lineHeight: 1.1, margin: 0 }}>
              {person.displayName}
            </h1>
            {dateRange && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "rgba(246,241,231,0.7)", marginTop: 6 }}>{dateRange}</p>
            )}
            {person.essenceLine && (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 16, fontStyle: "italic", color: "rgba(246,241,231,0.85)", marginTop: 8 }}>
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
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 12 }}>
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
          style={{ position: "absolute", top: 16, right: 16, background: "rgba(246,241,231,0.85)", border: "1px solid var(--rule)", borderRadius: 20, padding: "5px 12px", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-soft)", cursor: "pointer" }}
        >
          {uploadingPortrait ? "Uploading…" : "Change portrait"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadPortrait(file); }}
        />
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ background: "var(--paper-deep)", borderBottom: "1px solid var(--rule)", padding: "24px 40px" }}>
          <form onSubmit={saveEdit} style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="text" required value={editForm.displayName}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Full name" style={inputStyle} />
            <input type="text" value={editForm.essenceLine}
              onChange={(e) => setEditForm((f) => ({ ...f, essenceLine: e.target.value }))}
              placeholder="Essence line (one sentence)" style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input type="text" value={editForm.birthDateText}
                onChange={(e) => setEditForm((f) => ({ ...f, birthDateText: e.target.value }))}
                placeholder="Birth date" style={inputStyle} />
              <input type="text" value={editForm.deathDateText}
                onChange={(e) => setEditForm((f) => ({ ...f, deathDateText: e.target.value }))}
                placeholder="Death date" style={inputStyle} />
            </div>
            <input type="text" value={editForm.birthPlace}
              onChange={(e) => setEditForm((f) => ({ ...f, birthPlace: e.target.value }))}
              placeholder="Birthplace" style={inputStyle} />
            <PlacePicker
              treeId={treeId}
              apiBase={API}
              value={editForm.birthPlaceId}
              onChange={(birthPlaceId) => setEditForm((f) => ({ ...f, birthPlaceId }))}
              label="Birthplace on the map"
              emptyLabel="No mapped birthplace"
            />
            <input type="text" value={editForm.deathPlace}
              onChange={(e) => setEditForm((f) => ({ ...f, deathPlace: e.target.value }))}
              placeholder="Death place" style={inputStyle} />
            <PlacePicker
              treeId={treeId}
              apiBase={API}
              value={editForm.deathPlaceId}
              onChange={(deathPlaceId) => setEditForm((f) => ({ ...f, deathPlaceId }))}
              label="Death place on the map"
              emptyLabel="No mapped death place"
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }}>
              <input type="checkbox" checked={editForm.isLiving}
                onChange={(e) => setEditForm((f) => ({ ...f, isLiving: e.target.checked }))} />
              Still living
            </label>
            {deleteError && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "#9a4f46" }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={savingEdit} style={primaryBtnStyle}>
                {savingEdit ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditing(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={deletePerson}
                disabled={savingEdit || deletingPerson}
                style={dangerBtnStyle}
              >
                {deletingPerson ? "Deleting…" : "Delete person"}
              </button>
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
              Deleting a person also removes their relationships, memories, prompts, and cross-tree links.
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--rule)", background: "var(--paper)", position: "sticky", top: 53, zIndex: 19 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px", display: "flex", gap: 0 }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === "prompts") loadPersonPrompts(); }}
              style={{
                fontFamily: "var(--font-ui)", fontSize: 13,
                color: activeTab === tab.id ? "var(--ink)" : "var(--ink-faded)",
                background: "none", border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--moss)" : "2px solid transparent",
                padding: "14px 20px 12px", cursor: "pointer", transition: "color 200ms",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 40px" }}>

        {/* Decade sidebar (memories tab) */}
        <aside style={{
          width: 110,
          flexShrink: 0,
          paddingTop: 40,
          position: "sticky",
          top: 100,
          alignSelf: "flex-start",
          display: decades.length > 0 && activeTab === "memories" ? "block" : "none",
        }}>
          {decades.map((decade) => (
            <button key={decade}
              onClick={() => {
                const el = decadeSectionRefs.current.get(decade);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                setActiveDecade(decade);
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: "8px 0", cursor: "pointer", width: "100%" }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: activeDecade === decade ? "var(--moss)" : "var(--rule)", flexShrink: 0, transition: "background 200ms" }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: activeDecade === decade ? "var(--ink)" : "var(--ink-faded)", transition: "color 200ms" }}>
                {decade}
              </span>
            </button>
          ))}
        </aside>

        {/* Main content */}
        <main
          ref={mainRef}
          style={{
            flex: 1,
            paddingTop: 40,
            paddingBottom: 80,
            paddingLeft: decades.length > 0 && activeTab === "memories" ? 32 : 0,
            paddingRight: activeTab === "memories" && activeDecade && decadeStats ? 32 : 0,
          }}
        >
          {/* ── Memories tab ── */}
          {activeTab === "memories" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Memories
                </h2>
                <button
                  onClick={() => {
                    setMemoryComposerKind("photo");
                    setShowMemoryForm(true);
                  }}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}
                >
                  + Add memory
                </button>
              </div>

              {decades.map((decade) => {
                const mems = decadeMap.get(decade)!;
                return (
                  <section key={decade} ref={(el) => registerDecadeSection(decade, el)} style={{ marginBottom: 48 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-soft)", fontStyle: "italic" }}>{decade}</span>
                      <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                      {mems.map((m, i) => (
                        <MemoryCard
                          key={m.id}
                          memory={m}
                          extraControls={renderMemoryCardControls(m)}
                          onClick={() => openLightbox(mems, i)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              {undatedMemories.length > 0 && (
                <section style={{ marginBottom: 48 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-soft)", fontStyle: "italic" }}>Undated</span>
                    <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                    {undatedMemories.map((m, i) => (
                      <MemoryCard
                        key={m.id}
                        memory={m}
                        extraControls={renderMemoryCardControls(m)}
                        onClick={() => openLightbox(undatedMemories, i)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {contextualMemories.length > 0 && (
                <section style={{ marginBottom: 48 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-soft)", fontStyle: "italic" }}>
                      From family context
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                  </div>
                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginTop: 0, marginBottom: 16 }}>
                    These memories appear here because they were shared through family or lineage context, not because this page owns them.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                    {contextualMemories.map((memory, index) => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        extraControls={renderMemoryCardControls(memory)}
                        onClick={() => openLightbox(contextualMemories, index)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {canSuppressFromSurface && suppressedContextualMemories.length > 0 && (
                <section style={{ marginBottom: 48 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-soft)", fontStyle: "italic" }}>
                      Hidden from this page
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                  </div>
                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginTop: 0, marginBottom: 16 }}>
                    These memories still live in the archive, but they no longer surface on this page.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                    {suppressedContextualMemories.map((memory) => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        extraControls={
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {renderTreeVisibilityControl(memory)}
                            <button
                              type="button"
                              onClick={() => setMemorySurfaceSuppression(memory.id, false)}
                              disabled={updatingMemorySuppressionId === memory.id}
                              style={{
                                ...secondaryBtnStyle,
                                padding: "6px 10px",
                                fontSize: 12,
                              }}
                            >
                              {updatingMemorySuppressionId === memory.id ? "Restoring…" : "Restore to page"}
                            </button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {person.memories.length === 0 && (
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-faded)" }}>
                  No memories recorded yet.
                </p>
              )}
            </div>
          )}

          {/* ── Stories tab ── */}
          {activeTab === "stories" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: 0, fontWeight: 400 }}>Stories</h2>
                <button
                  onClick={() => {
                    setMemoryComposerKind("story");
                    setShowMemoryForm(true);
                    setActiveTab("memories");
                  }}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}
                >
                  + Add story
                </button>
              </div>
              {storyMemories.length === 0 ? (
                contextualStoryMemories.length === 0 ? (
                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-faded)" }}>No stories yet.</p>
                ) : null
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                  {storyMemories.map((m) => (
                    <article key={m.id} style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 40 }}>
                      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", fontWeight: 400, margin: "0 0 8px" }}>{m.title}</h3>
                      {m.dateOfEventText && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginBottom: 16 }}>{m.dateOfEventText}</p>}
                      {m.body && <p style={{ fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.85, color: "var(--ink-soft)", whiteSpace: "pre-wrap", margin: 0 }}>{m.body}</p>}
                      {canManageTreeVisibility && (
                        <div style={{ marginTop: 16, maxWidth: 240 }}>
                          {renderTreeVisibilityControl(m)}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {contextualStoryMemories.length > 0 && (
                <div style={{ marginTop: 40 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-soft)", fontStyle: "italic" }}>
                      Shared through family context
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--rule)" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                    {contextualStoryMemories.map((m) => (
                      <article key={m.id} style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 40 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", fontWeight: 400, margin: 0 }}>
                              {m.title}
                            </h3>
                            {m.memoryReasonLabel && (
                              <span style={pillStyle}>{m.memoryReasonLabel}</span>
                            )}
                          </div>
                          {canSuppressFromSurface && (
                            <button
                              type="button"
                              onClick={() => setMemorySurfaceSuppression(m.id, true)}
                              disabled={updatingMemorySuppressionId === m.id}
                              style={{
                                ...secondaryBtnStyle,
                                padding: "6px 10px",
                                fontSize: 12,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {updatingMemorySuppressionId === m.id ? "Hiding…" : "Hide from this page"}
                            </button>
                          )}
                        </div>
                        {m.dateOfEventText && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginBottom: 16 }}>{m.dateOfEventText}</p>}
                        {m.body && <p style={{ fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.85, color: "var(--ink-soft)", whiteSpace: "pre-wrap", margin: 0 }}>{m.body}</p>}
                        {(canManageTreeVisibility || canSuppressFromSurface) && (
                          <div style={{ marginTop: 16, maxWidth: 240 }}>
                            {renderTreeVisibilityControl(m)}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Connections tab ── */}
          {activeTab === "connections" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: 0, fontWeight: 400 }}>Connections</h2>
                {otherPeople.length > 0 && (
                  <button onClick={() => setShowRelForm((s) => !s)}
                    style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>
                    {showRelForm ? "Cancel" : "+ Add"}
                  </button>
                )}
              </div>

              {showRelForm && (
                <form onSubmit={saveRelationship} style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 8, padding: 16, marginBottom: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                  <select value={relForm.type} onChange={(e) => setRelForm((f) => ({ ...f, type: e.target.value as RelationshipType }))} style={inputStyle}>
                    <option value="parent_child">Parent / Child</option>
                    <option value="sibling">Sibling</option>
                    <option value="spouse">Spouse / Partner</option>
                  </select>
                  {relForm.type === "parent_child" && (
                    <select value={relForm.direction} onChange={(e) => setRelForm((f) => ({ ...f, direction: e.target.value as "from" | "to" }))} style={inputStyle}>
                      <option value="from">{person.displayName} is the parent</option>
                      <option value="to">{person.displayName} is the child</option>
                    </select>
                  )}
                  <select required value={relForm.otherPersonId} onChange={(e) => setRelForm((f) => ({ ...f, otherPersonId: e.target.value }))} style={inputStyle}>
                    <option value="">Select person…</option>
                    {otherPeople.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                  </select>
                  <button type="submit" disabled={savingRel} style={primaryBtnStyle}>
                    {savingRel ? "Saving…" : "Add relationship"}
                  </button>
                </form>
              )}

              {person.relationships.length === 0 ? (
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-faded)" }}>No relationships recorded.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                  {person.relationships.map((r) => {
                    const other = r.fromPerson.id === personId ? r.toPerson : r.fromPerson;
                    const label = relationshipLabel(r, personId);
                    const initials = other.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <a
                        key={r.id}
                        href={`/trees/${treeId}/people/${other.id}`}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 16px", background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 8, textDecoration: "none", textAlign: "center" }}
                      >
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--paper)", border: "1.5px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {other.portraitUrl ? (
                            <img src={other.portraitUrl} alt={other.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink-faded)" }}>{initials}</span>
                          )}
                        </div>
                        <div>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--ink)", lineHeight: 1.3 }}>{other.displayName}</div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", marginTop: 3 }}>{label.split(" ")[0]}</div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── About tab ── */}
          {activeTab === "about" && (
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: "0 0 24px", fontWeight: 400 }}>About</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {([
                  ["Birth", person.birthDateText],
                  ["Birthplace", person.birthPlace],
                  ["Birthplace on the map", person.birthPlaceResolved?.label ?? null],
                  ["Death", person.deathDateText],
                  ["Death place", person.deathPlace],
                  ["Death place on the map", person.deathPlaceResolved?.label ?? null],
                  ["Status", person.isLiving ? "Living" : "Deceased"],
                ] as [string, string | null][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ display: "flex", gap: 24 }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", width: 80, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink)" }}>{value}</span>
                  </div>
                ))}
                {person.linkedUserId === session?.user.id && (
                  <div style={{ display: "flex", gap: 24 }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", width: 80 }}>Account</span>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)" }}>This is you</span>
                  </div>
                )}
                {sortedVisibleTrees.length > 0 && (
                  <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", width: 80 }}>Trees</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {sortedVisibleTrees.map((tree) => (
                        <button
                          key={tree.id}
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
                          <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink)" }}>
                            {tree.name}
                          </span>
                          {tree.id === person.homeTreeId && (
                            <span style={pillStyle}>home</span>
                          )}
                          {tree.id === treeId && (
                            <span style={pillStyle}>current</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {canManageDuplicates && (
                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
                      <h3 style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, fontWeight: 500 }}>
                        Possible duplicates
                      </h3>
                      <button
                        type="button"
                        onClick={loadDuplicateCandidates}
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
                                onClick={() => mergeDuplicate(candidate)}
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
                              {candidate.alreadyInTree && (
                                <span style={pillStyle}>already in this tree</span>
                              )}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                              {candidate.visibleTrees.map((tree) => (
                                <button
                                  key={tree.id}
                                  type="button"
                                  onClick={() => router.push(`/trees/${tree.id}/people/${candidate.id}`)}
                                  style={{
                                    ...pillStyle,
                                    background: "var(--paper)",
                                    cursor: "pointer",
                                  }}
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
                )}
              </div>

              {/* ── Shared context from other trees ── */}
              {crossTreeLinks.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <h3 style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", fontWeight: 500 }}>
                    Shared context from other trees
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {crossTreeLinks.map((link, index) => (
                      <div key={link.connectionId ?? `${link.treeId}-${index}`} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "16px 20px", background: "var(--paper-deep)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
                          <div>
                            <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                              {link.treeName ?? "Other tree"}
                            </p>
                          </div>
                          <a
                            href={`/trees/${link.treeId}/people/${link.linkedPerson.id}`}
                            style={{
                              fontFamily: "var(--font-ui)",
                              fontSize: 12,
                              color: "var(--moss)",
                              textDecoration: "none",
                            }}
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
                            {link.memories.slice(0, 3).map((m) => (
                              <div
                                key={m.id}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--paper)", borderRadius: 6, border: "1px solid var(--rule)" }}
                              >
                                <span style={{ fontSize: 13, opacity: 0.4 }}>
                                  {m.kind === "photo" ? "◻" : m.kind === "voice" ? "🎙" : m.kind === "document" ? "□" : "✦"}
                                </span>
                                <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)", flex: 1 }}>{m.title}</span>
                                {m.dateOfEventText && (
                                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>{m.dateOfEventText}</span>
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
                </div>
              )}
            </div>
          )}
          {activeTab === "prompts" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", margin: 0, fontWeight: 400 }}>
                  Questions for {person.displayName.split(" ")[0]}
                </h2>
                <button
                  onClick={() => setPromptComposerOpen(true)}
                  style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--moss)", fontFamily: "var(--font-ui)", fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer" }}
                >
                  + Ask a question
                </button>
              </div>
              {personPrompts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-faded)", fontFamily: "var(--font-body)" }}>
                  <p style={{ fontSize: 28, marginBottom: 10 }}>✦</p>
                  <p style={{ fontSize: 15 }}>No questions yet.</p>
                  <p style={{ fontSize: 13 }}>Ask {person.displayName.split(" ")[0]} something about their life.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {personPrompts.map((p) => (
                    <div key={p.id} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "14px 18px", background: "var(--paper)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
                          Asked by {p.fromUserName ?? "a family member"} · {new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 500, color: p.status === "answered" ? "var(--moss)" : p.status === "dismissed" ? "var(--ink-faded)" : "var(--gilt)", padding: "2px 8px", borderRadius: 20, border: `1px solid ${p.status === "answered" ? "var(--moss)" : p.status === "dismissed" ? "var(--rule)" : "var(--gilt)"}` }}>
                          {p.status === "answered" ? "Replied" : p.status === "dismissed" ? "Dismissed" : "Awaiting reply"}
                        </span>
                      </div>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink)", margin: "0 0 8px", lineHeight: 1.5 }}>
                        {p.questionText}
                      </p>
                      {p.replies && p.replies.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {p.replies.map((r) => (
                            <div key={r.id} style={{ background: "rgba(78,93,66,0.06)", borderRadius: 6, padding: "6px 10px", fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }}>
                              ↳ {r.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* "In this chapter" right sidebar — only on memories tab when a decade is active */}
        {activeTab === "memories" && activeDecade && decadeStats && (
          <aside style={{
            width: 180,
            flexShrink: 0,
            paddingTop: 40,
            position: "sticky",
            top: 100,
            alignSelf: "flex-start",
          }}>
            <div style={{
              background: "var(--paper-deep)",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              padding: 16,
            }}>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                In the {activeDecade}
              </div>
              {[
                { label: "Photos", count: decadeStats.photos, icon: "◻" },
                { label: "Stories", count: decadeStats.stories, icon: "✦" },
                { label: "Voice memos", count: decadeStats.voice, icon: "🎙" },
                { label: "Documents", count: decadeStats.documents, icon: "□" },
              ].filter((s) => s.count > 0).map(({ label, count, icon }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.5, width: 16, textAlign: "center" }}>{icon}</span>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-soft)", flex: 1 }}>{label}</span>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>{count}</span>
                </div>
              ))}
              {decadeStats.total === 0 && (
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>
                  No memories
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Memory lightbox */}
      {lightboxIndex !== null && (
        <MemoryLightbox
          memories={lightboxMemories}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          canManageTreeVisibility={canManageTreeVisibility}
          updatingTreeVisibilityId={updatingMemoryVisibilityId}
          onSetTreeVisibility={(memoryId, visibility) =>
            void setMemoryTreeVisibility(memoryId, visibility, { closeLightbox: true })
          }
        />
      )}

      {/* Prompt composer */}
      <PromptComposer
        open={promptComposerOpen}
        onClose={() => setPromptComposerOpen(false)}
        treeId={treeId}
        people={[{ id: person.id, displayName: person.displayName, essenceLine: person.essenceLine, portraitUrl: person.portraitUrl }]}
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
        />
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
}: {
  memory: Memory;
  onClick?: () => void;
  extraControls?: React.ReactNode;
}) {
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
        background: "var(--paper-deep)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 200ms",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = "0 4px 16px rgba(28,25,21,0.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      {memory.mediaUrl && memory.kind === "photo" && (
        <img src={memory.mediaUrl} alt={memory.title} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
      )}
      {memory.kind === "voice" && (
        <div style={{ height: 60, background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ width: 3, height: 10 + Math.abs(Math.sin(i * 0.8) * 24), borderRadius: 2, background: "rgba(246,241,231,0.3)" }} />
          ))}
        </div>
      )}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.4 }}>{kindIcon[memory.kind]}</span>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--ink)", margin: 0, fontWeight: 400, lineHeight: 1.3 }}>{memory.title}</h3>
        </div>
        {memory.memoryContext === "contextual" && memory.memoryReasonLabel && (
          <div style={{ marginBottom: 8 }}>
            <span style={pillStyle}>{memory.memoryReasonLabel}</span>
          </div>
        )}
        {memory.dateOfEventText && (
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "0 0 8px" }}>{memory.dateOfEventText}</p>
        )}
        {memory.body && memory.kind !== "photo" && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {memory.body}
          </p>
        )}
        {memory.kind === "voice" && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "var(--ink-faded)", margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {getVoiceTranscriptLabel(memory)}
          </p>
        )}
        {extraControls && (
          <div
            style={{ marginTop: 12 }}
            onClick={(event) => event.stopPropagation()}
          >
            {extraControls}
          </div>
        )}
      </div>
    </article>
  );
}
