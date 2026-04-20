"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AnimatePresence } from "framer-motion";
import { DriftMode } from "@/components/tree/DriftMode";
import { AddMemoryWizard } from "@/components/tree/AddMemoryWizard";
import {
  MemoryVisibilityControl,
  type TreeVisibilityLevel,
} from "@/components/tree/MemoryVisibilityControl";
import { SearchOverlay } from "@/components/tree/SearchOverlay";
import { Shimmer } from "@/components/ui/Shimmer";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

interface Tree {
  id: string;
  name: string;
  role?: string;
}

interface Person {
  id: string;
  name: string;
  portraitUrl: string | null;
  essenceLine: string | null;
  birthYear: number | null;
  deathYear: number | null;
  linkedUserId: string | null;
}

interface Memory {
  id: string;
  kind: "story" | "photo" | "voice" | "document" | "other";
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  personName?: string | null;
  primaryPersonId?: string | null;
  personPortraitUrl?: string | null;
  createdAt?: string;
  treeVisibilityLevel?: TreeVisibilityLevel;
  treeVisibilityIsOverride?: boolean;
}

function extractYear(text?: string | null): number | null {
  if (!text) return null;
  const m = text.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1]!, 10) : null;
}

function getVoiceTranscriptLabel(memory: Memory): string | null {
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
  return null;
}

function MemoryCard({
  memory,
  onClick,
  extraControls,
}: {
  memory: Memory;
  onClick: () => void;
  extraControls?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        padding: 0,
        textAlign: "left",
        flexShrink: 0,
        width: 200,
        overflow: "hidden",
        boxShadow: hovered
          ? "0 4px 20px rgba(28,25,21,0.12)"
          : "0 1px 4px rgba(28,25,21,0.06)",
        transform: hovered ? "translateY(-2px)" : "none",
        transition: `box-shadow 200ms ${EASE}, transform 200ms ${EASE}`,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          width: "100%",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {memory.kind === "photo" && memory.mediaUrl ? (
          <div style={{ height: 110, overflow: "hidden", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={memory.mediaUrl}
              alt={memory.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ) : (
          <div
            style={{
              height: 110,
              background: "var(--paper-deep)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                color: "var(--rule)",
              }}
            >
              {memory.kind === "story" ? "✦" : memory.kind === "voice" ? "◉" : "▤"}
            </div>
          </div>
        )}
        <div style={{ padding: "10px 12px 12px" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              color: "var(--ink)",
              lineHeight: 1.3,
              marginBottom: 4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {memory.title}
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--ink-faded)",
            }}
          >
            {memory.personName ?? ""}
            {memory.personName && memory.dateOfEventText ? " · " : ""}
            {memory.dateOfEventText ?? ""}
          </div>
          {memory.kind === "voice" && (
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-body)",
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--ink-faded)",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {getVoiceTranscriptLabel(memory)}
            </div>
          )}
        </div>
      </button>
      {extraControls && (
        <div style={{ padding: "0 12px 12px" }}>
          {extraControls}
        </div>
      )}
    </article>
  );
}

function PersonCard({ person, onClick }: { person: Person; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        background: hovered ? "var(--paper-deep)" : "none",
        transition: `background 150ms ${EASE}`,
      } as React.CSSProperties}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: "50%",
          overflow: "hidden",
          border: "1.5px solid var(--rule)",
          background: "var(--paper-deep)",
          flexShrink: 0,
        }}
      >
        {person.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.portraitUrl}
            alt={person.name}
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
              fontSize: 22,
              color: "var(--ink-faded)",
            }}
          >
            {person.name.charAt(0)}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 13,
          color: "var(--ink)",
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: 80,
        }}
      >
        {person.name.split(" ")[0]}
      </div>
      {(person.birthYear ?? person.deathYear) && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            color: "var(--ink-faded)",
          }}
        >
          {[person.birthYear, person.deathYear].filter(Boolean).join("–")}
        </div>
      )}
    </button>
  );
}

