"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Shimmer } from "@/components/ui/Shimmer";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type MapPlace = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string | null;
  adminRegion?: string | null;
  locality?: string | null;
  eventCount: number;
};

type MapEvent = {
  id: string;
  type: "birth" | "death" | "memory";
  personId: string;
  personName: string;
  placeId: string;
  placeLabel: string;
  latitude: number;
  longitude: number;
  dateText: string | null;
  sortYear: number | null;
  title: string;
  memoryId?: string;
};

type RouteSegment = {
  id: string;
  fromEventId: string;
  toEventId: string;
  from: { placeId: string; label: string; latitude: number; longitude: number };
  to: { placeId: string; label: string; latitude: number; longitude: number };
};

type PersonRoute = {
  personId: string;
  personName: string;
  segments: RouteSegment[];
};

type MapPayload = {
  tree: { id: string; name: string };
  places: MapPlace[];
  events: MapEvent[];
  routes: PersonRoute[];
};

const WIDTH = 1000;
const HEIGHT = 500;

function project(latitude: number, longitude: number) {
  const x = ((longitude + 180) / 360) * WIDTH;
  const y = ((90 - latitude) / 180) * HEIGHT;
  return { x, y };
}

function linePath(segment: RouteSegment) {
  const from = project(segment.from.latitude, segment.from.longitude);
  const to = project(segment.to.latitude, segment.to.longitude);
  const midX = (from.x + to.x) / 2;
  const arcLift = Math.max(18, Math.abs(to.x - from.x) * 0.12);
  return `M ${from.x} ${from.y} Q ${midX} ${Math.min(from.y, to.y) - arcLift} ${to.x} ${to.y}`;
}

