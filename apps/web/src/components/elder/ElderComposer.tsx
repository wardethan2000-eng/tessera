"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { VoiceRecorderField } from "@/components/tree/VoiceRecorderField";
import { queueElderCapture } from "@/lib/elder-offline-queue";
import {
  presignElderUpload,
  submitElderMemory,
  uploadFileToPresigned,
  type ElderSubmitInput,
} from "@/lib/elder-api";

type Mode = "photo" | "voice" | "story";

const DRAFT_PREFIX = "tessera-elder-draft:";

export interface ElderComposerProps {
  token: string;
  promptId?: string;
  questionText?: string | null;
  subjectName?: string | null;
  initialFile?: File | null;
  initialBody?: string | null;
  onSubmitted?: (memory: { id: string; mediaUrl: string | null; kind: string }) => void;
}

function modeFromFile(file: File | null | undefined): Mode {
  if (!file) return "photo";
  if (file.type.startsWith("audio/")) return "voice";
  return "photo";
}

export function ElderComposer({
  token,
  promptId,
  questionText,
  subjectName,
  initialFile,
  initialBody,
  onSubmitted,
}: ElderComposerProps) {
  const [mode, setMode] = useState<Mode>(modeFromFile(initialFile));
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [body, setBody] = useState(initialBody ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mediaUrl: string | null; kind: string } | null>(null);
  const [queued, setQueued] = useState(false);

  const draftKey = useMemo(
    () => `${DRAFT_PREFIX}${token}:${promptId ?? "compose"}`,
    [token, promptId],
  );

  useEffect(() => {
    if (!initialFile) return;
    const id = window.setTimeout(() => {
      setFile(initialFile);
      setMode(modeFromFile(initialFile));
    }, 0);
    return () => window.clearTimeout(id);
  }, [initialFile]);

  useEffect(() => {
    if (!initialBody) return;
    const id = window.setTimeout(() => {
      setBody(initialBody);
      if (!initialFile) setMode("story");
    }, 0);
    return () => window.clearTimeout(id);
  }, [initialBody, initialFile]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(draftKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { body?: string; mode?: Mode };
        if (parsed.body) setBody(parsed.body);
        if (
          !initialFile &&
          (parsed.mode === "photo" || parsed.mode === "voice" || parsed.mode === "story")
        ) {
          setMode(parsed.mode);
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, [draftKey, initialFile]);

  useEffect(() => {
    if (done || queued) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ body, mode }));
    } catch {}
  }, [draftKey, body, mode, done, queued]);

  const queueForLater = useCallback(
    async (input: ElderSubmitInput) => {
      await queueElderCapture({
        token,
        promptId,
        input,
        files: file
          ? [
              {
                name: file.name,
                type: file.type,
                size: file.size,
                blob: file,
              },
            ]
          : [],
      });
      try {
        window.localStorage.removeItem(draftKey);
      } catch {}
      setQueued(true);
    },
    [draftKey, file, promptId, token],
  );

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      const needsFile = mode === "voice" || mode === "photo";
      if (needsFile && !file) {
        setSubmitError(
          mode === "voice"
            ? "Please record your voice first."
            : "Please choose a photo or video first.",
        );
        return;
      }
      if (mode === "story" && !body.trim()) {
        setSubmitError("Please type a few words first.");
        return;
      }

      const input: ElderSubmitInput = {
        kind: mode,
        body: body.trim() || undefined,
      };

      setSubmitting(true);
      try {
        const mediaIds: string[] = [];
        if (needsFile && file) {
          const { mediaId, uploadUrl } = await presignElderUpload(token, file);
          await uploadFileToPresigned(file, uploadUrl);
          mediaIds.push(mediaId);
        }

        const result = (await submitElderMemory(
          token,
          {
            ...input,
            mediaIds: mediaIds.length ? mediaIds : undefined,
          },
          promptId,
        )) as
          | { id: string; mediaUrl: string | null; kind: string }
          | { queued: true };

        try {
          window.localStorage.removeItem(draftKey);
        } catch {}

        if ("queued" in result) {
          setQueued(true);
          return;
        }

        const submittedResult = result as {
          id: string;
          mediaUrl: string | null;
          kind: string;
        };
        setDone({ mediaUrl: submittedResult.mediaUrl, kind: submittedResult.kind });
        onSubmitted?.(submittedResult);
      } catch (err) {
        if (file || !navigator.onLine) {
          try {
            await queueForLater(input);
            return;
          } catch {
            // Fall through to show the send error.
          }
        }
        setSubmitError(
          err instanceof Error ? err.message : "This did not send. Please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [body, draftKey, file, mode, onSubmitted, promptId, queueForLater, token],
  );

  if (done) {
    return (
      <div style={cardStyle}>
        <div style={checkStyle}>Saved</div>
        <h2 style={headlineStyle}>Your memory was sent.</h2>
        <p style={leadStyle}>The family will see it soon.</p>
        {done.mediaUrl && done.kind === "photo" && (
          <img
            src={done.mediaUrl}
            alt="What you sent"
            style={{ marginTop: 12, maxWidth: "100%", borderRadius: 12 }}
          />
        )}
      </div>
    );
  }

  if (queued) {
    return (
      <div style={cardStyle}>
        <div style={checkStyle}>Saved</div>
        <h2 style={headlineStyle}>This will send when the phone is online.</h2>
        <p style={leadStyle}>
          You can close this page. Tessera saved it on this phone and will try
          again automatically.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={cardStyle}>
      {questionText ? (
        <>
          <p style={topMetaStyle}>
            {subjectName ? `About ${subjectName}` : "Your reply"}
          </p>
          <h1 style={questionStyle}>{questionText}</h1>
        </>
      ) : (
        <div>
          <h1 style={questionStyle}>Send something to the family</h1>
          <p style={{ ...leadStyle, marginTop: 8 }}>
            A photo, a voice note, or a few written words is enough.
          </p>
        </div>
      )}

      <div style={modeRowStyle} role="tablist" aria-label="Choose what to send">
        <ModeButton
          active={mode === "photo"}
          onClick={() => {
            setMode("photo");
            setFile(null);
          }}
          label="Send a photo"
          helper="Choose a picture or video"
        />
        <ModeButton
          active={mode === "voice"}
          onClick={() => {
            setMode("voice");
            setFile(null);
          }}
          label="Record my voice"
          helper="Say a memory out loud"
        />
        <ModeButton
          active={mode === "story"}
          onClick={() => {
            setMode("story");
            setFile(null);
          }}
          label="Write words"
          helper="Type a short memory"
        />
      </div>

      {mode === "voice" && (
        <div style={primaryFieldStyle}>
          <VoiceRecorderField value={file} onChange={setFile} large />
          <p style={hintStyle}>Tap Start recording. Speak for as long as you like.</p>
        </div>
      )}

      {mode === "story" && (
        <div style={primaryFieldStyle}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write whatever comes to mind..."
            style={bigTextAreaStyle}
            autoFocus
          />
          <p style={hintStyle}>Any length is fine.</p>
        </div>
      )}

      {mode === "photo" && (
        <div style={primaryFieldStyle}>
          <label style={photoDropStyle}>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
            <span style={photoDropIconStyle}>Photo</span>
            <span style={photoDropLabelStyle}>
              {file ? file.name : "Tap to choose a photo or video"}
            </span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a note if you want..."
            style={smallTextAreaStyle}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          ...primaryButtonStyle,
          opacity: submitting ? 0.6 : 1,
          cursor: submitting ? "wait" : "pointer",
        }}
      >
        {submitting ? "Sending..." : promptId ? "Send my reply" : "Send this memory"}
      </button>
      {submitError && <p style={errorStyle}>{submitError}</p>}
      <p style={hintStyle}>
        This private page sends to the family archive. Nothing is public.
      </p>
    </form>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  helper,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  helper: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{ ...modeButtonStyle, ...(active ? modeButtonActiveStyle : null) }}
    >
      <span>{label}</span>
      <small style={modeHelperStyle}>{helper}</small>
    </button>
  );
}

