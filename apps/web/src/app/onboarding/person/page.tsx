"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { readOnboardingSession, writeOnboardingSession } from "@/lib/onboarding-session";

const API = getApiBase();

function OnboardingPersonForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const treeId = searchParams.get("treeId");

  const { data: session, isPending } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [birthDateText, setBirthDateText] = useState("");
  const [essenceLine, setEssenceLine] = useState("");
  const [formError, setFormError] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [loading, setLoading] = useState(false);
  // Re-entry guard: true if self was already created this session
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [checkingIdentity, setCheckingIdentity] = useState(true);
  const [bootstrappingIdentity, setBootstrappingIdentity] = useState(false);
  const [identityConflict, setIdentityConflict] = useState<
    Array<{ id: string; displayName: string; scopeTreeIds: string[] }>
  >([]);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
    if (!isPending && !treeId) router.replace("/onboarding");
    if (!isPending && session) {
      const saved = readOnboardingSession();
      if (saved.selfPersonId && treeId) {
        setAlreadyDone(true);
        setCheckingIdentity(false);
        return;
      }

      void (async () => {
        try {
          const identityRes = await fetch(`${API}/api/me/identity`, {
            credentials: "include",
          });
          if (!identityRes.ok) {
            setIdentityError("Could not check your account identity. Please try again.");
            setCheckingIdentity(false);
            return;
          }

          const identity = (await identityRes.json()) as {
            status: "unclaimed" | "claimed" | "conflict";
            claimedPeople?: Array<{
              id: string;
              displayName: string;
              scopeTreeIds?: string[];
            }>;
          };

          if (identity.status === "conflict") {
            setIdentityConflict(
              (identity.claimedPeople ?? []).map((person) => ({
                id: person.id,
                displayName: person.displayName,
                scopeTreeIds: person.scopeTreeIds ?? [],
              })),
            );
            setCheckingIdentity(false);
            return;
          }

          if (identity.status === "claimed") {
            setBootstrappingIdentity(true);

            const bootstrapRes = await fetch(
              `${API}/api/trees/${treeId}/identity/bootstrap`,
              {
                method: "POST",
                credentials: "include",
              },
            );

            if (!bootstrapRes.ok) {
              const data = (await bootstrapRes.json().catch(() => ({}))) as {
                error?: string;
                claimedPeople?: Array<{
                  id: string;
                  displayName: string;
                  scopeTreeIds?: string[];
                }>;
              };
              setIdentityError(
                data.error ?? "Could not reuse your existing identity in this tree.",
              );
              if (bootstrapRes.status === 409) {
                setIdentityConflict(
                  (data.claimedPeople ?? []).map((person) => ({
                    id: person.id,
                    displayName: person.displayName,
                    scopeTreeIds: person.scopeTreeIds ?? [],
                  })),
                );
              }
              setBootstrappingIdentity(false);
              setCheckingIdentity(false);
              return;
            }

            const bootstrap = (await bootstrapRes.json()) as {
              status: "claimed" | "unclaimed";
              person: { id: string } | null;
            };

            if (bootstrap.status === "claimed" && bootstrap.person?.id) {
              writeOnboardingSession({ selfPersonId: bootstrap.person.id });
              router.replace(
                `/onboarding/relative?treeId=${treeId}&selfPersonId=${bootstrap.person.id}`,
              );
              return;
            }
          }

          setCheckingIdentity(false);
          setBootstrappingIdentity(false);
        } catch {
          setIdentityError("Could not check your account identity. Please try again.");
          setCheckingIdentity(false);
          setBootstrappingIdentity(false);
        }
      })();
    }
  }, [session, isPending, treeId, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setFormError(data.error ?? "Failed to add person. Please try again.");
        return;
      }
      const person = await res.json().catch(() => ({})) as { id?: string };
      if (!person.id) {
        setFormError("Unexpected response — please try again.");
        return;
      }
      writeOnboardingSession({ selfPersonId: person.id });
      router.push(`/onboarding/relative?treeId=${treeId}&selfPersonId=${person.id}`);
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isPending || !session) {
    return <p className="text-sm text-stone-400">Loading…</p>;
  }

  if (checkingIdentity || bootstrappingIdentity) {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Step 2 of 4</p>
          <h1 className="text-2xl font-semibold text-stone-900">
            {bootstrappingIdentity ? "Reusing your identity" : "Checking your account"}
          </h1>
          <p className="text-sm text-stone-500">
            {bootstrappingIdentity
              ? "Adding your existing person record to this new tree."
              : "Looking for an existing claimed person before creating a new one."}
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-stone-400">
            {bootstrappingIdentity ? "Bootstrapping…" : "Checking…"}
          </p>
        </div>
      </div>
    );
  }

  if (identityError) {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Step 2 of 4</p>
          <h1 className="text-2xl font-semibold text-stone-900">
            Identity check failed
          </h1>
          <p className="text-sm text-stone-500">
            We could not safely determine whether you already exist in another tree.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <p className="text-sm text-red-600">{identityError}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Re-entry: person was already created this session
  if (alreadyDone) {
    const saved = readOnboardingSession();
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Step 2 of 4</p>
          <h1 className="text-2xl font-semibold text-stone-900">You&apos;re in the tree</h1>
          <p className="text-sm text-stone-500">You already added yourself. Continue to the next step.</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <button
            onClick={() => router.push(`/onboarding/relative?treeId=${treeId}&selfPersonId=${saved.selfPersonId}`)}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  if (identityConflict.length > 0) {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Step 2 of 4</p>
          <h1 className="text-2xl font-semibold text-stone-900">
            Resolve your identity first
          </h1>
          <p className="text-sm text-stone-500">
            This account is already linked to multiple people. We need that cleaned
            up before adding you to another tree.
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            {identityConflict.map((person) => (
              <div
                key={person.id}
                className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
              >
                <p className="text-sm font-medium text-stone-800">{person.displayName}</p>
                <p className="mt-1 text-xs text-stone-500">
                  In trees:{" "}
                  {person.scopeTreeIds.length > 0
                    ? person.scopeTreeIds.join(", ")
                    : "unknown"}
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Step 2 of 4</p>
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
          {formError && <p className="text-sm text-red-600">{formError}</p>}
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
