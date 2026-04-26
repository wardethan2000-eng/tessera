"use client";

import { useChromecast } from "@/hooks/useChromecast";

export function DriftCastControls() {
  const {
    state,
    advance,
    stepBack,
    togglePlayPause,
    stopDrift,
  } = useChromecast();

  if (!state.isConnected) return null;

  const memory = state.receiverState?.currentMemory;
  const person = state.receiverState?.currentItem;
  const isPlaying = state.receiverState?.isPlaying ?? false;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.9)",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "inherit",
        color: "#e8e4df",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#4a7c59",
            display: "inline-block",
          }}
        />
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Casting to {state.deviceName ?? "TV"}
        </span>
      </div>

      <button
        onClick={stepBack}
        aria-label="Previous"
        style={{
          background: "none",
          border: "none",
          color: "#e8e4df",
          cursor: "pointer",
          padding: 8,
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ◀
      </button>

      <button
        onClick={togglePlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
        style={{
          background: "none",
          border: "none",
          color: "#e8e4df",
          cursor: "pointer",
          padding: 8,
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>

      <button
        onClick={advance}
        aria-label="Next"
        style={{
          background: "none",
          border: "none",
          color: "#e8e4df",
          cursor: "pointer",
          padding: 8,
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ▶
      </button>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {memory && (
          <>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {memory.title}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {person?.personName ?? ""}
              {memory.dateOfEventText ? ` · ${memory.dateOfEventText}` : ""}
            </div>
          </>
        )}
      </div>

      {state.receiverState && (
        <span style={{ fontSize: 11, opacity: 0.5, flexShrink: 0 }}>
          {state.receiverState.currentIndex + 1}/{state.receiverState.totalItems}
        </span>
      )}

      <button
        onClick={stopDrift}
        aria-label="Stop casting"
        style={{
          background: "none",
          border: "none",
          color: "#e8e4df",
          cursor: "pointer",
          padding: 8,
          fontSize: 12,
          opacity: 0.7,
        }}
      >
        Stop
      </button>
    </div>
  );
}