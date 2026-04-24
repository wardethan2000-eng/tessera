"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = "";

type PendingInvite = {
  id: string;
  treeId: string;
  treeName: string;
  invitedByName: string;
  invitedByEmail: string | null;
};

function extractTokenFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // not a URL
  }
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

export default function OnboardingWelcomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/auth/signin");
      return;
    }
    if (!session) return;

    let cancelled = false;
    void (async () => {
      try {
        const [treesRes, invitesRes] = await Promise.all([
          fetch(`${API}/api/trees`, { credentials: "include" }),
          fetch(`${API}/api/me/invitations`, { credentials: "include" }),
        ]);
        if (cancelled) return;

        if (treesRes.ok) {
          const trees = (await treesRes.json()) as Array<{ id: string }>;
          if (trees.length > 0) {
            router.replace("/");
            return;
          }
        }

        if (invitesRes.ok) {
          const invites = (await invitesRes.json()) as PendingInvite[];
          if (!cancelled) setPendingInvites(invites);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, isPending, router]);

  const email = session?.user?.email ?? "";

  const handlePasteInvite = useMemo(
    () => (event: React.FormEvent) => {
      event.preventDefault();
      const token = extractTokenFromInput(inviteInput);
      if (!token) {
        setInviteError(
          "That doesn't look like an invitation link. Paste the full URL from your email.",
        );
        return;
      }
      router.push(`/invitations/accept?token=${encodeURIComponent(token)}`);
    },
    [inviteInput, router],
  );

  if (isPending || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-sm text-stone-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Welcome to Tessera</p>
          <h1 className="text-3xl font-semibold text-stone-900">How do you want to begin?</h1>
          <p className="text-sm text-stone-500">
            A family archive is something you either start or are welcomed into.
          </p>
        </div>

        {pendingInvites.length > 0 && (
          <section className="rounded-2xl border border-emerald-300/60 bg-emerald-50/70 p-5 shadow-sm space-y-3">
            <p className="text-xs uppercase tracking-widest text-emerald-800/80">
              You have a pending invitation
            </p>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <p key={invite.id} className="text-sm text-stone-800">
                  <strong>{invite.invitedByName}</strong> invited you to{" "}
                  <em>{invite.treeName}</em>.
                </p>
              ))}
            </div>
            <p className="text-xs text-stone-600">
              Open your email and click the accept link — it was sent to{" "}
              <span className="font-medium">{email}</span>.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-stone-900">I was invited</h2>
            <p className="text-sm text-stone-500">
              Check your inbox ({email}) for an email from whoever invited you, and click the
              accept link. If you lost the email, paste the invitation link below.
            </p>
          </div>
          {!showInviteInput ? (
            <button
              type="button"
              onClick={() => setShowInviteInput(true)}
              className="text-sm font-medium text-stone-700 underline"
            >
              I have a link — paste it
            </button>
          ) : (
            <form onSubmit={handlePasteInvite} className="space-y-3">
              <input
                type="text"
                value={inviteInput}
                onChange={(event) => {
                  setInviteInput(event.target.value);
                  setInviteError("");
                }}
                placeholder="Paste your invitation link or token"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
              {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
              <button
                type="submit"
                className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
              >
                Continue →
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-stone-900">Start a new archive</h2>
            <p className="text-sm text-stone-500">
              You&apos;ll name the archive, add yourself, add one relative, and share a first
              memory. Takes a few minutes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            Start a new archive →
          </button>
        </section>
      </div>
    </main>
  );
}
