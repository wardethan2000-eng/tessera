"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { readOnboardingSession, writeOnboardingSession } from "@/lib/onboarding-session";

const API = getApiBase();

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/auth/signin");
      return;
    }
    // Guard: if tree was already created in this session, skip ahead
    if (!isPending && session) {
      const saved = readOnboardingSession();
      if (saved.treeId) {
        router.replace(`/onboarding/person?treeId=${saved.treeId}`);
        return;
      }
      // If the user has a pending invitation and no saved tree in progress,
      // redirect to the welcome fork so they don't accidentally create a
      // second, empty archive.
      void (async () => {
        try {
          const res = await fetch(`${API}/api/me/invitations`, {
            credentials: "include",
          });
          if (!res.ok) return;
          const invites = (await res.json()) as Array<{ id: string }>;
          if (invites.length > 0) {
            router.replace("/onboarding/welcome");
          }
        } catch {
          // Non-fatal — continue to show the founder flow.
        }
      })();
    }
  }, [session, isPending, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/trees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to create tree. Please try again.");
        return;
      }
      const tree = (await res.json()) as { id: string };
      writeOnboardingSession({ treeId: tree.id });
      router.push(`/onboarding/person?treeId=${tree.id}`);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isPending || !session) {
    return <Loading />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">
            Step 1 of 4
          </p>
          <h1 className="text-2xl font-semibold text-stone-900">
            Give your archive a name
          </h1>
          <p className="text-sm text-stone-500">
            Usually a surname, a line, or a framing — you can rename it any time.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleCreate} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-stone-700">Archive name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Smith Family"
                required
                maxLength={160}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating…" : "Create archive →"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50">
      <p className="text-sm text-stone-400">Loading…</p>
    </main>
  );
}
