import { and, eq } from "drizzle-orm";
import * as schema from "@familytree/database";
import { getViewableMemoryIdsForTree } from "./cross-tree-permission-service.js";
import { db } from "./db.js";
import { getReachMatchedMemoryIdsForTree } from "./memory-reach-service.js";

function applyScopeToPerson<
  TPerson extends {
    displayName: string;
  },
>(
  person: TPerson,
  scope?: {
    displayNameOverride?: string | null;
    visibilityDefault?: "all_members" | "family_circle" | "named_circle";
  } | null,
) {
  return {
    ...person,
    canonicalDisplayName: person.displayName,
    displayName: scope?.displayNameOverride ?? person.displayName,
    displayNameOverride: scope?.displayNameOverride ?? null,
    visibilityDefault: scope?.visibilityDefault ?? "all_members",
  };
}

export async function getTreeScopedPersonIds(treeId: string): Promise<string[]> {
  const [scopeRows, legacyRows] = await Promise.all([
    db
      .select({ personId: schema.treePersonScope.personId })
      .from(schema.treePersonScope)
      .where(eq(schema.treePersonScope.treeId, treeId)),
    db
      .select({ personId: schema.people.id })
      .from(schema.people)
      .where(eq(schema.people.treeId, treeId)),
  ]);

  return [...new Set([...scopeRows, ...legacyRows].map((row) => row.personId))];
}

export async function isPersonInTreeScope(
  treeId: string,
  personId: string,
): Promise<boolean> {
  const [scopeRow, legacyRow] = await Promise.all([
    db.query.treePersonScope.findFirst({
      where: (scope, { and, eq }) =>
        and(eq(scope.treeId, treeId), eq(scope.personId, personId)),
      columns: {
        personId: true,
      },
    }),
    db.query.people.findFirst({
      where: (person, { and, eq }) =>
        and(eq(person.id, personId), eq(person.treeId, treeId)),
      columns: {
        id: true,
      },
    }),
  ]);

  return Boolean(scopeRow || legacyRow);
}

export async function getTreeScopedPeople(treeId: string) {
  const [scopedRows, legacyPeople] = await Promise.all([
    db.query.treePersonScope.findMany({
      where: (scope, { eq }) => eq(scope.treeId, treeId),
      with: {
        person: {
          with: {
            portraitMedia: true,
            birthPlaceRef: true,
            deathPlaceRef: true,
          },
        },
      },
    }),
    db.query.people.findMany({
      where: (person, { eq }) => eq(person.treeId, treeId),
      with: {
        portraitMedia: true,
        birthPlaceRef: true,
        deathPlaceRef: true,
      },
    }),
  ]);

  const merged = new Map<string, (typeof legacyPeople)[number]>();
  for (const row of scopedRows) {
    if (row.person) {
      merged.set(row.person.id, applyScopeToPerson(row.person, row));
    }
  }
  for (const person of legacyPeople) {
    if (!merged.has(person.id)) {
      merged.set(person.id, applyScopeToPerson(person));
    }
  }

  return [...merged.values()];
}

export async function getTreeScopedPerson(treeId: string, personId: string) {
  const scopedRow = await db.query.treePersonScope.findFirst({
    where: (scope, { and, eq }) =>
      and(eq(scope.treeId, treeId), eq(scope.personId, personId)),
    with: {
      person: {
        with: {
          portraitMedia: true,
          birthPlaceRef: true,
          deathPlaceRef: true,
        },
      },
    },
  });

  if (scopedRow?.person) {
    return applyScopeToPerson(scopedRow.person, scopedRow);
  }

  const legacyPerson = await db.query.people.findFirst({
    where: (person, { and, eq }) =>
      and(eq(person.id, personId), eq(person.treeId, treeId)),
    with: {
      portraitMedia: true,
      birthPlaceRef: true,
      deathPlaceRef: true,
    },
  });

  return legacyPerson ? applyScopeToPerson(legacyPerson) : null;
}

export async function getTreeScopedPersonByLinkedUserId(
  treeId: string,
  userId: string,
) {
  const people = await getTreeScopedPeople(treeId);
  return people.find((person) => person.linkedUserId === userId) ?? null;
}

