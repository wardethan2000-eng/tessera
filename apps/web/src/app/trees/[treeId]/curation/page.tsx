"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

interface CurationMemory {
  id: string;
  title: string;
  kind: string;
  primaryPersonName: string | null;
  mediaUrl: string | null;
  sourceFilename: string | null;
  dateOfEventText: string | null;
  placeLabelOverride: string | null;
  createdAt: string;
}

interface CurationCounts {
  needsDate: number;
  needsPlace: number;
  needsPeople: number;
  needsReview: number;
}

interface Queue {
  needsDate: CurationMemory[];
  needsPlace: CurationMemory[];
  needsPeople: CurationMemory[];
  distinctCount?: number;
  counts?: CurationCounts;
}

type Section = "needsDate" | "needsPlace" | "needsPeople";
type WorkspaceMode = "cleanup" | "editorial";
type ViewMode = "list" | "grid";

interface CurationPerson {
  id: string;
  displayName: string;
}

interface EditorialMemory {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
  dateOfEventText?: string | null;
  featuredOnPersonPage?: boolean;
  curatedSortOrder?: number | null;
}

const SECTION_META: Record<Section, { label: string; fieldLabel: string; placeholder: string }> = {
  needsDate: {
    label: "Missing date",
    fieldLabel: "When did this happen?",
    placeholder: "June 1987  or  Summer 1987  or  15 Jun 1987",
  },
  needsPlace: {
    label: "Missing place",
    fieldLabel: "Where did this happen?",
    placeholder: "Chicago, Illinois  or  Grandma's house",
  },
  needsPeople: {
    label: "Missing people",
    fieldLabel: "Who is in this memory?",
    placeholder: "Search people...",
  },
};

