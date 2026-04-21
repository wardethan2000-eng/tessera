"use client";

export type VoiceRecorderStage =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "paused"
  | "recorded"
  | "unsupported"
  | "error";

type MediaRecorderSupport = {
  isTypeSupported?: (mimeType: string) => boolean;
};

export type VoiceRecordingSupportState =
  | {
      supported: true;
      reason: null;
    }
  | {
      supported: false;
      reason: "secure_context_required" | "unsupported_browser";
    };

export type VoiceTranscriptRefreshItem = {
  id: string;
  kind: string;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
};

export const PREFERRED_AUDIO_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export function getVoiceRecordingSupportState(options: {
  hasWindow: boolean;
  hasNavigator: boolean;
  hasMediaRecorder: boolean;
  hasGetUserMedia: boolean;
  isSecureContext: boolean;
}): VoiceRecordingSupportState {
  if (
    !options.hasWindow ||
    !options.hasNavigator ||
    !options.hasMediaRecorder ||
    !options.hasGetUserMedia
  ) {
    return {
      supported: false,
      reason: options.hasWindow && options.hasNavigator && !options.isSecureContext
        ? "secure_context_required"
        : "unsupported_browser",
    };
  }

  if (!options.isSecureContext) {
    return {
      supported: false,
      reason: "secure_context_required",
    };
  }

  return {
    supported: true,
    reason: null,
  };
}

export function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType?.toLowerCase().split(";")[0] ?? "").trim();
}

export function getPreferredAudioRecordingMimeType(
  mediaRecorderSupport: MediaRecorderSupport | null | undefined,
): string | null {
  const isTypeSupported = mediaRecorderSupport?.isTypeSupported;
  if (typeof isTypeSupported !== "function") {
    return null;
  }

  for (const mimeType of PREFERRED_AUDIO_RECORDING_MIME_TYPES) {
    if (isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

export function getAudioFileExtension(mimeType: string | null | undefined): string {
  switch (normalizeMimeType(mimeType)) {
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
      return "wav";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/webm":
    default:
      return "webm";
  }
}

export function createRecordedAudioFile(
  blob: Blob,
  options?: {
    baseName?: string;
    mimeType?: string | null;
    timestamp?: Date;
  },
): File {
  const mimeType = normalizeMimeType(options?.mimeType ?? blob.type) || "audio/webm";
  const extension = getAudioFileExtension(mimeType);
  const timestamp = (options?.timestamp ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const baseName = (options?.baseName?.trim() || "voice-note")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return new File([blob], `${baseName || "voice-note"}-${timestamp}.${extension}`, {
    type: mimeType,
    lastModified: options?.timestamp?.getTime() ?? Date.now(),
  });
}

export function hasPendingVoiceTranscriptions(
  items: VoiceTranscriptRefreshItem[],
): boolean {
  return items.some(
    (item) =>
      item.kind === "voice" &&
      (item.transcriptStatus === "queued" || item.transcriptStatus === "processing"),
  );
}
