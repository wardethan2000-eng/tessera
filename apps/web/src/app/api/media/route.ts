import { NextRequest } from "next/server";

const API_BASE = (process.env.API_PROXY_URL || "http://localhost:4000").replace(
  /\/$/,
  "",
);

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return Response.json({ error: "Missing media key" }, { status: 400 });
  }

  const forwardHeaders: Record<string, string> = {
    Accept: request.headers.get("accept") ?? "*/*",
  };

  const cookie = request.headers.get("cookie");
  if (cookie) forwardHeaders["Cookie"] = cookie;

  const range = request.headers.get("range");
  if (range) forwardHeaders["Range"] = range;

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) forwardHeaders["If-None-Match"] = ifNoneMatch;

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince) forwardHeaders["If-Modified-Since"] = ifModifiedSince;

  const upstream = await fetch(`${API_BASE}/api/media?${request.nextUrl.searchParams.toString()}`, {
    headers: forwardHeaders,
    cache: "no-store",
    redirect: "manual",
  });

  if (upstream.status === 304) {
    return new Response(null, { status: 304, headers: upstream.headers });
  }

  const headers = new Headers();
  for (const name of [
    "accept-ranges",
    "cache-control",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
    "vary",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}