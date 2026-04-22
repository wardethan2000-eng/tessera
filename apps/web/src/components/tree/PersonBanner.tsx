"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ApiPerson, ApiRelationship } from "./treeTypes";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface PersonBannerProps {
  person: ApiPerson | null;
  treeId: string;
  relationships: ApiRelationship[];
  onClose: () => void;
  onEnterLife: (personId: string) => void;
  onAddRelation?: (personId: string, kind: "parent" | "child" | "sibling" | "spouse") => void;
  onPersonUpdated?: () => void;
}

type EditField = "display_name" | "birth_date_text" | "death_date_text" | "essence_line";

const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function PersonBanner({
  person,
  treeId,
  relationships,
  onClose,
  onEnterLife,
  onAddRelation,
  onPersonUpdated,
}: PersonBannerProps) {
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback((field: EditField, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!person || !editingField) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [editingField]: editValue || null }),
      });
      if (res.ok) {
        onPersonUpdated?.();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
      setEditingField(null);
    }
  }, [person, editingField, editValue, treeId, onPersonUpdated]);

  useEffect(() => {
    if (!person) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [person, onClose]);

  useEffect(() => {
    setEditingField(null);
  }, [person?.id]);

  if (!person) return null;

  const initials = person.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const dateLabel =
    person.birthYear && person.deathYear
      ? `${person.birthYear} – ${person.deathYear}`
      : person.birthYear
        ? `b. ${person.birthYear}`
        : null;

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
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "transparent",
              border: "none",
              padding: 8,
              cursor: "pointer",
              color: "var(--ink-faded)",
              fontSize: 20,
              lineHeight: 1,
              zIndex: 2,
            }}
          >
            ×
          </button>

          {/* Header */}
          <div
            style={{
              padding: "44px 24px 20px",
              display: "flex",
              gap: 16,
              borderBottom: "1px solid var(--rule)",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                overflow: "hidden",
                border: "1.5px solid var(--rule)",
                background: "var(--paper-deep)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {person.portraitUrl ? (
                <img
                  src={person.portraitUrl}
                  alt={displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 24,
                    color: "var(--ink-faded)",
                    fontWeight: 400,
                    lineHeight: 1,
                  }}
                >
                  {initials}
                </span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {editingField === "display_name" ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") setEditingField(null);
                  }}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    color: "var(--ink)",
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid var(--moss)",
                    background: "transparent",
                    outline: "none",
                    padding: "2px 0",
                  }}
                />
              ) : (
                <div
                  onClick={() => startEdit("display_name", displayName)}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 20,
                    color: "var(--ink)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.01em",
                    cursor: "text",
                    wordBreak: "break-word",
                  }}
                >
                  {displayName}
                </div>
              )}

              {editingField !== "display_name" && dateLabel && (
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                    marginTop: 4,
                  }}
                >
                  {dateLabel}
                </div>
              )}

              {editingField !== "essence_line" && essenceLine && (
                <div
                  onClick={() => startEdit("essence_line", essenceLine ?? "")}
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--ink-soft)",
                    marginTop: 6,
                    cursor: "text",
                    lineHeight: 1.4,
                  }}
                >
                  {essenceLine}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Dates section */}
            <Section label="Life dates">
              <EditableRow
                label="Born"
                fieldKey="birth_date_text"
                value={person.birthYear != null ? String(person.birthYear) : ""}
                editingField={editingField}
                editValue={editValue}
                onStartEdit={(f, v) => startEdit(f as EditField, v)}
                onEditValueChange={setEditValue}
                onSave={saveEdit}
                saving={saving}
              />
              <EditableRow
                label="Died"
                fieldKey="death_date_text"
                value={person.deathYear != null ? String(person.deathYear) : ""}
                editingField={editingField}
                editValue={editValue}
                onStartEdit={(f, v) => startEdit(f as EditField, v)}
                onEditValueChange={setEditValue}
                onSave={saveEdit}
                saving={saving}
              />
            </Section>

            {/* Relationships section */}
            {relationGroups.length > 0 && (
              <Section label="Connections">
                {relationGroups.map(({ label, ids }) => (
                  <div key={label} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 10,
                        color: "var(--ink-faded)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        color: "var(--ink)",
                      }}
                    >
                      {ids.size} connection{ids.size !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Add relation buttons */}
            {onAddRelation && (
              <Section label="Add relation">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(["parent", "child", "sibling", "spouse"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => onAddRelation(person.id, kind)}
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        color: "var(--ink-soft)",
                        background: "transparent",
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        padding: "4px 10px",
                        cursor: "pointer",
                        transition: `all 150ms ${EASE}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--paper-deep)";
                        e.currentTarget.style.borderColor = "var(--moss)";
                        e.currentTarget.style.color = "var(--moss)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "var(--rule)";
                        e.currentTarget.style.color = "var(--ink-soft)";
                      }}
                    >
                      + {kind}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Enter life story */}
            <button
              onClick={() => onEnterLife(person.id)}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "var(--paper)",
                background: "var(--ink)",
                border: "none",
                borderRadius: 4,
                padding: "10px 0",
                cursor: "pointer",
                letterSpacing: "0.02em",
                width: "100%",
                transition: `background 150ms ${EASE}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ink)")}
            >
              Enter life story →
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--ink-faded)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function EditableRow({
  label,
  fieldKey,
  value,
  editingField,
  editValue,
  onStartEdit,
  onEditValueChange,
  onSave,
  saving,
}: {
  label: string;
  fieldKey: string;
  value: string;
  editingField: string | null;
  editValue: string;
  onStartEdit: (field: string, value: string) => void;
  onEditValueChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isEditing = editingField === fieldKey;

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          color: "var(--ink-faded)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      {isEditing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onStartEdit("", "");
            }}
            style={{
              flex: 1,
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--ink)",
              border: "none",
              borderBottom: "1px solid var(--moss)",
              background: "transparent",
              outline: "none",
              padding: "2px 0",
            }}
          />
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--moss)",
              background: "transparent",
              border: "1px solid var(--moss)",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "..." : "Save"}
          </button>
        </div>
      ) : (
        <div
          onClick={() => onStartEdit(fieldKey, value)}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: value ? "var(--ink)" : "var(--ink-faded)",
            cursor: "text",
            borderBottom: "1px dashed var(--rule)",
            padding: "2px 0",
            fontStyle: value ? "normal" : "italic",
          }}
        >
          {value || "Add…"}
        </div>
      )}
    </div>
  );
}