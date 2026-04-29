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
import { getProxiedMediaUrl } from "@/lib/media-url";
import { getApiBase } from "@/lib/api-base";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";

const API = getApiBase();
const DRAFT_PREFIX = "tessera-reply-draft:";

type MemoryKind = "voice" | "story" | "photo";

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
  kind: "story" | "photo" | "voice" | "document" | "other";
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
  if (memory.transcriptStatus === "completed") return "Transcript unavailable.";
  if (memory.transcriptStatus === "failed") {
    return memory.transcriptError ?? "Transcription failed.";
  }
  if (memory.transcriptStatus === "queued" || memory.transcriptStatus === "processing") {
    return "Transcribing…";
  }
  return null;
}

function deriveTitle(opts: {
  kind: MemoryKind;
  body: string;
  file: File | null;
  question: string;
}): string {
  const { kind, body, file, question } = opts;
  if (kind === "story") {
    const trimmed = body.trim();
    if (trimmed) {
      const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() ?? trimmed;
      return firstSentence.slice(0, 90) || question.slice(0, 90);
    }
  }
  if (kind === "photo" && file) {
    const base = file.name.replace(/\.[^.]+$/, "");
    if (base) return base.slice(0, 90);
  }
  if (kind === "voice") {
    return `Voice reply — ${question.slice(0, 60)}`;
  }
  return question.slice(0, 90);
}

