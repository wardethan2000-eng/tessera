"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

export type PlaceOption = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string | null;
  adminRegion?: string | null;
  locality?: string | null;
};

interface PlacePickerProps {
  treeId: string;
  value: string;
  onChange: (placeId: string) => void;
  apiBase?: string;
  label?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  note?: string;
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--rule, #d6d0c3)",
  background: "var(--paper-deep, #f1ebdf)",
  color: "var(--ink, #1c1915)",
  padding: "9px 12px",
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
};

export function PlacePicker({
  treeId,
  value,
  onChange,
  apiBase,
  label = "Place",
  allowEmpty = true,
  emptyLabel = "No mapped place",
  note,
}: PlacePickerProps) {
  const api = apiBase ?? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");
  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    label: "",
    latitude: "",
    longitude: "",
    locality: "",
    adminRegion: "",
    countryCode: "",
  });

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch(`${api}/api/trees/${treeId}/places`, { credentials: "include" })
      .then(async (res) => (res.ok ? ((await res.json()) as PlaceOption[]) : []))
      .then((data) => {
        if (!ignore) setPlaces(data);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [api, treeId]);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === value) ?? null,
    [places, value],
  );

  async function createPlace() {
    setSaving(true);
    setError(null);
    try {
      const latitude = Number.parseFloat(createForm.latitude);
      const longitude = Number.parseFloat(createForm.longitude);
      if (!createForm.label.trim() || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        throw new Error("Add a label plus valid latitude and longitude.");
      }

      const res = await fetch(`${api}/api/trees/${treeId}/places`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: createForm.label.trim(),
          latitude,
          longitude,
          locality: createForm.locality.trim() || undefined,
          adminRegion: createForm.adminRegion.trim() || undefined,
          countryCode: createForm.countryCode.trim().toUpperCase() || undefined,
        }),
      });

      const payload = (await res.json()) as PlaceOption | { error?: string };
      if (!res.ok) {
        throw new Error("error" in payload ? payload.error ?? "Failed to save place" : "Failed to save place");
      }

      const place = payload as PlaceOption;
      setPlaces((current) => {
        const next = current.filter((entry) => entry.id !== place.id);
        next.push(place);
        return next.sort((a, b) => a.label.localeCompare(b.label));
      });
      onChange(place.id);
      setCreateForm({
        label: "",
        latitude: "",
        longitude: "",
        locality: "",
        adminRegion: "",
        countryCode: "",
      });
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save place");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <label style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", margin: 0 }}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowCreate((open) => !open)}
          style={{
            border: "none",
            background: "none",
            color: "var(--moss)",
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            padding: 0,
          }}
        >
          {showCreate ? "Hide place form" : "+ Add a place"}
        </button>
      </div>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          ...inputStyle,
          fontFamily: "var(--font-ui)",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {allowEmpty && <option value="">{loading ? "Loading places…" : emptyLabel}</option>}
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.label}
          </option>
        ))}
      </select>

      {selectedPlace && (
        <div
          style={{
            borderRadius: 8,
            border: "1px solid var(--rule)",
            background: "rgba(78,93,66,0.05)",
            padding: "10px 12px",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-soft)",
          }}
        >
          {selectedPlace.label} · {selectedPlace.latitude.toFixed(3)}, {selectedPlace.longitude.toFixed(3)}
        </div>
      )}

      {note && (
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
          {note}
        </div>
      )}

      {showCreate && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--rule)",
            background: "var(--paper-deep)",
            padding: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <input
              value={createForm.label}
              onChange={(event) => setCreateForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Place label"
              style={{ ...inputStyle, fontFamily: "var(--font-body)" }}
            />
          </div>
          <input
            value={createForm.latitude}
            onChange={(event) => setCreateForm((current) => ({ ...current, latitude: event.target.value }))}
            placeholder="Latitude"
            style={{ ...inputStyle, fontFamily: "var(--font-ui)" }}
          />
          <input
            value={createForm.longitude}
            onChange={(event) => setCreateForm((current) => ({ ...current, longitude: event.target.value }))}
            placeholder="Longitude"
            style={{ ...inputStyle, fontFamily: "var(--font-ui)" }}
          />
          <input
            value={createForm.locality}
            onChange={(event) => setCreateForm((current) => ({ ...current, locality: event.target.value }))}
            placeholder="Locality"
            style={{ ...inputStyle, fontFamily: "var(--font-ui)" }}
          />
          <input
            value={createForm.adminRegion}
            onChange={(event) => setCreateForm((current) => ({ ...current, adminRegion: event.target.value }))}
            placeholder="Region"
            style={{ ...inputStyle, fontFamily: "var(--font-ui)" }}
          />
          <div style={{ gridColumn: "1 / -1" }}>
            <input
              value={createForm.countryCode}
              onChange={(event) => setCreateForm((current) => ({ ...current, countryCode: event.target.value }))}
              placeholder="Country code (optional)"
              style={{ ...inputStyle, fontFamily: "var(--font-ui)" }}
            />
          </div>
          {error && (
            <div style={{ gridColumn: "1 / -1", fontFamily: "var(--font-ui)", fontSize: 12, color: "#a85d5d" }}>
              {error}
            </div>
          )}
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              style={{
                borderRadius: 8,
                border: "1px solid var(--rule)",
                background: "transparent",
                padding: "8px 12px",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createPlace}
              disabled={saving}
              style={{
                borderRadius: 8,
                border: "none",
                background: "var(--moss)",
                padding: "8px 12px",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "white",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving…" : "Save place"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
