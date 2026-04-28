"use client";

import { useEffect, useRef, useState } from "react";
import {
  countElderQueue,
  drainAllElderQueues,
} from "@/lib/elder-offline-queue";

export function ElderQueuePill({ token }: { token?: string }) {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [sent, setSent] = useState(0);
  const autoAttemptKey = useRef("");

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      countElderQueue().then((n) => {
        if (!cancelled) setCount(n);
      });
    };
    tick();
    const id = window.setInterval(tick, 4000);
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!online || count === 0 || retrying) return;
    const key = `${token ?? "all"}:${count}`;
    if (autoAttemptKey.current === key) return;
    autoAttemptKey.current = key;
    let cancelled = false;
    setRetrying(true);
    drainAllElderQueues(token)
      .then((n) => {
        if (!cancelled) {
          setSent(n);
          return countElderQueue().then(setCount);
        }
      })
      .finally(() => {
        if (!cancelled) setRetrying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [count, online, retrying, token]);

  async function retryNow() {
    if (retrying) return;
    setRetrying(true);
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "DRAIN_ELDER_SUBMIT_QUEUE",
        });
      }
      const n = await drainAllElderQueues(token);
      setSent(n);
      setCount(await countElderQueue());
    } finally {
      setRetrying(false);
    }
  }

  if (count === 0 && online) return null;
  const message = !online
    ? count > 0
      ? `${count} memory waiting. It will send when the phone is back online.`
      : "This phone is offline. You can still write a memory; photos and voice need internet to send."
    : retrying
      ? "Sending saved memories now..."
      : count > 0
        ? `${count} memory waiting to send.`
        : sent > 0
          ? "Saved memories were sent."
          : "";

  return (
    <div
      style={{
        background: "#EDE6D6",
        color: "#403A2E",
        padding: "14px 16px",
        borderRadius: 12,
        fontSize: 17,
        lineHeight: 1.45,
        margin: "0",
        border: "1px solid #D7CDB6",
        fontFamily: "var(--font-ui)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <strong style={{ fontWeight: 700 }}>{message}</strong>
      {online && count > 0 && (
        <button
          type="button"
          onClick={() => void retryNow()}
          disabled={retrying}
          style={{
            border: "none",
            borderRadius: 10,
            background: "#4E5D42",
            color: "#F6F1E7",
            fontFamily: "var(--font-ui)",
            fontSize: 17,
            fontWeight: 700,
            padding: "12px 14px",
            cursor: retrying ? "wait" : "pointer",
          }}
        >
          {retrying ? "Sending..." : "Try sending now"}
        </button>
      )}
    </div>
  );
}