export default function FamilyMapPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPersonId, setSelectedPersonId] = useState(searchParams.get("personId") ?? "");

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`${API}/api/trees/${treeId}/map`, { credentials: "include" })
      .then(async (res) => (res.ok ? ((await res.json()) as MapPayload) : null))
      .then((data) => setPayload(data))
      .finally(() => setLoading(false));
  }, [session, treeId]);

  const people = useMemo(() => {
    const index = new Map<string, string>();
    for (const event of payload?.events ?? []) {
      index.set(event.personId, event.personName);
    }
    return Array.from(index.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payload]);

  const filteredEvents = useMemo(
    () =>
      (payload?.events ?? []).filter((event) =>
        selectedPersonId ? event.personId === selectedPersonId : true,
      ),
    [payload, selectedPersonId],
  );

  const filteredRoutes = useMemo(
    () =>
      (payload?.routes ?? []).filter((route) =>
        selectedPersonId ? route.personId === selectedPersonId : true,
      ),
    [payload, selectedPersonId],
  );

  if (isPending || loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Shimmer width={160} height={14} />
        <Shimmer width={240} height={10} />
      </main>
    );
  }

  if (!payload) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--paper)", display: "grid", placeItems: "center" }}>
        <p style={{ fontFamily: "var(--font-ui)", color: "var(--ink-faded)", fontSize: 14 }}>
          The family map could not be loaded.
        </p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f6f1e7 0%, #efe7d6 100%)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 24px",
          borderBottom: "1px solid var(--rule)",
          background: "rgba(246,241,231,0.9)",
          backdropFilter: "blur(10px)",
        }}
      >
        <a href={`/trees/${treeId}`} style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", textDecoration: "none" }}>
          ← Constellation
        </a>
        <span style={{ color: "var(--rule)" }}>·</span>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", lineHeight: 1.1 }}>
            Family Map
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)", marginTop: 2 }}>
            {payload.tree.name}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={selectedPersonId}
          onChange={(event) => setSelectedPersonId(event.target.value)}
          style={{
            borderRadius: 999,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            padding: "8px 12px",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink)",
          }}
        >
          <option value="">Entire family</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </header>

      <div
        style={{
          maxWidth: 1360,
          margin: "0 auto",
          padding: "28px 24px 40px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
        }}
      >
        <section
          style={{
            minWidth: 0,
            border: "1px solid var(--rule)",
            borderRadius: 24,
            background: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(241,235,223,0.95) 100%)",
            boxShadow: "0 18px 40px rgba(28,25,21,0.08)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "18px 22px 0" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Traced Places
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ink-soft)", margin: "8px 0 18px", lineHeight: 1.6 }}>
              Lines only appear where dated, confirmed places exist. Sparse lives still belong here.
            </p>
          </div>

          <div style={{ padding: "0 18px 18px" }}>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", height: "auto", display: "block", borderRadius: 18, background: "linear-gradient(180deg, #d7e7e2 0%, #eef2ec 100%)" }}>
              <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" />

              {[-120, -60, 0, 60, 120].map((lon) => {
                const x = project(0, lon).x;
                return <line key={`lon-${lon}`} x1={x} y1={0} x2={x} y2={HEIGHT} stroke="rgba(28,25,21,0.08)" strokeWidth={1} />;
              })}
              {[-60, -30, 0, 30, 60].map((lat) => {
                const y = project(lat, 0).y;
                return <line key={`lat-${lat}`} x1={0} y1={y} x2={WIDTH} y2={y} stroke="rgba(28,25,21,0.08)" strokeWidth={1} />;
              })}

              {filteredRoutes.flatMap((route) =>
                route.segments.map((segment) => (
                  <path
                    key={segment.id}
                    d={linePath(segment)}
                    fill="none"
                    stroke="rgba(78,93,66,0.45)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )),
              )}

              {filteredEvents.map((event) => {
                const point = project(event.latitude, event.longitude);
                const fill =
                  event.type === "birth" ? "#4e5d42" : event.type === "death" ? "#8f5c45" : "#1c1915";
                return (
                  <g key={event.id}>
                    <circle cx={point.x} cy={point.y} r={event.type === "memory" ? 4.2 : 5.5} fill={fill} opacity={0.9} />
                    <circle cx={point.x} cy={point.y} r={event.type === "memory" ? 8 : 11} fill={fill} opacity={0.08} />
                  </g>
                );
              })}

              <text x={24} y={34} fill="rgba(28,25,21,0.55)" fontFamily="var(--font-ui)" fontSize={11}>
                90°N
              </text>
              <text x={24} y={HEIGHT - 18} fill="rgba(28,25,21,0.55)" fontFamily="var(--font-ui)" fontSize={11}>
                90°S
              </text>
              <text x={WIDTH - 80} y={HEIGHT / 2 - 6} fill="rgba(28,25,21,0.55)" fontFamily="var(--font-ui)" fontSize={11}>
                Equator
              </text>
            </svg>
          </div>
        </section>

        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <section
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 20,
              background: "rgba(255,255,255,0.75)",
              padding: 18,
            }}
          >
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Snapshot
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Mapped places", value: selectedPersonId ? new Set(filteredEvents.map((event) => event.placeId)).size : payload.places.length },
                { label: "Events", value: filteredEvents.length },
                { label: "Routes", value: filteredRoutes.reduce((count, route) => count + route.segments.length, 0) },
                { label: "People", value: selectedPersonId ? 1 : people.length },
              ].map((item) => (
                <div key={item.label} style={{ borderRadius: 12, background: "var(--paper-deep)", padding: "12px 14px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}>{item.value}</div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 20,
              background: "rgba(255,255,255,0.75)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxHeight: 620,
              overflowY: "auto",
            }}
          >
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Event Ledger
            </div>

            {filteredEvents.length === 0 ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-faded)", margin: 0 }}>
                No mapped events yet.
              </p>
            ) : (
              filteredEvents.map((event) => (
                <article
                  key={event.id}
                  style={{
                    borderRadius: 14,
                    border: "1px solid var(--rule)",
                    background: "var(--paper)",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {event.type}
                    </span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
                      {event.dateText ?? "Undated"}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink)", lineHeight: 1.25 }}>
                    {event.title}
                  </div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
                    {event.personName} · {event.placeLabel}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <a
                      href={`/trees/${treeId}/people/${event.personId}`}
                      style={{
                        textDecoration: "none",
                        fontFamily: "var(--font-ui)",
                        fontSize: 12,
                        color: "var(--moss)",
                      }}
                    >
                      Person page
                    </a>
                    {event.memoryId && (
                      <a
                        href={`/trees/${treeId}/people/${event.personId}`}
                        style={{
                          textDecoration: "none",
                          fontFamily: "var(--font-ui)",
                          fontSize: 12,
                          color: "var(--ink-faded)",
                        }}
                      >
                        Memory
                      </a>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
