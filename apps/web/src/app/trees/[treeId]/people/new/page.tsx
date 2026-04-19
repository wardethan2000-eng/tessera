"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { PlacePicker } from "@/components/tree/PlacePicker";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function NewPersonPage({
  params,
}: {
  params: Promise<{ treeId: string }>;
}) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { treeId } = use(params);

  const [form, setForm] = useState({
    displayName: "",
    essenceLine: "",
    birthDateText: "",
    deathDateText: "",
    birthPlace: "",
    birthPlaceId: "",
    deathPlace: "",
    deathPlaceId: "",
    isLiving: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-400">Loading…</p>
      </main>
    );
  }

  if (!session) {
    router.replace("/auth/signin");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`${API}/api/trees/${treeId}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        displayName: form.displayName,
        essenceLine: form.essenceLine || undefined,
        birthDateText: form.birthDateText || undefined,
        deathDateText: form.deathDateText || undefined,
        birthPlace: form.birthPlace || undefined,
        birthPlaceId: form.birthPlaceId || undefined,
        deathPlace: form.deathPlace || undefined,
        deathPlaceId: form.deathPlaceId || undefined,
        isLiving: form.isLiving,
      }),
    });

    if (!res.ok) {
      setError("Failed to create person. Please try again.");
      setSaving(false);
      return;
    }

    const person = (await res.json()) as { id: string };
    router.push(`/trees/${treeId}/people/${person.id}`);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4 flex items-center gap-4">
        <a
          href="/dashboard"
          className="text-sm text-stone-400 hover:text-stone-700 transition-colors"
        >
          ← Dashboard
        </a>
        <p className="text-xs uppercase tracking-widest text-stone-400">
          Add Person
        </p>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-stone-950 mb-8">
          Add a person
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
              placeholder="Full name or known name"
              className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Essence line
            </label>
            <input
              type="text"
              value={form.essenceLine}
              onChange={(e) =>
                setForm((f) => ({ ...f, essenceLine: e.target.value }))
              }
              placeholder="A brief phrase that captures this person"
              className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Birth date
              </label>
              <input
                type="text"
                value={form.birthDateText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, birthDateText: e.target.value }))
                }
                placeholder="e.g. 14 March 1942"
                className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Death date
              </label>
              <input
                type="text"
                value={form.deathDateText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deathDateText: e.target.value }))
                }
                placeholder="e.g. 2 June 2010"
                className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Birthplace
            </label>
            <input
              type="text"
              value={form.birthPlace}
              onChange={(e) =>
                setForm((f) => ({ ...f, birthPlace: e.target.value }))
              }
              placeholder="City, country or region"
              className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <PlacePicker
            treeId={treeId}
            apiBase={API}
            value={form.birthPlaceId}
            onChange={(birthPlaceId) =>
              setForm((f) => ({ ...f, birthPlaceId }))
            }
            label="Birthplace on the map"
            emptyLabel="No mapped birthplace"
            note="Optional. Use this when you know the place well enough to pin it."
          />

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Death place
            </label>
            <input
              type="text"
              value={form.deathPlace}
              onChange={(e) =>
                setForm((f) => ({ ...f, deathPlace: e.target.value }))
              }
              placeholder="City, country or region"
              className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <PlacePicker
            treeId={treeId}
            apiBase={API}
            value={form.deathPlaceId}
            onChange={(deathPlaceId) =>
              setForm((f) => ({ ...f, deathPlaceId }))
            }
            label="Death place on the map"
            emptyLabel="No mapped death place"
            note="Optional. Leave blank if this person is still living or the place is unknown."
          />

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isLiving}
              onChange={(e) =>
                setForm((f) => ({ ...f, isLiving: e.target.checked }))
              }
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-stone-700">Still living</span>
          </label>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Add person"}
          </button>
        </form>
      </main>
    </div>
  );
}
