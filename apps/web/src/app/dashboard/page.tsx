"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Tree = { id: string; name: string; role: string; createdAt: string };
type Person = {
  id: string;
  displayName: string;
  essenceLine: string | null;
  birthDateText: string | null;
  linkedUserId: string | null;
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const [trees, setTrees] = useState<Tree[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [activeTreeId, setActiveTreeId] = useState<string | null>(
    searchParams.get("treeId"),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/auth/signin");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      fetchTrees();
    }
  }, [session]);

  useEffect(() => {
    if (activeTreeId) {
      fetchPeople(activeTreeId);
    }
  }, [activeTreeId]);

  async function fetchTrees() {
    const res = await fetch(`${API}/api/trees`, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as Tree[];
    setTrees(data);
    const firstTree = data[0];
    if (!activeTreeId && firstTree) setActiveTreeId(firstTree.id);
    if (data.length === 0) router.replace("/onboarding");
    setLoading(false);
  }

  async function fetchPeople(treeId: string) {
    const res = await fetch(`${API}/api/trees/${treeId}/people`, {
      credentials: "include",
    });
    if (!res.ok) return;
    setPeople((await res.json()) as Person[]);
  }

  if (isPending || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-400">Loading…</p>
      </main>
    );
  }

  const activeTree = trees.find((t) => t.id === activeTreeId);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-stone-400">FamilyTree</p>
        <div className="flex items-center gap-4">
          <span className="text-sm text-stone-500">{session?.user.name}</span>
          <button
            onClick={() =>
              signOut().then(() => router.push("/auth/signin"))
            }
            className="text-sm text-stone-400 hover:text-stone-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 space-y-10">
        {trees.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {trees.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTreeId(t.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  t.id === activeTreeId
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {activeTree && (
          <section>
            <h1 className="text-3xl font-semibold text-stone-950">
              {activeTree.name}
            </h1>
            <p className="mt-1 text-sm text-stone-400 capitalize">
              {activeTree.role}
            </p>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">People</h2>

          {people.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 p-10 text-center">
              <p className="text-sm text-stone-400">
                No people yet. The tree is empty.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {people.map((p) => (
                <li key={p.id}>
                  <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-stone-900">
                        {p.displayName}
                      </h3>
                      {p.linkedUserId === session?.user.id && (
                        <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                          you
                        </span>
                      )}
                    </div>
                    {p.birthDateText && (
                      <p className="mt-1 text-xs text-stone-400">
                        b. {p.birthDateText}
                      </p>
                    )}
                    {p.essenceLine && (
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {p.essenceLine}
                      </p>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-stone-50">
          <p className="text-sm text-stone-400">Loading…</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
