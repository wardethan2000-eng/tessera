"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Person {
  id: string;
  name: string;
}

interface CampaignQuestion {
  id: string;
  questionText: string;
  position: number;
  sentAt: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  cadenceDays: number;
  nextSendAt: string;
  lastSentAt: string | null;
  createdAt: string;
  toPerson: { id: string; name: string } | null;
  fromUser: { id: string; name: string | null } | null;
  recipients: { id: string; email: string }[];
  questions: CampaignQuestion[];
  sentCount: number;
  totalCount: number;
}

export default function PromptCampaignsPage() {
  const params = useParams<{ treeId: string }>();
  const treeId = params?.treeId ?? "";
  const { data: session, isPending: sessionLoading } = useSession();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    if (!treeId) return;
    setLoading(true);
    const [cRes, pRes] = await Promise.all([
      fetch(`${API}/api/trees/${treeId}/prompt-campaigns`, { credentials: "include" }),
      fetch(`${API}/api/trees/${treeId}/people`, { credentials: "include" }),
    ]);
    if (cRes.ok) {
      const data = await cRes.json();
      setCampaigns(data.campaigns ?? []);
    }
    if (pRes.ok) {
      const data = await pRes.json();
      setPeople(
        (data.people ?? []).map((p: { id: string; displayName?: string; name?: string }) => ({
          id: p.id,
          name: p.displayName ?? p.name ?? "Unnamed",
        })),
      );
    }
    setLoading(false);
  }, [treeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (sessionLoading) return null;
  if (!session?.user) {
    return (
      <main style={{ padding: 32, fontFamily: "var(--font-ui)" }}>
        Please sign in to manage prompt campaigns.
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 64px" }}>
      <div style={{ marginBottom: 8 }}>
        <Link
          href={`/trees/${treeId}/home`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            textDecoration: "none",
          }}
        >
          ← Back to Atrium
        </Link>
      </div>

      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 30,
              fontWeight: 400,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Prompt campaigns
          </h1>
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--ink-faded)",
              margin: "6px 0 0",
              maxWidth: 560,
              lineHeight: 1.5,
            }}
          >
            A series of questions sent to family members on a cadence (e.g. one a
            week). Replies are added to the archive automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            background: "var(--moss)",
            color: "var(--paper)",
            border: "none",
            borderRadius: 6,
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          New campaign
        </button>
      </header>

      {loading ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)" }}>Loading…</p>
      ) : campaigns.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} treeId={treeId} onChanged={refresh} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCampaignModal
          treeId={treeId}
          people={people}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void refresh();
          }}
        />
      )}
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        border: "1px dashed var(--rule)",
        borderRadius: 12,
        padding: "40px 28px",
        textAlign: "center",
        background: "var(--paper-deep)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          color: "var(--ink)",
          marginBottom: 6,
        }}
      >
        No campaigns yet
      </div>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
          maxWidth: 460,
          margin: "0 auto 18px",
          lineHeight: 1.55,
        }}
      >
        Pick a relative, draft a list of questions, and we'll email one to your
        chosen family members on the cadence you set. Each question becomes a
        prompt anyone can reply to.
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          background: "var(--moss)",
          color: "var(--paper)",
          border: "none",
          borderRadius: 6,
          padding: "10px 18px",
          cursor: "pointer",
        }}
      >
        Start a campaign
      </button>
    </div>
  );
}

