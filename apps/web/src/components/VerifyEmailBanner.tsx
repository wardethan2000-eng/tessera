"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { authApi } from "@/lib/auth-api";

const HIDDEN_PREFIXES = ["/auth", "/invitations/accept"];

export function VerifyEmailBanner() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (isPending) return null;
  if (!session?.user) return null;
  if (session.user.emailVerified) return null;
  if (dismissed) return null;
  if (pathname && HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  async function handleResend() {
    if (!session?.user?.email) return;
    setStatus("sending");
    setError("");
    const { error: err } = await authApi.sendVerificationEmail({
      email: session.user.email,
      callbackURL: "/account",
    });
    if (err) {
      setStatus("error");
      setError(err.message ?? "Could not send verification email.");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <p>
          {status === "sent"
            ? `Verification email sent to ${session.user.email}. Check your inbox.`
            : status === "error"
              ? error || "Could not send verification email."
              : `Please verify your email address (${session.user.email}) to secure your account.`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={status === "sending" || status === "sent"}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {status === "sending"
              ? "Sending…"
              : status === "sent"
                ? "Sent"
                : "Resend email"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="rounded-lg px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