export default function PromptReplyPage() {
  return (
    <Suspense
      fallback={
        <main style={pageStyle}>
          <p style={hintStyle}>Loading…</p>
        </main>
      }
    >
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

  const [kind, setKind] = useState<MemoryKind>("voice");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitterName, setSubmitterName] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [titleOverride, setTitleOverride] = useState("");
  const [dateOfEventText, setDateOfEventText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedMemory, setSubmittedMemory] = useState<SubmittedReplyMemory | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestEmail, setSuggestEmail] = useState("");
  const [suggestSent, setSuggestSent] = useState(false);

  // Load reply details
  useEffect(() => {
    if (!token) {
      setLoadError("No reply link provided.");
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

  // Restore draft text/name from localStorage
  const draftKey = token ? `${DRAFT_PREFIX}${token}` : null;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        body?: string;
        submitterName?: string;
        kind?: MemoryKind;
        titleOverride?: string;
        dateOfEventText?: string;
      };
      if (parsed.body) setBody(parsed.body);
      if (parsed.submitterName) setSubmitterName(parsed.submitterName);
      if (parsed.kind === "voice" || parsed.kind === "story" || parsed.kind === "photo") {
        setKind(parsed.kind);
      }
      if (parsed.titleOverride) setTitleOverride(parsed.titleOverride);
      if (parsed.dateOfEventText) setDateOfEventText(parsed.dateOfEventText);
    } catch {
      // ignore
    }
  }, [draftKey]);

  // Save draft on changes (text only — files are too large for localStorage)
  useEffect(() => {
    if (!draftKey || submitted) return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ body, submitterName, kind, titleOverride, dateOfEventText }),
      );
    } catch {
      // ignore
    }
  }, [draftKey, body, submitterName, kind, titleOverride, dateOfEventText, submitted]);

  // Clear draft on submit
  useEffect(() => {
    if (submitted && draftKey) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    }
  }, [submitted, draftKey]);

  const acceptedFileType = useMemo(() => {
    if (kind === "photo") return "image/*";
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

    const needsFile = kind === "voice" || kind === "photo";
    if (needsFile && !file) {
      setSubmitError(
        kind === "voice"
          ? "Please record or upload your voice first."
          : "Please choose a photo to share.",
      );
      return;
    }
    if (kind === "story" && !body.trim()) {
      setSubmitError("Please type a few words to share.");
      return;
    }

    const finalTitle =
      titleOverride.trim() ||
      deriveTitle({ kind, body, file, question: details.questionText });

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
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
      }

      const res = await fetch(`${API}/api/prompt-replies/${encodeURIComponent(token)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: finalTitle,
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
        <p style={hintStyle}>Loading reply link…</p>
      </main>
    );
  }

  if (loadError || !details) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={headlineStyle}>Reply link unavailable</h1>
          <p style={leadStyle}>{loadError ?? "This link is not available."}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    if (!submittedMemory) {
      return (
        <main style={pageStyle}>
          <div style={cardStyle}>
            <div style={thankYouMarkStyle}>&#10003;</div>
            <h1 style={headlineStyle}>No problem.</h1>
            <p style={leadStyle}>
              That&rsquo;s perfectly fine. Another question will arrive soon.
            </p>
          </div>
        </main>
      );
    }
    const transcriptLabel = getVoiceTranscriptLabel(submittedMemory);
    const submittedMemoryMediaUrl = getProxiedMediaUrl(submittedMemory?.mediaUrl);
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <div style={thankYouMarkStyle}>✓</div>
          <h1 style={headlineStyle}>Thank you.</h1>
          <p style={leadStyle}>
            Your reply was added to <em>{details.treeName}</em>. The family will see it soon.
          </p>
          {submittedMemory?.kind === "voice" && (
            <div style={submissionDetailStyle}>
              {submittedMemoryMediaUrl && (
                <audio controls src={submittedMemoryMediaUrl} style={{ width: "100%" }}>
                  Your browser does not support audio playback.
                </audio>
              )}
              <div style={transcriptCardStyle}>
                <div style={transcriptLabelStyle}>What you said</div>
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
      <form onSubmit={handleSubmit} style={cardStyle}>
        <p style={topMetaStyle}>
          A private question for <strong>{details.treeName}</strong>
        </p>

        <p style={askedByStyle}>{details.fromUserName} asks:</p>
        <h1 style={questionStyle}>{details.questionText}</h1>
        {details.toPersonName && (
          <p style={subjectStyle}>About {details.toPersonName}</p>
        )}

        <div style={modeRowStyle} role="tablist" aria-label="How would you like to reply">
          <ModeButton
            active={kind === "voice"}
            onClick={() => {
              setKind("voice");
              setFile(null);
            }}
            icon="🎤"
            label="Speak"
          />
          <ModeButton
            active={kind === "story"}
            onClick={() => {
              setKind("story");
              setFile(null);
            }}
            icon="✎"
            label="Type"
          />
          <ModeButton
            active={kind === "photo"}
            onClick={() => {
              setKind("photo");
              setFile(null);
            }}
            icon="📷"
            label="Photo"
          />
        </div>

        {kind === "voice" && (
          <div style={primaryFieldStyle}>
            <VoiceRecorderField value={file} onChange={setFile} />
            <p style={hintStyle}>
              Tap the big button to record. Take your time. You can stop and try again.
            </p>
          </div>
        )}

        {kind === "story" && (
          <div style={primaryFieldStyle}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write whatever comes to mind…"
              style={bigTextAreaStyle}
              autoFocus
            />
            <p style={hintStyle}>Any length is fine. Your words are saved as you type.</p>
          </div>
        )}

        {kind === "photo" && (
          <div style={primaryFieldStyle}>
            <label style={photoDropStyle}>
              <input
                type="file"
                accept={acceptedFileType}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                style={{ display: "none" }}
              />
              <span style={photoDropIconStyle}>📷</span>
              <span style={photoDropLabelStyle}>
                {file ? file.name : "Tap to choose a photo"}
              </span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Add a note about this photo — who's in it, when it was taken…"
              style={smallTextAreaStyle}
            />
            <p style={hintStyle}>
              Date and caption help the archive. If you recognize people or places in the photo, mention them.
            </p>
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
          {submitting ? "Sending\u2026" : "Send my reply"}
        </button>

        {submitError && <p style={errorStyle}>{submitError}</p>}

        <div style={altActionsRowStyle}>
          <button
            type="button"
            onClick={async () => {
              if (!token) return;
              try {
                const res = await fetch(`${API}/api/prompt-replies/${encodeURIComponent(token)}/skip`, {
                  method: "POST",
                  credentials: "include",
                });
                if (res.ok) {
                  setSubmitted(true);
                  setSubmittedMemory(null);
                }
              } catch {}
            }}
            style={altBtnStyle}
          >
            I don&rsquo;t know the answer
          </button>
          <button
            type="button"
            onClick={() => setShowSuggest(!showSuggest)}
            style={altBtnStyle}
          >
            Ask someone else
          </button>
        </div>

        {showSuggest && (
          <div style={suggestBlockStyle}>
            <p style={{ ...hintStyle, margin: "0 0 8px" }}>
              Enter the email of someone who might know. We&rsquo;ll add them to this campaign.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="email"
                value={suggestEmail}
                onChange={(e) => setSuggestEmail(e.target.value)}
                placeholder="their-email@example.com"
                style={smallInputStyle}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!token || !suggestEmail.trim()) return;
                  try {
                    const res = await fetch(`${API}/api/prompt-replies/${encodeURIComponent(token)}/suggest`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ suggestedEmail: suggestEmail.trim() }),
                    });
                    if (res.ok) {
                      setSuggestEmail("");
                      setSuggestSent(true);
                    }
                  } catch {}
                }}
                disabled={!suggestEmail.trim()}
                style={{
                  ...primaryButtonStyle,
                  padding: "8px 14px",
                  fontSize: 13,
                  marginTop: 0,
                  opacity: suggestEmail.trim() ? 1 : 0.5,
                }}
              >
                Suggest
              </button>
            </div>
            {suggestSent && (
              <p style={{ ...hintStyle, color: "var(--moss)", margin: "6px 0 0" }}>
                Thank you &mdash; they may receive future questions.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          style={moreButtonStyle}
        >
          {showDetails ? "Hide details" : "More details (optional)"}
        </button>

        {showDetails && (
          <div style={detailsBlockStyle}>
            <label style={smallLabelStyle}>
              Your name (so we can credit you)
              <input
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                maxLength={200}
                placeholder="Optional"
                style={smallInputStyle}
              />
            </label>

            <label style={smallLabelStyle}>
              Approximate date of this memory
              <input
                value={dateOfEventText}
                onChange={(e) => setDateOfEventText(e.target.value)}
                maxLength={100}
                placeholder="e.g. Summer 1978"
                style={smallInputStyle}
              />
            </label>

            <label style={smallLabelStyle}>
              Title (we'll write one for you if blank)
              <input
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                maxLength={200}
                placeholder="Optional"
                style={smallInputStyle}
              />
            </label>
          </div>
        )}

        <p style={footerStyle}>
          This private link expires {new Date(details.expiresAt).toLocaleDateString()}.
        </p>
      </form>
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        ...modeButtonStyle,
        ...(active ? modeButtonActiveStyle : null),
      }}
    >
      <span style={modeIconStyle} aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  color: "var(--ink)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "32px 16px 80px",
};

const cardStyle: CSSProperties = {
  width: "min(640px, 100%)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 14,
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const topMetaStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-faded)",
};

const askedByStyle: CSSProperties = {
  margin: "8px 0 0",
  fontFamily: "var(--font-ui)",
  fontSize: 16,
  color: "var(--ink-soft)",
};

const questionStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 400,
  lineHeight: 1.25,
  color: "var(--ink)",
};

const subjectStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-faded)",
};

const headlineStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 400,
  lineHeight: 1.2,
};

const leadStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 18,
  lineHeight: 1.6,
  color: "var(--ink-soft)",
};

const modeRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  marginTop: 4,
};

const modeButtonStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "16px 8px",
  border: "1px solid var(--rule)",
  borderRadius: 12,
  background: "var(--paper)",
  color: "var(--ink-soft)",
  fontFamily: "var(--font-ui)",
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
};

const modeButtonActiveStyle: CSSProperties = {
  background: "var(--moss)",
  color: "#fff",
  borderColor: "var(--moss)",
};

const modeIconStyle: CSSProperties = {
  fontSize: 24,
  lineHeight: 1,
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
  fontSize: 19,
  lineHeight: 1.55,
  resize: "vertical",
  minHeight: 180,
};

const smallTextAreaStyle: CSSProperties = {
  ...bigTextAreaStyle,
  fontSize: 16,
  minHeight: 70,
};

const photoDropStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "32px 16px",
  border: "2px dashed var(--rule)",
  borderRadius: 12,
  background: "var(--paper)",
  cursor: "pointer",
  textAlign: "center",
};

const photoDropIconStyle: CSSProperties = {
  fontSize: 38,
  lineHeight: 1,
};

const photoDropLabelStyle: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 16,
  color: "var(--ink-soft)",
};

const primaryButtonStyle: CSSProperties = {
  marginTop: 6,
  border: "none",
  borderRadius: 12,
  padding: "18px 20px",
  background: "var(--moss)",
  color: "#fff",
  fontFamily: "var(--font-ui)",
  fontSize: 19,
  fontWeight: 600,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "#8B2F2F",
};

const moreButtonStyle: CSSProperties = {
  alignSelf: "flex-start",
  background: "transparent",
  border: "none",
  padding: 0,
  color: "var(--ink-faded)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  textDecoration: "underline",
  cursor: "pointer",
};

const detailsBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  borderTop: "1px solid var(--rule)",
  paddingTop: 16,
};

const smallLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-soft)",
};

const smallInputStyle: CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 8,
  padding: "9px 10px",
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
};

const footerStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-faded)",
  textAlign: "center",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  color: "var(--ink-faded)",
  lineHeight: 1.5,
};

const thankYouMarkStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  background: "var(--moss)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 28,
  fontFamily: "var(--font-ui)",
  marginBottom: 4,
};

const submissionDetailStyle: CSSProperties = {
  marginTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const transcriptCardStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--rule)",
  background: "var(--paper)",
  padding: "14px 16px",
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
  fontSize: 16,
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

const altActionsRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const altBtnStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  padding: "10px 14px",
  color: "var(--ink-soft)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cursor: "pointer",
};

const suggestBlockStyle: CSSProperties = {
  borderTop: "1px solid var(--rule)",
  paddingTop: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
