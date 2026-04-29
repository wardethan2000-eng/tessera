"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

interface ActivityQuestion {
  id: string;
  questionText: string;
  position: number;
  sentAt: string | null;
  sentPromptId: string | null;
}

interface ActivityRecipient {
  id: string;
  email: string;
  status: string;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
  repliedCount: number;
  reminderCount: number;
}

interface ActivityReply {
  promptId: string;
  questionText: string;
  memoryId: string;
  memoryTitle: string;
  createdAt: string;
}

interface RecipientSummary {
  total: number;
  active: number;
  bounced: number;
  optedOut: number;
  totalReplies: number;
}

interface CampaignActivity {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  campaignType: string | null;
  cadenceDays: number;
  nextSendAt: string;
  lastSentAt: string | null;
  toPerson: { id: string; name: string } | null;
  fromUser: { id: string; name: string | null } | null;
  questions: ActivityQuestion[];
  sentCount: number;
  totalCount: number;
  recipients: ActivityRecipient[];
  recipientSummary: RecipientSummary;
  recentReplies: ActivityReply[];
}

type Tab = "overview" | "questions" | "recipients" | "replies";

export default function CampaignDetailPage() {
  const params = useParams<{ treeId: string; campaignId: string }>();
  const treeId = params?.treeId ?? "";
  const campaignId = params?.campaignId ?? "";
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [activity, setActivity] = useState<CampaignActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!treeId || !campaignId) return;
    setLoading(true);
    setErr(null);
    const res = await fetch(
      `${API}/api/trees/${treeId}/prompt-campaigns/${campaignId}/activity`,
      { credentials: "include" },
    );
    if (res.ok) {
      setActivity((await res.json()) as CampaignActivity);
    } else {
      const data = await res.json().catch(() => ({}));
      setErr((data as { error?: string }).error ?? "Failed to load campaign");
    }
    setLoading(false);
  }, [treeId, campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (sessionLoading) return null;
  if (!session?.user) {
    return (
      <main style={{ padding: 32, fontFamily: "var(--font-ui)" }}>
        Please sign in.
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "32px 24px 64px" }}>
      <div style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => router.push(`/trees/${treeId}/prompts/campaigns`)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          &larr; All campaigns
        </button>
      </div>

      {loading ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)" }}>Loading&hellip;</p>
      ) : err ? (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            color: "#a23a30",
            padding: 20,
            background: "rgba(162,58,48,0.06)",
            borderRadius: 10,
          }}
        >
          {err}
        </div>
      ) : activity ? (
        <>
          <CampaignHeader activity={activity} treeId={treeId} onChanged={refresh} />
          <TabBar tab={tab} onChange={setTab} />
          {tab === "overview" && <OverviewTab activity={activity} treeId={treeId} onChanged={refresh} />}
          {tab === "questions" && <QuestionsTab activity={activity} treeId={treeId} />}
          {tab === "recipients" && (
            <RecipientsTab activity={activity} treeId={treeId} campaignId={campaignId} onChanged={refresh} />
          )}
          {tab === "replies" && <RepliesTab activity={activity} treeId={treeId} />}
        </>
      ) : null}
    </main>
  );
}

