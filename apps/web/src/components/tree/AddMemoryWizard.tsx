"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlacePicker } from "@/components/tree/PlacePicker";

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

interface Person {
  id: string;
  name: string;
  portraitUrl?: string | null;
}

interface AddMemoryWizardProps {
  treeId: string;
  people: Person[];
  apiBase?: string;
  open?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onMemoryAdded?: () => void;
  defaultPersonId?: string;
  promptId?: string;
  promptQuestion?: string;
}

interface Step1State {
  kind: MemoryKind;
}

interface Step2State {
  title: string;
  body: string;
  file: File | null;
}

interface Step3State {
  personId: string;
  dateOfEventText: string;
  placeId: string;
}

const KIND_OPTIONS: { id: MemoryKind; icon: string; label: string; description: string }[] = [
  { id: "photo", icon: "◻", label: "Photo", description: "A photograph from the archive" },
  { id: "story", icon: "✦", label: "Story", description: "A written memory or reflection" },
  { id: "voice", icon: "◉", label: "Voice", description: "An audio recording or voice memo" },
  { id: "document", icon: "▤", label: "Document", description: "A letter, certificate, or document" },
  { id: "other", icon: "◇", label: "Other", description: "Another kind of memory" },
];

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function AddMemoryWizard({
  treeId,
  people,
  apiBase,
  open,
  onClose,
  onSuccess,
  onMemoryAdded,
  defaultPersonId,
  promptId,
  promptQuestion,
}: AddMemoryWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [step1, setStep1] = useState<Step1State>({ kind: "photo" });
  const [step2, setStep2] = useState<Step2State>({ title: "", body: "", file: null });
  const [step3, setStep3] = useState<Step3State>({
    personId: defaultPersonId ?? (people[0]?.id ?? ""),
    dateOfEventText: "",
    placeId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus title when reaching step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => titleRef.current?.focus(), 80);
    }
  }, [step]);

  const apiBase_ = apiBase ?? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

  const needsFile = step1.kind === "photo" || step1.kind === "voice" || step1.kind === "document";

  const canProceedStep2 = useCallback(() => {
    if (!step2.title.trim()) return false;
    if (step1.kind === "story" && !step2.body.trim()) return false;
    if (needsFile && !step2.file) return false;
    return true;
  }, [step1.kind, step2.title, step2.body, step2.file, needsFile]);

  const handleSubmit = async () => {
    if (!promptId && !step3.personId) return;
    setSubmitting(true);
    setError(null);

    try {
      let resolvedMediaId: string | undefined;

      if (step2.file && needsFile) {
        const presignRes = await fetch(`${apiBase_}/api/trees/${treeId}/media/presign`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: step2.file.name,
            contentType: step2.file.type || "application/octet-stream",
            sizeBytes: step2.file.size,
          }),
        });
        if (!presignRes.ok) throw new Error("Failed to get upload URL");
        const { mediaId, uploadUrl } = (await presignRes.json()) as {
          mediaId: string;
          uploadUrl: string;
        };
        await fetch(uploadUrl, { method: "PUT", body: step2.file });
        resolvedMediaId = mediaId;
      }

      const body: Record<string, unknown> = {
        kind: step1.kind,
        title: step2.title.trim(),
        dateOfEventText: step3.dateOfEventText.trim() || undefined,
        placeId: step3.placeId || undefined,
      };
      if (step2.body.trim()) body.body = step2.body.trim();
      if (resolvedMediaId) body.mediaId = resolvedMediaId;

      const res = await fetch(
        promptId
          ? `${apiBase_}/api/trees/${treeId}/prompts/${promptId}/reply`
          : `${apiBase_}/api/trees/${treeId}/people/${step3.personId}/memories`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to save memory");
      }

      onSuccess?.();
      onMemoryAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const acceptType = step1.kind === "photo"
    ? "image/*"
    : step1.kind === "voice"
    ? "audio/*"
    : step1.kind === "document"
    ? ".pdf,.doc,.docx,application/pdf,application/msword"
    : undefined;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(28, 25, 21, 0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: `fadeIn 200ms ${EASE}`,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          width: "min(520px, 94vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(28,25,21,0.2)",
          animation: `bloom 300ms ${EASE}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 24px 16px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                color: "var(--ink)",
              }}
            >
              {promptQuestion ? "Reply to a question" : "Add a memory"}
            </div>
            {promptQuestion && (
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  marginTop: 4,
                  fontStyle: "italic",
                  maxWidth: 340,
                  lineHeight: 1.4,
                }}
              >
                "{promptQuestion}"
              </div>
            )}
            {!promptQuestion && (
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                  marginTop: 2,
                }}
              >
                Step {step} of 3 — {step === 1 ? "Choose kind" : step === 2 ? "Add content" : "Assign & publish"}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "var(--ink-faded)",
              lineHeight: 1,
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div
          style={{
            padding: "12px 24px 0",
            display: "flex",
            gap: 8,
          }}
        >
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: s <= step ? "var(--moss)" : "var(--rule)",
                transition: `background 300ms ${EASE}`,
              }}
            />
          ))}
        </div>

        {/* Step 1: Kind picker */}
        {step === 1 && (
          <div style={{ padding: "20px 24px 24px" }}>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 14,
              }}
            >
              What kind of memory is this?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {KIND_OPTIONS.map(({ id, icon, label, description }) => {
                const selected = step1.kind === id;
                return (
                  <button
                    key={id}
                    onClick={() => setStep1({ kind: id })}
                    style={{
                      background: selected ? "var(--paper-deep)" : "none",
                      border: `1.5px solid ${selected ? "var(--moss)" : "var(--rule)"}`,
                      borderRadius: 8,
                      padding: "12px 16px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      textAlign: "left",
                      transition: `border-color 150ms, background 150ms`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 20,
                        color: selected ? "var(--moss)" : "var(--ink-faded)",
                        width: 24,
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {icon}
                    </span>
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 14,
                          fontWeight: 500,
                          color: selected ? "var(--ink)" : "var(--ink-soft)",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 12,
                          color: "var(--ink-faded)",
                          marginTop: 1,
                        }}
                      >
                        {description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "white",
                  background: "var(--moss)",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 20px",
                  cursor: "pointer",
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Content */}
        {step === 2 && (
          <div style={{ padding: "20px 24px 24px" }}>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              {step1.kind === "photo"
                ? "Upload a photograph"
                : step1.kind === "voice"
                ? "Upload a voice recording"
                : step1.kind === "document"
                ? "Upload a document"
                : "Write the memory"}
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                  marginBottom: 6,
                }}
              >
                Title *
              </label>
              <input
                ref={titleRef}
                value={step2.title}
                onChange={(e) => setStep2((s) => ({ ...s, title: e.target.value }))}
                placeholder={
                  step1.kind === "photo"
                    ? "e.g. Summer at the lake, 1962"
                    : step1.kind === "story"
                    ? "e.g. The summer we moved to Portland"
                    : "Memory title"
                }
                style={{
                  width: "100%",
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  color: "var(--ink)",
                  background: "var(--paper-deep)",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  padding: "9px 12px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* File upload (photo/voice/document) */}
            {needsFile && (
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                    marginBottom: 6,
                  }}
                >
                  {step1.kind === "photo" ? "Photograph *" : step1.kind === "voice" ? "Audio file *" : "Document file *"}
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `1.5px dashed ${step2.file ? "var(--moss)" : "var(--rule)"}`,
                    borderRadius: 8,
                    padding: "20px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: step2.file ? "rgba(78,93,66,0.06)" : "none",
                    transition: "border-color 150ms, background 150ms",
                  }}
                >
                  {step2.file ? (
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 13,
                          color: "var(--ink-soft)",
                        }}
                      >
                        {step2.file.name}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--ink-faded)",
                          marginTop: 2,
                        }}
                      >
                        {(step2.file.size / 1024 / 1024).toFixed(1)} MB · Click to replace
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 22,
                          color: "var(--rule)",
                        }}
                      >
                        ↑
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 13,
                          color: "var(--ink-faded)",
                          marginTop: 4,
                        }}
                      >
                        Click to choose file
                      </div>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={acceptType}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setStep2((s) => ({ ...s, file: f }));
                  }}
                />
              </div>
            )}

            {/* Story body */}
            {step1.kind === "story" && (
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                    marginBottom: 6,
                  }}
                >
                  Story *
                </label>
                <textarea
                  value={step2.body}
                  onChange={(e) => setStep2((s) => ({ ...s, body: e.target.value }))}
                  placeholder="Write the memory here…"
                  rows={6}
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "var(--ink)",
                    background: "var(--paper-deep)",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                    padding: "9px 12px",
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.6,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {/* Optional caption for other kinds */}
            {(step1.kind === "photo" || step1.kind === "other") && (
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                    marginBottom: 6,
                  }}
                >
                  Caption / notes (optional)
                </label>
                <textarea
                  value={step2.body}
                  onChange={(e) => setStep2((s) => ({ ...s, body: e.target.value }))}
                  placeholder="Any additional context…"
                  rows={3}
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "var(--paper-deep)",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                    padding: "9px 12px",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--ink-faded)",
                  background: "none",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  padding: "9px 16px",
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => canProceedStep2() && setStep(3)}
                disabled={!canProceedStep2()}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "white",
                  background: canProceedStep2() ? "var(--moss)" : "var(--rule)",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 20px",
                  cursor: canProceedStep2() ? "pointer" : "default",
                  transition: "background 150ms",
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Assign & publish */}
        {step === 3 && (
          <div style={{ padding: "20px 24px 24px" }}>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 16,
              }}
            >
              {promptId ? "Finalize reply" : "Assign to a person"}
            </div>

            {/* Person picker */}
            {!promptId ? (
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                    marginBottom: 6,
                  }}
                >
                  Person *
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                    gap: 8,
                    maxHeight: 180,
                    overflowY: "auto",
                    padding: "2px 0",
                  }}
                >
                  {people.map((p) => {
                    const selected = step3.personId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setStep3((s) => ({ ...s, personId: p.id }))}
                        style={{
                          background: selected ? "var(--paper-deep)" : "none",
                          border: `1.5px solid ${selected ? "var(--moss)" : "var(--rule)"}`,
                          borderRadius: 8,
                          padding: "10px 8px",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                          transition: "border-color 150ms, background 150ms",
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            overflow: "hidden",
                            border: `1.5px solid ${selected ? "var(--moss)" : "var(--rule)"}`,
                            background: "var(--paper-deep)",
                            flexShrink: 0,
                          }}
                        >
                          {p.portraitUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.portraitUrl}
                              alt={p.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "var(--font-display)",
                                fontSize: 14,
                                color: "var(--ink-faded)",
                              }}
                            >
                              {p.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-ui)",
                            fontSize: 11,
                            color: selected ? "var(--ink)" : "var(--ink-soft)",
                            textAlign: "center",
                            lineHeight: 1.3,
                            wordBreak: "break-word",
                          }}
                        >
                          {p.name.split(" ")[0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginBottom: 14,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                }}
              >
                This reply will be attached to{" "}
                <strong style={{ color: "var(--ink)" }}>
                  {people.find((p) => p.id === step3.personId)?.name ?? "the prompted person"}
                </strong>
                .
              </div>
            )}

            {/* Date */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                  marginBottom: 6,
                }}
              >
                When did this happen? (optional)
              </label>
              <input
                value={step3.dateOfEventText}
                onChange={(e) => setStep3((s) => ({ ...s, dateOfEventText: e.target.value }))}
                placeholder="e.g. Summer 1962, June 1978, circa 1940s"
                style={{
                  width: "100%",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  color: "var(--ink)",
                  background: "var(--paper-deep)",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  padding: "9px 12px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <PlacePicker
                treeId={treeId}
                apiBase={apiBase_}
                value={step3.placeId}
                onChange={(placeId) => setStep3((s) => ({ ...s, placeId }))}
                label="Where did this happen? (optional)"
                emptyLabel="No mapped place"
                note="Add a mapped place once, then reuse it across the family archive."
              />
            </div>

            {/* Summary */}
            <div
              style={{
                background: "var(--paper-deep)",
                border: "1px solid var(--rule)",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                Summary
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                }}
              >
                A <strong style={{ color: "var(--ink)" }}>{step1.kind}</strong> memory titled{" "}
                <em style={{ color: "var(--ink)" }}>"{step2.title}"</em>
                {step3.personId && people.find((p) => p.id === step3.personId) && (
                  <>
                    {" "}assigned to{" "}
                    <strong style={{ color: "var(--ink)" }}>
                      {people.find((p) => p.id === step3.personId)?.name}
                    </strong>
                  </>
                )}
                {step3.dateOfEventText && (
                  <> · <em>{step3.dateOfEventText}</em></>
                )}
                {step3.placeId && (
                  <> · mapped place selected</>
                )}
              </div>
            </div>

            {error && (
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--rose)",
                  marginBottom: 12,
                  padding: "8px 12px",
                  background: "rgba(168,93,93,0.08)",
                  border: "1px solid rgba(168,93,93,0.2)",
                  borderRadius: 6,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--ink-faded)",
                  background: "none",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  padding: "9px 16px",
                  cursor: "pointer",
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={(!promptId && !step3.personId) || submitting}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "white",
                  background:
                    ((!promptId && !step3.personId) || submitting)
                      ? "var(--ink-faded)"
                      : "var(--moss)",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 20px",
                  cursor:
                    ((!promptId && !step3.personId) || submitting)
                      ? "default"
                      : "pointer",
                  minWidth: 120,
                  transition: "background 150ms",
                }}
              >
                {submitting ? "Saving…" : "Save memory"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