export async function getTreeMemories(
  treeId: string,
  options: {
    personId?: string;
    limit?: number;
    viewerUserId: string;
    includeSuppressed?: boolean;
  },
) {
  const scopedPersonIds = await getTreeScopedPersonIds(treeId);

  const taggedMemoryQuery = db
    .selectDistinct({ memoryId: schema.memoryPersonTags.memoryId })
    .from(schema.memoryPersonTags)
    .innerJoin(
      schema.treePersonScope,
      and(
        eq(schema.memoryPersonTags.personId, schema.treePersonScope.personId),
        eq(schema.treePersonScope.treeId, treeId),
      ),
    );

  const [taggedMemoryRows, legacyMemoryRows] = await Promise.all([
    options?.personId
      ? taggedMemoryQuery.where(eq(schema.memoryPersonTags.personId, options.personId))
      : taggedMemoryQuery,
    db
      .select({ memoryId: schema.memories.id })
      .from(schema.memories)
      .where(
        options?.personId
          ? and(
              eq(schema.memories.treeId, treeId),
              eq(schema.memories.primaryPersonId, options.personId),
            )
          : eq(schema.memories.treeId, treeId),
      ),
  ]);

  const reachedMemoryIds = await getReachMatchedMemoryIdsForTree(
    treeId,
    scopedPersonIds,
    options?.personId,
  );

  const memoryIds = [
    ...new Set(
      [
        ...taggedMemoryRows,
        ...legacyMemoryRows,
        ...reachedMemoryIds.map((memoryId) => ({ memoryId })),
      ].map((row) => row.memoryId),
    ),
  ];
  if (memoryIds.length === 0) {
    return [];
  }

  const visibleMemoryIds = await getVisibleMemoryIdsForTree(
    treeId,
    memoryIds,
    options.viewerUserId,
  );
  if (visibleMemoryIds.length === 0) {
    return [];
  }

  const suppressionIds =
    options.personId && !options.includeSuppressed
      ? await getSuppressedMemoryIdsForPersonSurface(
          treeId,
          options.personId,
          visibleMemoryIds,
        )
      : [];

  const suppressedIdSet = new Set(suppressionIds);
  const finalMemoryIds = visibleMemoryIds.filter((memoryId) => !suppressedIdSet.has(memoryId));
  if (finalMemoryIds.length === 0) {
    return [];
  }

  return db.query.memories.findMany({
    where: (memory, { inArray }) => inArray(memory.id, finalMemoryIds),
    with: {
      media: true,
      mediaItems: {
        with: {
          media: true,
        },
        orderBy: (memoryMediaItem, { asc }) => [asc(memoryMediaItem.sortOrder)],
      },
      place: true,
      primaryPerson: { with: { portraitMedia: true } },
      personTags: {
        with: {
          person: true,
        },
      },
      reachRules: true,
    },
    orderBy: (memory, { desc }) => [desc(memory.createdAt)],
    ...(options?.limit ? { limit: options.limit } : {}),
  });
}

export async function getTreeRelationships(treeId: string) {
  const scopedPersonIds = await getTreeScopedPersonIds(treeId);
  if (scopedPersonIds.length === 0) {
    return [];
  }

  const relationships = await db.query.relationships.findMany({
    where: (relationship, { and, eq, inArray }) =>
      and(
        eq(relationship.treeId, treeId),
        inArray(relationship.fromPersonId, scopedPersonIds),
        inArray(relationship.toPersonId, scopedPersonIds),
      ),
    with: {
      fromPerson: true,
      toPerson: true,
    },
  });

  if (relationships.length === 0) {
    return [];
  }

  const visibilityRows = await db.query.treeRelationshipVisibility.findMany({
    where: (visibility, { and, eq, inArray }) =>
      and(
        eq(visibility.treeId, treeId),
        inArray(
          visibility.relationshipId,
          relationships.map((relationship) => relationship.id),
        ),
      ),
  });

  const hiddenIds = new Set(
    visibilityRows
      .filter((row) => row.isVisible === false)
      .map((row) => row.relationshipId),
  );

  return relationships.filter((relationship) => !hiddenIds.has(relationship.id));
}

export async function getTreePersonRelationships(treeId: string, personId: string) {
  const scopedPersonIds = await getTreeScopedPersonIds(treeId);
  if (scopedPersonIds.length === 0) {
    return [];
  }

  const relationships = await db.query.relationships.findMany({
    where: (relationship, { and, eq, inArray, or }) =>
      and(
        eq(relationship.treeId, treeId),
        inArray(relationship.fromPersonId, scopedPersonIds),
        inArray(relationship.toPersonId, scopedPersonIds),
        or(
          eq(relationship.fromPersonId, personId),
          eq(relationship.toPersonId, personId),
        ),
      ),
    with: {
      fromPerson: true,
      toPerson: true,
    },
  });

  if (relationships.length === 0) {
    return [];
  }

  const visibilityRows = await db.query.treeRelationshipVisibility.findMany({
    where: (visibility, { and, eq, inArray }) =>
      and(
        eq(visibility.treeId, treeId),
        inArray(
          visibility.relationshipId,
          relationships.map((relationship) => relationship.id),
        ),
      ),
  });

  const hiddenIds = new Set(
    visibilityRows
      .filter((row) => row.isVisible === false)
      .map((row) => row.relationshipId),
  );

  return relationships.filter((relationship) => !hiddenIds.has(relationship.id));
}

