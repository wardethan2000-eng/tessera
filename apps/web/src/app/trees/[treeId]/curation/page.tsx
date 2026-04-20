"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface CurationMemory {
  id: string;
  title: string;
  kind: string;
  primaryPersonName: string | null;
  createdAt: string;
}

interface Queue {
  needsDate: CurationMemory[];
  needsPlace: CurationMemory[];
  needsPeople: CurationMemory[];
}

type Section = "needsDate" | "needsPlace" | "needsPeople";

const SECTION_META: Record<Section, { label: string; fieldLabel: string; placeholder: string }> = {
  needsDate: {
    label: "Missing date",
    fieldLabel: "When did this happen?",
    placeholder: "June 1987  or  Summer 1987  or  15 Jun 1987",
  },
  needsPlace: {
    label: "Missing place",
    fieldLabel: "Where did this happen?",
    placeholder: "Chicago, Illinois  or  Grandma's house",
  },
  needsPeople: {
    label: "Missing people",
    fieldLabel: "Who else is in this memory?",
    placeholder: "Tag people by searching… (coming soon)",
  },
};

export default function CurationPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("needsDate");

  // Per-card inline edit state: memoryId → draft value
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  const fetchQueue = useCallback(async () => {
    if (!treeId) return;
    const res = await fetch(`${API}/api/trees/${treeId}/curation/queue`, {
      credentials: "include",
    });
    if (res.ok) setQueue(await res.json());
    setLoading(false);
  }, [treeId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  async function saveField(memoryId: string, section: Section) {
    const value = drafts[memoryId]?.trim();
    if (!value) return;
    setSaving((s) => ({ ...s, [memoryId]: true }));

    const body: Record<string, string> =
      section === "needsDate"
        ? { dateOfEventText: value }
        : { placeLabelOverride: value };

    const res = await fetch(`${API}/api/trees/${treeId}/memories/${memoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });

    setSaving((s) => ({ ...s, [memoryId]: false }));

    if (res.ok) {
      setSaved((s) => ({ ...s, [memoryId]: true }));
      // Remove from queue after short delay so user sees the tick
      setTimeout(() => {
        setQueue((q) => {
          if (!q) return q;
          return { ...q, [section]: q[section].filter((m) => m.id !== memoryId) };
        });
      }, 800);
    }
  }

  function skipCard(memoryId: string, section: Section) {
    setQueue((q) => {
      if (!q) return q;
      return { ...q, [section]: q[section].filter((m) => m.id !== memoryId) };
    });
  }

  if (isPending || loading) {
    return (
      <main style={pageStyle}>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)" }}>Loading…</p>
      </main>
    );
  }

  const totalCount = queue
    ? queue.needsDate.length + queue.needsPlace.length + queue.needsPeople.length
    : 0;

  const sections: Section[] = ["needsDate", "needsPlace", "needsPeople"];
  const currentItems = queue?.[activeSection] ?? [];
  const meta = SECTION_META[activeSection];

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 660, width: "100%", margin: "0 auto" }}>

        {/* Header */}
        <button
          onClick={() => router.push(`/trees/${treeId}/atrium`)}
          style={backBtnStyle}
        >
          ← Back to archive
        </button>

        <h1 style={headingStyle}>Curation queue</h1>
        <p style={subheadStyle}>
          {totalCount === 0
            ? "Everything looks complete — nothing to curate right now."
            : `${totalCount} ${totalCount === 1 ? "memory needs" : "memories need"} a little attention.`}
        </p>

        {totalCount > 0 && (
          <>
            {/* Section tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
              {sections.map((s) => {
                const count = queue?.[s].length ?? 0;
                const isActive = s === activeSection;
                return (
                  <button
                    key={s}
                    onClick={() => setActiveSection(s)}
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: isActive ? "1px solid var(--moss)" : "1px solid var(--rule)",
                      background: isActive ? "var(--moss)" : "var(--paper)",
                      color: isActive ? "var(--paper)" : count === 0 ? "var(--ink-faded)" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    {SECTION_META[s].label}
                    {count > 0 && (
                      <span style={{ marginLeft: 6, opacity: 0.75 }}>({count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Cards */}
            {currentItems.length === 0 ? (
              <div style={emptyCardStyle}>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
                  All done for this category ✓
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {currentItems.map((memory) => {
                  const isSaved = saved[memory.id];
                  const isSaving = saving[memory.id];
                  const draft = drafts[memory.id] ?? "";
                  const isPeopleSection = activeSection === "needsPeople";

                  return (
                    <div key={memory.id} style={cardStyle}>
                      {/* Memory info */}
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: "0 0 2px" }}>
                          {memory.title}
                        </p>
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>
                          {memory.kind}
                          {memory.primaryPersonName && ` · ${memory.primaryPersonName}`}
                          {` · ${new Date(memory.createdAt).toLocaleDateString()}`}
                        </p>
                      </div>

                      {isSaved ? (
                        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", margin: 0 }}>
                          ✓ Saved
                        </p>
                      ) : isPeopleSection ? (
                        <div>
                          <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: "0 0 8px" }}>
                            {meta.fieldLabel}
                          </p>
                          <a
                            href={`/trees/${treeId}/people/${memory.id}`}
                            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--moss)", textDecoration: "underline" }}
                          >
                            Open memory to tag people →
                          </a>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            type="text"
                            placeholder={meta.placeholder}
                            value={draft}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [memory.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveField(memory.id, activeSection);
                            }}
                            style={inputStyle}
                          />
                          <button
                            onClick={() => saveField(memory.id, activeSection)}
                            disabled={isSaving || !draft.trim()}
                            style={saveBtnStyle}
                          >
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => skipCard(memory.id, activeSection)}
                            style={skipBtnStyle}
                          >
                            Skip
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--paper)",
  padding: "48px 24px",
};

const backBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  marginBottom: 32,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 400,
  color: "var(--ink)",
  margin: "0 0 6px",
};

const subheadStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--ink-soft)",
  margin: "0 0 36px",
  lineHeight: 1.6,
};

const cardStyle: React.CSSProperties = {
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  padding: "18px 20px",
};

const emptyCardStyle: React.CSSProperties = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink)",
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "8px 12px",
  outline: "none",
};

const saveBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--paper)",
  background: "var(--moss)",
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  cursor: "pointer",
};

const skipBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "8px 4px",
};
