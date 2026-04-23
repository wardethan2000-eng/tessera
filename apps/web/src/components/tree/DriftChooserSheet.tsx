"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ApiPerson } from "./treeTypes";
import type { DriftFilter } from "./DriftMode";

type ChooserMode = "menu" | "person" | "era" | "remembrance";

interface DriftChooserSheetProps {
  open: boolean;
  people: ApiPerson[];
  onClose: () => void;
  onChoose: (filter: DriftFilter | null) => void;
}

const ERAS: { id: string; label: string; yearStart: number; yearEnd: number }[] = [
  { id: "pre1900", label: "Before 1900", yearStart: 1000, yearEnd: 1899 },
  { id: "1900s", label: "1900s — 1920s", yearStart: 1900, yearEnd: 1929 },
  { id: "1930s", label: "1930s & 40s", yearStart: 1930, yearEnd: 1949 },
  { id: "1950s", label: "1950s & 60s", yearStart: 1950, yearEnd: 1969 },
  { id: "1970s", label: "1970s & 80s", yearStart: 1970, yearEnd: 1989 },
  { id: "1990s", label: "1990s & 2000s", yearStart: 1990, yearEnd: 2009 },
  { id: "modern", label: "2010 — today", yearStart: 2010, yearEnd: 2999 },
];

export function DriftChooserSheet({
  open,
  people,
  onClose,
  onChoose,
}: DriftChooserSheetProps) {
  const [mode, setMode] = useState<ChooserMode>("menu");
  const [search, setSearch] = useState("");

  const livingPeople = useMemo(
    () =>
      [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );
  const deceasedPeople = useMemo(
    () =>
      people
        .filter((p) => Boolean(p.deathDateText) || p.deathYear != null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const filteredPeople = useMemo(() => {
    const list = mode === "remembrance" ? deceasedPeople : livingPeople;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [mode, search, livingPeople, deceasedPeople]);

  function handleClose() {
    setMode("menu");
    setSearch("");
    onClose();
  }

  function pick(filter: DriftFilter | null) {
    setMode("menu");
    setSearch("");
    onChoose(filter);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(10, 8, 6, 0.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              maxHeight: "80vh",
              background: "var(--paper)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "20px 22px 28px",
              boxShadow: "0 -12px 40px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
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
                    lineHeight: 1.2,
                  }}
                >
                  {mode === "menu" && "Drift through…"}
                  {mode === "person" && "About one person"}
                  {mode === "era" && "From an era"}
                  {mode === "remembrance" && "In remembrance"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-faded)",
                    marginTop: 2,
                  }}
                >
                  {mode === "menu" && "Pick a way to wander."}
                  {mode === "person" && "We'll show every memory tied to them."}
                  {mode === "era" && "Memories whose date falls in that window."}
                  {mode === "remembrance" &&
                    "A quieter pace, in chronological order, in their memory."}
                </div>
              </div>
              {mode !== "menu" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("menu");
                    setSearch("");
                  }}
                  style={navBtnStyle}
                >
                  ← Back
                </button>
              ) : (
                <button type="button" onClick={handleClose} style={navBtnStyle}>
                  Close
                </button>
              )}
            </div>

            {mode === "menu" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ChoiceRow
                  title="All memories"
                  subtitle="A free-roaming drift across the whole archive."
                  onClick={() => pick(null)}
                />
                <ChoiceRow
                  title="About one person"
                  subtitle="Center the drift on a single relative."
                  onClick={() => setMode("person")}
                />
                <ChoiceRow
                  title="From an era"
                  subtitle="Pick a decade and step into it."
                  onClick={() => setMode("era")}
                />
                <ChoiceRow
                  title="In remembrance"
                  subtitle="Quietly walk through someone's life in order."
                  onClick={() => setMode("remembrance")}
                  disabled={deceasedPeople.length === 0}
                  disabledHint="Add a death date to a relative to enable this."
                />
              </div>
            )}

            {(mode === "person" || mode === "remembrance") && (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search names…"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    padding: "8px 12px",
                    border: "1px solid var(--rule)",
                    borderRadius: 6,
                    background: "var(--paper-deep)",
                    color: "var(--ink)",
                    outline: "none",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    overflowY: "auto",
                    maxHeight: 360,
                    paddingRight: 4,
                  }}
                >
                  {filteredPeople.length === 0 ? (
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 12,
                        color: "var(--ink-faded)",
                        padding: "16px 6px",
                      }}
                    >
                      {mode === "remembrance"
                        ? "No relatives have a death date yet."
                        : "No matches."}
                    </div>
                  ) : (
                    filteredPeople.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() =>
                          pick(
                            mode === "remembrance"
                              ? { mode: "remembrance", personId: person.id }
                              : { personId: person.id },
                          )
                        }
                        style={personRowStyle}
                      >
                        <span>{person.name}</span>
                        {person.birthYear || person.deathYear ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--ink-faded)",
                              fontFamily: "var(--font-ui)",
                            }}
                          >
                            {person.birthYear ?? "?"} –{" "}
                            {person.deathYear ?? (person.deathDateText ? "?" : "")}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {mode === "era" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 8,
                }}
              >
                {ERAS.map((era) => (
                  <button
                    key={era.id}
                    type="button"
                    onClick={() =>
                      pick({ yearStart: era.yearStart, yearEnd: era.yearEnd })
                    }
                    style={eraBtnStyle}
                  >
                    {era.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChoiceRow({
  title,
  subtitle,
  onClick,
  disabled,
  disabledHint,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        padding: "12px 14px",
        border: "1px solid var(--rule)",
        borderRadius: 8,
        background: disabled ? "var(--paper-deep)" : "var(--paper)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: "border-color 150ms, background 150ms",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          color: "var(--ink)",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          color: "var(--ink-faded)",
          lineHeight: 1.4,
        }}
      >
        {disabled && disabledHint ? disabledHint : subtitle}
      </span>
    </button>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: "5px 12px",
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-soft)",
  cursor: "pointer",
};

const personRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  background: "var(--paper)",
  cursor: "pointer",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink)",
  textAlign: "left",
};

const eraBtnStyle: React.CSSProperties = {
  padding: "12px 10px",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  background: "var(--paper)",
  cursor: "pointer",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink)",
};
