"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ApiRelationship } from "@/components/tree/treeTypes";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";
import {
  resolveRequestRecipients,
  type RequestPersonOption,
  type RequestTargetMode,
} from "@/lib/request-memory";

interface PromptComposerProps {
  open: boolean;
  onClose: () => void;
  treeId: string;
  people: RequestPersonOption[];
  apiBase?: string;
  defaultPersonId?: string;
  relationships?: ApiRelationship[];
  onPromptSent?: () => void;
}

const SUGGESTED_TEMPLATES = [
  "What is your earliest childhood memory?",
  "How did you meet your spouse?",
  "What was the hardest moment of your life, and how did you get through it?",
  "What traditions from your childhood do you wish had been passed down?",
  "Tell me about the place you grew up. What did it feel like?",
  "Who in the family had the biggest influence on you, and why?",
  "What do you want your grandchildren to know about you?",
  "What was your proudest moment?",
  "Describe a typical day from when you were young.",
  "Is there a family story you've always wanted to tell?",
];

const TARGET_MODE_LABELS: Record<RequestTargetMode, string> = {
  person: "One person",
  people: "Several people",
  family: "Immediate family",
};

export function PromptComposer({
  open,
  onClose,
  treeId,
  people,
  apiBase,
  defaultPersonId,
  relationships = [],
  onPromptSent,
}: PromptComposerProps) {
  const [targetMode, setTargetMode] = useState<RequestTargetMode>("person");
  const [selectedPersonId, setSelectedPersonId] = useState(defaultPersonId ?? "");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [familyAnchorPersonId, setFamilyAnchorPersonId] = useState(defaultPersonId ?? "");
  const [questionText, setQuestionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const apiBase_ = apiBase ?? ("");

  const canUseFamilyTarget = relationships.length > 0 && people.length > 0;

  useEffect(() => {
    if (!open) return;

    const fallbackPersonId = defaultPersonId ?? people[0]?.id ?? "";
    setTargetMode(canUseFamilyTarget && defaultPersonId ? "family" : "person");
    setSelectedPersonId(fallbackPersonId);
    setSelectedPersonIds(fallbackPersonId ? [fallbackPersonId] : []);
    setFamilyAnchorPersonId(fallbackPersonId);
    setQuestionText("");
    setError(null);
    setShowTemplates(false);
  }, [canUseFamilyTarget, defaultPersonId, open, people]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const recipientResolution = useMemo(
    () =>
      resolveRequestRecipients({
        mode: targetMode,
        people,
        relationships,
        selectedPersonId,
        selectedPersonIds,
        familyAnchorPersonId,
      }),
    [familyAnchorPersonId, people, relationships, selectedPersonId, selectedPersonIds, targetMode],
  );

  const activeAnchorPerson =
    people.find((person) => person.id === familyAnchorPersonId) ?? null;

  const togglePersonSelection = (personId: string) => {
    setSelectedPersonIds((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
  };

  const handleSubmit = async () => {
    if (recipientResolution.recipientIds.length === 0) {
      setError("Choose at least one recipient with a linked account.");
      return;
    }
    if (!questionText.trim()) {
      setError("Please write your request.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body =
        recipientResolution.recipientIds.length === 1
          ? {
              toPersonId: recipientResolution.recipientIds[0],
              questionText: questionText.trim(),
            }
          : {
              recipientPersonIds: recipientResolution.recipientIds,
              questionText: questionText.trim(),
            };

      const res = await fetch(`${apiBase_}/api/trees/${treeId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to send request");
      }
      onPromptSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(28,25,21,0.55)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(680px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(28,25,21,0.22)",
          animation: "promptSlideIn 350ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        }}
      >
        <div
          style={{
            padding: "24px 28px 0",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 400,
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Request a memory
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                color: "var(--ink-faded)",
                margin: "4px 0 0",
              }}
            >
              Send a memory request to one person, several people, or an immediate family group.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-faded)",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 4px",
              borderRadius: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ padding: "20px 28px 28px" }}>
          <label style={sectionLabelStyle}>Target</label>
          <div style={toggleGroupStyle}>
            {(["person", "people", "family"] as RequestTargetMode[])
              .filter((mode) => mode !== "family" || canUseFamilyTarget)
              .map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTargetMode(mode)}
                  style={{
                    ...toggleButtonStyle,
                    ...(targetMode === mode ? toggleButtonActiveStyle : null),
                  }}
                >
                  {TARGET_MODE_LABELS[mode]}
                </button>
              ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={sectionLabelStyle}>
              {targetMode === "family" ? "Whose family?" : "Who should receive this request?"}
            </label>

            {targetMode === "family" && (
              <p style={hintTextStyle}>
                Immediate family includes the selected person plus their parents, children, and spouses.
              </p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                gap: 8,
                marginTop: 8,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {people.map((person) => {
                const selected =
                  targetMode === "person"
                    ? selectedPersonId === person.id
                    : targetMode === "people"
                    ? selectedPersonIds.includes(person.id)
                    : familyAnchorPersonId === person.id;

                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => {
                      if (targetMode === "person") {
                        setSelectedPersonId(person.id);
                        return;
                      }
                      if (targetMode === "people") {
                        togglePersonSelection(person.id);
                        return;
                      }
                      setFamilyAnchorPersonId(person.id);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 8px",
                      borderRadius: 10,
                      border: `1.5px solid ${selected ? "var(--moss)" : "var(--rule)"}`,
                      background: selected ? "rgba(78,93,66,0.07)" : "var(--paper)",
                      cursor: "pointer",
                      transition: "all 200ms",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "var(--paper-deep)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {person.portraitUrl ? (
                        <img
                          src={getProxiedMediaUrl(person.portraitUrl) ?? undefined}
                          alt={person.displayName}
                          onError={handleMediaError}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 18,
                            color: "var(--ink-faded)",
                          }}
                        >
                          {person.displayName.charAt(0)}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        color: selected ? "var(--moss)" : "var(--ink)",
                        textAlign: "center",
                        lineHeight: 1.3,
                        fontWeight: selected ? 500 : 400,
                      }}
                    >
                      {person.displayName.split(" ")[0]}
                    </span>
                    {!person.linkedUserId && (
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 10,
                          color: "var(--ink-faded)",
                        }}
                      >
                        no account
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={recipientPreviewStyle}>
            <div style={recipientColumnStyle}>
              <div style={recipientHeadingStyle}>
                Will receive the request
                {targetMode === "family" && activeAnchorPerson
                  ? ` for ${activeAnchorPerson.displayName}`
                  : ""}
              </div>
              {recipientResolution.recipients.length === 0 ? (
                <p style={emptyRecipientStyle}>No linked-account recipients selected yet.</p>
              ) : (
                <div style={recipientChipWrapStyle}>
                  {recipientResolution.recipients.map((person) => (
                    <span key={person.id} style={recipientChipStyle}>
                      {person.displayName}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {recipientResolution.excludedUnlinked.length > 0 && (
              <div style={recipientColumnStyle}>
                <div style={recipientHeadingStyle}>Excluded without linked accounts</div>
                <div style={recipientChipWrapStyle}>
                  {recipientResolution.excludedUnlinked.map((person) => (
                    <span key={person.id} style={excludedChipStyle}>
                      {person.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label style={{ ...sectionLabelStyle, marginTop: 18 }}>
            Your request
          </label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder="What memory would you like them to share?"
            rows={3}
            style={textAreaStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--moss)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
          />

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--moss)",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 14 }}>{showTemplates ? "▾" : "▸"}</span>
              Suggested requests
            </button>
            {showTemplates && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 160,
                  overflowY: "auto",
                  padding: "4px 0",
                }}
              >
                {SUGGESTED_TEMPLATES.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => {
                      setQuestionText(template);
                      setShowTemplates(false);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid var(--rule)",
                      borderRadius: 6,
                      padding: "7px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--ink-soft)",
                    }}
                  >
                    {template}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "var(--rose)",
                marginTop: 12,
                marginBottom: 0,
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "1.5px solid var(--rule)",
                background: "none",
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                color: "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || recipientResolution.recipientIds.length === 0 || !questionText.trim()}
              style={{
                padding: "9px 22px",
                borderRadius: 8,
                border: "none",
                background:
                  submitting || recipientResolution.recipientIds.length === 0 || !questionText.trim()
                    ? "var(--rule)"
                    : "var(--moss)",
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                fontWeight: 500,
                color:
                  submitting || recipientResolution.recipientIds.length === 0 || !questionText.trim()
                    ? "var(--ink-faded)"
                    : "#fff",
                cursor:
                  submitting || recipientResolution.recipientIds.length === 0 || !questionText.trim()
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {submitting ? "Sending…" : `Send to ${recipientResolution.recipientIds.length || 0}`}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes promptSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const sectionLabelStyle = {
  display: "block",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--ink-soft)",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  marginBottom: 8,
};

const hintTextStyle = {
  margin: "0 0 8px",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-faded)",
};

const toggleGroupStyle = {
  display: "flex",
  gap: 8,
  padding: 4,
  borderRadius: 10,
  border: "1px solid var(--rule)",
  background: "var(--paper-deep)",
};

const toggleButtonStyle = {
  flex: 1,
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  background: "transparent",
  color: "var(--ink-faded)",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  cursor: "pointer",
};

const toggleButtonActiveStyle = {
  background: "var(--paper)",
  color: "var(--ink)",
};

const recipientPreviewStyle = {
  marginTop: 18,
  border: "1px solid var(--rule)",
  borderRadius: 12,
  background: "var(--paper-deep)",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

const recipientColumnStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

const recipientHeadingStyle = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-faded)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const recipientChipWrapStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 6,
};

const recipientChipStyle = {
  padding: "5px 10px",
  borderRadius: 999,
  background: "rgba(78,93,66,0.08)",
  border: "1px solid rgba(78,93,66,0.18)",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink)",
};

const excludedChipStyle = {
  ...recipientChipStyle,
  background: "rgba(177,165,145,0.12)",
  border: "1px solid var(--rule)",
  color: "var(--ink-faded)",
};

const emptyRecipientStyle = {
  margin: 0,
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--ink-faded)",
};

const textAreaStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1.5px solid var(--rule)",
  background: "var(--paper)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--ink)",
  resize: "vertical" as const,
  outline: "none",
  transition: "border-color 200ms",
  boxSizing: "border-box" as const,
};
