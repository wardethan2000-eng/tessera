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
  onCastDrift?: (filter: DriftFilter | null) => void;
  isCastConnected?: boolean;
  deviceName?: string | null;
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
  onCastDrift,
  isCastConnected,
  deviceName,
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
          className="drift-chooser-overlay"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="drift-chooser-sheet"
          >
            <div className="drift-chooser-header">
              <div>
                <div className="drift-chooser-title">
                  {mode === "menu" && "Drift through…"}
                  {mode === "person" && "About one person"}
                  {mode === "era" && "From an era"}
                  {mode === "remembrance" && "In remembrance"}
                </div>
                <div className="drift-chooser-subtitle">
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
                  className="drift-chooser-nav-btn"
                >
                  ← Back
                </button>
              ) : (
                <button type="button" onClick={handleClose} className="drift-chooser-nav-btn">
                  Close
                </button>
              )}
            </div>

            {mode === "menu" && (
              <div className="drift-chooser-menu">
                {isCastConnected && onCastDrift && (
                  <ChoiceRow
                    title={`Cast to ${deviceName ?? "TV"}`}
                    subtitle="Play drift on your TV while controlling from here."
                    onClick={() => onCastDrift(null)}
                    highlight
                  />
                )}
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
                  className="drift-chooser-search"
                />
                <div className="drift-chooser-people-list">
                  {filteredPeople.length === 0 ? (
                    <div className="drift-chooser-empty">
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
                        className="drift-chooser-person-row"
                      >
                        <span>{person.name}</span>
                        <span className="drift-chooser-person-actions">
                          {person.birthYear || person.deathYear ? (
                            <span className="drift-chooser-person-years">
                              {person.birthYear ?? "?"} –{" "}
                              {person.deathYear ?? (person.deathDateText ? "?" : "")}
                            </span>
                          ) : null}
                          {isCastConnected && onCastDrift && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCastDrift(
                                  mode === "remembrance"
                                    ? { mode: "remembrance", personId: person.id }
                                    : { personId: person.id },
                                );
                              }}
                              className="drift-chooser-person-cast"
                              title={`Cast to ${deviceName ?? "TV"}`}
                            >
                              ▶ TV
                            </button>
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {mode === "era" && (
              <div className="drift-chooser-eras">
                {ERAS.map((era) => (
                  <button
                    key={era.id}
                    type="button"
                    onClick={() =>
                      pick({ yearStart: era.yearStart, yearEnd: era.yearEnd })
                    }
                    className="drift-chooser-era-btn"
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
  highlight,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`drift-chooser-choice ${disabled ? "drift-chooser-choice--disabled" : ""} ${highlight ? "drift-chooser-choice--highlight" : ""}`}
    >
      <span className="drift-chooser-choice-title">{title}</span>
      <span className="drift-chooser-choice-subtitle">
        {disabled && disabledHint ? disabledHint : subtitle}
      </span>
    </button>
  );
}