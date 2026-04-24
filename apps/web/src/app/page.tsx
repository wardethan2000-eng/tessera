"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { readLastOpenedTreeId } from "@/lib/last-opened-tree";

const API = "";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace("/auth/signin");
      return;
    }
    // Route through the last-opened tree when possible so the dashboard and
    // Home feel like one continuous entry system. Also surface pending
    // invitations so new relatives aren't silently dropped into the wrong tree.
    Promise.all([
      fetch(`${API}/api/trees`, { credentials: "include" }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/api/me/invitations`, { credentials: "include" }).then((r) => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([trees, invitations]) => {
        const hasInvites = Array.isArray(invitations) && invitations.length > 0;
        if (Array.isArray(trees) && trees.length > 0) {
          if (hasInvites) {
            router.replace("/dashboard");
            return;
          }
          const lastOpenedTreeId = readLastOpenedTreeId();
          const matchingLastTree = lastOpenedTreeId
            ? trees.find((tree) => tree.id === lastOpenedTreeId)
            : null;

          if (matchingLastTree) {
            router.replace(`/trees/${matchingLastTree.id}/home`);
            return;
          }

          if (trees.length === 1) {
            router.replace(`/trees/${trees[0].id}/home`);
            return;
          }

          router.replace("/dashboard");
        } else {
          router.replace("/onboarding/welcome");
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
