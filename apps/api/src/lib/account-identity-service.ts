import { eq } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "./db.js";

export type ClaimedPersonIdentity = {
  id: string;
  displayName: string;
  treeId: string;
  homeTreeId: string | null;
  linkedUserId: string | null;
  scopeTreeIds: string[];
};

export type AccountIdentityStatus =
  | {
      status: "unclaimed";
      claimedPeople: [];
      canonicalPerson: null;
    }
  | {
      status: "claimed";
      claimedPeople: [ClaimedPersonIdentity];
      canonicalPerson: ClaimedPersonIdentity;
    }
  | {
      status: "conflict";
      claimedPeople: [ClaimedPersonIdentity, ...ClaimedPersonIdentity[]];
      canonicalPerson: null;
    };

export type InvitationLinkedIdentityDecision =
  | {
      kind: "claim-linked-person";
    }
  | {
      kind: "already-linked-to-person";
    }
  | {
      kind: "identity-conflict";
      reason: "user_has_multiple_claimed_people" | "user_already_linked_elsewhere";
      existingCanonicalPersonId: string | null;
      existingCanonicalTreeId: string | null;
    }
  | {
      kind: "linked-person-claimed-by-other-user";
      claimedByUserId: string;
    };

function uniq(values: string[]) {
  return [...new Set(values)];
}

export function decideInvitationLinkedIdentity(params: {
  userId: string;
  linkedPersonId: string;
  linkedPersonLinkedUserId: string | null;
  identity: AccountIdentityStatus;
}): InvitationLinkedIdentityDecision {
  const { userId, linkedPersonId, linkedPersonLinkedUserId, identity } = params;

  if (linkedPersonLinkedUserId && linkedPersonLinkedUserId !== userId) {
    return {
      kind: "linked-person-claimed-by-other-user",
      claimedByUserId: linkedPersonLinkedUserId,
    };
  }

  if (identity.status === "conflict") {
    return {
      kind: "identity-conflict",
      reason: "user_has_multiple_claimed_people",
      existingCanonicalPersonId: null,
      existingCanonicalTreeId: null,
    };
  }

  if (identity.status === "unclaimed") {
    return { kind: "claim-linked-person" };
  }

  if (identity.canonicalPerson.id === linkedPersonId) {
    return { kind: "already-linked-to-person" };
  }

  return {
    kind: "identity-conflict",
    reason: "user_already_linked_elsewhere",
    existingCanonicalPersonId: identity.canonicalPerson.id,
    existingCanonicalTreeId: identity.canonicalPerson.treeId,
  };
}

export function hydrateClaimedPeople(
  people: Array<{
    id: string;
    displayName: string;
    treeId: string;
    homeTreeId: string | null;
    linkedUserId: string | null;
  }>,
  scopeRows: Array<{ personId: string; treeId: string }>,
): ClaimedPersonIdentity[] {
  const scopeTreeIdsByPersonId = new Map<string, string[]>();

  for (const row of scopeRows) {
    const existing = scopeTreeIdsByPersonId.get(row.personId) ?? [];
    existing.push(row.treeId);
    scopeTreeIdsByPersonId.set(row.personId, existing);
  }

  return people.map((person) => ({
    ...person,
    scopeTreeIds: uniq([person.treeId, ...(scopeTreeIdsByPersonId.get(person.id) ?? [])]),
  }));
}

export function summarizeAccountIdentity(
  claimedPeople: ClaimedPersonIdentity[],
): AccountIdentityStatus {
  if (claimedPeople.length === 0) {
    return {
      status: "unclaimed",
      claimedPeople: [],
      canonicalPerson: null,
    };
  }

  if (claimedPeople.length === 1) {
    return {
      status: "claimed",
      claimedPeople: [claimedPeople[0]!],
      canonicalPerson: claimedPeople[0]!,
    };
  }

  return {
    status: "conflict",
    claimedPeople: claimedPeople as [ClaimedPersonIdentity, ...ClaimedPersonIdentity[]],
    canonicalPerson: null,
  };
}

export async function getClaimedPeopleForUser(
  userId: string,
): Promise<ClaimedPersonIdentity[]> {
  const people = await db.query.people.findMany({
    where: (person, { eq }) => eq(person.linkedUserId, userId),
    columns: {
      id: true,
      displayName: true,
      treeId: true,
      homeTreeId: true,
      linkedUserId: true,
    },
    orderBy: (person, { asc }) => [asc(person.createdAt), asc(person.id)],
  });

  if (people.length === 0) {
    return [];
  }

  const scopeRows = await db
    .select({
      personId: schema.treePersonScope.personId,
      treeId: schema.treePersonScope.treeId,
    })
    .from(schema.treePersonScope)
    .where(
      eq(schema.treePersonScope.personId, people[0]!.id),
    );

  const extraScopeRows =
    people.length > 1
      ? (
          await Promise.all(
            people.slice(1).map((person) =>
              db
                .select({
                  personId: schema.treePersonScope.personId,
                  treeId: schema.treePersonScope.treeId,
                })
                .from(schema.treePersonScope)
                .where(eq(schema.treePersonScope.personId, person.id)),
            ),
          )
        ).flat()
      : [];

  return hydrateClaimedPeople(people, [...scopeRows, ...extraScopeRows]);
}

export async function getIdentityStatusForUser(
  userId: string,
): Promise<AccountIdentityStatus> {
  const claimedPeople = await getClaimedPeopleForUser(userId);
  return summarizeAccountIdentity(claimedPeople);
}

export async function getClaimedPersonForUser(userId: string) {
  const identity = await getIdentityStatusForUser(userId);
  return identity.status === "claimed" ? identity.canonicalPerson : null;
}

export async function getUserPersonInTree(userId: string, treeId: string) {
  const claimedPerson = await getClaimedPersonForUser(userId);
  if (!claimedPerson) {
    return null;
  }

  return claimedPerson.scopeTreeIds.includes(treeId) ? claimedPerson : null;
}
