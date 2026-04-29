"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";

const API = getApiBase();

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
  campaignType?: string;
  toPerson: { id: string; name: string } | null;
  fromUser: { id: string; name: string | null } | null;
  recipients: { id: string; email: string }[];
  questions: CampaignQuestion[];
  sentCount: number;
  totalCount: number;
}

interface TemplateQuestion {
  id: string;
  position: number;
  questionText: string;
  theme: string;
  tier: string;
  sensitivity: string;
}

interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  campaignType: string;
  theme: string;
  defaultCadenceDays: number;
  sensitivityCeiling: string;
  questionCount: number;
  questions: TemplateQuestion[];
}

const STEPS = [
  { label: "Type", icon: "1" },
  { label: "Subject", icon: "2" },
  { label: "Recipients", icon: "3" },
  { label: "Cadence", icon: "4" },
  { label: "Questions", icon: "5" },
  { label: "Review", icon: "6" },
];

export default function PromptCampaignsPage() {
  const params = useParams<{ treeId: string }>();
  const treeId = params?.treeId ?? "";
  const { data: session, isPending: sessionLoading } = useSession();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

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
      const list = Array.isArray(data) ? data : (data.people ?? []);
      setPeople(
        list.map((p: { id: string; displayName?: string; name?: string }) => ({
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
          &larr; Back to Atrium
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
            A series of questions sent to family members on a cadence. Replies
            are added to the archive automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
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
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)" }}>Loading&hellip;</p>
      ) : campaigns.length === 0 ? (
        <EmptyState onCreate={() => setShowWizard(true)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} treeId={treeId} onChanged={refresh} />
          ))}
        </div>
      )}

      <ElderContributorsPanel treeId={treeId} people={people} />

      {showWizard && (
        <GuidedCampaignWizard
          treeId={treeId}
          people={people}
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
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
        Choose a campaign template, pick a subject, and we&apos;ll walk you
        through setting everything up. Each question becomes a prompt anyone
        can reply to.
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
  const router = useRouter();
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

  async function remove(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    setBusy(true);
    await fetch(`${API}/api/trees/${treeId}/prompt-campaigns/${campaign.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    onChanged();
  }

  async function sendTest(e?: React.MouseEvent) {
    e?.stopPropagation();
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
      onClick={() => router.push(`/trees/${treeId}/prompts/campaigns/${campaign.id}`)}
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 10,
        padding: 18,
        background: "var(--paper)",
        opacity: busy ? 0.6 : 1,
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
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
            {campaign.campaignType && (
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
                {campaign.campaignType.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              lineHeight: 1.55,
            }}
          >
            For {campaign.toPerson?.name ?? "\u2014"} &middot; every{" "}
            {campaign.cadenceDays} day{campaign.cadenceDays === 1 ? "" : "s"}{" "}
            &middot; {campaign.recipients.length} recipient
            {campaign.recipients.length === 1 ? "" : "s"} &middot;{" "}
            {campaign.sentCount} of {campaign.totalCount} sent
          </div>
        </div>
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          onClick={(e) => e.stopPropagation()}
        >
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
          {campaign.questions.length === 1 ? "" : "s"} &middot;{" "}
          {campaign.recipients.length} recipient
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
                    &middot; sent {new Date(q.sentAt).toLocaleDateString()}
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
  onClick: (e?: React.MouseEvent) => void;
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

/* ------------------------------------------------------------------ */
/*  Guided Campaign Wizard (6-step)                                    */
/* ------------------------------------------------------------------ */

function GuidedCampaignWizard({
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
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
  const [toPersonId, setToPersonId] = useState(people[0]?.id ?? "");
  const [recipientText, setRecipientText] = useState("");
  const [cadenceDays, setCadenceDays] = useState(7);
  const [startsAt, setStartsAt] = useState("");
  const [customizations, setCustomizations] = useState<Record<number, string>>({});
  const [removedPositions, setRemovedPositions] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/prompt-campaign-templates`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTemplates((d as { templates: CampaignTemplate[] }).templates))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!toPersonId && people[0]) setToPersonId(people[0].id);
  }, [people, toPersonId]);

  useEffect(() => {
    if (selectedTemplate) setCadenceDays(selectedTemplate.defaultCadenceDays);
  }, [selectedTemplate]);

  const recipientList = useMemo(
    () =>
      recipientText
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [recipientText],
  );

  const activeQuestions = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.questions
      .filter((q) => !removedPositions.has(q.position))
      .map((q) => ({
        ...q,
        questionText: customizations[q.position]?.trim() || q.questionText,
      }));
  }, [selectedTemplate, customizations, removedPositions]);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return Boolean(selectedTemplate);
      case 1: return Boolean(toPersonId);
      case 2: return recipientList.length > 0;
      case 3: return cadenceDays >= 1;
      case 4: return activeQuestions.length > 0;
      case 5: return true;
      default: return false;
    }
  }, [step, selectedTemplate, toPersonId, recipientList.length, cadenceDays, activeQuestions.length]);

  async function submit() {
    if (!selectedTemplate || !toPersonId) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/prompt-campaigns/from-template`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          toPersonId,
          name: selectedTemplate.name,
          cadenceDays,
          recipientEmails: recipientList,
          startsAt: startsAt || undefined,
          customizations,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
    else onClose();
  }

  function goNext() {
    if (step < 5) setStep(step + 1);
    else submit();
  }

  const subjectName = people.find((p) => p.id === toPersonId)?.name ?? "this person";

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
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header with step indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: "20px 24px 0",
            borderBottom: "1px solid var(--rule)",
            paddingBottom: 16,
          }}
        >
          <div style={{ flex: 1, display: "flex", gap: 4 }}>
            {STEPS.map((s, i) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: i <= step ? 1 : 0.4,
                  cursor: i < step ? "pointer" : "default",
                }}
                onClick={() => { if (i < step) setStep(i); }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    fontSize: 11,
                    fontFamily: "var(--font-ui)",
                    fontWeight: 600,
                    background: i < step ? "var(--moss)" : i === step ? "var(--ink)" : "var(--paper-deep)",
                    color: i <= step ? "var(--paper)" : "var(--ink-faded)",
                  }}
                >
                  {i < step ? "\u2713" : s.icon}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: i <= step ? "var(--ink)" : "var(--ink-faded)",
                    display: i === step || i < step ? "inline" : "none",
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {step === 0 && (
            <StepChooseType
              templates={templates}
              selected={selectedTemplate}
              onSelect={setSelectedTemplate}
            />
          )}
          {step === 1 && (
            <StepChooseSubject
              people={people}
              selected={toPersonId}
              onSelect={setToPersonId}
            />
          )}
          {step === 2 && (
            <StepChooseRecipients
              value={recipientText}
              onChange={setRecipientText}
              count={recipientList.length}
            />
          )}
          {step === 3 && (
            <StepCadence
              cadenceDays={cadenceDays}
              setCadenceDays={setCadenceDays}
              startsAt={startsAt}
              setStartsAt={setStartsAt}
            />
          )}
          {step === 4 && selectedTemplate && (
            <StepCustomizeQuestions
              template={selectedTemplate}
              customizations={customizations}
              setCustomizations={setCustomizations}
              removedPositions={removedPositions}
              setRemovedPositions={setRemovedPositions}
            />
          )}
          {step === 5 && selectedTemplate && (
            <StepReview
              template={selectedTemplate}
              subjectName={subjectName}
              recipientCount={recipientList.length}
              cadenceDays={cadenceDays}
              startsAt={startsAt}
              questions={activeQuestions}
            />
          )}

          {err && (
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "#a23a30",
                marginTop: 12,
              }}
            >
              {err}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "14px 24px",
            borderTop: "1px solid var(--rule)",
          }}
        >
          <button
            type="button"
            onClick={goBack}
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
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canAdvance || submitting}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              padding: "9px 18px",
              background: canAdvance ? "var(--moss)" : "var(--ink-faded)",
              color: "var(--paper)",
              border: "none",
              borderRadius: 6,
              cursor: canAdvance ? "pointer" : "not-allowed",
              minWidth: 130,
            }}
          >
            {submitting
              ? "Creating\u2026"
              : step === 5
                ? "Start campaign"
                : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Step 1: Choose campaign type ---- */

function StepChooseType({
  templates,
  selected,
  onSelect,
}: {
  templates: CampaignTemplate[];
  selected: CampaignTemplate | null;
  onSelect: (t: CampaignTemplate) => void;
}) {
  if (templates.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)" }}>
          Loading campaign templates&hellip;
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          margin: "0 0 4px",
          color: "var(--ink)",
        }}
      >
        What kind of campaign?
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
          margin: "0 0 18px",
          lineHeight: 1.5,
        }}
      >
        Each template comes with curated questions chosen for their theme and
        sensitivity. You can customize them in a later step.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {templates.map((t) => {
          const isSelected = selected?.id === t.id;
          const cadenceLabel =
            t.defaultCadenceDays === 7
              ? "Weekly"
              : t.defaultCadenceDays === 14
                ? "Biweekly"
                : t.defaultCadenceDays === 30
                  ? "Monthly"
                  : `Every ${t.defaultCadenceDays} days`;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              style={{
                textAlign: "left",
                padding: 16,
                border: isSelected ? "2px solid var(--moss)" : "1px solid var(--rule)",
                borderRadius: 10,
                background: isSelected ? "rgba(78,93,66,0.06)" : "var(--paper-deep)",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 500,
                  color: "var(--ink)",
                  marginBottom: 4,
                }}
              >
                {t.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.5,
                  marginBottom: 8,
                }}
              >
                {t.description}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={pillStyle}>{t.theme.replace(/_/g, " ")}</span>
                <span style={pillStyle}>{t.questionCount} questions</span>
                <span style={pillStyle}>{cadenceLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  background: "var(--paper)",
  border: "1px solid var(--rule)",
  padding: "2px 8px",
  borderRadius: 999,
  color: "var(--ink-faded)",
};

/* ---- Step 2: Choose subject ---- */

function StepChooseSubject({
  people,
  selected,
  onSelect,
}: {
  people: Person[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          margin: "0 0 4px",
          color: "var(--ink)",
        }}
      >
        Who is this about?
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
          margin: "0 0 18px",
          lineHeight: 1.5,
        }}
      >
        All questions in this campaign will be about this person. Their name
        will appear in each email.
      </p>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          ...inputStyle,
          maxWidth: 360,
        }}
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {selected && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--ink-soft)",
            margin: "12px 0 0",
            fontStyle: "italic",
          }}
        >
          All questions will be about{" "}
          <strong>{people.find((p) => p.id === selected)?.name ?? "this person"}</strong>.
        </p>
      )}
    </div>
  );
}

/* ---- Step 3: Choose recipients ---- */

function StepChooseRecipients({
  value,
  onChange,
  count,
}: {
  value: string;
  onChange: (v: string) => void;
  count: number;
}) {
  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          margin: "0 0 4px",
          color: "var(--ink)",
        }}
      >
        Who will receive the questions?
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
          margin: "0 0 4px",
          lineHeight: 1.5,
        }}
      >
        Each person will receive every question on the cadence you choose. They
        can reply without logging in &mdash; we send them a private link.
      </p>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-faded)",
          margin: "0 0 14px",
          lineHeight: 1.4,
        }}
      >
        Enter email addresses, comma- or newline-separated.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="grandma@example.com, aunt@example.com"
        rows={3}
        style={{ ...inputStyle, fontFamily: "var(--font-ui)", resize: "vertical" }}
      />
      {count > 0 && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--moss)",
            marginTop: 6,
          }}
        >
          {count} recipient{count === 1 ? "" : "s"} will receive questions
        </div>
      )}
    </div>
  );
}

/* ---- Step 4: Cadence + start date ---- */

function StepCadence({
  cadenceDays,
  setCadenceDays,
  startsAt,
  setStartsAt,
}: {
  cadenceDays: number;
  setCadenceDays: (d: number) => void;
  startsAt: string;
  setStartsAt: (d: string) => void;
}) {
  const presets = [
    { days: 7, label: "Weekly" },
    { days: 14, label: "Biweekly" },
    { days: 30, label: "Monthly" },
  ];

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          margin: "0 0 4px",
          color: "var(--ink)",
        }}
      >
        How often should questions arrive?
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
          margin: "0 0 18px",
          lineHeight: 1.5,
        }}
      >
        A slower cadence gives people more time to think. Weekly is a good
        default; biweekly or monthly may suit gentle reminiscence better.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {presets.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setCadenceDays(p.days)}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              padding: "8px 16px",
              border: cadenceDays === p.days ? "2px solid var(--moss)" : "1px solid var(--rule)",
              borderRadius: 6,
              background: cadenceDays === p.days ? "rgba(78,93,66,0.06)" : "var(--paper-deep)",
              color: cadenceDays === p.days ? "var(--moss)" : "var(--ink-soft)",
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label
        style={{
          display: "block",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-faded)",
          marginBottom: 4,
        }}
      >
        Or set a custom cadence (days between sends)
      </label>
      <input
        type="number"
        min={1}
        max={365}
        value={cadenceDays}
        onChange={(e) => setCadenceDays(Math.max(1, Number.parseInt(e.target.value || "1", 10)))}
        style={{ ...inputStyle, maxWidth: 120 }}
      />

      <div style={{ marginTop: 18 }}>
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            marginBottom: 4,
          }}
        >
          When should the first question send? (optional, defaults to now)
        </label>
        <input
          type="date"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          style={{ ...inputStyle, maxWidth: 200 }}
        />
      </div>
    </div>
  );
}

/* ---- Step 5: Customize questions ---- */

function StepCustomizeQuestions({
  template,
  customizations,
  setCustomizations,
  removedPositions,
  setRemovedPositions,
}: {
  template: CampaignTemplate;
  customizations: Record<number, string>;
  setCustomizations: (c: Record<number, string>) => void;
  removedPositions: Set<number>;
  setRemovedPositions: (s: Set<number>) => void;
}) {
  const questions = template.questions.filter((q) => !removedPositions.has(q.position));
  const hasSensitive = questions.some(
    (q) => q.sensitivity === "careful" || q.sensitivity === "grief_safe",
  );

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          margin: "0 0 4px",
          color: "var(--ink)",
        }}
      >
        Review and customize questions
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-faded)",
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}
      >
        {template.questionCount} questions from the &ldquo;{template.name}&rdquo;
        template. Click any question to edit its wording, or remove ones that
        don&apos;t fit.
      </p>

      {hasSensitive && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "#8a6a26",
            background: "rgba(176,139,62,0.1)",
            border: "1px solid rgba(176,139,62,0.3)",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Some questions may touch on sensitive topics. Consider whether each
          one is appropriate for your family.
        </div>
      )}

      <ol style={{ paddingLeft: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, listStyle: "none" }}>
        {questions.map((q, displayIndex) => {
          const isSensitive = q.sensitivity === "careful" || q.sensitivity === "grief_safe";
          const currentText = customizations[q.position]?.trim() || q.questionText;
          const isCustom = customizations[q.position]?.trim() && customizations[q.position] !== q.questionText;

          return (
            <li key={q.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  minWidth: 20,
                  paddingTop: 9,
                  textAlign: "right",
                }}
              >
                {displayIndex + 1}.
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={pillStyle}>{q.theme.replace(/_/g, " ")}</span>
                  {isSensitive && (
                    <span
                      style={{
                        ...pillStyle,
                        color: "#8a6a26",
                        borderColor: "rgba(176,139,62,0.4)",
                      }}
                    >
                      {q.sensitivity === "grief_safe" ? "grief-aware" : "sensitive"}
                    </span>
                  )}
                  {isCustom && (
                    <span
                      style={{
                        ...pillStyle,
                        color: "var(--moss)",
                        borderColor: "rgba(78,93,66,0.3)",
                      }}
                    >
                      edited
                    </span>
                  )}
                </div>
                <textarea
                  value={customizations[q.position] ?? q.questionText}
                  onChange={(e) =>
                    setCustomizations({ ...customizations, [q.position]: e.target.value })
                  }
                  rows={2}
                  style={{
                    ...inputStyle,
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(removedPositions);
                  next.add(q.position);
                  setRemovedPositions(next);
                }}
                title="Remove this question"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  padding: "6px 10px",
                  border: "1px solid var(--rule)",
                  background: "var(--paper)",
                  color: "var(--ink-faded)",
                  borderRadius: 6,
                  cursor: "pointer",
                  marginTop: 20,
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ol>

      {removedPositions.size > 0 && (
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
          }}
        >
          {removedPositions.size} question{removedPositions.size === 1 ? "" : "s"} removed
          {" \u00b7 "}
          <button
            type="button"
            onClick={() => setRemovedPositions(new Set())}
            style={{
              background: "none",
              border: "none",
              color: "var(--moss)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              padding: 0,
            }}
          >
            Restore all
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- Step 6: Review ---- */

function StepReview({
  template,
  subjectName,
  recipientCount,
  cadenceDays,
  startsAt,
  questions,
}: {
  template: CampaignTemplate;
  subjectName: string;
  recipientCount: number;
  cadenceDays: number;
  startsAt: string;
  questions: Array<{ questionText: string }>;
}) {
  const cadenceLabel =
    cadenceDays === 7
      ? "weekly"
      : cadenceDays === 14
        ? "biweekly"
        : cadenceDays === 30
          ? "monthly"
          : `every ${cadenceDays} days`;

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 400,
          margin: "0 0 4px",
          color: "var(--ink)",
        }}
      >
        Ready to start?
      </h2>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 15,
          color: "var(--ink-soft)",
          margin: "0 0 18px",
          lineHeight: 1.6,
        }}
      >
        {questions.length} question{questions.length === 1 ? "" : "s"} about{" "}
        <strong>{subjectName}</strong>, {cadenceLabel}, to{" "}
        <strong>
          {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
        </strong>
        .
        {startsAt && ` First question sends on ${new Date(startsAt + "T00:00:00").toLocaleDateString()}.`}
      </p>

      <div
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 10,
          padding: 16,
          background: "var(--paper-deep)",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "var(--ink-faded)",
            marginBottom: 8,
          }}
        >
          Preview (first {Math.min(3, questions.length)} questions)
        </div>
        <ol style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {questions.slice(0, 3).map((q, i) => (
            <li
              key={i}
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                color: "var(--ink)",
                lineHeight: 1.5,
              }}
            >
              {q.questionText}
            </li>
          ))}
        </ol>
        {questions.length > 3 && (
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              marginTop: 8,
            }}
          >
            &hellip; and {questions.length - 3} more
          </div>
        )}
      </div>

      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-faded)",
          lineHeight: 1.5,
        }}
      >
        Once started, you can pause or modify the campaign at any time. Each
        recipient gets an email with a private reply link &mdash; no account
        needed.
      </p>
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

/* ------------------------------------------------------------------ */
/*  Elder Contributors Panel (unchanged)                                */
/* ------------------------------------------------------------------ */

interface ElderToken {
  id: string;
  email: string;
  displayName: string | null;
  familyLabel: string | null;
  associatedPerson: { id: string; name: string } | null;
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedUserAgent: string | null;
  lastStandaloneAt: string | null;
  revokedAt: string | null;
}

function prettifyUserAgent(ua: string | null): string {
  if (!ua) return "";
  if (/iPhone|iPad|iPod/.test(ua)) return "iPhone/iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

function elderStatus(t: ElderToken): {
  label: string;
  tone: "muted" | "ok" | "installed";
} {
  if (t.lastStandaloneAt) return { label: "Installed \u2713", tone: "installed" };
  if (t.lastUsedAt) return { label: "Opened", tone: "ok" };
  return { label: "Invited", tone: "muted" };
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ElderContributorsPanel({
  treeId,
  people,
}: {
  treeId: string;
  people: Person[];
}) {
  const [tokens, setTokens] = useState<ElderToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [justMinted, setJustMinted] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!treeId) return;
    setLoading(true);
    const res = await fetch(`${API}/api/trees/${treeId}/elder-capture-tokens`, {
      credentials: "include",
    });
    if (res.ok) {
      const d = (await res.json()) as { tokens: ElderToken[] };
      setTokens(d.tokens);
    }
    setLoading(false);
  }, [treeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = tokens.filter((t) => !t.revokedAt);

  return (
    <section
      style={{
        marginTop: 36,
        padding: 20,
        borderRadius: 10,
        border: "1px solid var(--rule)",
        background: "var(--paper-deep)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              fontSize: 22,
              color: "var(--ink)",
            }}
          >
            Memory contributors
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--ink-faded)",
              maxWidth: 540,
              lineHeight: 1.5,
            }}
          >
            Send a relative their own private memory page (PWA). They install it
            once from email and can share photos, voice notes, and stories any
            time &mdash; no login.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            background: "var(--moss)",
            color: "var(--paper)",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Invite a contributor
        </button>
      </header>

      {justMinted && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-soft)",
            wordBreak: "break-all",
          }}
        >
          Invite sent. Their private link: <code>{justMinted}</code>
        </div>
      )}

      {loading ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)" }}>Loading&hellip;</p>
      ) : active.length === 0 ? (
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)", margin: 0 }}>
          No contributors yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {active.map((t) => {
            const s = elderStatus(t);
            const ua = prettifyUserAgent(t.lastUsedUserAgent);
            const badgeBg =
              s.tone === "installed" ? "#4E5D42" : s.tone === "ok" ? "#B08B3E" : "#847A66";
            return (
              <li
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 6,
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div
                    style={{
                      color: "var(--ink)",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>{t.displayName ?? t.email}</span>
                    <span
                      style={{
                        background: badgeBg,
                        color: "#F6F1E7",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 3,
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div style={{ color: "var(--ink-faded)", fontSize: 12 }}>
                    {t.email}
                    {t.associatedPerson && ` \u00b7 about ${t.associatedPerson.name}`}
                  </div>
                </div>
                <div
                  style={{ color: "var(--ink-faded)", fontSize: 12, minWidth: 120 }}
                >
                  {t.lastUsedAt
                    ? `Opened ${relativeTime(t.lastUsedAt)}${ua ? ` \u00b7 ${ua}` : ""}`
                    : "Not yet opened"}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Send a fresh install email to ${t.email}? This rotates their private link \u2014 the previous one will stop working.`,
                      )
                    )
                      return;
                    const res = await fetch(
                      `${API}/api/trees/${treeId}/elder-capture-tokens/${t.id}/resend`,
                      { method: "POST", credentials: "include" },
                    );
                    if (res.ok) {
                      const d = (await res.json()) as { url?: string };
                      if (d.url) setJustMinted(d.url);
                      await refresh();
                    }
                  }}
                  style={{
                    background: "transparent",
                    color: "var(--moss)",
                    border: "1px solid var(--rule)",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Revoke link for ${t.email}? They will no longer be able to use it.`,
                      )
                    )
                      return;
                    const res = await fetch(
                      `${API}/api/trees/${treeId}/elder-capture-tokens/${t.id}`,
                      { method: "DELETE", credentials: "include" },
                    );
                    if (res.ok) await refresh();
                  }}
                  style={{
                    background: "transparent",
                    color: "#8B2F2F",
                    border: "1px solid #C8A8A8",
                    borderRadius: 4,
                    padding: "4px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Revoke
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showInvite && (
        <InviteContributorModal
          treeId={treeId}
          people={people}
          onClose={() => setShowInvite(false)}
          onMinted={(url) => {
            setJustMinted(url);
            setShowInvite(false);
            void refresh();
          }}
        />
      )}
    </section>
  );
}

function InviteContributorModal({
  treeId,
  people,
  onClose,
  onMinted,
}: {
  treeId: string;
  people: Person[];
  onClose: () => void;
  onMinted: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [associatedPersonId, setAssociatedPersonId] = useState("");
  const [familyLabel, setFamilyLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!associatedPersonId) {
      setError("Choose which person their memories will be tagged to");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`${API}/api/trees/${treeId}/elder-capture-tokens`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        associatedPersonId: associatedPersonId || undefined,
        familyLabel: familyLabel.trim() || undefined,
        sendInviteEmail: true,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setError(err.error ?? "Could not create invite");
      return;
    }
    const d = (await res.json()) as { url: string };
    onMinted(d.url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 25, 21, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--paper-deep)",
          border: "1px solid var(--rule)",
          borderRadius: 10,
          padding: 24,
          width: "min(480px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 22,
            color: "var(--ink)",
          }}
        >
          Invite a memory contributor
        </h3>
        <label style={modalLabelStyle}>
          Their email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={modalInputStyle}
            placeholder="grandma@example.com"
          />
        </label>
        <label style={modalLabelStyle}>
          Their name (optional)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={modalInputStyle}
            placeholder="Mary Ward"
          />
        </label>
        <label style={modalLabelStyle}>
          About which person? <span style={{ color: "#8B2F2F" }}>(required &mdash; memories will be tagged to them)</span>
          <select
            value={associatedPersonId}
            onChange={(e) => setAssociatedPersonId(e.target.value)}
            style={modalInputStyle}
            required
          >
            <option value="">&mdash; choose a person &mdash;</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={modalLabelStyle}>
          Family label (shown on their PWA, optional)
          <input
            value={familyLabel}
            onChange={(e) => setFamilyLabel(e.target.value)}
            style={modalInputStyle}
            placeholder="The Wards"
          />
        </label>
        {error && (
          <p style={{ margin: 0, color: "#8B2F2F", fontFamily: "var(--font-ui)", fontSize: 13 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={modalCancelStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...modalSubmitStyle, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Sending\u2026" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalLabelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 4,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-soft)",
};
const modalInputStyle = {
  fontFamily: "var(--font-ui)",
  fontSize: 14,
  background: "var(--paper)",
  color: "var(--ink)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  padding: "8px 10px",
};
const modalCancelStyle = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  background: "transparent",
  color: "var(--ink-soft)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  padding: "8px 14px",
  cursor: "pointer",
};
const modalSubmitStyle = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  background: "var(--moss)",
  color: "var(--paper)",
  border: "none",
  borderRadius: 4,
  padding: "8px 14px",
  cursor: "pointer",
};