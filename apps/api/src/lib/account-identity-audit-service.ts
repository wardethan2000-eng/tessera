import { inArray, isNotNull, sql } from "drizzle-orm";
import type { DbClient } from "@familytree/database";
import * as schema from "@familytree/database";
import {
  PersonMergeError,
  preflightMergedRelationshipState,
  type MergeRelationshipRecord,
} from "./cross-tree-merge-service.js";

type AuditDb = DbClient;

type DuplicateClaimedPersonRow = {
  id: string;
  treeId: string;
  homeTreeId: string | null;
  displayName: string;
  birthDateText: string | null;
  deathDateText: string | null;
  linkedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountIdentityAuditPerson = {
  id: string;
  displayName: string;
  treeId: string;
  treeName: string;
  homeTreeId: string | null;
  homeTreeName: string | null;
  birthDateText: string | null;
  deathDateText: string | null;
  createdAt: string;
  updatedAt: string;
  scopeTreeIds: string[];
  scopeTreeNames: string[];
  relationshipCount: number;
  relationshipTreeIds: string[];
  relationshipTreeNames: string[];
  primaryMemoryCount: number;
  taggedMemoryCount: number;
  promptCount: number;
  linkedInvitationCount: number;
  pendingLinkedInvitationCount: number;
};

export type DuplicateMergeCheck = {
  survivorPersonId: string;
  mergedAwayPersonId: string;
  canMerge: boolean;
  affectedTreeIds: string[];
  affectedTreeNames: string[];
  touchedRelationshipCount: number;
  blocker: string | null;
};

export type DuplicateClaimRecommendation = {
  survivorPersonId: string;
  blockedMergeCount: number;
  mergeableCount: number;
  reason: string;
};

export type DuplicateClaimStatus = "ready_for_merge" | "manual_review" | "blocked";

export type AccountIdentityDuplicateCase = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  status: DuplicateClaimStatus;
  claimedPeopleCount: number;
  recommendedSurvivor: DuplicateClaimRecommendation;
  people: AccountIdentityAuditPerson[];
  recommendedMergeChecks: DuplicateMergeCheck[];
  pairwiseMergeChecks: DuplicateMergeCheck[];
};

export type AccountIdentityAuditSummary = {
  generatedAt: string;
  duplicateAccountCount: number;
  duplicateClaimedPeopleCount: number;
  readiness: "ready_for_unique_index" | "cleanup_required";
  cases: AccountIdentityDuplicateCase[];
};

function uniq(values: string[]) {
  return [...new Set(values)];
}

function mapCount(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function mapDistinctCounts(rows: Array<{ key: string; value: string }>) {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = grouped.get(row.key) ?? new Set<string>();
    set.add(row.value);
    grouped.set(row.key, set);
  }

  const counts = new Map<string, number>();
  for (const [key, values] of grouped) {
    counts.set(key, values.size);
  }
  return counts;
}

export function recommendDuplicateClaimSurvivor(params: {
  people: Array<{
    id: string;
    createdAt: Date;
    scopeTreeIds: string[];
  }>;
  pairwiseMergeChecks: DuplicateMergeCheck[];
}): DuplicateClaimRecommendation {
  const { people, pairwiseMergeChecks } = params;

  const ranked = [...people]
    .map((person) => {
      const outgoingChecks = pairwiseMergeChecks.filter(
        (check) => check.survivorPersonId === person.id,
      );
      const blockedMergeCount = outgoingChecks.filter((check) => !check.canMerge).length;
      const mergeableCount = outgoingChecks.filter((check) => check.canMerge).length;

      return {
        survivorPersonId: person.id,
        blockedMergeCount,
        mergeableCount,
        createdAt: person.createdAt,
        scopeTreeCount: person.scopeTreeIds.length,
      };
    })
    .sort((left, right) => {
      if (left.blockedMergeCount !== right.blockedMergeCount) {
        return left.blockedMergeCount - right.blockedMergeCount;
      }
      if (left.mergeableCount !== right.mergeableCount) {
        return right.mergeableCount - left.mergeableCount;
      }
      if (left.scopeTreeCount !== right.scopeTreeCount) {
        return right.scopeTreeCount - left.scopeTreeCount;
      }
      if (left.createdAt.getTime() !== right.createdAt.getTime()) {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }
      return left.survivorPersonId.localeCompare(right.survivorPersonId);
    });

  const best = ranked[0]!;

  return {
    survivorPersonId: best.survivorPersonId,
    blockedMergeCount: best.blockedMergeCount,
    mergeableCount: best.mergeableCount,
    reason:
      best.blockedMergeCount === 0
        ? "Can absorb every other claimed duplicate under current merge rules."
        : "Leaves the fewest immediate merge blockers under current relationship rules.",
  };
}

