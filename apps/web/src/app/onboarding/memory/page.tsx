"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { readOnboardingSession, writeOnboardingSession } from "@/lib/onboarding-session";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function OnboardingMemoryForm() {
  const router = useRouter();
  const params = useSearchParams();
  const treeId = params.get("treeId");
  const selfPersonId = params.get("selfPersonId");

  const { data: session, isPending } = useSession();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
    if (!isPending && (!treeId || !selfPersonId)) router.replace("/onboarding");
    if (!isPending && session) {
      const saved = readOnboardingSession();
      // Guard: if memory was already saved, send them to the archive
      if (saved.memoryAdded && treeId) {
        router.replace(`/trees/${treeId}/atrium`);
      }
    }
  }, [session, isPending, treeId, selfPersonId, router]);

  function atriumUrl() {
    return `/trees/${treeId}/atrium`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!treeId || !selfPersonId || !body.trim()) return;
    setLoading(true);
    setError("");

    try {
      const trimmed = body.trim();
      // Grapheme-safe title: use Array.from for proper Unicode handling,
      // then try to break at a word boundary
      const chars = Array.from(trimmed);
      let titleText: string;
      if (chars.length <= 60) {
        titleText = trimmed;
      } else {
        const raw = chars.slice(0, 60).join("");
        const lastSpace = raw.lastIndexOf(" ");
        titleText = (lastSpace > 20 ? raw.slice(0, lastSpace) : raw) + "…";
      }

      const res = await fetch(
        `${API}/api/trees/${treeId}/people/${selfPersonId}/memories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            kind: "story",
            title: titleText,
            body: trimmed,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to save memory.");
        return;
      }

      writeOnboardingSession({ memoryAdded: true });
      router.push(atriumUrl());
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isPending || !session) {
    return <p className="text-sm text-stone-400">Loading…</p>;
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold text-stone-900">
          Share your first memory
        </h1>
        <p className="text-sm text-stone-500">
          A sentence, a story, a detail you never want to forget.
          This is what brings the archive to life.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-stone-700">Your memory</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Dad always said the best bread you ever made is the one cooling on the counter right now…"
              required
              rows={5}
              maxLength={10000}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 resize-none"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !body.trim()}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Save and open archive →"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            writeOnboardingSession({ memoryAdded: true });
            router.push(atriumUrl());
          }}
          className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors py-1"
        >
          Skip — go to archive →
        </button>
        <button
          type="button"
          onClick={() => router.push(`/onboarding/relative?treeId=${treeId}&selfPersonId=${selfPersonId}`)}
          className="w-full text-center text-sm text-stone-400 hover:text-stone-600 transition-colors py-1"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

export default function OnboardingMemoryPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <Suspense fallback={<p className="text-sm text-stone-400">Loading…</p>}>
        <OnboardingMemoryForm />
      </Suspense>
    </main>
  );
}
