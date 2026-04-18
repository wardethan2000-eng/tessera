"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending) {
      router.replace(session ? "/dashboard" : "/auth/signin");
    }
  }, [session, isPending, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50">
      <p className="text-sm text-stone-400">Loading…</p>
    </main>
  );
}
