"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 560, border: "1px solid var(--rule)", borderRadius: 12, padding: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 12px" }}>
          Something went wrong
        </h1>
        <pre style={{ fontFamily: "monospace", fontSize: 12, overflow: "auto", maxHeight: 300, background: "#f5f0e8", padding: 12, borderRadius: 8 }}>
          {error.message}
          {"\n"}
          {error.stack}
        </pre>
        <button type="button" onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
          Try again
        </button>
      </div>
    </main>
  );
}