const cardStyle: CSSProperties = {
  width: "min(640px, 100%)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 14,
  padding: "30px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};
const topMetaStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 15,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-faded)",
};
const questionStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 31,
  fontWeight: 400,
  lineHeight: 1.25,
  color: "var(--ink)",
};
const headlineStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 31,
  fontWeight: 400,
};
const leadStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 20,
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};
const modeRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};
const modeButtonStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 5,
  padding: "22px 18px",
  border: "2px solid var(--rule)",
  borderRadius: 14,
  background: "var(--paper)",
  color: "var(--ink-soft)",
  fontFamily: "var(--font-ui)",
  fontSize: 21,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};
const modeButtonActiveStyle: CSSProperties = {
  background: "var(--moss)",
  color: "#fff",
  borderColor: "var(--moss)",
};
const modeHelperStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  opacity: 0.86,
  lineHeight: 1.35,
};
const primaryFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const bigTextAreaStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  padding: "16px 14px",
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: 21,
  lineHeight: 1.55,
  resize: "vertical",
  minHeight: 210,
};
const smallTextAreaStyle: CSSProperties = {
  ...bigTextAreaStyle,
  fontSize: 18,
  minHeight: 96,
};
const photoDropStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "42px 18px",
  border: "3px dashed var(--rule)",
  borderRadius: 14,
  background: "var(--paper)",
  cursor: "pointer",
  textAlign: "center",
};
const photoDropIconStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1,
};
const photoDropLabelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 21,
  fontWeight: 700,
  color: "var(--ink-soft)",
};
const primaryButtonStyle: CSSProperties = {
  marginTop: 6,
  border: "none",
  borderRadius: 12,
  padding: "22px 20px",
  background: "var(--moss)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 22,
  fontWeight: 800,
  cursor: "pointer",
};
const errorStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 17,
  color: "#8B2F2F",
};
const hintStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 16,
  color: "var(--ink-faded)",
  lineHeight: 1.5,
};
const checkStyle: CSSProperties = {
  minWidth: 76,
  alignSelf: "flex-start",
  borderRadius: 999,
  background: "var(--moss)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  fontSize: 20,
  fontFamily: "var(--font-ui)",
  fontWeight: 800,
};
