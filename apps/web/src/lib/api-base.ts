/**
 * Returns the API base URL for the current environment.
 *
 * On the public site (tessera.family), returns "" so all API calls become
 * relative and are proxied by the Next.js rewrite to localhost:4000.
 *
 * On the local network or development, returns NEXT_PUBLIC_API_URL if set,
 * otherwise falls back to the origin of the current page if it looks like a
 * local development server, or empty string as a final fallback.
 *
 * Safe to call on both server and client.
 */
export function getApiBase(): string {
  if (typeof window === "undefined") return "";

  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const { hostname } = window.location;

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.endsWith(".local")
  ) {
    return `${window.location.protocol}//${hostname}:4000`;
  }

  return "";
}