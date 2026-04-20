import { and, eq, inArray, or } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "./db.js";

type MemoryVisibilityLevel =
  | "all_members"
  | "family_circle"
  | "named_circle"
  | "hidden";

export type ResolvedMemoryVisibility = {
  memoryId: string;
  visibility: MemoryVisibilityLevel;
  isOverride: boolean;
  unlockDate: Date | null;
};

type PermissionResult = {
  allowed: boolean;
  reason: string;
};

function allow(reason: string): PermissionResult {
  return { allowed: true, reason };
}

function deny(reason: string): PermissionResult {
  return { allowed: false, reason };
}

export function canManageTreeScope(role: string): boolean {
  return role === "founder" || role === "steward";
}

function canAccessVisibilityLevel(
  visibility: MemoryVisibilityLevel,
  role: string,
): boolean {
  if (visibility === "hidden") {
    return false;
  }

  if (visibility === "all_members") {
    return true;
  }

  // The schema supports circle-based visibility before the product has circle
  // membership records. Until that lands, keep those modes steward-only.
  return canManageTreeScope(role);
}

async function resolveMemoryVisibilitiesForTree(
  treeId: string,
  memoryIds: string[],
): Promise<ResolvedMemoryVisibility[]> {
  if (memoryIds.length === 0) {
    return [];
  }

  const now = new Date();
  const [memories, visibilityRows] = await Promise.all([
    db.query.memories.findMany({
      where: (memory, { inArray }) => inArray(memory.id, memoryIds),
      columns: {
        id: true,
        primaryPersonId: true,
      },
    }),
    db.query.memoryTreeVisibility.findMany({
      where: (visibility, { and, eq, inArray }) =>
        and(
          eq(visibility.treeId, treeId),
          inArray(visibility.memoryId, memoryIds),
        ),
      columns: {
        memoryId: true,
        visibilityOverride: true,
        unlockDate: true,
      },
    }),
  ]);

  const primaryPersonIds = [...new Set(memories.map((memory) => memory.primaryPersonId))];
  const [scopeRows, legacyPeople] = await Promise.all([
    primaryPersonIds.length > 0
      ? db.query.treePersonScope.findMany({
          where: (scope, { and, eq, inArray }) =>
            and(
              eq(scope.treeId, treeId),
              inArray(scope.personId, primaryPersonIds),
            ),
          columns: {
            personId: true,
            visibilityDefault: true,
          },
        })
      : Promise.resolve([]),
    primaryPersonIds.length > 0
      ? db.query.people.findMany({
          where: (person, { and, eq, inArray }) =>
            and(
              eq(person.treeId, treeId),
              inArray(person.id, primaryPersonIds),
            ),
          columns: {
            id: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const visibilityByMemoryId = new Map(
    visibilityRows.map((row) => [row.memoryId, row]),
  );
  const scopeDefaultByPersonId = new Map(
    scopeRows.map((row) => [row.personId, row.visibilityDefault]),
  );
  const legacyPersonIds = new Set(legacyPeople.map((person) => person.id));

  return memories.map((memory) => {
    const override = visibilityByMemoryId.get(memory.id);
    const visibility =
      override
        ? override.unlockDate && override.unlockDate > now
          ? "hidden"
          : override.visibilityOverride
        : scopeDefaultByPersonId.get(memory.primaryPersonId) ??
          (legacyPersonIds.has(memory.primaryPersonId)
            ? "all_members"
            : "all_members");

    return {
      memoryId: memory.id,
      visibility,
      isOverride: Boolean(override),
      unlockDate: override?.unlockDate ?? null,
    };
  });
}

export async function getViewableMemoryIdsForTree(
  treeId: string,
  memoryIds: string[],
  viewerUserId: string,
): Promise<string[]> {
  if (memoryIds.length === 0) {
    return [];
  }

  const membership = await db.query.treeMemberships.findFirst({
    where: (treeMembership, { and, eq }) =>
      and(
        eq(treeMembership.treeId, treeId),
        eq(treeMembership.userId, viewerUserId),
      ),
    columns: {
      role: true,
    },
  });

  if (!membership) {
    return [];
  }
  const resolvedVisibilities = await resolveMemoryVisibilitiesForTree(treeId, memoryIds);
  const visibilityByMemoryId = new Map(
    resolvedVisibilities.map((visibility) => [visibility.memoryId, visibility.visibility]),
  );

  return memoryIds
    .filter((memory) => {
      const resolvedVisibility = visibilityByMemoryId.get(memory) ?? "all_members";
      return canAccessVisibilityLevel(resolvedVisibility, membership.role);
    })
    .map((memoryId) => memoryId);
}

export async function getResolvedMemoryVisibilitiesForTree(
  treeId: string,
  memoryIds: string[],
): Promise<ResolvedMemoryVisibility[]> {
  return resolveMemoryVisibilitiesForTree(treeId, memoryIds);
}

export async function canEditPerson(
  userId: string,
  personId: string,
): Promise<PermissionResult> {
  const person = await db.query.people.findFirst({
    where: (candidate, { eq }) => eq(candidate.id, personId),
    columns: {
      id: true,
      treeId: true,
      homeTreeId: true,
      linkedUserId: true,
    },
  });

  if (!person) {
    return deny("Person not found");
  }

  if (person.linkedUserId === userId) {
    return allow("Subject sovereignty");
  }

  const homeTreeId = person.homeTreeId;
  const [homeTreeMembership, scopedStewardship, legacyStewardship] =
    await Promise.all([
      homeTreeId
        ? db.query.treeMemberships.findFirst({
            where: (membership, { and, eq, or }) =>
              and(
                eq(membership.treeId, homeTreeId),
                eq(membership.userId, userId),
                or(eq(membership.role, "founder"), eq(membership.role, "steward")),
              ),
            columns: {
              treeId: true,
            },
          })
        : Promise.resolve(null),
      db
        .select({ treeId: schema.treeMemberships.treeId })
        .from(schema.treePersonScope)
        .innerJoin(
          schema.treeMemberships,
          and(
            eq(schema.treeMemberships.treeId, schema.treePersonScope.treeId),
            eq(schema.treeMemberships.userId, userId),
            or(
              eq(schema.treeMemberships.role, "founder"),
              eq(schema.treeMemberships.role, "steward"),
            ),
          ),
        )
        .where(eq(schema.treePersonScope.personId, personId))
        .limit(1),
      db.query.treeMemberships.findFirst({
        where: (membership, { and, eq, or }) =>
          and(
            eq(membership.treeId, person.treeId),
            eq(membership.userId, userId),
            or(eq(membership.role, "founder"), eq(membership.role, "steward")),
          ),
        columns: {
          treeId: true,
        },
      }),
    ]);

  if (homeTreeMembership) {
    return allow("Home tree stewardship");
  }

  if (scopedStewardship.length > 0 || legacyStewardship) {
    return allow("Tree stewardship");
  }

  return deny("Only the linked subject or a steward can edit this person");
}

export async function canEditRelationship(
  userId: string,
  relationshipId: string,
): Promise<PermissionResult> {
  const relationship = await db.query.relationships.findFirst({
    where: (candidate, { eq }) => eq(candidate.id, relationshipId),
    columns: {
      id: true,
      treeId: true,
      createdInTreeId: true,
    },
    with: {
      fromPerson: {
        columns: {
          linkedUserId: true,
        },
      },
      toPerson: {
        columns: {
          linkedUserId: true,
        },
      },
    },
  });

  if (!relationship) {
    return deny("Relationship not found");
  }

  if (
    relationship.fromPerson?.linkedUserId === userId ||
    relationship.toPerson?.linkedUserId === userId
  ) {
    return allow("Linked participant");
  }

  const stewardTreeId = relationship.createdInTreeId ?? relationship.treeId;
  const stewardMembership = await db.query.treeMemberships.findFirst({
    where: (membership, { and, eq, or }) =>
      and(
        eq(membership.treeId, stewardTreeId),
        eq(membership.userId, userId),
        or(eq(membership.role, "founder"), eq(membership.role, "steward")),
      ),
    columns: {
      treeId: true,
    },
  });

  if (stewardMembership) {
    return allow("Creating tree stewardship");
  }

  return deny("Only a linked participant or steward can edit this relationship");
}
