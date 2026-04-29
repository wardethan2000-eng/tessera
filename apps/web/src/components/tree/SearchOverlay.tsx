"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

interface SearchPerson {
  id: string;
  name: string;
  portraitUrl?: string | null;
  essenceLine?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
}

interface SearchMemory {
  id: string;
  kind: MemoryKind;
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  personName?: string | null;
  primaryPersonId?: string | null;
  personPortraitUrl?: string | null;
}

interface SearchOverlayProps {
  treeId: string;
  people: SearchPerson[];
  memories: SearchMemory[];
  open: boolean;
  onClose: () => void;
}

type Tab = "all" | "people" | "memories";

const KIND_ICON: Record<MemoryKind, string> = {
  photo: "◻",
  story: "✦",
  voice: "◉",
  document: "▤",
  other: "◇",
};

const EASE = "var(--ease-tessera)";

function normalize(s: string) {
  return s.toLowerCase().replace(/['']/g, "'");
}

function getMemorySnippet(memory: SearchMemory): string | null {
  if (memory.kind !== "voice") return null;
  if (memory.transcriptStatus === "completed" && memory.transcriptText) {
    return memory.transcriptText;
  }
  if (memory.transcriptStatus === "completed") {
    return "Transcript unavailable.";
  }
  if (memory.transcriptStatus === "failed") {
    return memory.transcriptError ? `Transcription failed: ${memory.transcriptError}` : "Transcription failed.";
  }
  if (memory.transcriptStatus === "queued" || memory.transcriptStatus === "processing") {
    return "Transcribing…";
  }
  return memory.transcriptText ?? null;
}