export function summarizeDuplicateClaimStatus(params: {
  peopleCount: number;
  recommendation: DuplicateClaimRecommendation;
}): DuplicateClaimStatus {
  const { peopleCount, recommendation } = params;

  if (peopleCount <= 1) {
    return "ready_for_merge";
  }

  if (recommendation.blockedMergeCount === 0) {
    return "ready_for_merge";
  }

  if (recommendation.mergeableCount > 0) {
    return "manual_review";
  }

  return "blocked";
}

function formatTreeName(treeNamesById: Map<string, string>, treeId: string | null) {
  if (!treeId) {
    return null;
  }

  return treeNamesById.get(treeId) ?? treeId;
}

function evaluateMergeCheck(params: {
  survivorPersonId: string;
  mergedAwayPersonId: string;
  touchedRelationships: MergeRelationshipRecord[];
  relationshipsByTreeId: Map<string, MergeRelationshipRecord[]>;
  treeNamesById: Map<string, string>;
}): DuplicateMergeCheck {
  const {
    survivorPersonId,
    mergedAwayPersonId,
    touchedRelationships,
    relationshipsByTreeId,
    treeNamesById,
  } = params;

  const pairTouchedRelationships = touchedRelationships.filter(
    (relationship) =>
      relationship.fromPersonId === survivorPersonId ||
      relationship.toPersonId === survivorPersonId ||
      relationship.fromPersonId === mergedAwayPersonId ||
      relationship.toPersonId === mergedAwayPersonId,
  );

  const affectedTreeIds = uniq(pairTouchedRelationships.map((relationship) => relationship.treeId));
  const relationshipsInAffectedTrees = affectedTreeIds.flatMap(
    (treeId) => relationshipsByTreeId.get(treeId) ?? [],
  );

  try {
    preflightMergedRelationshipState({
      relationships: relationshipsInAffectedTrees,
      survivorPersonId,
      mergedAwayPersonId,
    });

    return {
      survivorPersonId,
      mergedAwayPersonId,
      canMerge: true,
      affectedTreeIds,
      affectedTreeNames: affectedTreeIds.map(
        (treeId) => treeNamesById.get(treeId) ?? treeId,
      ),
      touchedRelationshipCount: pairTouchedRelationships.length,
      blocker: null,
    };
  } catch (error) {
    return {
      survivorPersonId,
      mergedAwayPersonId,
      canMerge: false,
      affectedTreeIds,
      affectedTreeNames: affectedTreeIds.map(
        (treeId) => treeNamesById.get(treeId) ?? treeId,
      ),
      touchedRelationshipCount: pairTouchedRelationships.length,
      blocker:
        error instanceof PersonMergeError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown merge blocker",
    };
  }
}

