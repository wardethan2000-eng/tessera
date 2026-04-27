import { loadCastSdk, isCastSdkAvailable } from "./cast-types";
export { loadCastSdk, isCastSdkAvailable } from "./cast-types";
import type {
  CastContextInstance,
  CastOptions,
  CastSessionInstance,
} from "./cast-types";

const CAST_NAMESPACE = "urn:x-cast:com.tessera.drift";
const CAST_APP_ID = process.env.NEXT_PUBLIC_CAST_APP_ID ?? "992F4393";

export type DriftFilter = {
  mode?: "remembrance" | "corkboard";
  personId?: string;
  yearStart?: number;
  yearEnd?: number;
};

export type CastDriftState = {
  currentIndex: number;
  totalItems: number;
  isPlaying: boolean;
  currentMemory: {
    id: string;
    title: string;
    kind: string;
    dateOfEventText: string | null;
  } | null;
  currentItem: {
    personName: string;
    portraitUrl: string | null;
  } | null;
};

export type CastHookState = {
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  receiverState: CastDriftState | null;
  castToken: string | null;
  deviceName: string | null;
  error: string | null;
};

type CastMessage =
  | { type: "START_DRIFT"; treeId: string; filter: DriftFilter | null; castToken: string; apiBase: string }
  | { type: "ADVANCE" }
  | { type: "STEP_BACK" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "JUMP_TO"; index: number }
  | { type: "MUTE"; muted: boolean }
  | { type: "CHANGE_FILTER"; filter: DriftFilter }
  | { type: "STOP_DRIFT" };

let castContext: CastContextInstance | null = null;

export async function requestSession(): Promise<CastSessionInstance> {
  await loadCastSdk();
  if (!castContext) {
    castContext = window.cast!.framework!.CastContext.getInstance();
    const options: CastOptions = {
      receiverApplicationId: CAST_APP_ID || (window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? ""),
      autoJoinPolicy: window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED ?? "origin_scoped",
    };
    castContext.setOptions(options);
  }
  return castContext.requestSession();
}

export function getCastContext(): CastContextInstance | null {
  if (!isCastSdkAvailable()) return null;
  return window.cast!.framework!.CastContext.getInstance();
}

export function getSession(): CastSessionInstance | null {
  const ctx = getCastContext();
  return ctx?.getCurrentSession() ?? null;
}

export function getCastState(): string {
  const ctx = getCastContext();
  return ctx?.getCastState() ?? "NO_DEVICES_AVAILABLE";
}

export function sendMessage(message: CastMessage): void {
  const session = getSession();
  if (!session) throw new Error("No active Cast session");
  session.sendMessage(CAST_NAMESPACE, JSON.stringify(message));
}

export function endSession(stopCasting = true): void {
  const session = getSession();
  if (session) {
    session.endSession(stopCasting);
  }
}

export function addSessionListener(
  callback: (event: { sessionState: string }) => void,
): () => void {
  const ctx = getCastContext();
  if (!ctx) return () => {};
  ctx.addEventListener("sessionstatechanged", callback);
  return () => {
    ctx.removeEventListener("sessionstatechanged", callback);
  };
}

export function addMessageListener(
  onMessage: (data: CastDriftState) => void,
): () => void {
  const session = getSession();
  if (!session) return () => {};
  const handler = (namespace: string, message: string) => {
    if (namespace !== CAST_NAMESPACE) return;
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === "DRIFT_STATE") {
        onMessage(parsed as CastDriftState);
      }
    } catch {
      // ignore malformed messages
    }
  };
  session.addListener("message", handler as (event: unknown) => void);
  return () => {
    // Note: no removeListener in Cast SDK; best-effort cleanup
  };
}

export async function generateCastToken(treeId: string): Promise<string> {
  const apiBase = getApiBaseForCast();
  const res = await fetch(`${apiBase}/api/auth/cast-token`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ treeId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to generate cast token: ${res.status}`);
  }
  const data = await res.json();
  return data.token as string;
}

export function getApiBaseForCast(): string {
  if (typeof window === "undefined") return "";
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const { hostname, protocol } = window.location;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.endsWith(".local")
  ) {
    return `${protocol}//${hostname}:4000`;
  }
  return "";
}

export { CAST_NAMESPACE, CAST_APP_ID };