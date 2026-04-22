"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/auth-api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const errorParam = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(errorParam ? decodeURIComponent(errorParam) : "");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: err } = await authApi.resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Could not reset password. The link may be expired.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/auth/signin"), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-stone-400">Tessera</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Choose a new password
          </h1>
        </div>

        {!token ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            Missing reset token. Please request a new link.
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm space-y-2">
            <p className="text-stone-700">Password reset. Redirecting to sign in…</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-stone-700">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-stone-700">Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Set new password"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-stone-50" />
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
