"use client";

import { use, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { fetchInbox, type ElderInbox } from "@/lib/elder-api";
import { getProxiedMediaUrl } from "@/lib/media-url";
import { ElderQueuePill } from "@/components/elder/ElderQueuePill";

export default function ElderLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [inbox, setInbox] = useState<ElderInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    fetchInbox(token).then(setInbox).catch((e: Error) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isStandalone =
      "standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isIOS && !isStandalone) {
      const dismissed = window.localStorage.getItem(`elder-install-nudge:${token}`);
      if (!dismissed) {
        window.setTimeout(() => setShowInstall(true), 0);
      }
    }
  }, [token]);

  if (error) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={headlineStyle}>Link unavailable</h1>
          <p style={leadStyle}>{error}</p>
        </div>
      </main>
    );
  }

  if (!inbox) {
    return (
      <main style={pageStyle}>
        <p style={hintStyle}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <p style={greetingStyle}>Hello, {inbox.displayName.split(" ")[0]}.</p>
          <h1 style={familyTitleStyle}>{inbox.familyLabel}</h1>
        </header>

        <ElderQueuePill token={token} />

        {showInstall && (
          <div style={installNudgeStyle}>
            <p style={installTitleStyle}>Put this button on your phone.</p>
            <p style={installCopyStyle}>
              It makes sharing a photo or voice note one tap from your home
              screen.
            </p>
            <Link
              href={`/elder/${encodeURIComponent(token)}/install`}
              style={installButtonStyle}
            >
              Show me how
            </Link>
            <button
              onClick={() => {
                window.localStorage.setItem(
                  `elder-install-nudge:${token}`,
                  "1",
                );
                setShowInstall(false);
              }}
              style={dismissButtonStyle}
            >
              Not now
            </button>
          </div>
        )}

        {inbox.pendingPrompts.length > 0 && (
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Questions for you</h2>
            <div style={promptListStyle}>
              {inbox.pendingPrompts.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  href={`/elder/${encodeURIComponent(token)}/reply/${encodeURIComponent(p.id)}`}
                  style={promptCardStyle}
                >
                  <p style={promptFromStyle}>{p.fromName} asked:</p>
                  <p style={promptTextStyle}>{p.questionText}</p>
                  <span style={promptArrowStyle}>Answer →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link
          href={`/elder/${encodeURIComponent(token)}/compose`}
          style={bigCtaStyle}
        >
          <span>Send a photo, voice note, or story</span>
        </Link>

        <Link
          href={`/elder/${encodeURIComponent(token)}/install`}
          style={secondaryCtaStyle}
        >
          Add this to my phone
        </Link>

        {inbox.recent.length > 0 && (
          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>You recently shared</h2>
            <div style={recentRowStyle}>
              {inbox.recent.map((r) => {
                const url = getProxiedMediaUrl(r.mediaUrl);
                return (
                  <div key={r.id} style={recentItemStyle}>
                    {url && r.mimeType?.startsWith("image/") ? (
                      <img src={url} alt={r.title} style={recentImgStyle} />
                    ) : (
                      <div style={recentPlaceholderStyle}>
                        {r.kind === "voice" ? "🎤" : r.kind === "story" ? "✎" : "📎"}
                      </div>
                    )}
                    <p style={recentTitleStyle}>{r.title}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p style={footerStyle}>
          This link is private to {inbox.email}. Do not share it.
        </p>
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
  gap: 24,
};
const headerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  paddingTop: 8,
};
const greetingStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 16,
  color: "var(--ink-faded)",
};
const familyTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  fontSize: 30,
  lineHeight: 1.2,
};
const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-faded)",
};
const promptListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const promptCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "16px 18px",
  borderRadius: 12,
  border: "1px solid var(--rule)",
  background: "var(--paper-deep)",
  color: "var(--ink)",
  textDecoration: "none",
};
const promptFromStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-soft)",
};
const promptTextStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 20,
  lineHeight: 1.3,
};
const promptArrowStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--moss)",
  marginTop: 4,
};
const bigCtaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "30px 22px",
  borderRadius: 14,
  background: "var(--moss)",
  color: "#fff",
  textDecoration: "none",
  fontFamily: "var(--font-ui)",
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1.2,
  textAlign: "center",
};
const secondaryCtaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px 18px",
  borderRadius: 14,
  border: "2px solid var(--rule)",
  background: "var(--paper-deep)",
  color: "var(--ink-soft)",
  textDecoration: "none",
  fontFamily: "var(--font-ui)",
  fontSize: 20,
  fontWeight: 800,
};
const recentRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};
const recentItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const recentImgStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid var(--rule)",
};
const recentPlaceholderStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "var(--paper-deep)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 28,
};
const recentTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-soft)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const installNudgeStyle: CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  padding: "18px 16px",
  fontFamily: "var(--font-ui)",
  fontSize: 17,
  color: "var(--ink-soft)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const installTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 20,
  fontWeight: 800,
  color: "var(--ink)",
};
const installCopyStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 17,
  lineHeight: 1.45,
  color: "var(--ink-soft)",
};
const installButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  background: "var(--moss)",
  color: "#fff",
  textDecoration: "none",
  fontFamily: "var(--font-ui)",
  fontSize: 19,
  fontWeight: 800,
  padding: "16px 18px",
};
const dismissButtonStyle: CSSProperties = {
  alignSelf: "flex-end",
  background: "transparent",
  border: "none",
  color: "var(--moss)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  cursor: "pointer",
  padding: 0,
};
const footerStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-faded)",
  textAlign: "center",
};
const cardStyle: CSSProperties = {
  width: "min(640px, 100%)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 14,
  padding: "32px 28px",
};
const headlineStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 28,
  fontWeight: 400,
};
const leadStyle: CSSProperties = {
  margin: "8px 0 0",
  fontFamily: "var(--font-body)",
  fontSize: 17,
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};
const hintStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-faded)",
};
