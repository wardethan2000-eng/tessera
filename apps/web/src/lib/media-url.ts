"use client";

export function getProxiedMediaUrl(mediaUrl?: string | null): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("/api/media?")) return mediaUrl;
  const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
  const mediaPrefix = `${API_BASE}/api/media?`;
  if (mediaUrl.startsWith(mediaPrefix)) {
    return mediaUrl.slice(API_BASE.length);
  }
  return mediaUrl;
}

export function handleMediaError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  img.style.display = "none";
  if (img.parentElement) {
    img.parentElement.style.background = "var(--paper-deep)";
  }
}