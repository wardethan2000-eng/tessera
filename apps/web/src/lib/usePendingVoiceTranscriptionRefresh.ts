"use client";

import { useEffect, useMemo, useRef } from "react";
import { type VoiceTranscriptRefreshItem } from "@/lib/voice-recording";

type UsePendingVoiceTranscriptionRefreshOptions = {
  items: VoiceTranscriptRefreshItem[];
  refresh: () => Promise<void> | void;
  enabled?: boolean;
  intervalMs?: number;
  maxDurationMs?: number;
};

export function usePendingVoiceTranscriptionRefresh({
  items,
  refresh,
  enabled = true,
  intervalMs = 5_000,
  maxDurationMs = 2 * 60_000,
}: UsePendingVoiceTranscriptionRefreshOptions): void {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const pendingKey = useMemo(() => {
    return items
      .filter(
        (item) =>
          item.kind === "voice" &&
          (item.transcriptStatus === "queued" || item.transcriptStatus === "processing"),
      )
      .map((item) => `${item.id}:${item.transcriptStatus}`)
      .sort()
      .join("|");
  }, [items]);
  const hasPending = pendingKey.length > 0;

  useEffect(() => {
    if (!enabled || !hasPending) {
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (Date.now() - startedAt >= maxDurationMs) {
        window.clearInterval(intervalId);
        return;
      }

      void refreshRef.current();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, hasPending, intervalMs, maxDurationMs, pendingKey]);
}
