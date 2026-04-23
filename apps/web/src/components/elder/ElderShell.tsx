"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchInbox } from "@/lib/elder-api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function ElderShell({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const [familyLabel, setFamilyLabel] = useState<string | null>(null);
  useEffect(() => {
    fetchInbox(token)
      .then((i) => setFamilyLabel(i.familyLabel))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const created: HTMLElement[] = [];
    const add = (el: HTMLElement) => {
      document.head.appendChild(el);
      created.push(el);
    };

    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = `/elder/${encodeURIComponent(token)}/manifest.webmanifest`;
    add(manifestLink);

    for (const size of ["180", "192", "512"]) {
      const apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      apple.setAttribute("sizes", `${size}x${size}`);
      apple.href =
        size === "180" ? "/elder-icon-apple-180.png" : `/elder-icon-${size}.png`;
      add(apple);
    }

    const metas: Array<[string, string]> = [
      ["apple-mobile-web-app-capable", "yes"],
      ["mobile-web-app-capable", "yes"],
      ["apple-mobile-web-app-status-bar-style", "default"],
      ["theme-color", "#4E5D42"],
    ];
    if (familyLabel) {
      metas.push(["apple-mobile-web-app-title", familyLabel.slice(0, 24)]);
    }
    for (const [name, content] of metas) {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      add(m);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/elder-sw.js", { scope: "/elder/" })
        .catch(() => {});
    }

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      const key = `elder-pwa-ping:${token}`;
      const lastPing = Number(window.localStorage.getItem(key) ?? 0);
      if (Date.now() - lastPing > 24 * 60 * 60 * 1000) {
        fetch(`${API}/api/elder/${encodeURIComponent(token)}/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ standalone: true }),
        })
          .then(() => window.localStorage.setItem(key, String(Date.now())))
          .catch(() => {});
      }
    }

    return () => {
      for (const el of created) el.remove();
    };
  }, [token, familyLabel]);

  return <>{children}</>;
}
