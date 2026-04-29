import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import * as schema from "@tessera/database";
import { db } from "./db.js";
import { getTreeScopedPersonIds, getVisibleMemoryIdsForTree } from "./cross-tree-read-service.js";
import { mediaUrl } from "./storage.js";

export interface SearchResult {
  id: string;
  kind: "person" | "memory" | "place";
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

export interface SearchTotals {
  people: number;
  memories: number;
  places: number;
}

export interface SearchResponse {
  results: SearchResult[];
  totals: SearchTotals;
  query: string;
  filters: SearchFilters;
}

export interface SearchFilters {
  personIds?: string[];
  memoryKinds?: string[];
  placeIds?: string[];
  yearStart?: number;
  yearEnd?: number;
  hasTranscript?: boolean;
  hasMedia?: boolean;
  contributorUserId?: string;
}

export interface FacetResult {
  memoryKinds: Record<string, number>;
  people: { id: string; name: string; count: number }[];
  places: { id: string; label: string; count: number }[];
  yearRange: { earliest: number | null; latest: number | null };
  hasTranscript: { true: number; false: number };
  hasMedia: { true: number; false: number };
}

function websearchToTsquery(query: string) {
  return sql`websearch_to_tsquery('english', ${query})`;
}

function extractYear(dateText: string | null): number | null {
  if (!dateText) return null;
  const match = dateText.match(/\b(\d{4})\b/);
  return match ? parseInt(match[1]!, 10) : null;
}

function buildMemoryWhere(
  treeId: string,
  tsQuery: SQL,
  filters: SearchFilters,
): SQL | undefined {
  const conditions: SQL[] = [eq(schema.memories.treeId, treeId), sql`${schema.memories.searchVector} @@ ${tsQuery}`];

  if (filters.memoryKinds && filters.memoryKinds.length > 0) {
    conditions.push(inArray(schema.memories.kind, filters.memoryKinds as ("story" | "photo" | "voice" | "document" | "other")[]));
  }
  if (filters.contributorUserId) {
    conditions.push(eq(schema.memories.contributorUserId, filters.contributorUserId));
  }
  if (filters.hasTranscript === true) {
    conditions.push(eq(schema.memories.transcriptStatus, "completed"));
  } else if (filters.hasTranscript === false) {
    conditions.push(sql`${schema.memories.transcriptStatus} IS NULL OR ${schema.memories.transcriptStatus} = 'none'`);
  }
  if (filters.hasMedia === true) {
    conditions.push(isNotNull(schema.memories.mediaId));
  } else if (filters.hasMedia === false) {
    conditions.push(isNull(schema.memories.mediaId));
  }
  if (filters.personIds && filters.personIds.length > 0) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${schema.memoryPersonTags} WHERE ${schema.memoryPersonTags.memoryId} = ${schema.memories.id} AND ${schema.memoryPersonTags.personId} IN (${sql.join(filters.personIds.map(id => sql`${id}`), sql`, `)}) OR ${schema.memories.primaryPersonId} IN (${sql.join(filters.personIds.map(id => sql`${id}`), sql`, `)})`
    );
  }
  if (filters.placeIds && filters.placeIds.length > 0) {
    conditions.push(inArray(schema.memories.placeId, filters.placeIds));
  }
  if (filters.yearStart !== undefined || filters.yearEnd !== undefined) {
    conditions.push(sql`regexp_match(${schema.memories.dateOfEventText}, '\\d{4}') IS NOT NULL`);
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return sql.join(conditions, sql` AND `);
}

async function searchMemories(
  treeId: string,
  query: string,
  viewerUserId: string,
  limit: number,
  offset: number,
  filters: SearchFilters,
): Promise<{ results: SearchResult[]; total: number }> {
  const scopedPersonIds = await getTreeScopedPersonIds(treeId);
  if (scopedPersonIds.length === 0) return { results: [], total: 0 };

  const tsQuery = websearchToTsquery(query);
  const whereCondition = buildMemoryWhere(treeId, tsQuery, filters);

  if (!whereCondition) return { results: [], total: 0 };

  const rankedRows = await db
    .select({
      id: schema.memories.id,
      title: schema.memories.title,
      kind: schema.memories.kind,
      primaryPersonId: schema.memories.primaryPersonId,
      mediaId: schema.memories.mediaId,
      dateOfEventText: schema.memories.dateOfEventText,
      treeId: schema.memories.treeId,
      transcriptStatus: schema.memories.transcriptStatus,
      score: sql<number>`ts_rank_cd(${schema.memories.searchVector}, ${tsQuery}) +
        CASE WHEN ${schema.memories.transcriptStatus} = 'completed' THEN 0.05 ELSE 0 END`,
      headline: sql<string | null>`ts_headline('english', coalesce(${schema.memories.body}, ${schema.memories.title}), ${tsQuery}, 'MaxWords=35, MinWords=15, ShortWord=3, HighlightAll=FALSE')`,
    })
    .from(schema.memories)
    .where(whereCondition)
    .orderBy(sql`ts_rank_cd(${schema.memories.searchVector}, ${tsQuery}) +
      CASE WHEN ${schema.memories.transcriptStatus} = 'completed' THEN 0.05 ELSE 0 END DESC`)
    .limit(limit * 3)
    .offset(0);

  const trgmRows = rankedRows.length < limit
    ? await db
        .select({
          id: schema.memories.id,
          title: schema.memories.title,
          kind: schema.memories.kind,
          primaryPersonId: schema.memories.primaryPersonId,
          mediaId: schema.memories.mediaId,
          dateOfEventText: schema.memories.dateOfEventText,
          treeId: schema.memories.treeId,
          transcriptStatus: schema.memories.transcriptStatus,
          score: sql<number>`similarity(${schema.memories.title}, ${query})`,
          headline: sql<string | null>`${schema.memories.title}`,
        })
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.treeId, treeId),
            sql`similarity(${schema.memories.title}, ${query}) > 0.3`,
          ),
        )
        .orderBy(sql`similarity(${schema.memories.title}, ${query}) DESC`)
        .limit(limit * 2)
    : [];

  const seenIds = new Set(rankedRows.map((r) => r.id));
  let combined = [
    ...rankedRows,
    ...trgmRows.filter((r) => !seenIds.has(r.id)),
  ];

  const candidateIds = combined.map((r) => r.id);
  if (candidateIds.length === 0) return { results: [], total: 0 };

  const visibleIds = await getVisibleMemoryIdsForTree(treeId, candidateIds, viewerUserId);
  const visibleSet = new Set(visibleIds);

  combined = combined.filter((r) => visibleSet.has(r.id));

  if (filters.personIds && filters.personIds.length > 0) {
    const personIdSet = new Set(filters.personIds);
    combined = combined.filter((r) =>
      personIdSet.has(r.primaryPersonId) || visibleSet.has(r.id),
    );
  }

  if (filters.yearStart !== undefined || filters.yearEnd !== undefined) {
    combined = combined.filter((r) => {
      const year = extractYear(r.dateOfEventText);
      if (year === null) return false;
      if (filters.yearStart !== undefined && year < filters.yearStart) return false;
      if (filters.yearEnd !== undefined && year > filters.yearEnd) return false;
      return true;
    });
  }

  const totalCount = combined.length;
  const paged = combined.slice(offset, offset + limit);

  if (paged.length === 0) return { results: [], total: totalCount };

  const personIds = [...new Set(paged.map((r) => r.primaryPersonId).filter(Boolean) as string[])];
  const mediaIds = [...new Set(paged.map((r) => r.mediaId).filter(Boolean) as string[])];

  const [personRows, mediaRows] = await Promise.all([
    personIds.length > 0
      ? db.query.people.findMany({
          where: (p, { inArray: inArr }) => inArr(p.id, personIds),
          columns: { id: true, displayName: true },
          with: { portraitMedia: { columns: { objectKey: true } } },
        })
      : Promise.resolve([]),
    mediaIds.length > 0
      ? db.query.media.findMany({
          where: (m, { inArray: inArr }) => inArr(m.id, mediaIds),
          columns: { id: true, objectKey: true },
        })
      : Promise.resolve([]),
  ]);

  const personNameMap = new Map(personRows.map((p) => [p.id, p.displayName]));
  const personPortraitMap = new Map(
    personRows
      .filter((p) => p.portraitMedia?.objectKey)
      .map((p) => [p.id, mediaUrl(p.portraitMedia!.objectKey)]),
  );
  const mediaUrlMap = new Map(mediaRows.map((m) => [m.id, mediaUrl(m.objectKey)]));

  const results: SearchResult[] = paged.map((row) => {
    const { snippet, highlightRanges } = parseHeadline(row.headline);
    const matchReason: string[] = [];
    if (row.score > 0) matchReason.push("text match");
    if (row.headline && row.headline.includes("<b>")) matchReason.push("content");
    if (row.transcriptStatus === "completed" && row.title.toLowerCase() !== (row.headline ?? "").replace(/<\/?b>/g, "").toLowerCase()) {
      matchReason.push("transcript");
    }

    return {
      id: row.id,
      kind: "memory" as const,
      title: row.title,
      subtitle: [
        row.kind,
        row.primaryPersonId ? personNameMap.get(row.primaryPersonId) ?? null : null,
        row.dateOfEventText,
      ]
        .filter(Boolean)
        .join(" · "),
      snippet,
      highlightRanges,
      score: row.score,
      matchReason,
      memoryId: row.id,
      primaryPersonId: row.primaryPersonId,
      portraitUrl: row.primaryPersonId ? personPortraitMap.get(row.primaryPersonId) ?? null : null,
      mediaUrl: row.mediaId ? mediaUrlMap.get(row.mediaId) ?? null : null,
      memoryKind: row.kind,
      dateOfEventText: row.dateOfEventText,
    };
  });

  return { results, total: totalCount };
}

async function searchPeople(
  treeId: string,
  query: string,
  limit: number,
  offset: number,
): Promise<{ results: SearchResult[]; total: number }> {
  const tsQuery = websearchToTsquery(query);

  const scopeRows = await db
    .select({
      personId: schema.treePersonScope.personId,
    })
    .from(schema.treePersonScope)
    .where(eq(schema.treePersonScope.treeId, treeId));

  const scopedIds = [...new Set(scopeRows.map((r) => r.personId))];
  if (scopedIds.length === 0) return { results: [], total: 0 };

  const rankedRows = await db
    .select({
      id: schema.people.id,
      displayName: schema.people.displayName,
      essenceLine: schema.people.essenceLine,
      birthDateText: schema.people.birthDateText,
      deathDateText: schema.people.deathDateText,
      portraitMediaId: schema.people.portraitMediaId,
      score: sql<number>`ts_rank_cd(${schema.people.searchVector}, ${tsQuery})`,
    })
    .from(schema.people)
    .where(
      and(
        inArray(schema.people.id, scopedIds),
        sql`${schema.people.searchVector} @@ ${tsQuery}`,
      ),
    )
    .orderBy(sql`ts_rank_cd(${schema.people.searchVector}, ${tsQuery}) DESC`)
    .limit(limit * 2);

  const trgmRows = rankedRows.length < limit
    ? await db
        .select({
          id: schema.people.id,
          displayName: schema.people.displayName,
          essenceLine: schema.people.essenceLine,
          birthDateText: schema.people.birthDateText,
          deathDateText: schema.people.deathDateText,
          portraitMediaId: schema.people.portraitMediaId,
          score: sql<number>`similarity(${schema.people.displayName}, ${query})`,
        })
        .from(schema.people)
        .where(
          and(
            inArray(schema.people.id, scopedIds),
            sql`similarity(${schema.people.displayName}, ${query}) > 0.3`,
          ),
        )
        .orderBy(sql`similarity(${schema.people.displayName}, ${query}) DESC`)
        .limit(limit)
    : [];

  const seenIds = new Set(rankedRows.map((r) => r.id));
  const combined = [
    ...rankedRows,
    ...trgmRows.filter((r) => !seenIds.has(r.id)),
  ];

  const totalCount = combined.length;
  const paged = combined.slice(offset, offset + limit);

  const portraitIds = [...new Set(paged.map((r) => r.portraitMediaId).filter(Boolean) as string[])];
  const portraitRows = portraitIds.length > 0
    ? await db.query.media.findMany({
        where: (m, { inArray: inArr }) => inArr(m.id, portraitIds),
        columns: { id: true, objectKey: true },
      })
    : [];
  const portraitMap = new Map(portraitRows.map((m) => [m.id, mediaUrl(m.objectKey)]));

  const results: SearchResult[] = paged.map((row) => ({
    id: row.id,
    kind: "person" as const,
    title: row.displayName,
    subtitle: row.essenceLine ?? null,
    snippet: null,
    highlightRanges: [],
    score: row.score,
    matchReason: row.score > 0 ? ["name"] : [],
    personId: row.id,
    portraitUrl: row.portraitMediaId ? portraitMap.get(row.portraitMediaId) ?? null : null,
  }));

  return { results, total: totalCount };
}

async function searchPlaces(
  treeId: string,
  query: string,
  limit: number,
  offset: number,
): Promise<{ results: SearchResult[]; total: number }> {
  const tsQuery = websearchToTsquery(query);

  const rankedRows = await db
    .select({
      id: schema.places.id,
      label: schema.places.label,
      locality: schema.places.locality,
      adminRegion: schema.places.adminRegion,
      latitude: schema.places.latitude,
      longitude: schema.places.longitude,
      score: sql<number>`ts_rank_cd(${schema.places.searchVector}, ${tsQuery})`,
    })
    .from(schema.places)
    .where(
      and(
        eq(schema.places.treeId, treeId),
        sql`${schema.places.searchVector} @@ ${tsQuery}`,
      ),
    )
    .orderBy(sql`ts_rank_cd(${schema.places.searchVector}, ${tsQuery}) DESC`)
    .limit(limit * 2);

  const trgmRows = rankedRows.length < limit
    ? await db
        .select({
          id: schema.places.id,
          label: schema.places.label,
          locality: schema.places.locality,
          adminRegion: schema.places.adminRegion,
          latitude: schema.places.latitude,
          longitude: schema.places.longitude,
          score: sql<number>`similarity(${schema.places.label}, ${query})`,
        })
        .from(schema.places)
        .where(
          and(
            eq(schema.places.treeId, treeId),
            sql`similarity(${schema.places.label}, ${query}) > 0.3`,
          ),
        )
        .orderBy(sql`similarity(${schema.places.label}, ${query}) DESC`)
        .limit(limit)
    : [];

  const seenIds = new Set(rankedRows.map((r) => r.id));
  const combined = [
    ...rankedRows,
    ...trgmRows.filter((r) => !seenIds.has(r.id)),
  ];

  const totalCount = combined.length;
  const paged = combined.slice(offset, offset + limit);

  const results: SearchResult[] = paged.map((row) => ({
    id: row.id,
    kind: "place" as const,
    title: row.label,
    subtitle: [row.locality, row.adminRegion].filter(Boolean).join(", ") || null,
    snippet: null,
    highlightRanges: [],
    score: row.score,
    matchReason: row.score > 0 ? ["place label"] : [],
    placeId: row.id,
  }));

  return { results, total: totalCount };
}

function parseHeadline(headline: string | null): { snippet: string | null; highlightRanges: [number, number][] } {
  if (!headline) return { snippet: null, highlightRanges: [] };

  const ranges: [number, number][] = [];
  let cleanText = "";
  let i = 0;

  while (i < headline.length) {
    if (headline.startsWith("<b>", i)) {
      const start = cleanText.length;
      i += 3;
      const endTag = headline.indexOf("</b>", i);
      if (endTag === -1) {
        cleanText += headline.slice(i);
        break;
      }
      cleanText += headline.slice(i, endTag);
      ranges.push([start, cleanText.length]);
      i = endTag + 4;
    } else {
      cleanText += headline[i];
      i++;
    }
  }

  return { snippet: cleanText, highlightRanges: ranges };
}

export async function search(
  treeId: string,
  query: string,
  viewerUserId: string,
  options: {
    limit?: number;
    offset?: number;
    kinds?: ("person" | "memory" | "place")[];
    filters?: SearchFilters;
  } = {},
): Promise<SearchResponse> {
  const limit = Math.min(options.limit ?? 30, 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const kinds = options.kinds ?? ["person", "memory", "place"];
  const filters = options.filters ?? {};

  const queries: Promise<{ results: SearchResult[]; total: number }>[] = [];

  if (kinds.includes("person")) {
    queries.push(searchPeople(treeId, query, limit, offset));
  } else {
    queries.push(Promise.resolve({ results: [], total: 0 }));
  }

  if (kinds.includes("memory")) {
    queries.push(searchMemories(treeId, query, viewerUserId, limit, offset, filters));
  } else {
    queries.push(Promise.resolve({ results: [], total: 0 }));
  }

  if (kinds.includes("place")) {
    queries.push(searchPlaces(treeId, query, limit, offset));
  } else {
    queries.push(Promise.resolve({ results: [], total: 0 }));
  }

  const [peopleResult, memoriesResult, placesResult] = await Promise.all(queries);

  const allResults = [
    ...(peopleResult?.results ?? []),
    ...(memoriesResult?.results ?? []),
    ...(placesResult?.results ?? []),
  ];

  allResults.sort((a, b) => b.score - a.score);

  return {
    results: allResults,
    totals: {
      people: peopleResult?.total ?? 0,
      memories: memoriesResult?.total ?? 0,
      places: placesResult?.total ?? 0,
    },
    query,
    filters,
  };
}

export async function getSearchFacets(
  treeId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _viewerUserId: string,
): Promise<FacetResult> {
  const scopedPersonIds = await getTreeScopedPersonIds(treeId);

  const memoryWhere = scopedPersonIds.length > 0
    ? sql`(EXISTS (SELECT 1 FROM ${schema.memoryPersonTags} WHERE ${schema.memoryPersonTags.memoryId} = ${schema.memories.id} AND ${schema.memoryPersonTags.personId} IN (${sql.join(scopedPersonIds.map(id => sql`${id}`), sql`, `)})) OR ${schema.memories.treeId} = ${treeId})`
    : eq(schema.memories.treeId, treeId);

  const [
    kindRows,
    personMemoryRows,
    placeMemoryRows,
    yearRangeRows,
    transcriptRows,
    mediaRows,
  ] = await Promise.all([
    db
      .select({
        kind: schema.memories.kind,
        count: sql<number>`count(*)`,
      })
      .from(schema.memories)
      .where(memoryWhere)
      .groupBy(schema.memories.kind),
    db
      .select({
      personId: schema.memoryPersonTags.personId,
      count: sql<number>`count(*)`,
    })
    .from(schema.memoryPersonTags)
    .innerJoin(schema.memories, eq(schema.memoryPersonTags.memoryId, schema.memories.id))
    .where(memoryWhere)
    .groupBy(schema.memoryPersonTags.personId)
    .orderBy(sql`count(*) DESC`)
    .limit(20),
    db
    .select({
      placeId: schema.memories.placeId,
      count: sql<number>`count(*)`,
    })
    .from(schema.memories)
    .where(and(memoryWhere, isNotNull(schema.memories.placeId)))
    .groupBy(schema.memories.placeId)
    .orderBy(sql`count(*) DESC`)
    .limit(20),
    db
    .select({
      minYear: sql<number | null>`min((regexp_match(${schema.memories.dateOfEventText}, '\\d{4}'))[1]::int)`,
      maxYear: sql<number | null>`max((regexp_match(${schema.memories.dateOfEventText}, '\\d{4}'))[1]::int)`,
    })
    .from(schema.memories)
    .where(and(memoryWhere, sql`${schema.memories.dateOfEventText} ~ '\d{4}'`)),
    db
    .select({
      hasTranscript: sql<string>`CASE WHEN ${schema.memories.transcriptStatus} = 'completed' THEN 'true' ELSE 'false' END`,
      count: sql<number>`count(*)`,
    })
    .from(schema.memories)
    .where(memoryWhere)
    .groupBy(sql`CASE WHEN ${schema.memories.transcriptStatus} = 'completed' THEN 'true' ELSE 'false' END`),
    db
      .select({
        hasMedia: sql<string>`CASE WHEN ${schema.memories.mediaId} IS NOT NULL THEN 'true' ELSE 'false' END`,
        count: sql<number>`count(*)`,
      })
      .from(schema.memories)
      .where(memoryWhere)
      .groupBy(sql`CASE WHEN ${schema.memories.mediaId} IS NOT NULL THEN 'true' ELSE 'false' END`),
  ]);

  const memoryKinds: Record<string, number> = {};
  for (const row of kindRows) {
    memoryKinds[row.kind] = Number(row.count);
  }

  const uniquePersonIds = [...new Set(personMemoryRows.map((r) => r.personId))];
  const personNameRows = uniquePersonIds.length > 0
    ? await db.query.people.findMany({
        where: (p, { inArray: inArr }) => inArr(p.id, uniquePersonIds),
        columns: { id: true, displayName: true },
      })
    : [];
  const personNameMap = new Map(personNameRows.map((p) => [p.id, p.displayName]));

  const people: FacetResult["people"] = personMemoryRows.map((row) => ({
    id: row.personId,
    name: personNameMap.get(row.personId) ?? "Unknown",
    count: Number(row.count),
  }));

  const uniquePlaceIds = [...new Set(placeMemoryRows.map((r) => r.placeId!).filter(Boolean))];
  const placeRows = uniquePlaceIds.length > 0
    ? await db.query.places.findMany({
        where: (p, { inArray: inArr }) => inArr(p.id, uniquePlaceIds),
        columns: { id: true, label: true },
      })
    : [];
  const placeLabelMap = new Map(placeRows.map((p) => [p.id, p.label]));

  const places: FacetResult["places"] = placeMemoryRows
    .filter((row) => row.placeId !== null)
    .map((row) => ({
      id: row.placeId!,
      label: placeLabelMap.get(row.placeId!) ?? "Unknown",
      count: Number(row.count),
    }));

  const yearRange: FacetResult["yearRange"] = {
    earliest: yearRangeRows[0]?.minYear ?? null,
    latest: yearRangeRows[0]?.maxYear ?? null,
  };

  const hasTranscript: FacetResult["hasTranscript"] = { true: 0, false: 0 };
  for (const row of transcriptRows) {
    if (row.hasTranscript === "true") hasTranscript.true = Number(row.count);
    else hasTranscript.false += Number(row.count);
  }

  const hasMedia: FacetResult["hasMedia"] = { true: 0, false: 0 };
  for (const row of mediaRows) {
    if (row.hasMedia === "true") hasMedia.true = Number(row.count);
    else hasMedia.false += Number(row.count);
  }

  return { memoryKinds, people, places, yearRange, hasTranscript, hasMedia };
}