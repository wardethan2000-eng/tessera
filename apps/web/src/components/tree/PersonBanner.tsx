"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ApiPerson, ApiRelationship } from "./treeTypes";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";

const API = "";
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface PersonBannerProps {
  person: ApiPerson | null;
  treeId: string;
  relationships: ApiRelationship[];
  onClose: () => void;
  onEnterLife: (personId: string) => void;
  onAddRelation?: (personId: string, kind: "parent" | "child" | "sibling" | "spouse") => void;
  onPersonUpdated?: () => void;
}

interface ParsedDate {
  month: string;
  day: string;
  year: string;
}

function parseDateText(text: string | null | undefined): ParsedDate {
  if (!text) return { month: "", day: "", year: "" };
  const parts = text.split(/[\/\-\.]/);
  if (parts.length === 3) {
    return { month: parts[0] ?? "", day: parts[1] ?? "", year: parts[2] ?? "" };
  }
  // Try extracting just a year
  const yearMatch = text.match(/\b(\d{4})\b/);
  if (yearMatch) return { month: "", day: "", year: yearMatch[1] ?? "" };
  return { month: "", day: "", year: text.trim() };
}

function formatDateText(parsed: ParsedDate): string | null {
  const { month, day, year } = parsed;
  if (!month && !day && !year) return null;
  if (month && day && year) return `${month}/${day}/${year}`;
  if (!month && !day && year) return year;
  if (month && year && !day) return `${month}/${year}`;
  return [month, day, year].filter(Boolean).join("/");
}

