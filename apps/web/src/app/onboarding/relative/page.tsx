"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { readOnboardingSession, writeOnboardingSession } from "@/lib/onboarding-session";

const API = getApiBase();

type RelationshipOption = {
  label: string;
  type: "parent_child" | "sibling" | "spouse";
  // "from" means the new relative is the fromPerson (parent side)
  // "to"   means the new relative is the toPerson   (child side)
  // "sym"  means symmetric (sibling/spouse) — fromPerson doesn't matter
  direction: "from" | "to" | "sym";
  spouseStatus?: "active";
};

const RELATIONSHIP_OPTIONS: RelationshipOption[] = [
  { label: "My mother",        type: "parent_child", direction: "from" },
  { label: "My father",        type: "parent_child", direction: "from" },
  { label: "My child",         type: "parent_child", direction: "to" },
  { label: "My sibling",       type: "sibling",      direction: "sym" },
  { label: "My spouse / partner", type: "spouse",    direction: "sym", spouseStatus: "active" },
];

function OnboardingRelativeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const treeId = params.get("treeId");
  const selfPersonId = params.get("selfPersonId");

  const { data: session, isPending } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [relationshipIdx, setRelationshipIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Re-entry guard: true if a relative was already added this session
  const [alreadyDone, setAlreadyDone] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
    if (!isPending && (!treeId || !selfPersonId)) router.replace("/onboarding");
    if (!isPending && session) {
      const saved = readOnboardingSession();
      if (saved.relativeAdded) setAlreadyDone(true);
    }
  }, [session, isPending, treeId, selfPersonId, router]);

  function nextUrl() {
    return `/onboarding/memory?treeId=${treeId}&selfPersonId=${selfPersonId}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!treeId || !selfPersonId) return;
    setLoading(true);
    setError("");

    try {
      // 1. Create the relative person
      const personRes = await fetch(`${API}/api/trees/${treeId}/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName }),
      });

      if (!personRes.ok) {
        const data = await personRes.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to add person.");
        return;
      }

      const relative = await personRes.json() as { id: string };
      const option: RelationshipOption = RELATIONSHIP_OPTIONS[relationshipIdx] ?? RELATIONSHIP_OPTIONS[0] as RelationshipOption;

      // 2. Create the relationship
      const fromPersonId = option.direction === "from" ? relative.id : selfPersonId;
      const toPersonId   = option.direction === "from" ? selfPersonId  : relative.id;

      const relRes = await fetch(`${API}/api/trees/${treeId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromPersonId,
          toPersonId,
          type: option.type,
          ...(option.spouseStatus ? { spouseStatus: option.spouseStatus } : {}),
        }),
      });

      if (!relRes.ok) {
        const data = await relRes.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Person was added but the relationship could not be created. You can fix this later in the tree.");
        // Stay on page so user sees the error — don't navigate
        return;
      }

      router.push(nextUrl());
      writeOnboardingSession({ relativeAdded: true });
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isPending || !session) {
    return <p className="text-sm text-stone-400">Loading…</p>;
  }

  // Re-entry: relative was already added this session
  if (alreadyDone) {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Step 3 of 4</p>
          <h1 className="text-2xl font-semibold text-stone-900">Relative added</h1>
          <p className="text-sm text-stone-500">You already added a relative. Continue to the next step.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-3">
          <button
            onClick={() => router.push(nextUrl())}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
          >
            Continue →
          </button>
          <button
            type="button"
            onClick={() => router.push(`/onboarding/person?treeId=${treeId}`)}
            className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors py-1"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Step 3 of 4</p>
        <h1 className="text-2xl font-semibold text-stone-900">
          Add one relative
        </h1>
        <p className="text-sm text-stone-500">
          Give your tree a second node — it&apos;s what makes it feel alive.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-stone-700">Their name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Margaret Smith"
              required
              maxLength={200}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-stone-700">Relationship to you</span>
            <select
              value={relationshipIdx}
              onChange={(e) => setRelationshipIdx(Number(e.target.value))}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            >
              {RELATIONSHIP_OPTIONS.map((opt, i) => (
                <option key={i} value={i}>{opt.label}</option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Adding…" : "Add to tree →"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push(nextUrl())}
          className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors py-1"
        >
          Skip for now →
        </button>
        <button
          type="button"
          onClick={() => router.push(`/onboarding/person?treeId=${treeId}`)}
          className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors py-1"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

export default function OnboardingRelativePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <Suspense fallback={<p className="text-sm text-stone-400">Loading…</p>}>
        <OnboardingRelativeForm />
      </Suspense>
    </main>
  );
}
