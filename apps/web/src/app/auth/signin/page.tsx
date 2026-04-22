"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const afterAuth = inviteToken
    ? `/invitations/accept?token=${encodeURIComponent(inviteToken)}`
    : "/";

  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await signIn.email({
      email,
      password,
      callbackURL: afterAuth,
    });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Sign in failed. Check your email and password.");
      return;
    }
    router.push(afterAuth);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await signIn.magicLink({
      email,
      callbackURL: afterAuth,
    });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Failed to send magic link.");
      return;
    }
    setMagicSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-stone-400">Tessera</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">Sign in</h1>
        </div>

        {magicSent ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <p className="text-stone-700">
              Check your inbox — a sign-in link is on its way to{" "}
              <strong>{email}</strong>.
            </p>
            <p className="mt-2 text-sm text-stone-400">
              In development, check Mailpit at your data VM on port 8025.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex rounded-xl bg-stone-100 p-1 gap-1">
              {(["password", "magic"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                    mode === m
                      ? "bg-white shadow-sm text-stone-900"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  {m === "password" ? "Password" : "Magic link"}
                </button>
              ))}
            </div>

            {mode === "password" ? (
              <form onSubmit={handlePasswordSignIn} className="space-y-4">
                <Field label="Email" type="email" value={email} onChange={setEmail} />
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <SubmitButton loading={loading} label="Sign in" loadingLabel="Signing in…" />
                <p className="text-right text-xs">
                  <Link
                    href="/auth/forgot-password"
                    className="text-stone-500 hover:text-stone-900 underline underline-offset-2"
                  >
                    Forgot password?
                  </Link>
                </p>
              </form>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <Field label="Email" type="email" value={email} onChange={setEmail} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <SubmitButton
                  loading={loading}
                  label="Send magic link"
                  loadingLabel="Sending…"
                />
              </form>
            )}
          </div>
        )}

        <p className="text-center text-sm text-stone-500">
          New here?{" "}
          <Link
            href={inviteToken ? `/auth/signup?invite=${encodeURIComponent(inviteToken)}` : "/auth/signup"}
            className="text-stone-900 underline underline-offset-2"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-stone-50" />}>
      <SignInContent />
    </Suspense>
  );
}


function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
      />
    </label>
  );
}

function SubmitButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