export default function CurationPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");
  const { data: session, isPending } = useSession();

  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("needsDate");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("cleanup");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [people, setPeople] = useState<CurationPerson[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [editorialMemories, setEditorialMemories] = useState<EditorialMemory[]>([]);
  const [editorialLoading, setEditorialLoading] = useState(false);
  const [editorialError, setEditorialError] = useState<string | null>(null);
  const [editorialSaving, setEditorialSaving] = useState(false);
  const [editorialSaveError, setEditorialSaveError] = useState<string | null>(null);
  const [editorialSaved, setEditorialSaved] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPersonId, setBulkPersonId] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [personSearchQuery, setPersonSearchQuery] = useState("");
  const [personSearchResults, setPersonSearchResults] = useState<CurationPerson[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  const fetchQueue = useCallback(async () => {
    if (!treeId) return;
    try {
      const query = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
      const res = await fetch(`${API}/api/trees/${treeId}/curation/queue${query}`, {
        credentials: "include",
      });
      if (res.ok) {
        setQueue(await res.json());
        setFetchError(null);
      } else {
        setFetchError("Could not load the review queue.");
      }
    } catch {
      setFetchError("Network error — could not load the review queue.");
    }
    setLoading(false);
  }, [batchId, treeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue(); }, [fetchQueue]);

  const fetchPeople = useCallback(async () => {
    if (!treeId) return;
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load people.");
      const data = (await res.json()) as Array<{ id: string; displayName: string }>;
      setPeople(data.map((person) => ({ id: person.id, displayName: person.displayName })));
      setSelectedPersonId((current) => {
        if (current) return current;
        const requestedPersonId = searchParams.get("personId");
        if (requestedPersonId && data.some((person) => person.id === requestedPersonId)) {
          return requestedPersonId;
        }
        return data[0]?.id ?? "";
      });
    } catch (error) {
      setEditorialError(
        error instanceof Error ? error.message : "Could not load people.",
      );
    }
  }, [searchParams, treeId]);

  const fetchEditorialMemories = useCallback(async () => {
    if (!treeId || !selectedPersonId) {
      setEditorialMemories([]);
      return;
    }
    setEditorialLoading(true);
    setEditorialSaveError(null);
    setEditorialSaved(false);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people/${selectedPersonId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load person memories.");
      const data = (await res.json()) as {
        directMemories?: Array<{
          id: string;
          title: string;
          kind: string;
          createdAt: string;
          dateOfEventText?: string | null;
          featuredOnPersonPage?: boolean;
          curatedSortOrder?: number | null;
        }>;
      };
      setEditorialMemories(
        (data.directMemories ?? []).map((memory) => ({
          id: memory.id,
          title: memory.title,
          kind: memory.kind,
          createdAt: memory.createdAt,
          dateOfEventText: memory.dateOfEventText ?? null,
          featuredOnPersonPage: memory.featuredOnPersonPage ?? false,
          curatedSortOrder: memory.curatedSortOrder ?? null,
        })),
      );
      setEditorialError(null);
    } catch (error) {
      setEditorialError(
        error instanceof Error ? error.message : "Could not load person memories.",
      );
      setEditorialMemories([]);
    } finally {
      setEditorialLoading(false);
    }
  }, [selectedPersonId, treeId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchPeople(); }, [fetchPeople]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchEditorialMemories(); }, [fetchEditorialMemories]);

  const selectedPersonName = useMemo(
    () => people.find((person) => person.id === selectedPersonId)?.displayName ?? "this person",
    [people, selectedPersonId],
  );

  const moveEditorialMemory = useCallback((index: number, direction: -1 | 1) => {
    setEditorialMemories((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(nextIndex, 0, item);
      return next;
    });
    setEditorialSaved(false);
  }, []);

  const toggleFeaturedMemory = useCallback((memoryId: string) => {
    setEditorialMemories((current) =>
      current.map((memory) =>
        memory.id === memoryId
          ? { ...memory, featuredOnPersonPage: !memory.featuredOnPersonPage }
          : memory,
      ),
    );
    setEditorialSaved(false);
  }, []);

  const saveEditorialOrder = useCallback(async () => {
    if (!treeId || !selectedPersonId) return;
    setEditorialSaving(true);
    setEditorialSaveError(null);
    setEditorialSaved(false);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people/${selectedPersonId}/memory-curation`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: editorialMemories.map((memory) => ({
            memoryId: memory.id,
            isFeatured: memory.featuredOnPersonPage ?? false,
          })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not save chapter order.");
      }
      setEditorialSaved(true);
      void fetchEditorialMemories();
    } catch (error) {
      setEditorialSaveError(
        error instanceof Error ? error.message : "Could not save chapter order.",
      );
    } finally {
      setEditorialSaving(false);
    }
  }, [editorialMemories, fetchEditorialMemories, selectedPersonId, treeId]);

  async function saveField(memoryId: string, section: Section) {
    if (section === "needsPeople") return;
    const value = drafts[memoryId]?.trim();
    if (!value) return;
    setSaving((s) => ({ ...s, [memoryId]: true }));
    setSaveErrors((s) => { const copy = { ...s }; delete copy[memoryId]; return copy; });

    const body: Record<string, string> =
      section === "needsDate"
        ? { dateOfEventText: value }
        : { placeLabelOverride: value };

    try {
      const res = await fetch(`${API}/api/trees/${treeId}/memories/${memoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved((s) => ({ ...s, [memoryId]: true }));
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(memoryId); return next; });
        setTimeout(() => {
          setQueue((q) => {
            if (!q) return q;
            return { ...q, [section]: q[section].filter((m) => m.id !== memoryId) };
          });
          setDrafts((d) => { const copy = { ...d }; delete copy[memoryId]; return copy; });
          setSaved((s) => { const copy = { ...s }; delete copy[memoryId]; return copy; });
        }, 800);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setSaveErrors((s) => ({ ...s, [memoryId]: data.error ?? "Save failed" }));
      }
    } catch {
      setSaveErrors((s) => ({ ...s, [memoryId]: "Network error" }));
    }
    setSaving((s) => ({ ...s, [memoryId]: false }));
  }

  function skipCard(memoryId: string, section: Section) {
    setQueue((q) => {
      if (!q) return q;
      return { ...q, [section]: q[section].filter((m) => m.id !== memoryId) };
    });
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(memoryId); return next; });
  }

  function toggleSelect(memoryId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memoryId)) next.delete(memoryId);
      else next.add(memoryId);
      return next;
    });
  }

  function selectAll() {
    const currentItems = queue?.[activeSection] ?? [];
    setSelectedIds(new Set(currentItems.map((m) => m.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  async function applyBulkAction() {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    try {
      const action =
        activeSection === "needsDate" ? "assignDate"
        : activeSection === "needsPlace" ? "assignPlace"
        : "tagPeople";

      const value =
        activeSection === "needsPeople"
          ? bulkPersonId
          : bulkValue;

      const res = await fetch(`${API}/api/trees/${treeId}/curation/bulk`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryIds: [...selectedIds],
          action,
          value: value || undefined,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { applied: number };
        setSelectedIds(new Set());
        setBulkValue("");
        setBulkPersonId("");
        void fetchQueue();
      }
    } catch {
      // Best-effort bulk action
    } finally {
      setBulkApplying(false);
    }
  }

  async function tagPersonOnMemory(memoryId: string, personId: string) {
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/memories/${memoryId}/tag-person`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });

      if (res.ok) {
        setSaved((s) => ({ ...s, [memoryId]: true }));
        setTimeout(() => {
          setQueue((q) => {
            if (!q) return q;
            return { ...q, needsPeople: q.needsPeople.filter((m) => m.id !== memoryId) };
          });
          setSaved((s) => { const copy = { ...s }; delete copy[memoryId]; return copy; });
        }, 800);
      }
    } catch {
      // Best-effort tag
    }
  }

  async function searchPeople(query: string) {
    if (!query.trim()) {
      setPersonSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as CurationPerson[];
        const lower = query.toLowerCase();
        setPersonSearchResults(
          data.filter((p) => p.displayName.toLowerCase().includes(lower)).slice(0, 8),
        );
      }
    } catch {
      // Best-effort search
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchPeople(personSearchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [personSearchQuery]);

  useEffect(() => {
    function handleKeyboard(e: KeyboardEvent) {
      if (workspaceMode !== "cleanup") return;
      const currentItems = queue?.[activeSection] ?? [];
      if (currentItems.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, currentItems.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "x" || e.key === " ") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        e.preventDefault();
        const memory = currentItems[focusIndex];
        if (memory) toggleSelect(memory.id);
      } else if (e.key === "Enter") {
        if (e.target instanceof HTMLSelectElement) return;
        const memory = currentItems[focusIndex];
        if (memory) {
          if (activeSection === "needsPeople") {
            // No-op for people section without a selected person
          } else if (drafts[memory.id]?.trim()) {
            saveField(memory.id, activeSection);
          }
        }
      } else if (e.key === "s") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        const memory = currentItems[focusIndex];
        if (memory) skipCard(memory.id, activeSection);
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, focusIndex, queue, workspaceMode, drafts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusIndex(0);
  }, [activeSection]);

  if (isPending || loading) {
    return (
      <main style={pageStyle}>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>Loading…</p>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main style={pageStyle}>
        <div style={{ maxWidth: 660, width: "100%", margin: "0 auto" }}>
          <button onClick={() => router.push(`/trees/${treeId}/home`)} style={backBtnStyle}>← Back to archive</button>
          <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--rose, #b91c1c)", marginTop: 32 }}>
            {fetchError}
          </p>
          <button
            onClick={() => { setLoading(true); setFetchError(null); fetchQueue(); }}
            style={{ ...saveBtnStyle, marginTop: 12 }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const totalCount = queue
    ? queue.needsDate.length + queue.needsPlace.length + queue.needsPeople.length
    : 0;

  const sections: Section[] = ["needsDate", "needsPlace", "needsPeople"];
  const currentItems = queue?.[activeSection] ?? [];
  const meta = SECTION_META[activeSection];
  const counts = queue?.counts;

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 860, width: "100%", margin: "0 auto" }}>
        <button
          onClick={() => router.push(`/trees/${treeId}/home`)}
          style={backBtnStyle}
        >
          ← Back to archive
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={headingStyle}>Review queue</h1>
            <p style={subheadStyle}>
              Clean up missing metadata, then shape a person page into a calmer chapter.
            </p>
          </div>
          {counts && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={countPillStyle}>{counts.needsDate} need date</span>
              <span style={countPillStyle}>{counts.needsPlace} need place</span>
              <span style={countPillStyle}>{counts.needsPeople} need people</span>
            </div>
          )}
        </div>

        {batchId && (
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink)", margin: "0 0 4px", fontWeight: 500 }}>
              Reviewing one import
            </p>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0 }}>
              This queue is filtered to the memories created by the selected collection import.
            </p>
            <Link
              href={`/trees/${treeId}/import`}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", textDecoration: "underline", marginTop: 10, display: "inline-flex" }}
            >
              Back to imports
            </Link>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
          <button
            onClick={() => setWorkspaceMode("cleanup")}
            style={modeBtnStyle(workspaceMode === "cleanup")}
          >
            Cleanup queue
            {counts && counts.needsReview > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.75 }}>({counts.needsReview})</span>
            )}
          </button>
          <button
            onClick={() => setWorkspaceMode("editorial")}
            style={modeBtnStyle(workspaceMode === "editorial")}
          >
            Editorial order
          </button>
        </div>

        {workspaceMode === "cleanup" ? (
          totalCount > 0 ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {sections.map((s) => {
                  const count = queue?.[s].length ?? 0;
                  const isActive = s === activeSection;
                  return (
                    <button
                      key={s}
                      onClick={() => setActiveSection(s)}
                      style={sectionBtnStyle(isActive, count === 0)}
                    >
                      {SECTION_META[s].label}
                      {count > 0 && <span style={{ marginLeft: 6, opacity: 0.75 }}>({count})</span>}
                    </button>
                  );
                })}

                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button
                    onClick={() => setViewMode("list")}
                    style={viewToggleStyle(viewMode === "list")}
                    title="List view"
                  >
                    ☰
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    style={viewToggleStyle(viewMode === "grid")}
                    title="Grid view"
                  >
                    ⊞
                  </button>
                </div>
              </div>

              {selectedIds.size > 0 && (
                <div style={{ ...cardStyle, marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }}>
                    {selectedIds.size} selected
                  </span>
                  <button onClick={selectAll} style={secondaryBtnStyle}>Select all</button>
                  <button onClick={selectNone} style={secondaryBtnStyle}>Select none</button>

                  {activeSection === "needsPeople" ? (
                    <select
                      value={bulkPersonId}
                      onChange={(e) => setBulkPersonId(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Choose person...</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>{p.displayName}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder={meta.placeholder}
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      style={inputStyle}
                    />
                  )}

                  <button
                    onClick={() => void applyBulkAction()}
                    disabled={bulkApplying}
                    style={saveBtnStyle}
                  >
                    {bulkApplying ? "Applying…" : `Apply to ${selectedIds.size}`}
                  </button>
                </div>
              )}

              <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", margin: "0 0 8px" }}>
                j/k: navigate · x: select · Enter: save · s: skip
              </p>

              {currentItems.length === 0 ? (
                <div style={emptyCardStyle}>
                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
                    All done for this category ✓
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                <div ref={cardContainerRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                  {currentItems.map((memory, index) => {
                    const isSaved = saved[memory.id];
                    const isSaving = saving[memory.id];
                    const isSelected = selectedIds.has(memory.id);
                    const isFocused = index === focusIndex;

                    return (
                      <div
                        key={memory.id}
                        onClick={() => setFocusIndex(index)}
                        style={{
                          ...cardStyle,
                          padding: 12,
                          cursor: "pointer",
                          outline: isFocused ? "2px solid var(--moss)" : isSelected ? "2px solid var(--moss)" : "none",
                          outlineOffset: -2,
                          opacity: isSaved ? 0.5 : 1,
                          transition: "opacity 0.3s",
                        }}
                      >
                        {memory.mediaUrl && (
                          <div style={{
                            width: "100%",
                            aspectRatio: "1",
                            borderRadius: 6,
                            overflow: "hidden",
                            background: "var(--paper)",
                            marginBottom: 8,
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={memory.mediaUrl}
                              alt={memory.title}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(memory.id)}
                            style={{ cursor: "pointer" }}
                          />
                          <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", textTransform: "uppercase" }}>
                            {memory.kind}
                          </span>
                        </div>
                        <p style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--ink)",
                          margin: "0 0 2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap" as const,
                        }}>
                          {memory.title}
                        </p>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", margin: 0 }}>
                          {memory.primaryPersonName ?? "No person"}
                        </p>
                        {isSaved && (
                          <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--moss)", margin: "4px 0 0" }}>
                            ✓ Saved
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div ref={cardContainerRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {currentItems.map((memory, index) => {
                    const isSaved = saved[memory.id];
                    const isSaving = saving[memory.id];
                    const draft = drafts[memory.id] ?? "";
                    const isPeopleSection = activeSection === "needsPeople";
                    const isSelected = selectedIds.has(memory.id);
                    const isFocused = index === focusIndex;

                    return (
                      <div
                        key={memory.id}
                        style={{
                          ...cardStyle,
                          outline: isFocused ? "2px solid var(--moss)" : isSelected ? "1px solid var(--moss)" : "none",
                          outlineOffset: -1,
                          opacity: isSaved ? 0.5 : 1,
                          transition: "opacity 0.3s",
                        }}
                      >
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(memory.id)}
                            style={{ marginTop: 4, cursor: "pointer" }}
                          />

                          {memory.mediaUrl && (
                            <div style={{
                              width: 56,
                              height: 56,
                              borderRadius: 6,
                              overflow: "hidden",
                              background: "var(--paper)",
                              flexShrink: 0,
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={memory.mediaUrl}
                                alt={memory.title}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </div>
                          )}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: "0 0 2px" }}>
                              {memory.title}
                            </p>
                            <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>
                              {memory.kind}
                              {memory.primaryPersonName && ` · ${memory.primaryPersonName}`}
                              {memory.sourceFilename && ` · ${memory.sourceFilename}`}
                              {` · ${new Date(memory.createdAt).toLocaleDateString()}`}
                            </p>

                            {isSaved ? (
                              <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", margin: "8px 0 0" }}>
                                ✓ Saved
                              </p>
                            ) : isPeopleSection ? (
                              <div style={{ marginTop: 8 }}>
                                <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "0 0 6px" }}>
                                  {meta.fieldLabel}
                                </p>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    placeholder="Search people..."
                                    value={personSearchQuery}
                                    onChange={(e) => setPersonSearchQuery(e.target.value)}
                                    style={inputStyle}
                                  />
                                </div>
                                {personSearchResults.length > 0 && (
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                    {personSearchResults.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => tagPersonOnMemory(memory.id, p.id)}
                                        style={chipBtnStyle}
                                      >
                                        {p.displayName}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                  <Link
                                    href={`/trees/${treeId}/memories/${memory.id}`}
                                    style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", textDecoration: "underline" }}
                                  >
                                    Open memory →
                                  </Link>
                                  <button
                                    onClick={() => skipCard(memory.id, activeSection)}
                                    style={skipBtnStyle}
                                  >
                                    Skip
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    placeholder={meta.placeholder}
                                    value={draft}
                                    onChange={(e) =>
                                      setDrafts((d) => ({ ...d, [memory.id]: e.target.value }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveField(memory.id, activeSection);
                                    }}
                                    style={inputStyle}
                                    autoFocus={isFocused && !isPeopleSection}
                                  />
                                  <button
                                    onClick={() => saveField(memory.id, activeSection)}
                                    disabled={isSaving || !draft.trim()}
                                    style={saveBtnStyle}
                                  >
                                    {isSaving ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    onClick={() => skipCard(memory.id, activeSection)}
                                    style={skipBtnStyle}
                                  >
                                    Skip
                                  </button>
                                </div>
                                {saveErrors[memory.id] && (
                                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--rose, #b91c1c)", margin: "6px 0 0" }}>
                                    {saveErrors[memory.id]}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={emptyCardStyle}>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
                Everything looks complete — nothing to curate right now.
              </p>
            </div>
          )
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={cardStyle}>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                    Chapter owner
                  </p>
                  <select
                    value={selectedPersonId}
                    onChange={(event) => {
                      setSelectedPersonId(event.target.value);
                      setEditorialSaved(false);
                    }}
                    style={{ ...inputStyle, width: "100%" }}
                  >
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.7, color: "var(--ink-soft)", margin: 0 }}>
                  Reorder direct memories for {selectedPersonName}. Featured items stay visually prominent on the person page.
                </p>
              </div>
            </div>

            {editorialError && (
              <div style={cardStyle}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--rose, #b91c1c)", margin: 0 }}>
                  {editorialError}
                </p>
              </div>
            )}

            {editorialLoading ? (
              <div style={emptyCardStyle}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
                  Loading chapter order…
                </p>
              </div>
            ) : editorialMemories.length === 0 ? (
              <div style={emptyCardStyle}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
                  No direct memories are available to order for this person yet.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
                    Top to bottom = earlier to later on the person page.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {editorialSaved && (
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)" }}>
                        ✓ Saved
                      </span>
                    )}
                    {editorialSaveError && (
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--rose, #b91c1c)" }}>
                        {editorialSaveError}
                      </span>
                    )}
                    <button
                      onClick={() => void saveEditorialOrder()}
                      disabled={editorialSaving}
                      style={saveBtnStyle}
                    >
                      {editorialSaving ? "Saving…" : "Save chapter order"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {editorialMemories.map((memory, index) => (
                    <div key={memory.id} style={cardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                            <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              #{index + 1}
                            </span>
                            {memory.featuredOnPersonPage && (
                              <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--moss)", border: "1px solid var(--moss)", borderRadius: 999, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Featured
                              </span>
                            )}
                          </div>
                          <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: "0 0 2px" }}>
                            {memory.title}
                          </p>
                          <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>
                            {memory.kind}
                            {memory.dateOfEventText && ` · ${memory.dateOfEventText}`}
                            {` · ${new Date(memory.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => toggleFeaturedMemory(memory.id)}
                            style={secondaryBtnStyle}
                          >
                            {memory.featuredOnPersonPage ? "Unfeature" : "Feature"}
                          </button>
                          <button
                            onClick={() => moveEditorialMemory(index, -1)}
                            disabled={index === 0}
                            style={secondaryBtnStyle}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveEditorialMemory(index, 1)}
                            disabled={index === editorialMemories.length - 1}
                            style={secondaryBtnStyle}
                          >
                            ↓
                          </button>
                          <a
                            href={`/trees/${treeId}/memories/${memory.id}`}
                            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", textDecoration: "underline" }}
                          >
                            Open memory →
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function modeBtnStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    padding: "6px 14px",
    borderRadius: 20,
    border: active ? "1px solid var(--moss)" : "1px solid var(--rule)",
    background: active ? "var(--moss)" : "var(--paper)",
    color: active ? "var(--paper)" : "var(--ink)",
    cursor: "pointer",
  };
}

function sectionBtnStyle(active: boolean, empty: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    padding: "6px 14px",
    borderRadius: 20,
    border: active ? "1px solid var(--moss)" : "1px solid var(--rule)",
    background: active ? "var(--moss)" : "var(--paper)",
    color: active ? "var(--paper)" : empty ? "var(--ink-faded)" : "var(--ink)",
    cursor: "pointer",
  };
}

function viewToggleStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 14,
    padding: "4px 8px",
    border: active ? "1px solid var(--moss)" : "1px solid var(--rule)",
    background: active ? "var(--moss)" : "var(--paper)",
    color: active ? "var(--paper)" : "var(--ink-faded)",
    borderRadius: 6,
    cursor: "pointer",
  };
}

const chipBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  padding: "4px 10px",
  border: "1px solid var(--moss)",
  borderRadius: 999,
  background: "transparent",
  color: "var(--moss)",
  cursor: "pointer",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  padding: "48px 24px",
};

const backBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  marginBottom: 32,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 400,
  color: "var(--ink)",
  margin: "0 0 6px",
};

const subheadStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--ink-soft)",
  margin: "0 0 36px",
  lineHeight: 1.6,
};

const cardStyle: React.CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  padding: "18px 20px",
};

const emptyCardStyle: React.CSSProperties = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink)",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "8px 12px",
  outline: "none",
};

const saveBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--paper)",
  background: "var(--moss)",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-soft)",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
};

const skipBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "8px 4px",
};

const countPillStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-soft)",
  border: "1px solid var(--rule)",
  borderRadius: 999,
  padding: "3px 8px",
  whiteSpace: "nowrap" as const,
};