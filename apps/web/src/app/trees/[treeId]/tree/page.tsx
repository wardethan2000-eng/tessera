"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { AnimatePresence } from "framer-motion";
import { TreeCanvas } from "@/components/tree/TreeCanvas";
import { DriftMode, type DriftFilter } from "@/components/tree/DriftMode";
import { DriftChooserSheet } from "@/components/tree/DriftChooserSheet";
import { CorkboardDrift } from "@/components/corkboard/CorkboardDrift";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import { PromptComposer } from "@/components/tree/PromptComposer";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { Shimmer } from "@/components/ui/Shimmer";
import { writeLastOpenedTreeId } from "@/lib/last-opened-tree";
import { isCanonicalTreeId, resolveCanonicalTreeId } from "@/lib/tree-route";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";
import type { ApiPerson, ApiRelationship } from "@/components/tree/treeTypes";

const API = getApiBase();

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const m = text.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1]!, 10) : null;
}

interface Tree {
  id: string;
  name: string;
}

interface TreeMemory {
  id: string;
  kind: "story" | "photo" | "voice" | "document" | "other";
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  personName?: string | null;
  primaryPersonId?: string | null;
  personPortraitUrl?: string | null;
}

export default function TreePage() {
  const router = useRouter();
  const params = useParams<{ treeId: string }>();
  const searchParams = useSearchParams();
  const { treeId } = params;
  const focusPersonId = searchParams.get("focusPersonId");
  const { data: session, isPending } = useSession();
  const needsNormalization = !isCanonicalTreeId(treeId);

  const [tree, setTree] = useState<Tree | null>(null);
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [relationships, setRelationships] = useState<ApiRelationship[]>([]);
  const [memories, setMemories] = useState<TreeMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftChooserOpen, setDriftChooserOpen] = useState(false);
  const [driftFilter, setDriftFilter] = useState<DriftFilter | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPromptPersonId, setSelectedPromptPersonId] = useState<string | null>(null);

  const openDrift = useCallback(
    (filter?: DriftFilter | null) => {
      setDriftFilter(filter ?? null);
      setDriftChooserOpen(false);
      setDriftOpen(true);
    },
    [],
  );
  const closeDrift = useCallback(() => {
    setDriftOpen(false);
    setDriftFilter(null);
  }, []);
  const openDriftChooser = useCallback(() => {
    setDriftChooserOpen(true);
  }, []);
  const closeDriftChooser = useCallback(() => {
    setDriftChooserOpen(false);
  }, []);

  const mapPeoplePayload = useCallback((data: Array<Record<string, unknown>>) => {
    return data.map((p) => ({
      id: p.id as string,
      name: (p.displayName ?? p.name ?? "") as string,
      birthYear: extractYear(p.birthDateText as string | null),
      deathYear: extractYear(p.deathDateText as string | null),
      birthDateText: (p.birthDateText ?? null) as string | null,
      deathDateText: (p.deathDateText ?? null) as string | null,
      firstName: (p.firstName ?? null) as string | null,
      lastName: (p.lastName ?? null) as string | null,
      maidenName: (p.maidenName ?? null) as string | null,
      essenceLine: (p.essenceLine ?? null) as string | null,
      portraitUrl: (p.portraitUrl ?? null) as string | null,
      linkedUserId: (p.linkedUserId ?? null) as string | null,
    }));
  }, []);

  const currentUserPersonId =
    session?.user?.id && people.length > 0
      ? (people.find((p) => p.linkedUserId === session.user.id)?.id ?? null)
      : null;

  // Global ⌘K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session || !needsNormalization) return;

    let cancelled = false;
    void (async () => {
      const resolvedTreeId = await resolveCanonicalTreeId(API, treeId);
      if (cancelled) return;
      if (resolvedTreeId && resolvedTreeId !== treeId) {
        router.replace(`/trees/${resolvedTreeId}/tree`);
        return;
      }
      if (!resolvedTreeId) {
        setLoadError("This tree link is invalid or no longer points to an available tree.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsNormalization, router, session, treeId]);

  useEffect(() => {
    if (!session || !treeId || !isCanonicalTreeId(treeId)) return;
    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [treeResResult, peopleResResult, relsResResult, memoriesResResult] =
          await Promise.allSettled([
            fetch(`${API}/api/trees/${treeId}`, { credentials: "include" }),
            fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
            fetch(`${API}/api/trees/${treeId}/relationships`, { credentials: "include" }),
            fetch(`${API}/api/trees/${treeId}/memories`, { credentials: "include" }),
          ]);

        if (treeResResult.status === "fulfilled" && treeResResult.value.ok) {
          setTree(await treeResResult.value.json());
        }
        if (peopleResResult.status === "fulfilled" && peopleResResult.value.ok) {
          const data = await peopleResResult.value.json();
          setPeople(mapPeoplePayload(data as Array<Record<string, unknown>>));
        }
        if (relsResResult.status === "fulfilled" && relsResResult.value.ok) {
          setRelationships(await relsResResult.value.json());
        }
        if (memoriesResResult.status === "fulfilled" && memoriesResResult.value.ok) {
          setMemories(await memoriesResResult.value.json());
        }
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load this tree.",
        );
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [mapPeoplePayload, session, treeId]);

  useEffect(() => {
    if (!session || !isCanonicalTreeId(treeId)) return;
    writeLastOpenedTreeId(treeId);
  }, [session, treeId]);

  const handlePersonDetail = useCallback(
    (personId: string) => {
      router.push(`/trees/${treeId}/people/${personId}`);
    },
    [router, treeId]
  );

  const refreshMemories = useCallback(async () => {
    const res = await fetch(`${API}/api/trees/${treeId}/memories`, {
      credentials: "include",
    });
    if (res.ok) setMemories(await res.json());
  }, [treeId]);

  usePendingVoiceTranscriptionRefresh({
    items: memories.map((memory) => ({
      id: memory.id,
      kind: memory.kind,
      transcriptStatus: memory.transcriptStatus,
    })),
    refresh: refreshMemories,
    enabled: Boolean(session),
  });

  const refreshConstellation = useCallback(async () => {
    const [peopleResResult, relsResResult] = await Promise.allSettled([
      fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/relationships`, {
        credentials: "include",
      }),
    ]);

    if (peopleResResult.status === "fulfilled" && peopleResResult.value.ok) {
      const data = await peopleResResult.value.json();
      setPeople(mapPeoplePayload(data as Array<Record<string, unknown>>));
    }
    if (relsResResult.status === "fulfilled" && relsResResult.value.ok) {
      setRelationships(await relsResResult.value.json());
    }
  }, [mapPeoplePayload, treeId]);

  const apiPeople = people.map((p) => ({
    id: p.id,
    name: p.name,
    portraitUrl: p.portraitUrl,
  }));

  const promptPeople = people.map((p) => ({
    id: p.id,
    displayName: p.name,
    portraitUrl: p.portraitUrl,
    essenceLine: p.essenceLine,
    linkedUserId: p.linkedUserId ?? null,
  }));

  if (isPending || loading || (needsNormalization && !loadError)) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Shimmer width={160} height={14} />
        <Shimmer width={240} height={10} />
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
            This tree could not be opened.
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

  if (!tree) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)", fontSize: 14 }}>
          Tree not found.{" "}
          <a href="/dashboard" style={{ color: "var(--moss)", textDecoration: "underline" }}>
            Back to dashboard
          </a>
        </p>
      </main>
    );
  }

  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "var(--paper)" }}>
      <TreeCanvas
        treeId={treeId}
        treeName={tree.name}
        people={people}
        relationships={relationships}
        currentUserPersonId={currentUserPersonId}
        initialSelectedPersonId={focusPersonId}
        onDriftClick={() => openDriftChooser()}
        onPersonDetailClick={handlePersonDetail}
        onAddMemoryClick={() => setWizardOpen(true)}
        onRequestMemoryClick={() => setRequestOpen(true)}
        onSearchClick={() => setSearchOpen(true)}
        onConstellationChanged={refreshConstellation}
        onSelectedPersonChange={setSelectedPromptPersonId}
      />

      <DriftChooserSheet
        open={driftChooserOpen}
        people={people}
        onClose={closeDriftChooser}
        onChoose={(filter) => openDrift(filter)}
      />

      <AnimatePresence>
        {driftOpen && driftFilter?.mode === "corkboard" ? (
          <CorkboardDrift
            key="corkboard"
            treeId={treeId}
            people={people}
            onClose={closeDrift}
            onPersonDetail={handlePersonDetail}
            apiBase={API}
            initialFilter={driftFilter}
          />
        ) : driftOpen ? (
          <DriftMode
            key="drift"
            treeId={treeId}
            people={people}
            onClose={closeDrift}
            onPersonDetail={handlePersonDetail}
            apiBase={API}
            initialFilter={driftFilter}
          />
        ) : null}
      </AnimatePresence>

      {wizardOpen && (
        <AddMemoryWizard
          treeId={treeId}
          people={apiPeople}
          apiBase={API}
          onClose={() => setWizardOpen(false)}
          onSuccess={refreshMemories}
        />
      )}

      <PromptComposer
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        treeId={treeId}
        people={promptPeople}
        relationships={relationships}
        defaultPersonId={selectedPromptPersonId ?? undefined}
      />

      <SearchOverlay
        treeId={treeId}
        people={people.map((p) => ({
          id: p.id,
          name: p.name,
          portraitUrl: p.portraitUrl,
          essenceLine: p.essenceLine,
          birthYear: p.birthYear,
          deathYear: p.deathYear,
        }))}
        memories={memories}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </main>
  );
}
