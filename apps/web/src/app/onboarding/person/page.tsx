"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function OnboardingPersonForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const treeId = searchParams.get("treeId");

  const { data: session, isPending } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [birthDateText, setBirthDateText] = useState("");
  const [essenceLine, setEssenceLine] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
    if (!isPending && !treeId) router.replace("/onboarding");
  }, [session, isPending, treeId, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`${API}/api/trees/${treeId}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        displayName,
        birthDateText: birthDateText || undefined,
        essenceLine: essenceLine || undefined,
        linkToUser: true,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Failed to add person. Please try again.");
      return;
    }
    router.push(`/dashboard?treeId=${treeId}`);
  }

  if (isPending || !session) {
    return <p className="text-sm text-stone-400">Loading…</p>;
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Step 2 of 2</p>
        <h1 className="text-2xl font-semibold text-stone-900">
          Add yourself to the tree
        </h1>
        <p className="text-sm text-stone-500">
          This creates your node. You can fill in more detail any time.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleCreate} className="space-y-4">
          <Field
            label="Full name"
            type="text"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Jane Smith"
            required
            maxLength={200}
          />
          <Field
            label="Birth year or date"
            type="text"
            value={birthDateText}
            onChange={setBirthDateText}
            placeholder="1952 or 14 March 1952"
            maxLength={100}
            optional
          />
          <Field
            label="One sentence about you"
            type="text"
            value={essenceLine}
            onChange={setEssenceLine}
            placeholder="Beekeeper, father of four, maker of great bread."
            maxLength={255}
            optional
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Adding…" : "Add to tree →"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPersonPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <Suspense fallback={<p className="text-sm text-stone-400">Loading…</p>}>
        <OnboardingPersonForm />
      </Suspense>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  optional,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  optional?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">
        {label}{" "}
        {optional && (
          <span className="font-normal text-stone-400">(optional)</span>
        )}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
      />
    </label>
  );
}