export function SearchOverlay({ treeId, people, memories, open, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTab("all");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const q = normalize(query.trim());

  const matchedPeople = q
    ? people.filter(
        (p) =>
          normalize(p.name).includes(q) ||
          (p.essenceLine && normalize(p.essenceLine).includes(q))
      )
    : people.slice(0, 12);

  const matchedMemories = q
    ? memories.filter(
        (m) =>
          normalize(m.title).includes(q) ||
          (m.body && normalize(m.body).includes(q)) ||
          (m.transcriptText && normalize(m.transcriptText).includes(q)) ||
          (m.personName && normalize(m.personName).includes(q)) ||
          (m.dateOfEventText && normalize(m.dateOfEventText).includes(q))
      )
    : memories.slice(0, 12);

  const showPeople = tab === "all" || tab === "people";
  const showMemories = tab === "all" || tab === "memories";

  const isEmpty =
    (showPeople && matchedPeople.length === 0) &&
    (showMemories && matchedMemories.length === 0);

  const goToPerson = useCallback(
    (personId: string) => {
      router.push(`/trees/${treeId}/people/${personId}`);
      onClose();
    },
    [router, treeId, onClose]
  );

  const goToMemory = useCallback(
    (memory: SearchMemory) => {
      if (memory.primaryPersonId) {
        router.push(`/trees/${treeId}/people/${memory.primaryPersonId}`);
      }
      onClose();
    },
    [router, treeId, onClose]
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(28, 25, 21, 0.6)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "12vh",
        animation: `fadeIn var(--duration-micro) ${EASE}`,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(640px, 94vw)",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(28,25,21,0.25)",
          animation: `bloom var(--duration-micro) ${EASE}`,
          overflow: "hidden",
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: "0 18px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              color: "var(--ink-faded)",
              lineHeight: 1,
            }}
          >
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, memories, stories…"
            style={{
              flex: 1,
              fontFamily: "var(--font-body)",
              fontSize: 16,
              color: "var(--ink)",
              background: "none",
              border: "none",
              outline: "none",
              padding: "18px 0",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                padding: "4px",
              }}
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: "none",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--ink-faded)",
              padding: "4px 8px",
              border: "1px solid var(--rule)",
              borderRadius: 4,
            }}
          >
            Esc
          </button>
        </div>

        {/* Tab bar */}
        <div
          style={{
            padding: "0 18px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            gap: 0,
          }}
        >
          {(["all", "people", "memories"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: tab === t ? "var(--ink)" : "var(--ink-faded)",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--moss)" : "transparent"}`,
                padding: "10px 14px 8px",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "color var(--duration-micro), border-color var(--duration-micro)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {isEmpty ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                fontFamily: "var(--font-body)",
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--ink-faded)",
              }}
            >
              {q ? `No results for "${query}"` : "Start typing to search…"}
            </div>
          ) : (
            <>
              {/* People section */}
              {showPeople && matchedPeople.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "12px 18px 6px",
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      color: "var(--ink-faded)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    People
                  </div>
                  {matchedPeople.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goToPerson(p.id)}
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "10px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        textAlign: "left",
                        borderRadius: 0,
                        transition: "background var(--duration-micro)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-deep)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "none";
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          overflow: "hidden",
                          border: "1.5px solid var(--rule)",
                          background: "var(--paper-deep)",
                          flexShrink: 0,
                        }}
                      >
                        {p.portraitUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getProxiedMediaUrl(p.portraitUrl) ?? undefined}
                            alt={p.name}
                            onError={handleMediaError}
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 14,
                            color: "var(--ink)",
                            lineHeight: 1.3,
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 12,
                            fontStyle: "italic",
                            color: "var(--ink-faded)",
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.essenceLine ??
                            ([p.birthYear, p.deathYear].filter(Boolean).join(" – ") ||
                            "")}
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--ink-faded)",
                        }}
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Memories section */}
              {showMemories && matchedMemories.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "12px 18px 6px",
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      color: "var(--ink-faded)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Memories
                  </div>
                  {matchedMemories.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => goToMemory(m)}
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "10px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        textAlign: "left",
                        transition: "background var(--duration-micro)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-deep)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "none";
                      }}
                    >
                      {/* Thumbnail or kind icon */}
                      <div
                        style={{
                          width: 40,
                          height: 32,
                          borderRadius: 4,
                          overflow: "hidden",
                          border: "1px solid var(--rule)",
                          background: "var(--paper-deep)",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {getProxiedMediaUrl(m.mediaUrl) && m.kind === "photo" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getProxiedMediaUrl(m.mediaUrl) ?? undefined}
                            alt={m.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: 16,
                              color: "var(--ink-faded)",
                            }}
                          >
                            {KIND_ICON[m.kind]}
                          </span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 14,
                            color: "var(--ink)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {m.title}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-ui)",
                            fontSize: 11,
                            color: "var(--ink-faded)",
                            marginTop: 1,
                          }}
                        >
                          {m.kind}
                          {m.personName && ` · ${m.personName}`}
                          {m.dateOfEventText && ` · ${m.dateOfEventText}`}
                        </div>
                        {(() => {
                          const snippet = getMemorySnippet(m);
                          return snippet ? (
                            <div
                              style={{
                                marginTop: 4,
                                fontFamily: "var(--font-body)",
                                fontSize: 12,
                                lineHeight: 1.45,
                                color: "var(--ink-faded)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {snippet}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--ink-faded)",
                        }}
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* See all results + Footer hint */}
        <div
          style={{
            borderTop: "1px solid var(--rule)",
            padding: "8px 18px",
            display: "flex",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {q && (
            <Link
              href={`/trees/${treeId}/search?q=${encodeURIComponent(query.trim())}`}
              onClick={() => onClose()}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "var(--moss)",
                textDecoration: "none",
              }}
            >
              See all results →
            </Link>
          )}
          {!q && <span />}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {[
              { key: "↑↓", hint: "navigate" },
              { key: "↵", hint: "open" },
              { key: "Esc", hint: "close" },
            ].map(({ key, hint }) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                }}
              >
                <span
                  style={{
                    background: "var(--paper-deep)",
                    border: "1px solid var(--rule)",
                    borderRadius: 3,
                    padding: "2px 5px",
                    fontSize: 10,
                  }}
                >
                  {key}
                </span>
                {hint}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