export async function getVisibleTreesForPerson(personId: string, userId: string) {
  const [scopedTrees, legacyTrees] = await Promise.all([
    db
      .select({
        id: schema.trees.id,
        name: schema.trees.name,
        tier: schema.trees.tier,
        subscriptionStatus: schema.trees.subscriptionStatus,
        role: schema.treeMemberships.role,
      })
      .from(schema.treePersonScope)
      .innerJoin(
        schema.treeMemberships,
        and(
          eq(schema.treeMemberships.treeId, schema.treePersonScope.treeId),
          eq(schema.treeMemberships.userId, userId),
        ),
      )
      .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMemberships.treeId))
      .where(eq(schema.treePersonScope.personId, personId)),
    db
      .select({
        id: schema.trees.id,
        name: schema.trees.name,
        tier: schema.trees.tier,
        subscriptionStatus: schema.trees.subscriptionStatus,
        role: schema.treeMemberships.role,
      })
      .from(schema.people)
      .innerJoin(
        schema.treeMemberships,
        and(
          eq(schema.treeMemberships.treeId, schema.people.treeId),
          eq(schema.treeMemberships.userId, userId),
        ),
      )
      .innerJoin(schema.trees, eq(schema.trees.id, schema.treeMemberships.treeId))
      .where(eq(schema.people.id, personId)),
  ]);

  const merged = new Map<string, (typeof scopedTrees)[number]>();
  for (const tree of scopedTrees) {
    merged.set(tree.id, tree);
  }
  for (const tree of legacyTrees) {
    merged.set(tree.id, tree);
  }

  return [...merged.values()];
}

export async function getVisibleMemoryIdsForTree(
  treeId: string,
  memoryIds: string[],
  viewerUserId: string,
): Promise<string[]> {
  return getViewableMemoryIdsForTree(treeId, memoryIds, viewerUserId);
}

export async function getSuppressedMemoryIdsForPersonSurface(
  treeId: string,
  personId: string,
  memoryIds?: string[],
): Promise<string[]> {
  if (memoryIds && memoryIds.length === 0) {
    return [];
  }

  const rows = await db.query.memoryPersonSuppressions.findMany({
    where: (suppression, operators) =>
      memoryIds?.length
        ? and(
            operators.eq(suppression.treeId, treeId),
            operators.eq(suppression.personId, personId),
            operators.inArray(suppression.memoryId, memoryIds),
          )
        : and(
            operators.eq(suppression.treeId, treeId),
            operators.eq(suppression.personId, personId),
          ),
    columns: {
      memoryId: true,
    },
  });

  return rows.map((row) => row.memoryId);
}

export async function isMemoryInTreeScope(treeId: string, memoryId: string) {
  const [scopedRow, legacyRow] = await Promise.all([
    db
      .select({ memoryId: schema.memoryPersonTags.memoryId })
      .from(schema.memoryPersonTags)
      .innerJoin(
        schema.treePersonScope,
        and(
          eq(schema.memoryPersonTags.personId, schema.treePersonScope.personId),
          eq(schema.treePersonScope.treeId, treeId),
        ),
      )
      .where(eq(schema.memoryPersonTags.memoryId, memoryId))
      .limit(1),
    db.query.memories.findFirst({
      where: (memory, { and, eq }) =>
        and(eq(memory.id, memoryId), eq(memory.treeId, treeId)),
      columns: {
        id: true,
      },
    }),
  ]);

  return scopedRow.length > 0 || Boolean(legacyRow);
}

export async function isRelationshipInTreeScope(treeId: string, relationshipId: string) {
  const scopedPersonIds = await getTreeScopedPersonIds(treeId);
  if (scopedPersonIds.length === 0) {
    return false;
  }

  const relationship = await db.query.relationships.findFirst({
    where: (candidate, { and, eq, inArray }) =>
      and(
        eq(candidate.id, relationshipId),
        eq(candidate.treeId, treeId),
        inArray(candidate.fromPersonId, scopedPersonIds),
        inArray(candidate.toPersonId, scopedPersonIds),
      ),
    columns: {
      id: true,
    },
  });

  return Boolean(relationship);
}
