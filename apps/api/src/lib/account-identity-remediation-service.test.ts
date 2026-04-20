import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??=
  "postgresql://familytree:familytree@localhost:5432/familytree_test";

const { chooseExecutionTreeId } = await import(
  "./account-identity-remediation-service.js"
);

describe("chooseExecutionTreeId", () => {
  it("prefers an affected relationship tree when allowed", () => {
    const treeId = chooseExecutionTreeId({
      survivor: {
        treeId: "tree-survivor",
        scopeTreeIds: ["tree-survivor", "tree-shared"],
      },
      mergedAway: {
        treeId: "tree-merged",
        scopeTreeIds: ["tree-merged"],
      },
      mergeCheck: {
        affectedTreeIds: ["tree-shared"],
      },
      allowedTreeIds: new Set(["tree-shared", "tree-survivor", "tree-merged"]),
    });

    assert.equal(treeId, "tree-shared");
  });

  it("falls back to the survivor tree when no affected tree is allowed", () => {
    const treeId = chooseExecutionTreeId({
      survivor: {
        treeId: "tree-survivor",
        scopeTreeIds: ["tree-survivor", "tree-shared"],
      },
      mergedAway: {
        treeId: "tree-merged",
        scopeTreeIds: ["tree-merged"],
      },
      mergeCheck: {
        affectedTreeIds: ["tree-unavailable"],
      },
      allowedTreeIds: new Set(["tree-survivor"]),
    });

    assert.equal(treeId, "tree-survivor");
  });

  it("returns null when there is no allowed execution tree", () => {
    const treeId = chooseExecutionTreeId({
      survivor: {
        treeId: "tree-survivor",
        scopeTreeIds: ["tree-survivor"],
      },
      mergedAway: {
        treeId: "tree-merged",
        scopeTreeIds: ["tree-merged"],
      },
      mergeCheck: {
        affectedTreeIds: ["tree-shared"],
      },
      allowedTreeIds: new Set<string>(),
    });

    assert.equal(treeId, null);
  });
});
