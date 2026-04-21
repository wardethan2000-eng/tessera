"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { VoiceRecorderField } from "@/components/tree/VoiceRecorderField";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

interface PromptReplyDetails {
  promptId: string;
  treeId: string;
  treeName: string;
  questionText: string;
  toPersonName: string | null;
  fromUserName: string;
  email: string;
  expiresAt: string;
}

interface SubmittedReplyMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  body?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
}

function getVoiceTranscriptLabel(memory: SubmittedReplyMemory | null): string | null {
  if (!memory || memory.kind !== "voice") return null;
  if (memory.transcriptStatus === "completed" && memory.transcriptText) {
    return memory.transcriptText;
  }
  if (memory.transcriptStatus === "completed") {
    return "Transcript unavailable.";
  }
  if (memory.transcriptStatus === "failed") {
    return memory.transcriptError ?? "Transcription failed.";
  }
  if (memory.transcriptStatus === "queued" || memory.transcriptStatus === "processing") {
    return "Transcribing…";
  }
  return null;
}

export default function PromptReplyPage() {
  return (
    <Suspense fallback={<main style={pageStyle}><p style={smallTextStyle}>Loading…</p></main>}>
      <PromptReplyContent />
    </Suspense>
  );
}

function PromptReplyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [details, setDetails] = useState<PromptReplyDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<MemoryKind>("story");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dateOfEventText, setDateOfEventText] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [voiceInputMode, setVoiceInputMode] = useState<"upload" | "record">("upload");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedMemory, setSubmittedMemory] = useState<SubmittedReplyMemory | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("No reply token provided.");
      setLoading(false);
      return;
    }

    fetch(`${API}/api/prompt-replies/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Reply link not available");
        }
        return res.json();
      })
      .then((data: PromptReplyDetails) => {
        setDetails(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [token]);

  const needsFile = kind === "photo" || kind === "voice" || kind === "document";
  const usingVoiceRecorder = kind === "voice" && voiceInputMode === "record";

  const acceptedFileType = useMemo(() => {
    if (kind === "photo") return "image/*";
    if (kind === "voice") return "audio/*";
    if (kind === "document") return ".pdf,.doc,.docx,application/pdf,application/msword";
    return undefined;
  }, [kind]);

  const refreshSubmittedMemory = useCallback(async () => {
    if (!token || !submittedMemory?.id) return;

    const res = await fetch(
      `${API}/api/prompt-replies/${encodeURIComponent(token)}/reply-status?memoryId=${encodeURIComponent(submittedMemory.id)}`,
    );
    if (res.ok) {
      setSubmittedMemory((await res.json()) as SubmittedReplyMemory);
    }
  }, [submittedMemory?.id, token]);

  usePendingVoiceTranscriptionRefresh({
    items: submittedMemory ? [submittedMemory] : [],
    refresh: refreshSubmittedMemory,
    enabled: submitted && !!submittedMemory,
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !details) return;
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError("Please add a title.");
      return;
    }
    if (kind === "story" && !body.trim()) {
      setSubmitError("Stories need some text.");
      return;
    }
    if (needsFile && !file) {
      setSubmitError("Please upload a file for this reply.");
      return;
    }

    setSubmitting(true);
    try {
      let mediaId: string | undefined;

      if (needsFile && file) {
        const presignRes = await fetch(
          `${API}/api/prompt-replies/${encodeURIComponent(token)}/media/presign`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size,
            }),
          },
        );
        if (!presignRes.ok) {
          const err = (await presignRes.json()) as { error?: string };
          throw new Error(err.error ?? "Could not prepare upload");
        }
        const data = (await presignRes.json()) as { mediaId: string; uploadUrl: string };
        mediaId = data.mediaId;

        const uploadRes = await fetch(data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
        if (!uploadRes.ok) {
          throw new Error("Upload failed");
        }
      }

      const res = await fetch(`${API}/api/prompt-replies/${encodeURIComponent(token)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          body: body.trim() || undefined,
          dateOfEventText: dateOfEventText.trim() || undefined,
          submitterName: submitterName.trim() || undefined,
          mediaId,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Could not submit reply");
      }

      setSubmittedMemory((await res.json()) as SubmittedReplyMemory);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit reply");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={smallTextStyle}>Loading reply link…</p>
      </main>
    );
  }

  if (loadError || !details) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Reply link unavailable</h1>
          <p style={bodyStyle}>{loadError ?? "This link is not available."}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    const transcriptLabel = getVoiceTranscriptLabel(submittedMemory);
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Thank you</h1>
          <p style={bodyStyle}>
            Your reply has been added to <em>{details.treeName}</em>.
          </p>
          {submittedMemory?.kind === "voice" && (
            <div style={submissionDetailStyle}>
              {submittedMemory.mediaUrl && (
                <audio controls src={submittedMemory.mediaUrl} style={{ width: "100%" }}>
                  Your browser does not support audio playback.
                </audio>
              )}
              <div style={transcriptCardStyle}>
                <div style={transcriptLabelStyle}>Transcript</div>
                <div style={transcriptBodyStyle}>
                  {transcriptLabel ?? "Your recording was saved."}
                </div>
                {submittedMemory.transcriptLanguage &&
                  submittedMemory.transcriptStatus === "completed" && (
                    <div style={transcriptMetaStyle}>
                      Language: {submittedMemory.transcriptLanguage}
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={formCardStyle}>
        <p style={smallTextStyle}>
          Private reply for <strong>{details.treeName}</strong>
        </p>
        <h1 style={headingStyle}>{details.fromUserName} asked:</h1>
        <blockquote style={quoteStyle}>{details.questionText}</blockquote>
        <p style={smallTextStyle}>
          For {details.toPersonName ?? "your family member"} · Link expires{" "}
          {new Date(details.expiresAt).toLocaleDateString()}
        </p>

        <label style={labelStyle}>
          Your name (optional)
          <input
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            maxLength={200}
            style={inputStyle}
            placeholder="How should this be credited?"
          />
        </label>

        <label style={labelStyle}>
          Reply type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as MemoryKind);
              setFile(null);
              setVoiceInputMode("upload");
            }}
            style={inputStyle}
          >
            <option value="story">Story</option>
            <option value="photo">Photo</option>
            <option value="voice">Voice note</option>
            <option value="document">Document</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label style={labelStyle}>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            style={inputStyle}
            placeholder="Give this memory a short title"
          />
        </label>

        <label style={labelStyle}>
          Approximate date (optional)
          <input
            value={dateOfEventText}
            onChange={(e) => setDateOfEventText(e.target.value)}
            maxLength={100}
            style={inputStyle}
            placeholder="e.g. Summer 1978"
          />
        </label>

        {kind === "story" && (
          <label style={labelStyle}>
            Story
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              required
              style={textAreaStyle}
              placeholder="Share the memory in your own words"
            />
          </label>
        )}

        {kind === "voice" && needsFile && (
          <div style={labelStyle}>
            Voice source
            <div style={toggleGroupStyle}>
              <button
                type="button"
                onClick={() => {
                  setVoiceInputMode("record");
                  setFile(null);
                }}
                style={{
                  ...toggleButtonStyle,
                  ...(voiceInputMode === "record" ? toggleButtonActiveStyle : null),
                }}
              >
                Record in browser
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoiceInputMode("upload");
                  setFile(null);
                }}
                style={{
                  ...toggleButtonStyle,
                  ...(voiceInputMode === "upload" ? toggleButtonActiveStyle : null),
                }}
              >
                Upload file
              </button>
            </div>
          </div>
        )}

        {needsFile && !usingVoiceRecorder && (
          <label style={labelStyle}>
            Upload file
            <input
              type="file"
              accept={acceptedFileType}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              style={inputStyle}
            />
          </label>
        )}

        {usingVoiceRecorder && (
          <div style={labelStyle}>
            Recording
            <VoiceRecorderField value={file} onChange={setFile} />
          </div>
        )}

        {submitError && (
          <p style={{ ...smallTextStyle, color: "#8B2F2F" }}>{submitError}</p>
        )}

        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Submitting…" : "Submit reply"}
        </button>
      </form>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  color: "var(--ink)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const cardStyle: CSSProperties = {
  width: "min(560px, 94vw)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  padding: "30px 24px",
};

