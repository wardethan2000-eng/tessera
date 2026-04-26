declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean, reason?: string) => void;
    chrome?: {
      cast?: {
        AutoJoinPolicy: {
          ORIGIN_SCOPED: string;
          TAB_AND_ORIGIN_SCOPED: string;
          PAGE_SCOPED: string;
        };
        media?: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        };
      };
    };
    cast?: {
      framework?: {
        CastContext: {
          getInstance(): CastContextInstance;
          SessionState: {
            SESSION_STARTED: string;
            SESSION_RESUMED: string;
            SESSION_ENDED: string;
            NO_SESSION: string;
          };
          CastState: {
            CONNECTED: string;
            NOT_CONNECTED: string;
            NO_DEVICES_AVAILABLE: string;
          };
        };
        RemotePlayer: new () => RemotePlayerInstance;
        RemotePlayerController: new (player: RemotePlayerInstance) => RemotePlayerControllerInstance;
        RemotePlayerEventType: {
          IS_CONNECTED_CHANGED: string;
          CURRENT_TIME_CHANGED: string;
          DURATION_CHANGED: string;
          VOLUME_LEVEL_CHANGED: string;
          IS_PAUSED_CHANGED: string;
          ANY_CHANGE: string;
        };
      };
    };
  }
}

export interface CastContextInstance {
  setOptions(options: CastOptions): void;
  getCurrentSession(): CastSessionInstance | null;
  addEventListener(eventType: string, callback: (event: CastStateEvent) => void): void;
  removeEventListener(eventType: string, callback: (event: CastStateEvent) => void): void;
  requestSession(): Promise<CastSessionInstance>;
  getCastState(): string;
}

export interface CastOptions {
  receiverApplicationId: string;
  autoJoinPolicy?: string;
}

export interface CastSessionInstance {
  getSessionId(): string;
  getCastDevice(): { friendlyName: string };
  loadMedia(request: unknown): Promise<void>;
  sendMessage(namespace: string, message: string): Promise<void>;
  endSession(stopCasting: boolean): Promise<void>;
  addListener(eventType: string, callback: (event: unknown) => void): void;
}

export interface RemotePlayerInstance {
  isConnected: boolean;
  currentTime: number;
  duration: number;
  volumeLevel: number;
  isPaused: boolean;
}

export interface RemotePlayerControllerInstance {
  addEventListener(eventType: string, callback: (event: unknown) => void): void;
  removeEventListener(eventType: string, callback: (event: unknown) => void): void;
  playOrPause(): void;
  stop(): void;
  seek(): void;
  setVolumeLevel(level: number): void;
  muteOrUnmute(): void;
}

export interface CastStateEvent {
  sessionState: string;
  castState: string;
}

let sdkLoaded = false;
let sdkLoading: Promise<void> | null = null;

export async function loadCastSdk(): Promise<void> {
  if (sdkLoaded) return;
  if (sdkLoading) return sdkLoading;

  sdkLoading = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Cast SDK not available in server environment"));
      return;
    }

    const existing = window.cast?.framework?.CastContext;
    if (existing) {
      sdkLoaded = true;
      resolve();
      return;
    }

    window.__onGCastApiAvailable = (isAvailable: boolean, reason?: string) => {
      if (isAvailable && window.cast?.framework) {
        sdkLoaded = true;
        resolve();
      } else {
        reject(new Error(`Cast SDK not available: ${reason ?? "unknown"}`));
      }
    };

    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Cast SDK script"));
    document.head.appendChild(script);
  });

  return sdkLoading;
}

export function isCastSdkAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.cast?.framework?.CastContext);
}