"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastOpenedTreeId } from "@/lib/last-opened-tree";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const lastTreeId = readLastOpenedTreeId();
    if (lastTreeId) {
      router.replace(`/trees/${lastTreeId}/home`);
    } else {
      router.replace("/onboarding/welcome");
    }
  }, [router]);

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
        Opening your archives…
      </p>
    </main>
  );
}