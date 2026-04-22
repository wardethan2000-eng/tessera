"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/auth-api";

function ForgotPasswordContent() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await authApi.forgetPassword({
      email,
      redirectTo: "/auth/reset-password",
    });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Could not send reset email.");
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-stone-400">Tessera</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Reset your password
          </h1>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm space-y-2">
            <p className="text-stone-700">
              If an account exists for <strong>{email}</strong>, a reset link
              has been sent.
            </p>
            <p className="text-sm text-stone-500">The link expires in 1 hour.</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4"
          >
            <p className="text-sm text-stone-600">
              Enter the email you signed up with and we&apos;ll send you a link
              to choose a new password.
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-stone-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-stone-500">
          <Link
            href="/auth/signin"
            className="text-stone-900 underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-stone-50" />
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
