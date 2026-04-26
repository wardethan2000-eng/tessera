"use client";

import { useChromecast } from "@/hooks/useChromecast";

export function CastButton() {
  const { state, connect, disconnect } = useChromecast();

  if (!state.isAvailable) return null;

  const handleCast = () => {
    if (state.isConnected) {
      disconnect();
    } else if (!state.isConnecting) {
      connect();
    }
  };

  return (
    <button
      onClick={handleCast}
      disabled={state.isConnecting}
      aria-label={state.isConnected ? `Disconnect from ${state.deviceName ?? "TV"}` : "Cast to TV"}
      title={
        state.isConnected
          ? `Connected to ${state.deviceName ?? "TV"}`
          : state.isConnecting
            ? "Connecting..."
            : "Cast to TV"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "none",
        background: state.isConnected ? "var(--moss, #4a7c59)" : "transparent",
        color: state.isConnected ? "white" : "var(--ink-faded, #888)",
        cursor: state.isConnecting ? "wait" : "pointer",
        transition: "background 0.2s, color 0.2s",
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        {state.isConnected ? (
          <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.92-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
        ) : (
          <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.92-11-11-11z" />
        )}
      </svg>
    </button>
  );
}