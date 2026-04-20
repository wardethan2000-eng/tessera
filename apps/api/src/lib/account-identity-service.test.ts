import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://familytree:familytree@localhost:5432/familytree_test";

const {
  decideInvitationLinkedIdentity,
  hydrateClaimedPeople,
  summarizeAccountIdentity,
} = await import("./account-identity-service.js");

describe("hydrateClaimedPeople", () => {
  it("includes the legacy tree id alongside scope rows", () => {
    const claimedPeople = hydrateClaimedPeople(
      [
        {
          id: "person-1",
          displayName: "Ethan Ward",
          treeId: "tree-home",
          homeTreeId: "tree-home",
          linkedUserId: "user-1",
        },
      ],
      [
        { personId: "person-1", treeId: "tree-home" },
        { personId: "person-1", treeId: "tree-other" },
      ],
    );

    assert.deepEqual(claimedPeople, [
      {
        id: "person-1",
        displayName: "Ethan Ward",
        treeId: "tree-home",
        homeTreeId: "tree-home",
        linkedUserId: "user-1",
        scopeTreeIds: ["tree-home", "tree-other"],
      },
    ]);
  });
});

describe("summarizeAccountIdentity", () => {
  it("returns unclaimed when no claimed people exist", () => {
    assert.deepEqual(summarizeAccountIdentity([]), {
      status: "unclaimed",
      claimedPeople: [],
      canonicalPerson: null,
    });
  });

  it("returns claimed when exactly one claimed person exists", () => {
    const person = {
      id: "person-1",
      displayName: "Ethan Ward",
      treeId: "tree-home",
      homeTreeId: "tree-home",
      linkedUserId: "user-1",
      scopeTreeIds: ["tree-home", "tree-other"],
    };

    assert.deepEqual(summarizeAccountIdentity([person]), {
      status: "claimed",
      claimedPeople: [person],
      canonicalPerson: person,
    });
  });

  it("returns conflict when more than one claimed person exists", () => {
    const personA = {
      id: "person-1",
      displayName: "Ethan Ward",
      treeId: "tree-a",
      homeTreeId: "tree-a",
      linkedUserId: "user-1",
      scopeTreeIds: ["tree-a"],
    };
    const personB = {
      id: "person-2",
      displayName: "Ethan J. Ward",
      treeId: "tree-b",
      homeTreeId: "tree-b",
      linkedUserId: "user-1",
      scopeTreeIds: ["tree-b"],
    };

    const result = summarizeAccountIdentity([personA, personB]);

    assert.equal(result.status, "conflict");
    assert.equal(result.canonicalPerson, null);
    assert.deepEqual(result.claimedPeople, [personA, personB]);
  });
});

describe("decideInvitationLinkedIdentity", () => {
  it("allows claiming an unclaimed linked person for an unclaimed user", () => {
    assert.deepEqual(
      decideInvitationLinkedIdentity({
        userId: "user-1",
        linkedPersonId: "person-1",
        linkedPersonLinkedUserId: null,
        identity: {
          status: "unclaimed",
          claimedPeople: [],
          canonicalPerson: null,
        },
      }),
      { kind: "claim-linked-person" },
    );
  });

  it("treats the same linked person as already linked", () => {
    assert.deepEqual(
      decideInvitationLinkedIdentity({
        userId: "user-1",
        linkedPersonId: "person-1",
        linkedPersonLinkedUserId: "user-1",
        identity: {
          status: "claimed",
          claimedPeople: [
            {
              id: "person-1",
              displayName: "Ethan Ward",
              treeId: "tree-1",
              homeTreeId: "tree-1",
              linkedUserId: "user-1",
              scopeTreeIds: ["tree-1"],
            },
          ],
          canonicalPerson: {
            id: "person-1",
            displayName: "Ethan Ward",
            treeId: "tree-1",
            homeTreeId: "tree-1",
            linkedUserId: "user-1",
            scopeTreeIds: ["tree-1"],
          },
        },
      }),
      { kind: "already-linked-to-person" },
    );
  });

  it("returns identity conflict when the user is already linked elsewhere", () => {
    assert.deepEqual(
      decideInvitationLinkedIdentity({
        userId: "user-1",
        linkedPersonId: "person-2",
        linkedPersonLinkedUserId: null,
        identity: {
          status: "claimed",
          claimedPeople: [
            {
              id: "person-1",
              displayName: "Ethan Ward",
              treeId: "tree-1",
              homeTreeId: "tree-1",
              linkedUserId: "user-1",
              scopeTreeIds: ["tree-1"],
            },
          ],
          canonicalPerson: {
            id: "person-1",
            displayName: "Ethan Ward",
            treeId: "tree-1",
            homeTreeId: "tree-1",
            linkedUserId: "user-1",
            scopeTreeIds: ["tree-1"],
          },
        },
      }),
      {
        kind: "identity-conflict",
        reason: "user_already_linked_elsewhere",
        existingCanonicalPersonId: "person-1",
        existingCanonicalTreeId: "tree-1",
      },
    );
  });

  it("returns conflict when the user already has multiple claimed people", () => {
    assert.deepEqual(
      decideInvitationLinkedIdentity({
        userId: "user-1",
        linkedPersonId: "person-3",
        linkedPersonLinkedUserId: null,
        identity: {
          status: "conflict",
          claimedPeople: [
            {
              id: "person-1",
              displayName: "Ethan Ward",
              treeId: "tree-1",
              homeTreeId: "tree-1",
              linkedUserId: "user-1",
              scopeTreeIds: ["tree-1"],
            },
            {
              id: "person-2",
              displayName: "Ethan J. Ward",
              treeId: "tree-2",
              homeTreeId: "tree-2",
              linkedUserId: "user-1",
              scopeTreeIds: ["tree-2"],
            },
          ],
          canonicalPerson: null,
        },
      }),
      {
        kind: "identity-conflict",
        reason: "user_has_multiple_claimed_people",
        existingCanonicalPersonId: null,
        existingCanonicalTreeId: null,
      },
    );
  });

  it("rejects linking a person claimed by another user", () => {
    assert.deepEqual(
      decideInvitationLinkedIdentity({
        userId: "user-1",
        linkedPersonId: "person-1",
        linkedPersonLinkedUserId: "user-2",
        identity: {
          status: "unclaimed",
          claimedPeople: [],
          canonicalPerson: null,
        },
      }),
      {
        kind: "linked-person-claimed-by-other-user",
        claimedByUserId: "user-2",
      },
    );
  });
});
