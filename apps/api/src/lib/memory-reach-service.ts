import { inArray, or } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "./db.js";

type ReachKind = "immediate_family" | "ancestors" | "descendants" | "whole_tree";

type ReachRule = {
  memoryId: string;
  kind: ReachKind;
  seedPersonId: string | null;
  scopeTreeId: string | null;
};

type RelationshipRow = {
  type: "parent_child" | "sibling" | "spouse";
  fromPersonId: string;
  toPersonId: string;
};

async function listRelationshipsForPeople(personIds: Iterable<string>) {
  const ids = [...new Set(personIds)].filter(Boolean);
  if (ids.length === 0) {
    return [];
  }

  return db.query.relationships.findMany({
    where: (relationship, { inArray, or }) =>
      or(
        inArray(relationship.fromPersonId, ids),
        inArray(relationship.toPersonId, ids),
      ),
    columns: {
      type: true,
      fromPersonId: true,
      toPersonId: true,
    },
  }) as Promise<RelationshipRow[]>;
}

async function expandImmediateFamily(seedPersonId: string): Promise<Set<string>> {
  const relationships = await listRelationshipsForPeople([seedPersonId]);
  const personIds = new Set<string>([seedPersonId]);

  for (const relationship of relationships) {
    if (relationship.fromPersonId === seedPersonId) {
      personIds.add(relationship.toPersonId);
    }
    if (relationship.toPersonId === seedPersonId) {
      personIds.add(relationship.fromPersonId);
    }
  }

  return personIds;
}

async function expandLineage(
  seedPersonId: string,
  direction: "ancestors" | "descendants",
): Promise<Set<string>> {
  const visited = new Set<string>([seedPersonId]);
  let frontier = new Set<string>([seedPersonId]);

  while (frontier.size > 0) {
    const current = [...frontier];
    const relationships = await db.query.relationships.findMany({
      where: (relationship, { and, eq, inArray }) =>
        and(
          eq(relationship.type, "parent_child"),
          direction === "ancestors"
            ? inArray(relationship.toPersonId, current)
            : inArray(relationship.fromPersonId, current),
        ),
      columns: {
        fromPersonId: true,
        toPersonId: true,
      },
    });

    const next = new Set<string>();
    for (const relationship of relationships) {
      const relatedPersonId =
        direction === "ancestors"
          ? relationship.fromPersonId
          : relationship.toPersonId;
      if (!visited.has(relatedPersonId)) {
        visited.add(relatedPersonId);
        next.add(relatedPersonId);
      }
    }

    frontier = next;
  }

  return visited;
}

async function resolveReachRulePersonIds(rule: ReachRule): Promise<Set<string>> {
  if (rule.kind === "whole_tree" || !rule.seedPersonId) {
    return new Set();
  }

  switch (rule.kind) {
    case "immediate_family":
      return expandImmediateFamily(rule.seedPersonId);
    case "ancestors":
      return expandLineage(rule.seedPersonId, "ancestors");
    case "descendants":
      return expandLineage(rule.seedPersonId, "descendants");
    default:
      return new Set();
  }
}

export async function getReachMatchedMemoryIdsForTree(
  treeId: string,
  scopedPersonIds: string[],
  personId?: string,
): Promise<string[]> {
  const rules = await db.query.memoryReachRules.findMany({
    columns: {
      memoryId: true,
      kind: true,
      seedPersonId: true,
      scopeTreeId: true,
    },
  });
  if (rules.length === 0) {
    return [];
  }

  const scopedPersonIdSet = new Set(scopedPersonIds);
  const cache = new Map<string, Promise<Set<string>>>();
  const matchedMemoryIds = new Set<string>();

  for (const rule of rules) {
    if (rule.kind === "whole_tree") {
      if (rule.scopeTreeId === treeId) {
        matchedMemoryIds.add(rule.memoryId);
      }
      continue;
    }

    if (!rule.seedPersonId) {
      continue;
    }

    const cacheKey = `${rule.kind}:${rule.seedPersonId}`;
    const resolvedPromise =
      cache.get(cacheKey) ??
      resolveReachRulePersonIds({
        memoryId: rule.memoryId,
        kind: rule.kind,
        seedPersonId: rule.seedPersonId,
        scopeTreeId: rule.scopeTreeId,
      });
    cache.set(cacheKey, resolvedPromise);
    const resolvedPersonIds = await resolvedPromise;

    if (personId) {
      if (resolvedPersonIds.has(personId)) {
        matchedMemoryIds.add(rule.memoryId);
      }
      continue;
    }

    for (const resolvedPersonId of resolvedPersonIds) {
      if (scopedPersonIdSet.has(resolvedPersonId)) {
        matchedMemoryIds.add(rule.memoryId);
        break;
      }
    }
  }

  return [...matchedMemoryIds];
}
