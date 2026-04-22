"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authApi } from "@/lib/auth-api";

type Status = "pending" | "success" | "error";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");

  const [status, setStatus] = useState<Status>("pending");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (errorParam) {
      setStatus("error");
      setMessage(decodeURIComponent(errorParam));
      return;
    }
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    async function verify() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/verify-email?token=${encodeURIComponent(token as string)}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? "Verification failed.");
        }
        setStatus("success");
        setMessage("Your email has been verified.");
        setTimeout(() => router.push("/account"), 1500);
      } catch (err) {
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Verification link is invalid or has expired."
        );
      }
    }
    verify();
  }, [token, errorParam, router]);

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  async function handleResend() {
    const session = await authClient.getSession();
    const email = session.data?.user?.email;
    if (!email) {
      router.push("/auth/signin");
      return;
    }
    setResending(true);
    await authApi.sendVerificationEmail({
      email,
      callbackURL: "/account",
    });
    setResending(false);
    setResent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-400">Tessera</p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">Email verification</h1>
        </div>
        <div
          className={`rounded-2xl border p-6 shadow-sm ${
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : status === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-stone-200 bg-white text-stone-700"
          }`}
        >
          <p>{message}</p>
          {status === "error" && (
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resent}
                className="w-full rounded-xl bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {resent ? "Sent — check your inbox" : resending ? "Sending…" : "Resend verification email"}
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-stone-500">
          <Link href="/" className="text-stone-900 underline underline-offset-2">
            Return home
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-stone-50" />
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