export function PersonBanner({
  person,
  treeId,
  relationships,
  onClose,
  onEnterLife,
  onAddRelation,
  onPersonUpdated,
}: PersonBannerProps) {
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState<"birth" | "death" | null>(null);
  const [birthDate, setBirthDate] = useState<ParsedDate>({ month: "", day: "", year: "" });
  const [deathDate, setDeathDate] = useState<ParsedDate>({ month: "", day: "", year: "" });
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editingEssence, setEditingEssence] = useState(false);
  const [editEssenceValue, setEditEssenceValue] = useState("");
  const [editingMaidenName, setEditingMaidenName] = useState(false);
  const [editMaidenNameValue, setEditMaidenNameValue] = useState("");
  const calendarRef = useRef<HTMLDivElement>(null);
  // Prevent double-save when Enter triggers both onKeyDown and the subsequent onBlur
  const nameSavedRef = useRef(false);
  const essenceSavedRef = useRef(false);
  const maidenSavedRef = useRef(false);

  useEffect(() => {
    if (!person) return;
    setBirthDate(parseDateText(person.birthDateText));
    setDeathDate(parseDateText(person.deathDateText));
    setEditingName(false);
    setEditingEssence(false);
    setEditingMaidenName(false);
    setShowCalendar(null);
  }, [person?.id, person?.birthDateText, person?.deathDateText]);

  useEffect(() => {
    if (!person) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCalendar(null);
        setEditingName(false);
        setEditingEssence(false);
        setEditingMaidenName(false);
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [person, onClose]);

  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalendar]);

  const saveField = useCallback(async (field: string, value: string | null) => {
    if (!person) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) onPersonUpdated?.();
    } catch { /* silent */ }
    finally { setSaving(false); }
  }, [person, treeId, onPersonUpdated]);

  const saveDateField = useCallback((which: "birth" | "death") => {
    const parsed = which === "birth" ? birthDate : deathDate;
    const field = which === "birth" ? "birthDateText" : "deathDateText";
    saveField(field, formatDateText(parsed));
    setShowCalendar(null);
  }, [birthDate, deathDate, saveField]);

  if (!person) return null;

  const initials = person.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const displayName = person.name;
  const essenceLine = person.essenceLine;

  const parentIds = new Set<string>();
  const spouseIds = new Set<string>();
  const childIds = new Set<string>();
  const siblingIds = new Set<string>();
  for (const rel of relationships) {
    if (rel.fromPersonId === person.id) {
      if (rel.type === "parent_child") childIds.add(rel.toPersonId);
      else if (rel.type === "spouse") spouseIds.add(rel.toPersonId);
      else if (rel.type === "sibling") siblingIds.add(rel.toPersonId);
    }
    if (rel.toPersonId === person.id) {
      if (rel.type === "parent_child") parentIds.add(rel.fromPersonId);
      else if (rel.type === "spouse") spouseIds.add(rel.fromPersonId);
      else if (rel.type === "sibling") siblingIds.add(rel.fromPersonId);
    }
  }

  const relationGroups = [
    { label: "Parents", ids: parentIds },
    { label: "Spouse", ids: spouseIds },
    { label: "Children", ids: childIds },
    { label: "Siblings", ids: siblingIds },
  ].filter((g) => g.ids.size > 0);

  return (
    <AnimatePresence>
      {person && (
        <motion.div
          key="person-banner"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 340,
            zIndex: 20,
            background: "var(--paper)",
            borderLeft: "1px solid var(--rule)",
            boxShadow: "-8px 0 32px rgba(28,25,21,0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", padding: 8, cursor: "pointer", color: "var(--ink-faded)", fontSize: 20, lineHeight: 1, zIndex: 2 }}
          >×</button>

          {/* Header */}
          <div style={{ padding: "44px 24px 18px", display: "flex", gap: 16, borderBottom: "1px solid var(--rule)", alignItems: "flex-start" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", border: "1.5px solid var(--rule)", background: "var(--paper-deep)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {person.portraitUrl ? (
                <img src={getProxiedMediaUrl(person.portraitUrl) ?? undefined} alt={displayName} onError={handleMediaError} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink-faded)", fontWeight: 400, lineHeight: 1 }}>{initials}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingName ? (
                <input
                  autoFocus
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onBlur={() => { if (!nameSavedRef.current) { nameSavedRef.current = true; saveField("displayName", editNameValue); } setEditingName(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { nameSavedRef.current = true; saveField("displayName", editNameValue); setEditingName(false); }
                    if (e.key === "Escape") { nameSavedRef.current = true; setEditingName(false); }
                  }}
                  style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", width: "100%", border: "none", borderBottom: "2px solid var(--moss)", background: "transparent", outline: "none", padding: "4px 0", lineHeight: 1.2, letterSpacing: "-0.01em" }}
                />
              ) : (
                <div onClick={() => { nameSavedRef.current = false; setEditNameValue(displayName); setEditingName(true); }} style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", lineHeight: 1.2, letterSpacing: "-0.01em", cursor: "text", wordBreak: "break-word" }}>{displayName}</div>
              )}

              {(!person.birthDateText && !person.deathDateText) && person.birthYear && !editingName && (
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginTop: 4 }}>
                  {person.birthYear}{person.deathYear ? ` – ${person.deathYear}` : " –"}
                </div>
              )}

              {editingEssence ? (
                <input
                  autoFocus
                  value={editEssenceValue}
                  onChange={(e) => setEditEssenceValue(e.target.value)}
                  onBlur={() => { if (!essenceSavedRef.current) { essenceSavedRef.current = true; saveField("essenceLine", editEssenceValue || null); } setEditingEssence(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { essenceSavedRef.current = true; saveField("essenceLine", editEssenceValue || null); setEditingEssence(false); }
                    if (e.key === "Escape") { essenceSavedRef.current = true; setEditingEssence(false); }
                  }}
                  style={{ fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic", color: "var(--ink-soft)", width: "100%", border: "none", borderBottom: "1px solid var(--moss)", background: "transparent", outline: "none", padding: "4px 0", marginTop: 6 }}
                />
              ) : (
                <div
                  onClick={() => { essenceSavedRef.current = false; setEditEssenceValue(essenceLine ?? ""); setEditingEssence(true); }}
                  style={{ fontFamily: "var(--font-body)", fontSize: 13, fontStyle: essenceLine ? "italic" : "normal", color: essenceLine ? "var(--ink-soft)" : "var(--ink-faded)", marginTop: 6, cursor: "text", lineHeight: 1.4 }}
                >
                  {essenceLine || "Add a short bio…"}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Maiden name */}
            <Section label="Maiden name">
              {editingMaidenName ? (
                <input
                  autoFocus
                  value={editMaidenNameValue}
                  onChange={(e) => setEditMaidenNameValue(e.target.value)}
                  onBlur={() => { if (!maidenSavedRef.current) { maidenSavedRef.current = true; saveField("maidenName", editMaidenNameValue || null); } setEditingMaidenName(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { maidenSavedRef.current = true; saveField("maidenName", editMaidenNameValue || null); setEditingMaidenName(false); }
                    if (e.key === "Escape") { maidenSavedRef.current = true; setEditingMaidenName(false); }
                  }}
                  style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)", width: "100%", border: "none", borderBottom: "1px solid var(--moss)", background: "transparent", outline: "none", padding: "4px 0" }}
                />
              ) : (
                <div
                  onClick={() => { maidenSavedRef.current = false; setEditMaidenNameValue(person.maidenName ?? ""); setEditingMaidenName(true); }}
                  style={{ fontFamily: "var(--font-body)", fontSize: 14, color: person.maidenName ? "var(--ink)" : "var(--ink-faded)", cursor: "text", minHeight: 20 }}
                >
                  {person.maidenName || "Add maiden name…"}
                </div>
              )}
            </Section>

            {/* Dates */}
            <Section label="Life dates">
              <DateRow
                label="Born"
                which="birth"
                parsed={birthDate}
                onChange={setBirthDate}
                onSave={() => saveDateField("birth")}
                showCalendar={showCalendar}
                onToggleCalendar={(w) => setShowCalendar(w === showCalendar ? null : w)}
                calendarRef={calendarRef}
                saving={saving}
              />
              <DateRow
                label="Died"
                which="death"
                parsed={deathDate}
                onChange={setDeathDate}
                onSave={() => saveDateField("death")}
                showCalendar={showCalendar}
                onToggleCalendar={(w) => setShowCalendar(w === showCalendar ? null : w)}
                calendarRef={calendarRef}
                saving={saving}
              />
            </Section>

            {/* Relationships */}
            {relationGroups.length > 0 && (
              <Section label="Connections">
                {relationGroups.map(({ label, ids }) => (
                  <div key={label} style={{ marginBottom: 4 }}>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--ink)" }}>{ids.size} connection{ids.size !== 1 ? "s" : ""}</div>
                  </div>
                ))}
              </Section>
            )}

            {/* Add relation */}
            {onAddRelation && (
              <Section label="Add relation">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(["parent", "child", "sibling", "spouse"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => onAddRelation(person.id, kind)}
                      style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-soft)", background: "transparent", border: "1px solid var(--rule)", borderRadius: 999, padding: "4px 10px", cursor: "pointer", transition: `all 150ms ${EASE}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-deep)"; e.currentTarget.style.borderColor = "var(--moss)"; e.currentTarget.style.color = "var(--moss)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--rule)"; e.currentTarget.style.color = "var(--ink-soft)"; }}
                    >+ {kind}</button>
                  ))}
                </div>
              </Section>
            )}

            {/* Enter life story */}
            <button
              onClick={() => onEnterLife(person.id)}
              style={{
                fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--paper)", background: "var(--ink)",
                border: "none", borderRadius: 4, padding: "10px 0", cursor: "pointer", letterSpacing: "0.02em",
                width: "100%", transition: `background 150ms ${EASE}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ink)")}
            >
              Enter life story →
            </button>

            {/* Account linkage */}
            <Section label="Account">
              {person.linkedUserId ? (
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--moss)" }}>
                  Linked to a member account
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--ink-faded)", lineHeight: 1.5 }}>
                    Invite {displayName.split(" ")[0] || "them"} by email so they
                    can sign in and edit their own page. When they accept, their
                    account will link to this person.
                  </div>
                  <a
                    href={`/trees/${treeId}/settings?personId=${person.id}#invite`}
                    style={{
                      fontFamily: "var(--font-ui)", fontSize: 12, textAlign: "center",
                      color: "var(--moss)", background: "transparent", border: "1px solid var(--moss)",
                      borderRadius: 4, padding: "8px 10px", cursor: "pointer", textDecoration: "none",
                      transition: `all 150ms ${EASE}`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--moss)"; e.currentTarget.style.color = "var(--paper)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--moss)"; }}
                  >
                    Invite by email
                  </a>
                </div>
              )}
            </Section>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-faded)", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function DateRow({
  label,
  which,
  parsed,
  onChange,
  onSave,
  showCalendar,
  onToggleCalendar,
  calendarRef,
  saving,
}: {
  label: string;
  which: "birth" | "death";
  parsed: ParsedDate;
  onChange: (d: ParsedDate) => void;
  onSave: () => void;
  showCalendar: "birth" | "death" | null;
  onToggleCalendar: (w: "birth" | "death") => void;
  calendarRef: React.RefObject<HTMLDivElement | null>;
  saving: boolean;
}) {
  const isOpen = showCalendar === which;
  const displayValue = [parsed.month && MONTHS[Number(parsed.month)] ? MONTHS[Number(parsed.month)]?.slice(0, 3) : "", parsed.day, parsed.year].filter(Boolean).join(" ") || (parsed.year || "—");

  return (
    <div style={{ marginBottom: 8, position: "relative" }}>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", marginBottom: 2 }}>{label}</div>
      <button
        type="button"
        onClick={() => onToggleCalendar(which)}
        style={{
          fontFamily: "var(--font-body)", fontSize: 14, color: displayValue !== "—" ? "var(--ink)" : "var(--ink-faded)",
          background: isOpen ? "rgba(78,93,66,0.05)" : "transparent", border: isOpen ? "1px solid rgba(78,93,66,0.3)" : "1px dashed var(--rule)",
          borderRadius: 6, padding: "6px 10px", cursor: "pointer", width: "100%", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: `all 150ms ${EASE}`,
        }}
      >
        <span>{displayValue}</span>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", marginLeft: 8 }}>✎</span>
      </button>

      {isOpen && (
        <div
          ref={calendarRef}
          style={{
            position: "absolute", top: "100%", left: 0, zIndex: 30,
            background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(28,25,21,0.12)", padding: "12px 14px", minWidth: 220,
          }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <select
              value={parsed.month}
              onChange={(e) => onChange({ ...parsed, month: e.target.value })}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 6px", flex: 1 }}
            >
              <option value="">Month</option>
              {MONTHS.slice(1).map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </select>
            <input
              type="text"
              inputMode="numeric"
              placeholder="DD"
              value={parsed.day}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 2); onChange({ ...parsed, day: v }); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", width: 40, background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 6px", textAlign: "center" }}
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="YYYY"
              value={parsed.year}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); onChange({ ...parsed, year: v }); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink)", width: 52, background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 6px", textAlign: "center" }}
            />
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", marginBottom: 8 }}>
            Format: MM/DD/YYYY or year only
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              onClick={() => { onChange(which === "birth" ? { month: "", day: "", year: "" } : { month: "", day: "", year: "" }); onToggleCalendar(which); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", background: "transparent", border: "1px solid var(--rule)", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
            >Clear</button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "white", background: "var(--moss)", border: "none", borderRadius: 4, padding: "4px 12px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}
            >{saving ? "..." : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}