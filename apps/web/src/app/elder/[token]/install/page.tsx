"use client";

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Platform = "ios" | "android" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Chrome|Edg|Brave|Firefox|Safari/.test(ua)) return "desktop";
  return "other";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function ElderInstallPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installNow() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    setInstalled(isStandalone());
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Link href={`/elder/${encodeURIComponent(token)}`} style={backLinkStyle}>
          Back
        </Link>

        <header style={headerStyle}>
          <p style={eyebrowStyle}>One tap from your phone</p>
          <h1 style={titleStyle}>Add this memory button to your home screen</h1>
          <p style={leadStyle}>
            After this, you can open Tessera like an app and send a photo,
            voice note, or story without finding the link again.
          </p>
        </header>

        {installed ? (
          <section style={successCardStyle}>
            <h2 style={sectionTitleStyle}>It is already installed.</h2>
            <p style={copyStyle}>
              Open Tessera from your home screen whenever you want to send a
              memory.
            </p>
            <Link href={`/elder/${encodeURIComponent(token)}/compose`} style={primaryLinkStyle}>
              Send a memory now
            </Link>
          </section>
        ) : installPrompt ? (
          <section style={stepCardStyle}>
            <h2 style={sectionTitleStyle}>Tap this button first.</h2>
            <p style={copyStyle}>
              Your browser can install this memory page for you.
            </p>
            <button type="button" onClick={() => void installNow()} style={primaryButtonStyle}>
              Add to my phone
            </button>
          </section>
        ) : platform === "ios" ? (
          <IosSteps />
        ) : platform === "android" ? (
          <AndroidSteps />
        ) : (
          <DesktopSteps />
        )}

        <section style={tipCardStyle}>
          <h2 style={sectionTitleStyle}>What it does</h2>
          <div style={simpleGridStyle}>
            <div style={simpleItemStyle}>Send a photo</div>
            <div style={simpleItemStyle}>Record your voice</div>
            <div style={simpleItemStyle}>Write a few words</div>
          </div>
          <p style={copyStyle}>
            This page is private to you. It only sends memories to the family
            archive.
          </p>
        </section>
      </div>
    </main>
  );
}

function IosSteps() {
  return (
    <section style={stepCardStyle}>
      <h2 style={sectionTitleStyle}>On iPhone or iPad</h2>
      <Step number="1" title="Open this page in Safari." detail="If you are in another browser, copy the link and open Safari." />
      <Step number="2" title="Tap the Share button." detail="It is the square with an arrow at the bottom of Safari." />
      <Step number="3" title="Tap Add to Home Screen." detail="You may need to scroll down in the Share menu." />
      <Step number="4" title="Tap Add." detail="Tessera will appear like an app on your home screen." />
    </section>
  );
}

function AndroidSteps() {
  return (
    <section style={stepCardStyle}>
      <h2 style={sectionTitleStyle}>On Android</h2>
      <Step number="1" title="Open this page in Chrome." detail="Chrome usually shows an install button automatically." />
      <Step number="2" title="Open the Chrome menu." detail="Tap the three dots in the top corner if no install button appears." />
      <Step number="3" title="Tap Install app." detail="It may also say Add to Home screen." />
      <Step number="4" title="Open Tessera from your home screen." detail="Use it any time you want to send a memory." />
    </section>
  );
}

function DesktopSteps() {
  return (
    <section style={stepCardStyle}>
      <h2 style={sectionTitleStyle}>On a computer</h2>
      <Step number="1" title="Look near the address bar." detail="Chrome and Edge may show an install icon." />
      <Step number="2" title="Choose Install." detail="The memory page will open in its own window." />
      <Step number="3" title="Use your phone for photos." detail="This tool is simplest from a phone camera." />
    </section>
  );
}

function Step({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <div style={stepStyle}>
      <div style={numberStyle}>{number}</div>
      <div>
        <p style={stepTitleStyle}>{title}</p>
        <p style={stepDetailStyle}>{detail}</p>
      </div>
    </div>
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
const headerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 15,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-faded)",
};
const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 36,
  fontWeight: 400,
  lineHeight: 1.1,
};
const leadStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 21,
  lineHeight: 1.55,
  color: "var(--ink-soft)",
};
const stepCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 16,
  padding: "22px 18px",
};
const successCardStyle: CSSProperties = {
  ...stepCardStyle,
  borderColor: "var(--moss)",
};
const tipCardStyle: CSSProperties = {
  ...stepCardStyle,
  gap: 14,
};
const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 27,
  fontWeight: 400,
  lineHeight: 1.2,
};
const copyStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 18,
  lineHeight: 1.5,
  color: "var(--ink-soft)",
};
const stepStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "54px 1fr",
  gap: 14,
  alignItems: "start",
};
const numberStyle: CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: "50%",
  background: "var(--moss)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-ui)",
  fontSize: 24,
  fontWeight: 800,
};
const stepTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontFamily: "var(--font-ui)",
  fontSize: 21,
  fontWeight: 800,
  lineHeight: 1.25,
  color: "var(--ink)",
};
const stepDetailStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 17,
  lineHeight: 1.45,
  color: "var(--ink-soft)",
};
const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 14,
  background: "var(--moss)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 22,
  fontWeight: 800,
  padding: "20px 18px",
  cursor: "pointer",
};
const primaryLinkStyle: CSSProperties = {
  ...primaryButtonStyle,
  display: "flex",
  justifyContent: "center",
  textDecoration: "none",
};
const simpleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
};
const simpleItemStyle: CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 12,
  background: "var(--paper)",
  padding: "16px 14px",
  fontFamily: "var(--font-ui)",
  fontSize: 19,
  fontWeight: 800,
  color: "var(--ink-soft)",
};
