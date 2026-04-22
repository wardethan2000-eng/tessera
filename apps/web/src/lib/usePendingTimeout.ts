"use client";

import { useEffect, useState } from "react";

export function usePendingTimeout(pending: boolean, timeoutMs = 10000) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!pending) {
      setTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [pending, timeoutMs]);

  return timedOut;
}
