"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Dashboard error:", error);
  return (
    <div style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}>Could not load archives</h2>
      <pre style={{ fontSize: 12, overflow: "auto" }}>{error.message}</pre>
      <button type="button" onClick={() => reset()}>Try again</button>
    </div>
  );
}