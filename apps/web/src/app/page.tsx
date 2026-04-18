"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/auth/signin");
      return;
    }
    // Redirect to the user's first tree canvas
    fetch(`${API}/api/trees`, { credentials: "include" })
      .then((r) => r.json())
      .then((trees) => {
        if (Array.isArray(trees) && trees.length > 0) {
          router.replace(`/trees/${trees[0].id}/atrium`);
        } else {
          router.replace("/onboarding");
        }
      })
      .catch(() => router.replace("/dashboard"));
  }, [session, isPending, router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
        }}
      >
        Loading…
      </p>
    </main>
  );
}
