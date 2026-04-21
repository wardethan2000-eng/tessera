"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createRecordedAudioFile,
  getPreferredAudioRecordingMimeType,
  type VoiceRecorderStage,
} from "@/lib/voice-recording";

type VoiceRecorderFieldProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  baseName?: string;
};

export function VoiceRecorderField({
  value,
  onChange,
  disabled = false,
  baseName = "voice-note",
}: VoiceRecorderFieldProps) {
  const [supportChecked, setSupportChecked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [stage, setStage] = useState<VoiceRecorderStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedIntervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    setIsSupported(supported);
    setSupportChecked(true);
    if (!supported) {
      setStage("unsupported");
    }
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const syncElapsedTime = useCallback(() => {
    if (startedAtRef.current === null) {
      setDurationMs(accumulatedMsRef.current);
      return;
    }

    setDurationMs(accumulatedMsRef.current + (performance.now() - startedAtRef.current));
  }, []);

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    startedAtRef.current = performance.now();
    syncElapsedTime();
    elapsedIntervalRef.current = window.setInterval(syncElapsedTime, 250);
  }, [stopElapsedTimer, syncElapsedTime]);

  const pauseElapsedTimer = useCallback(() => {
    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    stopElapsedTimer();
    setDurationMs(accumulatedMsRef.current);
  }, [stopElapsedTimer]);

  const resetElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    startedAtRef.current = null;
    accumulatedMsRef.current = 0;
    setDurationMs(0);
  }, [stopElapsedTimer]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearPreviewUrl = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const clearRecorder = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopStream();
    stopElapsedTimer();
    startedAtRef.current = null;
  }, [stopElapsedTimer, stopStream]);

  useEffect(() => {
    if (!value) {
      clearPreviewUrl();
      if (stage === "recorded") {
        setStage(isSupported ? "idle" : "unsupported");
        resetElapsedTimer();
      }
      return;
    }

    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(value);
    });

    if (stage !== "recording" && stage !== "paused") {
      setStage("recorded");
    }
  }, [clearPreviewUrl, isSupported, resetElapsedTimer, stage, value]);

  useEffect(() => {
    return () => {
      clearPreviewUrl();
      clearRecorder();
    };
  }, [clearPreviewUrl, clearRecorder]);

  const formattedDuration = useMemo(() => {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }, [durationMs]);

  const handleStartRecording = useCallback(async () => {
    if (disabled || !isSupported) {
      return;
    }

    clearPreviewUrl();
    clearRecorder();
    resetElapsedTimer();
    onChange(null);
    setError(null);
    setStage("requesting_permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredAudioRecordingMimeType(MediaRecorder);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        pauseElapsedTimer();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        const file = createRecordedAudioFile(blob, {
          baseName,
          mimeType: recorder.mimeType || mimeType || blob.type,
        });
        onChange(file);
        setStage("recorded");
        clearRecorder();
      });

      recorder.start();
      startElapsedTimer();
      setStage("recording");
    } catch (err) {
      clearRecorder();
      setStage("error");
      setError(
        err instanceof Error
          ? err.message
          : "Microphone access failed. You can upload an audio file instead.",
      );
    }
  }, [
    baseName,
    clearPreviewUrl,
    clearRecorder,
    disabled,
    isSupported,
    onChange,
    pauseElapsedTimer,
    resetElapsedTimer,
    startElapsedTimer,
  ]);

  const handlePauseResume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || disabled) {
      return;
    }

    if (recorder.state === "recording") {
      recorder.pause();
      pauseElapsedTimer();
      setStage("paused");
      return;
    }

    if (recorder.state === "paused") {
      recorder.resume();
      startElapsedTimer();
      setStage("recording");
    }
  }, [disabled, pauseElapsedTimer, startElapsedTimer]);

  const handleStopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || disabled || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  }, [disabled]);

  const handleDiscard = useCallback(() => {
    clearPreviewUrl();
    clearRecorder();
    resetElapsedTimer();
    setError(null);
    setStage(isSupported ? "idle" : "unsupported");
    onChange(null);
  }, [clearPreviewUrl, clearRecorder, isSupported, onChange, resetElapsedTimer]);

  if (!supportChecked) {
    return (
      <div style={containerStyle}>
        <p style={supportTextStyle}>Checking microphone support…</p>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div style={containerStyle}>
        <p style={supportTextStyle}>
          This browser does not support in-browser audio recording here. Upload an
          audio file instead.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={statusRowStyle}>
        <span style={statusLabelStyle}>
          {stage === "recording"
            ? "Recording"
            : stage === "paused"
            ? "Paused"
            : value
            ? "Recording ready"
            : "Ready to record"}
        </span>
        <span style={durationStyle}>{formattedDuration}</span>
      </div>

      <div style={buttonRowStyle}>
        {(stage === "idle" || stage === "recorded" || stage === "error") && (
          <button
            type="button"
            onClick={() => void handleStartRecording()}
            disabled={disabled}
            style={primaryButtonStyle}
          >
            {value ? "Record again" : "Start recording"}
          </button>
        )}

        {(stage === "recording" || stage === "paused") && (
          <>
            <button
              type="button"
              onClick={handlePauseResume}
              disabled={disabled}
              style={secondaryButtonStyle}
            >
              {stage === "recording" ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={handleStopRecording}
              disabled={disabled}
              style={primaryButtonStyle}
            >
              Stop
            </button>
          </>
        )}

        {value && stage !== "recording" && stage !== "paused" && (
          <button
            type="button"
            onClick={handleDiscard}
            disabled={disabled}
            style={secondaryButtonStyle}
          >
            Discard
          </button>
        )}
      </div>

      {previewUrl && (
        <audio controls src={previewUrl} style={audioStyle}>
          Your browser does not support audio playback.
        </audio>
      )}

      <p style={helpTextStyle}>
        Record a voice note in the browser, review it, then save it with the
        memory. If microphone access fails, upload a file instead.
      </p>

      {error && <p style={errorTextStyle}>{error}</p>}
    </div>
  );
}

const containerStyle: CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 8,
  padding: "14px 14px 12px",
  background: "var(--paper-deep)",
};

const statusRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
};

const statusLabelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-soft)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const durationStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-faded)",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 7,
  padding: "8px 14px",
  background: "var(--moss)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 7,
  padding: "8px 14px",
  background: "var(--paper)",
  color: "var(--ink-faded)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cursor: "pointer",
};

const helpTextStyle: CSSProperties = {
  margin: "10px 0 0",
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-faded)",
  lineHeight: 1.45,
};

const supportTextStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-faded)",
  lineHeight: 1.5,
};

const audioStyle: CSSProperties = {
  width: "100%",
  marginTop: 12,
};

const errorTextStyle: CSSProperties = {
  margin: "10px 0 0",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "#8B2F2F",
  lineHeight: 1.45,
};