export default function AtriumPage() {
  const router = useRouter();
  const params = useParams<{ treeId: string }>();
  const { treeId } = params;
  const { data: session, isPending } = useSession();

  const [tree, setTree] = useState<Tree | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  const [driftOpen, setDriftOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [updatingMemoryVisibilityId, setUpdatingMemoryVisibilityId] = useState<string | null>(null);

  // Global ⌘K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session || !treeId) return;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [treeRes, peopleRes, memoriesRes] = await Promise.all([
          fetch(`${API}/api/trees/${treeId}`, { credentials: "include" }),
          fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
          fetch(`${API}/api/trees/${treeId}/memories`, { credentials: "include" }),
        ]);
        if (treeRes.ok) setTree(await treeRes.json());
        if (peopleRes.ok) {
          const data = await peopleRes.json();
          setPeople(
            (data as Array<Record<string, unknown>>).map((p) => ({
              id: p.id as string,
              name: (p.displayName ?? p.name ?? "") as string,
              portraitUrl: (p.portraitUrl ?? null) as string | null,
              essenceLine: (p.essenceLine ?? null) as string | null,
              birthYear: extractYear(p.birthDateText as string | null),
              deathYear: extractYear(p.deathDateText as string | null),
              linkedUserId: (p.linkedUserId ?? null) as string | null,
            }))
          );
        }
        if (memoriesRes.ok) {
          const data = await memoriesRes.json();
          setMemories(data as Memory[]);
        }
        // Fetch inbox count (pending prompts for current user)
        const inboxRes = await fetch(`${API}/api/trees/${treeId}/prompts/inbox`, { credentials: "include" });
        if (inboxRes.ok) {
          const inboxData = await inboxRes.json() as Array<{ status: string }>;
          setInboxCount(inboxData.filter((p) => p.status === "pending").length);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [session, treeId]);

  const handlePersonClick = useCallback(
    (personId: string) => {
      router.push(`/trees/${treeId}/people/${personId}`);
    },
    [router, treeId]
  );

  const refreshMemories = useCallback(async () => {
    const res = await fetch(`${API}/api/trees/${treeId}/memories`, {
      credentials: "include",
    });
    if (res.ok) setMemories(await res.json());
  }, [treeId]);

  const setMemoryTreeVisibility = useCallback(
    async (memoryId: string, visibility: TreeVisibilityLevel | null) => {
      setUpdatingMemoryVisibilityId(memoryId);
      const res = await fetch(`${API}/api/trees/${treeId}/memories/${memoryId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ visibilityOverride: visibility }),
      });
      if (res.ok) {
        await refreshMemories();
      }
      setUpdatingMemoryVisibilityId(null);
    },
    [refreshMemories, treeId],
  );

  const apiPeople = people.map((p) => ({
    id: p.id,
    name: p.name,
    portraitUrl: p.portraitUrl,
  }));

  const featuredMemory =
    memories.find((m) => m.kind === "photo" && m.mediaUrl) ??
    memories.find((m) => m.kind === "story") ??
    memories[0] ??
    null;
  const canManageTreeVisibility =
    tree?.role === "founder" || tree?.role === "steward";

  const recentMemories = memories.slice(0, 20);

  if (isPending || loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Shimmer width={180} height={14} />
        <Shimmer width={280} height={10} />
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        color: "var(--ink)",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          height: 52,
          background: "rgba(246,241,231,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 12,
        }}
      >
        <a
          href="/dashboard"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textDecoration: "none",
            padding: "4px 0",
          }}
        >
          ← Home
        </a>
        <span style={{ color: "var(--rule)", fontSize: 12 }}>·</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 17,
            color: "var(--ink)",
          }}
        >
          {tree?.name ?? "Heirloom"}
        </span>

        <div style={{ flex: 1 }} />

        <a
          href={`/trees/${treeId}/map`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 12px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          Map
        </a>

        {/* Inbox bell */}
        <a
          href={`/trees/${treeId}/inbox`}
          style={{
            position: "relative",
            fontFamily: "var(--font-ui)",
            fontSize: 18,
            color: "var(--ink-faded)",
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 10px",
            cursor: "pointer",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
          title="Inbox"
        >
          ✉
          {inboxCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--rose)", color: "#fff", fontFamily: "var(--font-ui)", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {inboxCount > 9 ? "9+" : inboxCount}
            </span>
          )}
        </a>

        <button
          onClick={() => setSearchOpen(true)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "5px 12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>⌕</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Search
            <kbd
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: 3,
                padding: "1px 4px",
                color: "var(--ink-faded)",
              }}
            >
              ⌘K
            </kbd>
          </span>
        </button>

        <button
          onClick={() => setWizardOpen(true)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: 500,
            color: "white",
            background: "var(--moss)",
            border: "none",
            borderRadius: 6,
            padding: "5px 14px",
            cursor: "pointer",
          }}
        >
          + Add memory
        </button>
      </header>

      {/* Hero section */}
      <section
        style={{
          position: "relative",
          height: "min(60vh, 480px)",
          overflow: "hidden",
          background: "var(--ink)",
        }}
      >
        {featuredMemory?.kind === "photo" && featuredMemory.mediaUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={featuredMemory.mediaUrl}
              alt={featuredMemory.title}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "sepia(20%) brightness(0.7)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(28,25,21,0.85) 0%, rgba(28,25,21,0.2) 60%, transparent 100%)",
              }}
            />
          </>
        ) : (
          // No photo — sepia gradient with tree name
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `
                radial-gradient(ellipse at 30% 60%, rgba(176,139,62,0.18) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 20%, rgba(78,93,66,0.15) 0%, transparent 50%),
                #1C1915
              `,
            }}
          />
        )}

        {/* Hero content */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: "max(40px, 5vw)",
            right: "max(40px, 5vw)",
            animation: `bloom 600ms ${EASE}`,
          }}
        >
          {featuredMemory ? (
            <>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "rgba(246,241,231,0.55)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: 8,
                }}
              >
                {featuredMemory.kind === "photo"
                  ? "From the archive"
                  : featuredMemory.kind === "story"
                  ? "A story"
                  : "A memory"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(24px, 4vw, 40px)",
                  color: "rgba(246,241,231,0.95)",
                  lineHeight: 1.2,
                  marginBottom: 10,
                  maxWidth: "60ch",
                }}
              >
                {featuredMemory.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontStyle: "italic",
                  fontSize: 14,
                  color: "rgba(246,241,231,0.65)",
                }}
              >
                {featuredMemory.personName ?? ""}
                {featuredMemory.personName && featuredMemory.dateOfEventText ? " · " : ""}
                {featuredMemory.dateOfEventText ?? ""}
              </div>
              {canManageTreeVisibility && (
                <div style={{ marginTop: 16, maxWidth: 240 }}>
                  <MemoryVisibilityControl
                    memory={featuredMemory}
                    disabled={updatingMemoryVisibilityId === featuredMemory.id}
                    onChange={(visibility) => {
                      void setMemoryTreeVisibility(featuredMemory.id, visibility);
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "rgba(246,241,231,0.45)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: 10,
                }}
              >
                A private family archive
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 5vw, 52px)",
                  color: "rgba(246,241,231,0.9)",
                  lineHeight: 1.15,
                }}
              >
                {tree?.name ?? "Family Archive"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontStyle: "italic",
                  fontSize: 15,
                  color: "rgba(246,241,231,0.5)",
                  marginTop: 10,
                }}
              >
                Begin by adding the first memory.
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA row */}
      <section
        style={{
          padding: "28px max(24px, 5vw)",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setDriftOpen(true)}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontStyle: "italic",
            color: "var(--paper)",
            background: "var(--ink)",
            border: "none",
            borderRadius: 8,
            padding: "11px 24px",
            cursor: "pointer",
            letterSpacing: "0.01em",
            transition: `opacity 200ms ${EASE}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          Begin drifting ›
        </button>

        <a
          href={`/trees/${treeId}`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            color: "var(--moss)",
            background: "none",
            border: "1.5px solid var(--moss)",
            borderRadius: 8,
            padding: "10px 22px",
            textDecoration: "none",
            transition: `background 200ms ${EASE}`,
            display: "inline-block",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(78,93,66,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          Enter the constellation →
        </a>

        <div style={{ flex: 1 }} />

        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          {people.length} {people.length === 1 ? "person" : "people"} · {memories.length}{" "}
          {memories.length === 1 ? "memory" : "memories"}
        </div>
      </section>

      {/* Divider */}
      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--rule)",
          margin: "0 max(24px, 5vw)",
        }}
      />

      {/* Recent memories strip */}
      {recentMemories.length > 0 && (
        <section style={{ padding: "28px 0 0" }}>
          <div
            style={{
              padding: "0 max(24px, 5vw)",
              marginBottom: 16,
              display: "flex",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                color: "var(--ink)",
                margin: 0,
                fontWeight: 400,
              }}
            >
              Recently added
            </h2>
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
              }}
            >
              {recentMemories.length} memories
            </span>
          </div>

          <div
            style={{
              overflowX: "auto",
              paddingBottom: 16,
              paddingLeft: "max(24px, 5vw)",
              paddingRight: "max(24px, 5vw)",
              display: "flex",
              gap: 12,
              scrollbarWidth: "none",
            }}
          >
            {recentMemories.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                extraControls={
                  canManageTreeVisibility ? (
                    <MemoryVisibilityControl
                      memory={m}
                      disabled={updatingMemoryVisibilityId === m.id}
                      onChange={(visibility) => {
                        void setMemoryTreeVisibility(m.id, visibility);
                      }}
                    />
                  ) : undefined
                }
                onClick={() => {
                  if (m.primaryPersonId) {
                    router.push(`/trees/${treeId}/people/${m.primaryPersonId}`);
                  }
                }}
              />
            ))}
            {memories.length > 20 && (
              <a
                href={`/trees/${treeId}`}
                style={{
                  background: "var(--paper-deep)",
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  flexShrink: 0,
                  width: 200,
                  height: 156,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: `box-shadow 200ms ${EASE}`,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    color: "var(--ink-faded)",
                  }}
                >
                  +{memories.length - 20}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                  }}
                >
                  more in the constellation
                </span>
              </a>
            )}
          </div>
        </section>
      )}

      {/* Divider */}
      {recentMemories.length > 0 && (
        <hr
          style={{
            border: "none",
            borderTop: "1px solid var(--rule)",
            margin: "20px max(24px, 5vw) 0",
          }}
        />
      )}

      {/* The family */}
      <section style={{ padding: "28px max(24px, 5vw) 60px" }}>
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              color: "var(--ink)",
              margin: 0,
              fontWeight: 400,
            }}
          >
            The family
          </h2>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
          <div style={{ flex: 1 }} />
          <a
            href={`/trees/${treeId}/people/new`}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--moss)",
              textDecoration: "none",
            }}
          >
            + Add person
          </a>
        </div>

        {people.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              fontFamily: "var(--font-body)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink-faded)",
            }}
          >
            No one in the archive yet.{" "}
            <a
              href={`/trees/${treeId}/people/new`}
              style={{ color: "var(--moss)", textDecoration: "underline" }}
            >
              Add the first person
            </a>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {people.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                onClick={() => handlePersonClick(p.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* DriftMode */}
      <AnimatePresence>
        {driftOpen && (
          <DriftMode
            treeId={treeId}
            people={people.map((p) => ({
              id: p.id,
              name: p.name,
              birthYear: p.birthYear,
              deathYear: p.deathYear,
              essenceLine: p.essenceLine,
              portraitUrl: p.portraitUrl,
              linkedUserId: p.linkedUserId,
            }))}
            onClose={() => setDriftOpen(false)}
            onPersonDetail={handlePersonClick}
            apiBase={API}
          />
        )}
      </AnimatePresence>

      {/* Add Memory wizard */}
      {wizardOpen && (
        <AddMemoryWizard
          treeId={treeId}
          people={apiPeople}
          apiBase={API}
          onClose={() => setWizardOpen(false)}
          onSuccess={refreshMemories}
        />
      )}

      {/* Search overlay */}
      <SearchOverlay
        treeId={treeId}
        people={people.map((p) => ({
          id: p.id,
          name: p.name,
          portraitUrl: p.portraitUrl,
          essenceLine: p.essenceLine,
          birthYear: p.birthYear,
          deathYear: p.deathYear,
        }))}
        memories={memories}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </main>
  );
}