export async function auditDuplicateClaimedAccounts(
  db: AuditDb,
  options?: {
    userId?: string;
  },
): Promise<AccountIdentityAuditSummary> {
  const duplicateClaimRows = await db
    .select({
      linkedUserId: schema.people.linkedUserId,
      claimedPeopleCount: sql<number>`count(*)::int`,
    })
    .from(schema.people)
    .where(
      options?.userId
        ? sql`${schema.people.linkedUserId} = ${options.userId}`
        : isNotNull(schema.people.linkedUserId),
    )
    .groupBy(schema.people.linkedUserId)
    .having(sql`count(*) > 1`);

  const duplicateUserIds = duplicateClaimRows
    .map((row) => row.linkedUserId)
    .filter((value): value is string => Boolean(value));

  if (duplicateUserIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      duplicateAccountCount: 0,
      duplicateClaimedPeopleCount: 0,
      readiness: "ready_for_unique_index",
      cases: [],
    };
  }

  const [users, people] = await Promise.all([
    db.query.users.findMany({
      where: (user, { inArray }) => inArray(user.id, duplicateUserIds),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    }),
    db.query.people.findMany({
      where: (person, { inArray }) => inArray(person.linkedUserId, duplicateUserIds),
      columns: {
        id: true,
        treeId: true,
        homeTreeId: true,
        displayName: true,
        birthDateText: true,
        deathDateText: true,
        linkedUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (person, { asc }) => [asc(person.createdAt), asc(person.id)],
    }),
  ]);

  const personIds = people.map((person) => person.id);
  const baseTreeIds = uniq(
    people.flatMap((person) => [person.treeId, person.homeTreeId].filter(Boolean) as string[]),
  );

  const [
    scopeRows,
    touchedRelationships,
    primaryMemories,
    taggedMemoryRows,
    prompts,
    invitations,
  ] = await Promise.all([
    db
      .select({
        personId: schema.treePersonScope.personId,
        treeId: schema.treePersonScope.treeId,
      })
      .from(schema.treePersonScope)
      .where(inArray(schema.treePersonScope.personId, personIds)),
    db.query.relationships.findMany({
      where: (relationship, { inArray, or }) =>
        or(
          inArray(relationship.fromPersonId, personIds),
          inArray(relationship.toPersonId, personIds),
        ),
      columns: {
        id: true,
        treeId: true,
        type: true,
        fromPersonId: true,
        toPersonId: true,
        spouseStatus: true,
        startDateText: true,
        endDateText: true,
      },
    }),
    db.query.memories.findMany({
      where: (memory, { inArray }) => inArray(memory.primaryPersonId, personIds),
      columns: {
        id: true,
        primaryPersonId: true,
      },
    }),
    db
      .select({
        key: schema.memoryPersonTags.personId,
        value: schema.memoryPersonTags.memoryId,
      })
      .from(schema.memoryPersonTags)
      .where(inArray(schema.memoryPersonTags.personId, personIds)),
    db.query.prompts.findMany({
      where: (prompt, { inArray }) => inArray(prompt.toPersonId, personIds),
      columns: {
        id: true,
        toPersonId: true,
      },
    }),
    db.query.invitations.findMany({
      where: (invitation, { inArray }) =>
        inArray(invitation.linkedPersonId, personIds),
      columns: {
        id: true,
        linkedPersonId: true,
        status: true,
      },
    }),
  ]);

  const relationshipTreeIds = uniq(touchedRelationships.map((relationship) => relationship.treeId));
  const allReferencedTreeIds = uniq([...baseTreeIds, ...scopeRows.map((row) => row.treeId), ...relationshipTreeIds]);

  const [trees, allRelationshipsInTouchedTrees] = await Promise.all([
    allReferencedTreeIds.length > 0
      ? db.query.trees.findMany({
          where: (tree, { inArray }) => inArray(tree.id, allReferencedTreeIds),
          columns: {
            id: true,
            name: true,
          },
        })
      : Promise.resolve([]),
    relationshipTreeIds.length > 0
      ? db.query.relationships.findMany({
          where: (relationship, { inArray }) =>
            inArray(relationship.treeId, relationshipTreeIds),
          columns: {
            id: true,
            treeId: true,
            type: true,
            fromPersonId: true,
            toPersonId: true,
            spouseStatus: true,
            startDateText: true,
            endDateText: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const treeNamesById = new Map(trees.map((tree) => [tree.id, tree.name]));
  const scopeTreeIdsByPersonId = new Map<string, string[]>();
  for (const row of scopeRows) {
    const treeIds = scopeTreeIdsByPersonId.get(row.personId) ?? [];
    treeIds.push(row.treeId);
    scopeTreeIdsByPersonId.set(row.personId, treeIds);
  }

  const relationshipsByTreeId = new Map<string, MergeRelationshipRecord[]>();
  for (const relationship of allRelationshipsInTouchedTrees) {
    const rows = relationshipsByTreeId.get(relationship.treeId) ?? [];
    rows.push(relationship);
    relationshipsByTreeId.set(relationship.treeId, rows);
  }

  const relationshipCountByPersonId = new Map<string, number>();
  const relationshipTreeIdsByPersonId = new Map<string, Set<string>>();
  for (const relationship of touchedRelationships) {
    for (const personId of [relationship.fromPersonId, relationship.toPersonId]) {
      relationshipCountByPersonId.set(
        personId,
        (relationshipCountByPersonId.get(personId) ?? 0) + 1,
      );
      const treeIds = relationshipTreeIdsByPersonId.get(personId) ?? new Set<string>();
      treeIds.add(relationship.treeId);
      relationshipTreeIdsByPersonId.set(personId, treeIds);
    }
  }

  const primaryMemoryCountByPersonId = mapCount(
    primaryMemories.map((memory) => memory.primaryPersonId),
  );
  const taggedMemoryCountByPersonId = mapDistinctCounts(taggedMemoryRows);
  const promptCountByPersonId = mapCount(prompts.map((prompt) => prompt.toPersonId));
  const invitationCountByPersonId = mapCount(
    invitations
      .map((invitation) => invitation.linkedPersonId)
      .filter((value): value is string => Boolean(value)),
  );
  const pendingInvitationCountByPersonId = mapCount(
    invitations
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => invitation.linkedPersonId)
      .filter((value): value is string => Boolean(value)),
  );

  const cases: AccountIdentityDuplicateCase[] = duplicateUserIds
    .map((userId) => {
      const user = usersById.get(userId);
      const claimedPeople = people.filter(
        (person): person is DuplicateClaimedPersonRow =>
          person.linkedUserId === userId,
      );

      if (!user || claimedPeople.length < 2) {
        return null;
      }

      const auditPeople: AccountIdentityAuditPerson[] = claimedPeople.map((person) => {
        const scopeTreeIds = uniq([
          person.treeId,
          ...(scopeTreeIdsByPersonId.get(person.id) ?? []),
        ]);
        const relationshipTreeIds = [
          ...(relationshipTreeIdsByPersonId.get(person.id) ?? new Set<string>()),
        ];

        return {
          id: person.id,
          displayName: person.displayName,
          treeId: person.treeId,
          treeName: treeNamesById.get(person.treeId) ?? person.treeId,
          homeTreeId: person.homeTreeId,
          homeTreeName: formatTreeName(treeNamesById, person.homeTreeId),
          birthDateText: person.birthDateText,
          deathDateText: person.deathDateText,
          createdAt: person.createdAt.toISOString(),
          updatedAt: person.updatedAt.toISOString(),
          scopeTreeIds,
          scopeTreeNames: scopeTreeIds.map(
            (treeId) => treeNamesById.get(treeId) ?? treeId,
          ),
          relationshipCount: relationshipCountByPersonId.get(person.id) ?? 0,
          relationshipTreeIds,
          relationshipTreeNames: relationshipTreeIds.map(
            (treeId) => treeNamesById.get(treeId) ?? treeId,
          ),
          primaryMemoryCount: primaryMemoryCountByPersonId.get(person.id) ?? 0,
          taggedMemoryCount: taggedMemoryCountByPersonId.get(person.id) ?? 0,
          promptCount: promptCountByPersonId.get(person.id) ?? 0,
          linkedInvitationCount: invitationCountByPersonId.get(person.id) ?? 0,
          pendingLinkedInvitationCount:
            pendingInvitationCountByPersonId.get(person.id) ?? 0,
        };
      });

      const pairwiseMergeChecks = auditPeople.flatMap((survivor) =>
        auditPeople
          .filter((candidate) => candidate.id !== survivor.id)
          .map((mergedAway) =>
            evaluateMergeCheck({
              survivorPersonId: survivor.id,
              mergedAwayPersonId: mergedAway.id,
              touchedRelationships,
              relationshipsByTreeId,
              treeNamesById,
            }),
          ),
      );

      const recommendation = recommendDuplicateClaimSurvivor({
        people: claimedPeople.map((person) => ({
          id: person.id,
          createdAt: person.createdAt,
          scopeTreeIds: uniq([
            person.treeId,
            ...(scopeTreeIdsByPersonId.get(person.id) ?? []),
          ]),
        })),
        pairwiseMergeChecks,
      });

      const status = summarizeDuplicateClaimStatus({
        peopleCount: auditPeople.length,
        recommendation,
      });

      return {
        user,
        status,
        claimedPeopleCount: auditPeople.length,
        recommendedSurvivor: recommendation,
        people: auditPeople,
        recommendedMergeChecks: pairwiseMergeChecks.filter(
          (check) => check.survivorPersonId === recommendation.survivorPersonId,
        ),
        pairwiseMergeChecks,
      };
    })
    .filter((caseSummary): caseSummary is AccountIdentityDuplicateCase => Boolean(caseSummary))
    .sort((left, right) => left.user.email.localeCompare(right.user.email));

  const duplicateClaimedPeopleCount = cases.reduce(
    (total, caseSummary) => total + caseSummary.claimedPeopleCount,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    duplicateAccountCount: cases.length,
    duplicateClaimedPeopleCount,
    readiness: cases.length === 0 ? "ready_for_unique_index" : "cleanup_required",
    cases,
  };
}
