"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { MemoryLightbox, type LightboxMemory } from "@/components/tree/MemoryLightbox";
import { PromptComposer } from "@/components/tree/PromptComposer";
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
  portraitUrl: string | null;
  memories: Memory[];
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
};

type Relationship = {
  id: string;
  type: RelationshipType;
  fromPerson: { id: string; displayName: string; portraitUrl?: string | null };
  toPerson: { id: string; displayName: string; portraitUrl?: string | null };
};

type PersonSummary = { id: string; displayName: string };

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

  // Portrait upload
  const [uploadingPortrait, setUploadingPortrait] = useState(false);

  // Add memory
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [memoryForm, setMemoryForm] = useState({
    kind: "story" as MemoryKind,
    title: "",
    body: "",
    dateOfEventText: "",
    placeId: "",
    mediaId: "",
  });
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  const [savingMemory, setSavingMemory] = useState(false);

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
  const [crossTreeLinks, setCrossTreeLinks] = useState<Array<{
    connectionId: string;
    linkedPerson: {
      id: string;
      displayName: string;
      treeId: string;
      portraitUrl: string | null;
      essenceLine?: string | null;
    };
    memories: Memory[];
  }>>([]);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      loadPerson();
      loadAllPeople();
      loadCrossTreeLinks();
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

  async function loadCrossTreeLinks() {
    const res = await fetch(
      `${API}/api/trees/${treeId}/people/${personId}/cross-tree`,
      { credentials: "include" },
    );
    if (res.ok) setCrossTreeLinks(await res.json());
  }

  async function loadPersonPrompts() {
    const res = await fetch(`${API}/api/trees/${treeId}/prompts`, { credentials: "include" });
    if (res.ok) {
      const all = (await res.json()) as Array<{ id: string; questionText: string; status: "pending" | "answered" | "dismissed"; createdAt: string; fromUserName: string | null; toPersonId: string; replies?: Array<{ id: string; kind: string; title: string }> }>;
      setPersonPrompts(all.filter((p) => p.toPersonId === personId));
    }
  }

  function startEditing(p: Person) {
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

  async function saveMemory(e: React.FormEvent) {
    e.preventDefault();
    setSavingMemory(true);
    let resolvedMediaId = memoryForm.mediaId;
    if ((memoryForm.kind === "photo" || memoryForm.kind === "voice" || memoryForm.kind === "document") && memoryFile) {
      const presignRes = await fetch(`${API}/api/trees/${treeId}/media/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filename: memoryFile.name, contentType: memoryFile.type, sizeBytes: memoryFile.size }),
      });
      if (presignRes.ok) {
        const { mediaId, uploadUrl } = (await presignRes.json()) as { mediaId: string; uploadUrl: string };
        await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": memoryFile.type }, body: memoryFile });
        resolvedMediaId = mediaId;
      }
    }
    const res = await fetch(`${API}/api/trees/${treeId}/people/${personId}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        kind: memoryForm.kind,
        title: memoryForm.title,
        body: memoryForm.kind === "story" ? memoryForm.body : undefined,
        mediaId: ["photo", "voice", "document"].includes(memoryForm.kind) ? resolvedMediaId || undefined : undefined,
        dateOfEventText: memoryForm.dateOfEventText || undefined,
        placeId: memoryForm.placeId || undefined,
      }),
    });
    if (res.ok) {
      setShowMemoryForm(false);
      setMemoryForm({ kind: "story", title: "", body: "", dateOfEventText: "", placeId: "", mediaId: "" });
      setMemoryFile(null);
      await loadPerson();
    }
    setSavingMemory(false);
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
  const decadeMap = new Map<string, Memory[]>();
  for (const m of person.memories) {
    const year = extractYear(m.dateOfEventText);
    if (year) {
      const decade = getDecade(year);
      if (!decadeMap.has(decade)) decadeMap.set(decade, []);
      decadeMap.get(decade)!.push(m);
    }
  }
  const decades = Array.from(decadeMap.keys()).sort();
  const undatedMemories = person.memories.filter((m) => !extractYear(m.dateOfEventText));
  const storyMemories = person.memories.filter((m) => m.kind === "story");

  const dateRange =
    person.birthDateText && person.deathDateText
      ? `${person.birthDateText} – ${person.deathDateText}`
      : person.birthDateText
      ? `${person.birthDateText} –`
      : person.deathDateText
      ? `– ${person.deathDateText}`
      : null;

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
    { id: "stories", label: `Stories${storyMemories.length > 0 ? ` ${storyMemories.length}` : ""}` },
    { id: "connections", label: `Connections${person.relationships.length > 0 ? ` ${person.relationships.length}` : ""}` },
    { id: "about", label: "About" },
    { id: "prompts", label: `Questions${personPrompts.length > 0 ? ` ${personPrompts.length}` : ""}` },
  ];

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
          <button
            onClick={() => startEditing(person)}
            style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", background: "none", border: "1px solid var(--rule)", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}
          >
            Edit this page
          </button>
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
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={savingEdit} style={primaryBtnStyle}>
                {savingEdit ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditing(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
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
                <button onClick={() => setShowMemoryForm((s) => !s)} style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>
                  {showMemoryForm ? "Cancel" : "+ Add memory"}
                </button>
              </div>

              {showMemoryForm && (
                <MemoryForm
                  treeId={treeId}
                  memoryForm={memoryForm}
                  setMemoryForm={setMemoryForm}
                  memoryFile={memoryFile}
                  setMemoryFile={setMemoryFile}
                  savingMemory={savingMemory}
                  saveMemory={saveMemory}
                />
              )}

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
                        onClick={() => openLightbox(undatedMemories, i)}
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
                  onClick={() => { setShowMemoryForm(true); setMemoryForm((f) => ({ ...f, kind: "story" })); setActiveTab("memories"); }}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--moss)", background: "none", border: "1px solid var(--moss)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}
                >
                  + Add story
                </button>
              </div>
              {storyMemories.length === 0 ? (
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-faded)" }}>No stories yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                  {storyMemories.map((m) => (
                    <article key={m.id} style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 40 }}>
                      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", fontWeight: 400, margin: "0 0 8px" }}>{m.title}</h3>
                      {m.dateOfEventText && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginBottom: 16 }}>{m.dateOfEventText}</p>}
                      {m.body && <p style={{ fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.85, color: "var(--ink-soft)", whiteSpace: "pre-wrap", margin: 0 }}>{m.body}</p>}
                    </article>
                  ))}
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
              </div>

              {/* ── Also appears in (cross-tree) ── */}
              {crossTreeLinks.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <h3 style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", fontWeight: 500 }}>
                    Also appears in
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {crossTreeLinks.map((link) => (
                      <div key={link.connectionId} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "16px 20px", background: "var(--paper-deep)" }}>
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

// ── Sub-components ─────────────────────────────────────────────────────────

function MemoryCard({ memory, onClick }: { memory: Memory; onClick?: () => void }) {
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
      </div>
    </article>
  );
}

function MemoryForm({
  treeId,
  memoryForm,
  setMemoryForm,
  memoryFile,
  setMemoryFile,
  savingMemory,
  saveMemory,
}: {
  treeId: string;
  memoryForm: { kind: MemoryKind; title: string; body: string; dateOfEventText: string; placeId: string; mediaId: string };
  setMemoryForm: React.Dispatch<React.SetStateAction<typeof memoryForm>>;
  memoryFile: File | null;
  setMemoryFile: (f: File | null) => void;
  savingMemory: boolean;
  saveMemory: (e: React.FormEvent) => void;
}) {
  const KINDS: { id: MemoryKind; label: string }[] = [
    { id: "story", label: "Story" },
    { id: "photo", label: "Photo" },
    { id: "voice", label: "Voice memo" },
    { id: "document", label: "Document" },
  ];

  return (
    <form onSubmit={saveMemory} style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 8, padding: 20, marginBottom: 28, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {KINDS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setMemoryForm((f) => ({ ...f, kind: id }))}
            style={{ borderRadius: 6, padding: "7px 14px", fontFamily: "var(--font-ui)", fontSize: 12, border: "1px solid", borderColor: memoryForm.kind === id ? "var(--moss)" : "var(--rule)", background: memoryForm.kind === id ? "var(--moss)" : "none", color: memoryForm.kind === id ? "var(--paper)" : "var(--ink-soft)", cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>
      <input type="text" required value={memoryForm.title}
        onChange={(e) => setMemoryForm((f) => ({ ...f, title: e.target.value }))}
        placeholder="Title" style={inputStyle} />
      {["story"].includes(memoryForm.kind) && (
        <textarea required rows={4} value={memoryForm.body}
          onChange={(e) => setMemoryForm((f) => ({ ...f, body: e.target.value }))}
          placeholder="Write the memory…"
          style={{ ...inputStyle, resize: "none" }} />
      )}
      {["photo"].includes(memoryForm.kind) && (
        <input type="file" accept="image/*" required
          onChange={(e) => setMemoryFile(e.target.files?.[0] ?? null)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }} />
      )}
      {["voice"].includes(memoryForm.kind) && (
        <input type="file" accept="audio/*" required
          onChange={(e) => setMemoryFile(e.target.files?.[0] ?? null)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }} />
      )}
      {["document"].includes(memoryForm.kind) && (
        <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword" required
          onChange={(e) => setMemoryFile(e.target.files?.[0] ?? null)}
          style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-soft)" }} />
      )}
      {memoryFile && <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>{memoryFile.name}</p>}
      <input type="text" value={memoryForm.dateOfEventText}
        onChange={(e) => setMemoryForm((f) => ({ ...f, dateOfEventText: e.target.value }))}
        placeholder="Date of event (e.g. 1964, Summer 1972)"
        style={inputStyle} />
      <PlacePicker
        treeId={treeId}
        apiBase={API}
        value={memoryForm.placeId}
        onChange={(placeId) => setMemoryForm((f) => ({ ...f, placeId }))}
        label="Place on the map"
        emptyLabel="No mapped place"
      />
      <button type="submit" disabled={savingMemory} style={primaryBtnStyle}>
        {savingMemory ? "Saving…" : "Add memory"}
      </button>
    </form>
  );
}
