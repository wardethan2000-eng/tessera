"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AnimatePresence } from "framer-motion";
import { TreeCanvas } from "@/components/tree/TreeCanvas";
import { DriftMode } from "@/components/tree/DriftMode";
import { Shimmer } from "@/components/ui/Shimmer";
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

export default function TreePage() {
  const router = useRouter();
  const params = useParams<{ treeId: string }>();
  const { treeId } = params;
  const { data: session, isPending } = useSession();

  const [tree, setTree] = useState<Tree | null>(null);
  const [people, setPeople] = useState<ApiPerson[]>([]);
  const [relationships, setRelationships] = useState<ApiRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [driftOpen, setDriftOpen] = useState(false);

  const currentUserPersonId =
    session?.user?.id && people.length > 0
      ? (people.find((p) => p.linkedUserId === session.user.id)?.id ?? null)
      : null;

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session || !treeId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [treeRes, peopleRes, relsRes] = await Promise.all([
          fetch(`${API}/api/trees/${treeId}`, { credentials: "include" }),
          fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
          fetch(`${API}/api/trees/${treeId}/relationships`, { credentials: "include" }),
        ]);

        if (treeRes.ok) setTree(await treeRes.json());
        if (peopleRes.ok) {
          const data = await peopleRes.json();
          setPeople(
            (data as Array<Record<string, unknown>>).map((p) => ({
              id: p.id as string,
              name: (p.displayName ?? p.name ?? "") as string,
              birthYear: extractYear(p.birthDateText as string | null),
              deathYear: extractYear(p.deathDateText as string | null),
              essenceLine: (p.essenceLine ?? null) as string | null,
              portraitUrl: (p.portraitUrl ?? null) as string | null,
              linkedUserId: (p.linkedUserId ?? null) as string | null,
            }))
          );
        }
        if (relsRes.ok) setRelationships(await relsRes.json());
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [session, treeId]);

  const handlePersonDetail = useCallback(
    (personId: string) => {
      router.push(`/trees/${treeId}/people/${personId}`);
    },
    [router, treeId]
  );

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
        people={people}
        relationships={relationships}
        currentUserPersonId={currentUserPersonId}
        onDriftClick={() => setDriftOpen(true)}
        onPersonDetailClick={handlePersonDetail}
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
    </main>
  );
}
