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

  return null;
}