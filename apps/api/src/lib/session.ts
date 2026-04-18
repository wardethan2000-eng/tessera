import type { IncomingHttpHeaders } from "node:http";
import { auth } from "./auth.js";

function toWebHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function getSession(nodeHeaders: IncomingHttpHeaders) {
  return auth.api.getSession({ headers: toWebHeaders(nodeHeaders) });
}
