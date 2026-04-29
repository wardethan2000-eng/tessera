"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";

const API = getApiBase();

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";
type SearchKind = "person" | "memory" | "place";
type ResultTab = "all" | "people" | "memories" | "places";

interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  highlightRanges: [number, number][];
  score: number;
  matchReason: string[];
  personId?: string;
  memoryId?: string;
  placeId?: string;
  portraitUrl?: string | null;
  mediaUrl?: string | null;
  memoryKind?: string | null;
  primaryPersonId?: string | null;
  dateOfEventText?: string | null;
}

interface SearchTotals {
  people: number;
  memories: number;
  places: number;
}

interface FacetResult {
  memoryKinds: Record<string, number>;
  people: { id: string; name: string; count: number }[];
  places: { id: string; label: string; count: number }[];
  yearRange: { earliest: number | null; latest: number | null };
  hasTranscript: { true: number; false: number };
  hasMedia: { true: number; false: number };
}

interface SearchFilters {
  personIds?: string[];
  memoryKinds?: string[];
  placeIds?: string[];
  yearStart?: number;
  yearEnd?: number;
  hasTranscript?: boolean;
  hasMedia?: boolean;
}

const KIND_ICON: Record<MemoryKind, string> = {
  photo: "◻",
  story: "✦",
  voice: "◉",
  document: "▤",
  other: "◇",
};

const KIND_LABELS: Record<MemoryKind, string> = {
  photo: "Photo",
  story: "Story",
  voice: "Voice",
  document: "Document",
  other: "Other",
};

const MEMORY_KINDS: MemoryKind[] = ["story", "photo", "voice", "document", "other"];

function highlightSnippet(text: string, ranges: [number, number][]): React.ReactNode {
  if (ranges.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const [start, end] of ranges) {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark key={start} style={{ background: "var(--moss-light, #d4e8d0)", color: "inherit", padding: "0 1px" }}>
        {text.slice(start, end)}
      </mark>
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-ui)",
        fontSize: 11,
        color: "var(--ink)",
        background: "var(--paper-deep)",
        border: "1px solid var(--rule)",
        borderRadius: 12,
        padding: "3px 8px 3px 10px",
      }}
    >
      {label}
      <button
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ink-faded)",
          fontSize: 11,
          padding: 0,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  );
}