const formCardStyle: CSSProperties = {
  ...cardStyle,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 30,
  fontWeight: 400,
  lineHeight: 1.2,
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 16,
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};

const smallTextStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
};

const quoteStyle: CSSProperties = {
  margin: 0,
  padding: "12px 14px",
  borderLeft: "3px solid var(--gilt)",
  background: "var(--paper)",
  fontFamily: "var(--font-body)",
  fontSize: 17,
  lineHeight: 1.6,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-soft)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  padding: "9px 10px",
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
};

const toggleGroupStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: 4,
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "var(--paper)",
};

const toggleButtonStyle: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 6,
  padding: "9px 10px",
  background: "transparent",
  color: "var(--ink-faded)",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  cursor: "pointer",
};

const toggleButtonActiveStyle: CSSProperties = {
  background: "var(--paper-deep)",
  color: "var(--ink)",
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: "var(--font-body)",
  resize: "vertical",
};

const submissionDetailStyle: CSSProperties = {
  marginTop: 18,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const transcriptCardStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  padding: "12px 14px",
};

const transcriptLabelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-faded)",
  marginBottom: 8,
};

const transcriptBodyStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 15,
  lineHeight: 1.65,
  color: "var(--ink-soft)",
  whiteSpace: "pre-wrap",
};

const transcriptMetaStyle: CSSProperties = {
  marginTop: 8,
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-faded)",
};

const buttonStyle: CSSProperties = {
  marginTop: 4,
  border: "none",
  borderRadius: 8,
  padding: "11px 16px",
  background: "var(--moss)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
