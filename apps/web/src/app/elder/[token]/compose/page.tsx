"use client";

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ElderComposer } from "@/components/elder/ElderComposer";
import { ElderQueuePill } from "@/components/elder/ElderQueuePill";

export default function ElderComposePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  const [sharedFile, setSharedFile] = useState<File | null>(null);
  const initialText = useMemo(() => {
    const parts = [
      searchParams.get("title"),
      searchParams.get("text"),
      searchParams.get("url"),
    ].filter(Boolean);
    return parts.join("\n\n") || null;
  }, [searchParams]);

  useEffect(() => {
    // Web Share Target POSTs to this URL with FormData; capture via launch queue
    // when supported, otherwise look for query string title/text.
    const w = window as Window & {
      launchQueue?: { setConsumer: (cb: (params: unknown) => void) => void };
    };
    if (w.launchQueue) {
      try {
        w.launchQueue.setConsumer((p) => {
          const launchParams = p as { files?: FileSystemFileHandle[] };
          if (launchParams.files && launchParams.files.length) {
            launchParams.files[0]!
              .getFile()
              .then((f) => setSharedFile(f))
              .catch(() => {});
          }
        });
      } catch {}
    }
  }, []);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Link href={`/elder/${encodeURIComponent(token)}`} style={backLinkStyle}>
          Back
        </Link>
        <ElderQueuePill token={token} />
        <ElderComposer token={token} initialFile={sharedFile} initialBody={initialText} />
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  color: "var(--ink)",
  padding: "24px 16px calc(80px + env(safe-area-inset-bottom))",
  display: "flex",
  justifyContent: "center",
};
const containerStyle: CSSProperties = {
  width: "min(640px, 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 18,
};
const backLinkStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 18,
  color: "var(--ink-soft)",
  textDecoration: "none",
  padding: "8px 0",
};
