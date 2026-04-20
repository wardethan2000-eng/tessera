import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??=
  "postgresql://familytree:familytree@localhost:5432/familytree_test";

const {
  recommendDuplicateClaimSurvivor,
  summarizeDuplicateClaimStatus,
} = await import("./account-identity-audit-service.js");

describe("recommendDuplicateClaimSurvivor", () => {
  it("prefers the survivor with no blockers", () => {
    const recommendation = recommendDuplicateClaimSurvivor({
      people: [
        { id: "person-a", createdAt: new Date("2024-01-01T00:00:00Z"), scopeTreeIds: ["tree-a"] },
        { id: "person-b", createdAt: new Date("2024-01-02T00:00:00Z"), scopeTreeIds: ["tree-b"] },
      ],
      pairwiseMergeChecks: [
        {
          survivorPersonId: "person-a",
          mergedAwayPersonId: "person-b",
          canMerge: true,
          affectedTreeIds: [],
          affectedTreeNames: [],
          touchedRelationshipCount: 0,
          blocker: null,
        },
        {
          survivorPersonId: "person-b",
          mergedAwayPersonId: "person-a",
          canMerge: false,
          affectedTreeIds: [],
          affectedTreeNames: [],
          touchedRelationshipCount: 0,
          blocker: "blocked",
        },
      ],
    });

    assert.equal(recommendation.survivorPersonId, "person-a");
    assert.equal(recommendation.blockedMergeCount, 0);
    assert.equal(recommendation.mergeableCount, 1);
  });

  it("breaks ties by broader scope and older created date", () => {
    const recommendation = recommendDuplicateClaimSurvivor({
      people: [
        {
          id: "person-a",
          createdAt: new Date("2024-01-02T00:00:00Z"),
          scopeTreeIds: ["tree-a"],
        },
        {
          id: "person-b",
          createdAt: new Date("2024-01-01T00:00:00Z"),
          scopeTreeIds: ["tree-a", "tree-b"],
        },
      ],
      pairwiseMergeChecks: [
        {
          survivorPersonId: "person-a",
          mergedAwayPersonId: "person-b",
          canMerge: false,
          affectedTreeIds: [],
          affectedTreeNames: [],
          touchedRelationshipCount: 0,
          blocker: "blocked",
        },
        {
          survivorPersonId: "person-b",
          mergedAwayPersonId: "person-a",
          canMerge: false,
          affectedTreeIds: [],
          affectedTreeNames: [],
          touchedRelationshipCount: 0,
          blocker: "blocked",
        },
      ],
    });

    assert.equal(recommendation.survivorPersonId, "person-b");
  });
});

describe("summarizeDuplicateClaimStatus", () => {
  it("returns ready_for_merge when the recommendation has no blockers", () => {
    assert.equal(
      summarizeDuplicateClaimStatus({
        peopleCount: 2,
        recommendation: {
          survivorPersonId: "person-a",
          blockedMergeCount: 0,
          mergeableCount: 1,
          reason: "ok",
        },
      }),
      "ready_for_merge",
    );
  });

  it("returns manual_review when some merges are possible but not all", () => {
    assert.equal(
      summarizeDuplicateClaimStatus({
        peopleCount: 3,
        recommendation: {
          survivorPersonId: "person-a",
          blockedMergeCount: 1,
          mergeableCount: 1,
          reason: "partial",
        },
      }),
      "manual_review",
    );
  });

  it("returns blocked when no immediate merges are possible", () => {
    assert.equal(
      summarizeDuplicateClaimStatus({
        peopleCount: 2,
        recommendation: {
          survivorPersonId: "person-a",
          blockedMergeCount: 1,
          mergeableCount: 0,
          reason: "blocked",
        },
      }),
      "blocked",
    );
  });
});
