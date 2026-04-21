"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AnimatePresence } from "framer-motion";
import { TreeCanvas } from "@/components/tree/TreeCanvas";
import { DriftMode } from "@/components/tree/DriftMode";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { Shimmer } from "@/components/ui/Shimmer";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";
import type { ApiPerson, ApiRelationship } from "@/components/tree/treeTypes";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  const { treeId } = params;
  const { data: session, isPending } = useSession();

  const [tree, setTree] = useState<Tree | null>(null);
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [relationships, setRelationships] = useState<ApiRelationship[]>([]);
  const [memories, setMemories] = useState<TreeMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [driftOpen, setDriftOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const mapPeoplePayload = useCallback((data: Array<Record<string, unknown>>) => {
    return data.map((p) => ({
      id: p.id as string,
      name: (p.displayName ?? p.name ?? "") as string,
      birthYear: extractYear(p.birthDateText as string | null),
      deathYear: extractYear(p.deathDateText as string | null),
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
    if (!session || !treeId) return;
    const fetchData = async () => {
      setLoading(true);
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
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [mapPeoplePayload, session, treeId]);

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

  if (isPending || loading) {
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
        familyMapHref={`/trees/${treeId}/map`}
        people={people}
        relationships={relationships}
        currentUserPersonId={currentUserPersonId}
        onDriftClick={() => setDriftOpen(true)}
        onPersonDetailClick={handlePersonDetail}
        onAddMemoryClick={() => setWizardOpen(true)}
        onSearchClick={() => setSearchOpen(true)}
        onConstellationChanged={refreshConstellation}
      />

      <AnimatePresence>
        {driftOpen && (
          <DriftMode
            treeId={treeId}
            people={people}
            onClose={() => setDriftOpen(false)}
            onPersonDetail={handlePersonDetail}
            apiBase={API}
          />
        )}
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