function CampaignCard({
  campaign,
  treeId,
  onChanged,
}: {
  campaign: Campaign;
  treeId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`${API}/api/trees/${treeId}/prompt-campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    setBusy(true);
    await fetch(`${API}/api/trees/${treeId}/prompt-campaigns/${campaign.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    onChanged();
  }

  async function sendTest() {
    if (
      !confirm(
        `Send the next question of "${campaign.name}" right now to all ${campaign.recipients.length} recipient${campaign.recipients.length === 1 ? "" : "s"}? This will advance the schedule.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `${API}/api/trees/${treeId}/prompt-campaigns/${campaign.id}/send-test`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json()) as { error?: string; sent?: number; recipients?: number };
      if (!res.ok) {
        alert(data.error ?? "Could not send test");
      } else {
        alert(`Sent to ${data.sent ?? 0} of ${data.recipients ?? 0} recipient${data.recipients === 1 ? "" : "s"}.`);
      }
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  const nextDate = new Date(campaign.nextSendAt);
  const isOverdue = nextDate < new Date() && campaign.status === "active";

  return (
    <article
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 10,
        padding: 18,
        background: "var(--paper)",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 500,
                margin: 0,
                color: "var(--ink)",
              }}
            >
              {campaign.name}
            </h2>
            <StatusBadge status={campaign.status} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              lineHeight: 1.55,
            }}
          >
            For {campaign.toPerson?.name ?? "—"} · every {campaign.cadenceDays} day
            {campaign.cadenceDays === 1 ? "" : "s"} ·{" "}
            {campaign.recipients.length} recipient
            {campaign.recipients.length === 1 ? "" : "s"} ·{" "}
            {campaign.sentCount} of {campaign.totalCount} sent
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <SmallBtn onClick={sendTest}>Send test now</SmallBtn>
          {campaign.status === "active" && (
            <SmallBtn onClick={() => patch({ status: "paused" })}>Pause</SmallBtn>
          )}
          {campaign.status === "paused" && (
            <SmallBtn onClick={() => patch({ status: "active" })}>Resume</SmallBtn>
          )}
          <SmallBtn onClick={remove} danger>Delete</SmallBtn>
        </div>
      </header>

      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: isOverdue ? "var(--moss)" : "var(--ink-faded)",
          marginBottom: 12,
        }}
      >
        {campaign.status === "completed"
          ? "All questions sent."
          : `Next send: ${nextDate.toLocaleString()} ${isOverdue ? "(due now)" : ""}`}
      </div>

      <details>
        <summary
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-soft)",
            cursor: "pointer",
          }}
        >
          {campaign.questions.length} question
          {campaign.questions.length === 1 ? "" : "s"} · {campaign.recipients.length} recipient
          {campaign.recipients.length === 1 ? "" : "s"}
        </summary>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 1.2,
                color: "var(--ink-faded)",
                marginBottom: 4,
              }}
            >
              Recipients
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-soft)" }}>
              {campaign.recipients.map((r) => r.email).join(", ")}
            </div>
          </div>
          <ol style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {campaign.questions.map((q) => (
              <li
                key={q.id}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: q.sentAt ? "var(--ink-faded)" : "var(--ink)",
                }}
              >
                {q.questionText}
                {q.sentAt && (
                  <span style={{ fontSize: 11, color: "var(--ink-faded)", marginLeft: 8 }}>
                    · sent {new Date(q.sentAt).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </article>
  );
}

function StatusBadge({ status }: { status: Campaign["status"] }) {
  const colorMap: Record<Campaign["status"], { bg: string; fg: string; label: string }> = {
    active: { bg: "rgba(78,93,66,0.15)", fg: "var(--moss)", label: "Active" },
    paused: { bg: "rgba(176,139,62,0.15)", fg: "#8a6a26", label: "Paused" },
    completed: { bg: "rgba(0,0,0,0.06)", fg: "var(--ink-faded)", label: "Completed" },
  };
  const c = colorMap[status];
  return (
    <span
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        background: c.bg,
        color: c.fg,
        padding: "3px 8px",
        borderRadius: 12,
      }}
    >
      {c.label}
    </span>
  );
}

function SmallBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: 11,
        padding: "5px 10px",
        border: "1px solid var(--rule)",
        background: "var(--paper)",
        color: danger ? "#a23a30" : "var(--ink-soft)",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CreateCampaignModal({
  treeId,
  people,
  onClose,
  onCreated,
}: {
  treeId: string;
  people: Person[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [toPersonId, setToPersonId] = useState(people[0]?.id ?? "");
  const [cadenceDays, setCadenceDays] = useState(7);
  const [recipients, setRecipients] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!toPersonId && people[0]) setToPersonId(people[0].id);
  }, [people, toPersonId]);

  const recipientList = useMemo(
    () =>
      recipients
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [recipients],
  );
  const filledQuestions = useMemo(
    () => questions.map((q) => q.trim()).filter(Boolean),
    [questions],
  );
  const canSubmit =
    Boolean(name.trim()) &&
    Boolean(toPersonId) &&
    cadenceDays >= 1 &&
    recipientList.length > 0 &&
    filledQuestions.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/prompt-campaigns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          toPersonId,
          cadenceDays,
          recipientEmails: recipientList,
          questions: filledQuestions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,8,6,0.55)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper)",
          borderRadius: 12,
          padding: "22px 24px 24px",
          width: "min(620px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 400,
            margin: "0 0 4px",
            color: "var(--ink)",
          }}
        >
          New prompt campaign
        </h2>
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            margin: "0 0 18px",
            lineHeight: 1.5,
          }}
        >
          Each question will be emailed to the recipients on the cadence you set,
          one at a time. Replies become memories on the chosen person's page.
        </p>

        <Field label="Campaign name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekly questions for Grandma"
            style={inputStyle}
          />
        </Field>

        <Field label="Subject (who is this about?)">
          <select
            value={toPersonId}
            onChange={(e) => setToPersonId(e.target.value)}
            style={inputStyle}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How often (days between sends)">
          <input
            type="number"
            min={1}
            max={365}
            value={cadenceDays}
            onChange={(e) => setCadenceDays(Math.max(1, Number.parseInt(e.target.value || "1", 10)))}
            style={{ ...inputStyle, maxWidth: 120 }}
          />
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--ink-faded)",
              marginLeft: 10,
            }}
          >
            7 = weekly · 14 = biweekly · 30 = monthly
          </span>
        </Field>

        <Field
          label="Recipient emails"
          hint="Comma- or newline-separated. Each receives every question."
        >
          <textarea
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="grandma@example.com, aunt@example.com"
            rows={2}
            style={{ ...inputStyle, fontFamily: "var(--font-ui)", resize: "vertical" }}
          />
        </Field>

        <Field
          label="Questions"
          hint="One per send, in order. Add as many as you like."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <textarea
                  value={q}
                  onChange={(e) => {
                    const next = [...questions];
                    next[i] = e.target.value;
                    setQuestions(next);
                  }}
                  rows={2}
                  placeholder={`Question ${i + 1}`}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    fontFamily: "var(--font-ui)",
                    resize: "vertical",
                  }}
                />
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      padding: "6px 10px",
                      border: "1px solid var(--rule)",
                      background: "var(--paper)",
                      color: "var(--ink-faded)",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setQuestions([...questions, ""])}
              style={{
                alignSelf: "flex-start",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                padding: "6px 12px",
                border: "1px dashed var(--rule)",
                background: "transparent",
                color: "var(--ink-soft)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              + Add question
            </button>
          </div>
        </Field>

        {err && (
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "#a23a30",
              marginBottom: 10,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              padding: "9px 16px",
              border: "1px solid var(--rule)",
              background: "var(--paper)",
              color: "var(--ink-soft)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || submitting}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              padding: "9px 18px",
              background: canSubmit ? "var(--moss)" : "var(--ink-faded)",
              color: "var(--paper)",
              border: "none",
              borderRadius: 6,
              cursor: canSubmit ? "pointer" : "not-allowed",
              minWidth: 130,
            }}
          >
            {submitting ? "Creating…" : "Create campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-faded)",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {hint && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            marginBottom: 6,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink)",
  background: "var(--paper-deep)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "8px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