function CampaignHeader({
  activity,
  treeId,
  onChanged,
}: {
  activity: CampaignActivity;
  treeId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`${API}/api/trees/${treeId}/prompt-campaigns/${activity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setBusy(false);
    onChanged();
  }

  async function sendTest() {
    if (!confirm("Send the next question right now? This advances the schedule.")) return;
    setBusy(true);
    const res = await fetch(
      `${API}/api/trees/${treeId}/prompt-campaigns/${activity.id}/send-test`,
      { method: "POST", credentials: "include" },
    );
    const data = (await res.json()) as { error?: string; sent?: number; recipients?: number };
    setBusy(false);
    if (!res.ok) {
      alert(data.error ?? "Could not send");
    } else {
      alert(`Sent to ${data.sent ?? 0} of ${data.recipients ?? 0} recipients.`);
      onChanged();
    }
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {activity.name}
          </h1>
          <StatusBadge status={activity.status} />
          {activity.campaignType && (
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: "var(--ink-faded)",
                background: "var(--paper-deep)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {activity.campaignType.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "var(--ink-soft)",
            lineHeight: 1.5,
          }}
        >
          {activity.toPerson && `About ${activity.toPerson.name}`}
          {activity.fromUser && ` \u00b7 Started by ${activity.fromUser.name ?? "a tree member"}`}
        </div>
      </div>
      <div
        style={{ display: "flex", gap: 6, flexWrap: "wrap", opacity: busy ? 0.6 : 1 }}
      >
        <SmallBtn onClick={sendTest}>Send test</SmallBtn>
        {activity.status === "active" && (
          <SmallBtn onClick={() => patch({ status: "paused" })}>Pause</SmallBtn>
        )}
        {activity.status === "paused" && (
          <SmallBtn onClick={() => patch({ status: "active" })}>Resume</SmallBtn>
        )}
      </div>
    </header>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "questions", label: "Questions" },
    { key: "recipients", label: "Recipients" },
    { key: "replies", label: "Replies" },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--rule)",
        marginBottom: 20,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            padding: "10px 16px",
            background: "none",
            border: "none",
            borderBottom: tab === t.key ? "2px solid var(--moss)" : "2px solid transparent",
            color: tab === t.key ? "var(--ink)" : "var(--ink-faded)",
            cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Overview Tab ---- */

function OverviewTab({
  activity,
  treeId,
  onChanged,
}: {
  activity: CampaignActivity;
  treeId: string;
  onChanged: () => void;
}) {
  const [sendingReminder, setSendingReminder] = useState(false);

  async function sendReminder() {
    if (!confirm("Send a gentle reminder about the last question to active recipients?")) return;
    setSendingReminder(true);
    const res = await fetch(
      `${API}/api/trees/${treeId}/prompt-campaigns/${activity.id}/reminders`,
      { method: "POST", credentials: "include" },
    );
    const data = (await res.json()) as { sent?: number; error?: string };
    setSendingReminder(false);
    if (!res.ok) {
      alert(data.error ?? "Could not send reminders");
    } else {
      alert(`Reminder sent to ${data.sent ?? 0} recipients.`);
      onChanged();
    }
  }

  const nextDate = new Date(activity.nextSendAt);
  const isOverdue = nextDate < new Date() && activity.status === "active";
  const summary = activity.recipientSummary;

  return (
    <div>
      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard label="Questions sent" value={`${activity.sentCount} / ${activity.totalCount}`} />
        <StatCard
          label="Cadence"
          value={activity.cadenceDays === 7 ? "Weekly" : activity.cadenceDays === 14 ? "Biweekly" : activity.cadenceDays === 30 ? "Monthly" : `${activity.cadenceDays}d`}
        />
        <StatCard
          label="Next send"
          value={
            activity.status === "completed"
              ? "Done"
              : isOverdue
                ? "Due now"
                : nextDate.toLocaleDateString()
          }
          highlight={isOverdue}
        />
        <StatCard label="Active recipients" value={`${summary.active} / ${summary.total}`} />
        <StatCard label="Total replies" value={String(summary.totalReplies)} />
      </div>

      {/* Actions */}
      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 10,
          padding: 16,
          background: "var(--paper-deep)",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Actions
        </span>
        <button
          type="button"
          onClick={sendReminder}
          disabled={sendingReminder || activity.status !== "active"}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            padding: "6px 14px",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            background: "var(--paper)",
            color: sendingReminder ? "var(--ink-faded)" : "var(--ink-soft)",
            cursor: sendingReminder || activity.status !== "active" ? "not-allowed" : "pointer",
          }}
        >
          {sendingReminder ? "Sending\u2026" : "Send gentle reminder"}
        </button>
      </div>

      {/* Recent replies preview */}
      {activity.recentReplies.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--ink-faded)",
              margin: "0 0 8px",
            }}
          >
            Recent replies
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activity.recentReplies.slice(0, 3).map((r, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 12px",
                  background: "var(--paper-deep)",
                  borderRadius: 6,
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{r.memoryTitle || r.questionText}</span>
                <span style={{ fontSize: 11, color: "var(--ink-faded)" }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last sent */}
      {activity.lastSentAt && (
        <div
          style={{
            marginTop: 12,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          Last question sent: {new Date(activity.lastSentAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          color: "var(--ink-faded)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          fontWeight: 500,
          color: highlight ? "var(--moss)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ---- Questions Tab ---- */

function QuestionsTab({
  activity,
  treeId,
}: {
  activity: CampaignActivity;
  treeId: string;
}) {
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<string | null>(null);

  async function submitFollowUp(promptId: string) {
    if (!followUpQuestion.trim()) return;
    setFollowUpSubmitting(true);
    const res = await fetch(
      `${API}/api/trees/${treeId}/prompts/${promptId}/follow-ups`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText: followUpQuestion.trim() }),
      },
    );
    setFollowUpSubmitting(false);
    if (res.ok) {
      setFollowUpQuestion("");
      setFollowUpTarget(null);
      alert("Follow-up question added.");
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "Could not add follow-up");
    }
  }

  return (
    <div>
      <ol
        style={{
          paddingLeft: 0,
          margin: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {activity.questions.map((q) => (
          <li
            key={q.id}
            style={{
              padding: "12px 14px",
              border: "1px solid var(--rule)",
              borderRadius: 8,
              background: "var(--paper)",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                minWidth: 22,
                textAlign: "right",
                paddingTop: 2,
              }}
            >
              {q.position + 1}.
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  color: q.sentAt ? "var(--ink-soft)" : "var(--ink)",
                  lineHeight: 1.5,
                }}
              >
                {q.questionText}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  marginTop: 4,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {q.sentAt ? (
                  <>
                    <span style={{ color: "var(--moss)" }}>Sent</span>
                    <span>{new Date(q.sentAt).toLocaleDateString()}</span>
                  </>
                ) : (
                  <span>Pending</span>
                )}
                {q.sentPromptId && (
                  <button
                    type="button"
                    onClick={() => setFollowUpTarget(followUpTarget === q.sentPromptId ? null : q.sentPromptId!)}
                    style={{
                      background: "none",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: 10,
                      color: "var(--ink-soft)",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    Follow up
                  </button>
                )}
              </div>
              {followUpTarget === q.sentPromptId && (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 6,
                    alignItems: "flex-start",
                  }}
                >
                  <input
                    type="text"
                    value={followUpQuestion}
                    onChange={(e) => setFollowUpQuestion(e.target.value)}
                    placeholder="Type a follow-up question&hellip;"
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      padding: "6px 10px",
                      border: "1px solid var(--rule)",
                      borderRadius: 4,
                      background: "var(--paper-deep)",
                      color: "var(--ink)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => submitFollowUp(q.sentPromptId!)}
                    disabled={!followUpQuestion.trim() || followUpSubmitting}
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      padding: "6px 12px",
                      background: "var(--moss)",
                      color: "var(--paper)",
                      border: "none",
                      borderRadius: 4,
                      cursor: followUpQuestion.trim() ? "pointer" : "not-allowed",
                      opacity: followUpSubmitting ? 0.6 : 1,
                    }}
                  >
                    {followUpSubmitting ? "Adding\u2026" : "Add"}
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---- Recipients Tab ---- */

function RecipientsTab({
  activity,
  treeId,
  campaignId,
  onChanged,
}: {
  activity: CampaignActivity;
  treeId: string;
  campaignId: string;
  onChanged: () => void;
}) {
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  async function sendReminderFor(recipientId: string) {
    setSendingReminder(recipientId);
    const res = await fetch(
      `${API}/api/trees/${treeId}/prompt-campaigns/${campaignId}/reminders`,
      { method: "POST", credentials: "include" },
    );
    setSendingReminder(null);
    if (res.ok) {
      alert("Reminder sent.");
      onChanged();
    } else {
      alert("Could not send reminder.");
    }
  }

  const summary = activity.recipientSummary;

  return (
    <div>
      {/* Summary bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 14,
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-faded)",
        }}
      >
        <span>{summary.active} active</span>
        <span>{summary.bounced} bounced</span>
        <span>{summary.optedOut} opted out</span>
        <span>{summary.totalReplies} total replies</span>
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--font-ui)",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: "var(--paper-deep)" }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Last sent</th>
              <th style={thStyle}>Replies</th>
              <th style={thStyle}>Reminders</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {activity.recipients.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--rule)" }}>
                <td style={tdStyle}>
                  <span style={{ color: "var(--ink)" }}>{r.email}</span>
                </td>
                <td style={tdStyle}>
                  <RecipientStatusBadge status={r.status} />
                </td>
                <td style={tdStyle}>
                  {r.lastSentAt ? new Date(r.lastSentAt).toLocaleDateString() : "\u2014"}
                </td>
                <td style={tdStyle}>{r.repliedCount}</td>
                <td style={tdStyle}>{r.reminderCount}</td>
                <td style={tdStyle}>
                  {r.status === "active" && (
                    <button
                      type="button"
                      onClick={() => sendReminderFor(r.id)}
                      disabled={sendingReminder === r.id}
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        padding: "4px 8px",
                        border: "1px solid var(--rule)",
                        borderRadius: 4,
                        background: "var(--paper-deep)",
                        color: "var(--ink-soft)",
                        cursor: sendingReminder === r.id ? "not-allowed" : "pointer",
                        opacity: sendingReminder === r.id ? 0.6 : 1,
                      }}
                    >
                      {sendingReminder === r.id ? "Sending\u2026" : "Nudge"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {activity.recipients.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    ...tdStyle,
                    textAlign: "center",
                    color: "var(--ink-faded)",
                    padding: 24,
                  }}
                >
                  No recipients
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecipientStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active: { bg: "rgba(78,93,66,0.15)", fg: "var(--moss)", label: "Active" },
    bounced: { bg: "rgba(162,58,48,0.12)", fg: "#a23a30", label: "Bounced" },
    opted_out: { bg: "rgba(0,0,0,0.06)", fg: "var(--ink-faded)", label: "Opted out" },
  };
  const c = map[status] ?? { bg: "rgba(0,0,0,0.06)", fg: "var(--ink-faded)", label: status };
  return (
    <span
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        background: c.bg,
        color: c.fg,
        padding: "2px 7px",
        borderRadius: 999,
      }}
    >
      {c.label}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 500,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "var(--ink-faded)",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "var(--ink-soft)",
  fontSize: 12,
};

/* ---- Replies Tab ---- */

function RepliesTab({
  activity,
  treeId,
}: {
  activity: CampaignActivity;
  treeId: string;
}) {
  if (activity.recentReplies.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "40px 20px",
          fontFamily: "var(--font-ui)",
          fontSize: 14,
          color: "var(--ink-faded)",
        }}
      >
        No replies yet. When recipients answer questions, their memories will
        appear here.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {activity.recentReplies.map((r, i) => (
        <Link
          key={i}
          href={`/trees/${treeId}/people/${activity.toPerson?.id ?? ""}?memory=${r.memoryId}`}
          style={{
            display: "block",
            padding: "14px 16px",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            background: "var(--paper)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--ink)",
              marginBottom: 4,
            }}
          >
            {r.memoryTitle || "Untitled memory"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              display: "flex",
              gap: 12,
            }}
          >
            <span>In response to: &ldquo;{r.questionText}&rdquo;</span>
            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ---- Shared components ---- */

function StatusBadge({ status }: { status: CampaignActivity["status"] }) {
  const colorMap: Record<CampaignActivity["status"], { bg: string; fg: string; label: string }> = {
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