export default function SearchPage() {
  const { treeId } = useParams<{ treeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const { data: session, isPending } = useSession();

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<ResultTab>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totals, setTotals] = useState<SearchTotals>({ people: 0, memories: 0, places: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searched, setSearched] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [facets, setFacets] = useState<FacetResult | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [session, isPending, router]);

  const doSearch = useCallback(async (q: string, off: number, isNew: boolean, currentFilters?: SearchFilters) => {
    if (!q.trim() || !treeId) return;
    setLoading(true);
    setError(null);

    const kinds: SearchKind[] =
      activeTab === "all"
        ? ["person", "memory", "place"]
        : activeTab === "people"
          ? ["person"]
          : activeTab === "memories"
            ? ["memory"]
            : ["place"];

    const f = currentFilters ?? filters;

    try {
      const params = new URLSearchParams({
        q: q.trim(),
        limit: "30",
        offset: String(off),
        kinds: kinds.join(","),
      });
      if (f.personIds?.length) params.set("personIds", f.personIds.join(","));
      if (f.memoryKinds?.length) params.set("memoryKinds", f.memoryKinds.join(","));
      if (f.placeIds?.length) params.set("placeIds", f.placeIds.join(","));
      if (f.yearStart !== undefined) params.set("yearStart", String(f.yearStart));
      if (f.yearEnd !== undefined) params.set("yearEnd", String(f.yearEnd));
      if (f.hasTranscript !== undefined) params.set("hasTranscript", f.hasTranscript ? "true" : "false");
      if (f.hasMedia !== undefined) params.set("hasMedia", f.hasMedia ? "true" : "false");

      const res = await fetch(`${API}/api/trees/${treeId}/search?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Search failed");
      }
      const data = await res.json();
      if (isNew) {
        setResults(data.results);
        setTotals(data.totals);
        setOffset(0);
        setHasMore(data.results.length >= 30);
      } else {
        setResults((prev) => [...prev, ...data.results]);
        setTotals(data.totals);
        setOffset(off);
        setHasMore(data.results.length >= 30);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [treeId, activeTab, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery, 0, true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!searched) return;
    inputRef.current?.focus();
  }, [searched]);

  useEffect(() => {
    if (!treeId || !session) return;
    let cancelled = false;
    setFacetsLoading(true);
    fetch(`${API}/api/trees/${treeId}/search/facets`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data) setFacets(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFacetsLoading(false);
      });
    return () => { cancelled = true; };
  }, [treeId, session]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setTotals({ people: 0, memories: 0, places: 0 });
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      doSearch(value, 0, true);
    }, 300);
  }, [doSearch]);

  const handleTabChange = useCallback((tab: ResultTab) => {
    setActiveTab(tab);
    if (query.trim()) {
      doSearch(query, 0, true);
    }
  }, [query, doSearch]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      doSearch(query, offset + 30, false);
    }
  }, [hasMore, loading, query, offset, doSearch]);

  const toggleFilter = useCallback((key: keyof SearchFilters, value: string) => {
    setFilters((prev) => {
      const arr = (prev[key] as string[] | undefined) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      const newFilters = { ...prev, [key]: next.length > 0 ? next : undefined };
      if (query.trim()) doSearch(query, 0, true, newFilters);
      return newFilters;
    });
  }, [query, doSearch]);

  const setNumberFilter = useCallback((key: "yearStart" | "yearEnd", value: number | undefined) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value };
      if (query.trim()) doSearch(query, 0, true, newFilters);
      return newFilters;
    });
  }, [query, doSearch]);

  const toggleBooleanFilter = useCallback((key: "hasTranscript" | "hasMedia", value: boolean) => {
    setFilters((prev) => {
      const current = prev[key];
      const newFilters = { ...prev, [key]: current === value ? undefined : value };
      if (query.trim()) doSearch(query, 0, true, newFilters);
      return newFilters;
    });
  }, [query, doSearch]);

  const clearFilters = useCallback(() => {
    setFilters({});
    if (query.trim()) doSearch(query, 0, true, {});
  }, [query, doSearch]);

  const hasActiveFilters = !!(filters.personIds?.length || filters.memoryKinds?.length || filters.placeIds?.length ||
    filters.yearStart !== undefined || filters.yearEnd !== undefined ||
    filters.hasTranscript !== undefined || filters.hasMedia !== undefined);

  const filteredResults = results.filter((r) => {
    if (activeTab === "all") return true;
    if (activeTab === "people") return r.kind === "person";
    if (activeTab === "memories") return r.kind === "memory";
    return r.kind === "place";
  });

  if (isPending) {
    return (
      <div style={{ padding: 48, textAlign: "center", fontFamily: "var(--font-body)", color: "var(--ink-faded)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid var(--rule)",
          padding: "24px 24px 0",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Link
            href={`/trees/${treeId}/home`}
            style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--ink-faded)", textDecoration: "none" }}
          >
            ← Back
          </Link>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--ink)",
              margin: 0,
              flex: 1,
            }}
          >
            Discovery Search
          </h1>
        </div>

        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 0 12px",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink-faded)" }}>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search people, memories, places…"
            style={{
              flex: 1,
              fontFamily: "var(--font-body)",
              fontSize: 16,
              color: "var(--ink)",
              background: "none",
              border: "none",
              outline: "none",
              padding: "8px 0",
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setTotals({ people: 0, memories: 0, places: 0 }); setSearched(false); }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                padding: 4,
              }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              background: showFilters || hasActiveFilters ? "var(--paper-deep)" : "none",
              border: `1px solid ${showFilters || hasActiveFilters ? "var(--moss)" : "var(--rule)"}`,
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: hasActiveFilters ? "var(--moss)" : "var(--ink-faded)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ⚙ Filters
            {hasActiveFilters && (
              <span style={{ background: "var(--moss)", color: "white", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {(filters.personIds?.length ?? 0) + (filters.memoryKinds?.length ?? 0) + (filters.placeIds?.length ?? 0) + (filters.hasTranscript !== undefined ? 1 : 0) + (filters.hasMedia !== undefined ? 1 : 0) + (filters.yearStart !== undefined || filters.yearEnd !== undefined ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 8 }}>
            {filters.memoryKinds?.map((k) => (
              <FilterChip key={`kind-${k}`} label={KIND_LABELS[k as MemoryKind] ?? k} onRemove={() => toggleFilter("memoryKinds", k)} />
            ))}
            {filters.hasTranscript !== undefined && (
              <FilterChip label="Has transcript" onRemove={() => toggleBooleanFilter("hasTranscript", true)} />
            )}
            {filters.hasMedia !== undefined && (
              <FilterChip label="Has media" onRemove={() => toggleBooleanFilter("hasMedia", true)} />
            )}
            {filters.yearStart !== undefined && (
              <FilterChip label={`From ${filters.yearStart}`} onRemove={() => setNumberFilter("yearStart", undefined)} />
            )}
            {filters.yearEnd !== undefined && (
              <FilterChip label={`Until ${filters.yearEnd}`} onRemove={() => setNumberFilter("yearEnd", undefined)} />
            )}
            <button
              onClick={clearFilters}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                padding: "3px 6px",
                textDecoration: "underline",
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Tab bar */}
        {searched && (
          <div style={{ display: "flex", gap: 0 }}>
            {(["all", "people", "memories", "places"] as ResultTab[]).map((t) => {
              const count =
                t === "all"
                  ? totals.people + totals.memories + totals.places
                  : t === "people"
                    ? totals.people
                    : t === "memories"
                      ? totals.memories
                      : totals.places;
              return (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: activeTab === t ? "var(--ink)" : "var(--ink-faded)",
                    background: "none",
                    border: "none",
                    borderBottom: `2px solid ${activeTab === t ? "var(--moss)" : "transparent"}`,
                    padding: "10px 14px 8px",
                    cursor: "pointer",
                    textTransform: "capitalize" as const,
                    transition: "color var(--duration-micro), border-color var(--duration-micro)",
                  }}
                >
                  {t}
                  {count > 0 && (
                    <span style={{ marginLeft: 4, color: "var(--ink-faded)", fontSize: 11 }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "16px 24px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--paper-deep)",
          }}
        >
          {/* Memory kinds */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Memory kind
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MEMORY_KINDS.map((k) => (
                <button
                  key={k}
                  onClick={() => toggleFilter("memoryKinds", k)}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: `1px solid ${filters.memoryKinds?.includes(k) ? "var(--moss)" : "var(--rule)"}`,
                    background: filters.memoryKinds?.includes(k) ? "var(--moss-light, #eaf3e8)" : "var(--paper)",
                    color: filters.memoryKinds?.includes(k) ? "var(--moss)" : "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {KIND_LABELS[k]}
                  {facets?.memoryKinds[k] ? ` (${facets.memoryKinds[k]})` : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Year range */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              Year range
              {facets?.yearRange?.earliest && ` (${facets.yearRange.earliest}–${facets.yearRange.latest})`}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                placeholder="From"
                value={filters.yearStart ?? ""}
                onChange={(e) => setNumberFilter("yearStart", e.target.value ? parseInt(e.target.value, 10) : undefined)}
                style={{
                  width: 80,
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  padding: "4px 8px",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              />
              <span style={{ color: "var(--ink-faded)", fontFamily: "var(--font-ui)" }}>–</span>
              <input
                type="number"
                placeholder="Until"
                value={filters.yearEnd ?? ""}
                onChange={(e) => setNumberFilter("yearEnd", e.target.value ? parseInt(e.target.value, 10) : undefined)}
                style={{
                  width: 80,
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  padding: "4px 8px",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              />
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => toggleBooleanFilter("hasTranscript", true)}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 4,
                border: `1px solid ${filters.hasTranscript === true ? "var(--moss)" : "var(--rule)"}`,
                background: filters.hasTranscript === true ? "var(--moss-light, #eaf3e8)" : "var(--paper)",
                color: filters.hasTranscript === true ? "var(--moss)" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              Has transcript
              {facets?.hasTranscript ? ` (${facets.hasTranscript.true})` : ""}
            </button>
            <button
              onClick={() => toggleBooleanFilter("hasMedia", true)}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 4,
                border: `1px solid ${filters.hasMedia === true ? "var(--moss)" : "var(--rule)"}`,
                background: filters.hasMedia === true ? "var(--moss-light, #eaf3e8)" : "var(--paper)",
                color: filters.hasMedia === true ? "var(--moss)" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              Has media
              {facets?.hasMedia ? ` (${facets.hasMedia.true})` : ""}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 48px" }}>
        {error && (
          <div style={{ padding: "24px", textAlign: "center", fontFamily: "var(--font-body)", color: "var(--ink-faded)", fontStyle: "italic" }}>
            {error}
          </div>
        )}

        {loading && !searched && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--ink-faded)", fontStyle: "italic" }}>
            Searching…
          </div>
        )}

        {searched && filteredResults.length === 0 && !loading && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--ink-faded)", fontStyle: "italic" }}>
            {query.trim() ? `No results for "${query.trim()}"` : "Start typing to search…"}
          </div>
        )}

        {filteredResults.map((result) => (
          <SearchResultCard key={`${result.kind}-${result.id}`} result={result} treeId={treeId} />
        ))}

        {searched && hasMore && !loading && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <button
              onClick={loadMore}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: "var(--moss)",
                background: "none",
                border: "1px solid var(--moss)",
                borderRadius: 6,
                padding: "8px 24px",
                cursor: "pointer",
              }}
            >
              Load more
            </button>
          </div>
        )}

        {loading && searched && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-faded)", fontStyle: "italic" }}>
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultCard({ result, treeId }: { result: SearchResult; treeId: string }) {
  const href =
    result.kind === "person"
      ? `/trees/${treeId}/people/${result.personId ?? result.id}`
      : result.kind === "memory"
        ? `/trees/${treeId}/people/${result.primaryPersonId ?? ""}?memory=${result.memoryId ?? result.id}`
        : `/trees/${treeId}/home`;

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderBottom: "1px solid var(--rule)",
        textDecoration: "none",
        color: "inherit",
        transition: "background var(--duration-micro)",
      }}
    >
      {/* Thumbnail / icon */}
      <div
        style={{
          width: 48,
          height: result.kind === "person" ? 48 : 36,
          borderRadius: result.kind === "person" ? "50%" : 4,
          overflow: "hidden",
          border: "1px solid var(--rule)",
          background: "var(--paper-deep)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {result.kind === "person" && result.portraitUrl ? (
          <img
            src={getProxiedMediaUrl(result.portraitUrl) ?? undefined}
            alt={result.title}
            onError={handleMediaError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : result.kind === "memory" && result.mediaUrl && result.memoryKind === "photo" ? (
          <img
            src={getProxiedMediaUrl(result.mediaUrl) ?? undefined}
            alt={result.title}
            onError={handleMediaError}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-faded)" }}>
            {result.kind === "person"
              ? result.title.charAt(0)
              : result.kind === "memory"
                ? KIND_ICON[(result.memoryKind as MemoryKind) ?? "other"]
                : "◉"}
          </span>
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 15,
            color: "var(--ink)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {result.title}
        </div>
        {result.subtitle && (
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              marginTop: 1,
            }}
          >
            {result.subtitle}
          </div>
        )}
        {result.snippet && (
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--ink-faded)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {highlightSnippet(result.snippet, result.highlightRanges)}
          </div>
        )}
        {result.matchReason.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {result.matchReason.map((reason) => (
              <span
                key={reason}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 10,
                  color: "var(--moss)",
                  background: "var(--moss-light, #eaf3e8)",
                  borderRadius: 3,
                  padding: "1px 5px",
                }}
              >
                {reason}
              </span>
            ))}
          </div>
        )}
      </div>

      <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>→</span>
    </Link>
  );
}