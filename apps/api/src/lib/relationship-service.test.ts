import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://familytree:familytree@localhost:5432/familytree_test";

const { db } = await import("./db.js");
const { createRelationship, RelationshipRuleError } = await import("./relationship-service.js");

type QueueConfig = {
  peopleFindFirst?: Array<Record<string, unknown> | null>;
  relationshipsFindFirst?: Array<Record<string, unknown> | null>;
  relationshipsFindMany?: Array<Array<Record<string, unknown>>>;
};

type MockTx = {
  query: {
    people: {
      findFirst: () => Promise<Record<string, unknown> | null>;
    };
    relationships: {
      findFirst: () => Promise<Record<string, unknown> | null>;
      findMany: () => Promise<Array<Record<string, unknown>>>;
    };
  };
  insert: () => {
    values: (
      values: Record<string, unknown>,
    ) => { returning: () => Promise<Array<Record<string, unknown>>> };
  };
};

const originalTransaction = db.transaction;

afterEach(() => {
  (db as { transaction: typeof db.transaction }).transaction = originalTransaction;
});

function nextFromQueue<T>(queue: T[], label: string): T {
  const value = queue.shift();
  if (value === undefined) {
    throw new Error(`Unexpected ${label} call`);
  }
  return value;
}

function createMockTx(config: QueueConfig = {}) {
  const peopleQueue = [...(config.peopleFindFirst ?? [])];
  const relationshipFirstQueue = [...(config.relationshipsFindFirst ?? [])];
  const relationshipManyQueue = [...(config.relationshipsFindMany ?? [])];
  const insertedValues: Array<Record<string, unknown>> = [];

  const tx: MockTx = {
    query: {
      people: {
        findFirst: async () => nextFromQueue(peopleQueue, "people.findFirst"),
      },
      relationships: {
        findFirst: async () =>
          nextFromQueue(relationshipFirstQueue, "relationships.findFirst"),
        findMany: async () =>
          nextFromQueue(relationshipManyQueue, "relationships.findMany"),
      },
    },
    insert: () => ({
      values: (values) => {
        insertedValues.push(values);
        return {
          returning: async () => [{ id: "rel-created", ...values }],
        };
      },
    }),
  };

  return { tx, insertedValues };
}

function useMockTransaction(tx: MockTx) {
  (db as { transaction: typeof db.transaction }).transaction = async (callback) =>
    callback(tx as never);
}

describe("createRelationship invariants", () => {
  it("rejects self-referential relationships", async () => {
    const { tx, insertedValues } = createMockTx();
    useMockTransaction(tx);

    await assert.rejects(
      createRelationship({
        treeId: "tree-1",
        fromPersonId: "person-1",
        toPersonId: "person-1",
        type: "spouse",
      }),
      (error: unknown) => {
        assert.ok(error instanceof RelationshipRuleError);
        assert.equal(error.status, 400);
        assert.match(error.message, /cannot have a relationship with themselves/i);
        return true;
      },
    );

    assert.equal(insertedValues.length, 0);
  });

  it("enforces parent limit of two relationships", async () => {
    const { tx, insertedValues } = createMockTx({
      peopleFindFirst: [{ id: "parent-3" }, { id: "child-1" }],
      relationshipsFindFirst: [null, null],
      relationshipsFindMany: [[{ id: "parent-link-1" }, { id: "parent-link-2" }]],
    });
    useMockTransaction(tx);

    await assert.rejects(
      createRelationship({
        treeId: "tree-1",
        fromPersonId: "parent-3",
        toPersonId: "child-1",
        type: "parent_child",
      }),
      (error: unknown) => {
        assert.ok(error instanceof RelationshipRuleError);
        assert.equal(error.status, 409);
        assert.match(error.message, /already has two parents/i);
        return true;
      },
    );

    assert.equal(insertedValues.length, 0);
  });

  it("rejects a second active spouse for a person", async () => {
    const { tx, insertedValues } = createMockTx({
      peopleFindFirst: [{ id: "person-a" }, { id: "person-b" }],
      relationshipsFindFirst: [
        null,
        {
          id: "spouse-1",
          fromPersonId: "person-a",
          toPersonId: "person-x",
          spouseStatus: "active",
        },
      ],
    });
    useMockTransaction(tx);

    await assert.rejects(
      createRelationship({
        treeId: "tree-1",
        fromPersonId: "person-a",
        toPersonId: "person-b",
        type: "spouse",
      }),
      (error: unknown) => {
        assert.ok(error instanceof RelationshipRuleError);
        assert.equal(error.status, 409);
        assert.match(error.message, /already has an active spouse relationship/i);
        return true;
      },
    );

    assert.equal(insertedValues.length, 0);
  });

  it("normalizes spouse pairs and defaults spouse status on success", async () => {
    const { tx, insertedValues } = createMockTx({
      peopleFindFirst: [{ id: "person-z" }, { id: "person-a" }],
      relationshipsFindFirst: [null, null, null],
    });
    useMockTransaction(tx);

    const created = (await createRelationship({
      treeId: "tree-1",
      fromPersonId: "person-z",
      toPersonId: "person-a",
      type: "spouse",
    })) as {
      normalizedPersonAId: string;
      normalizedPersonBId: string;
      spouseStatus: "active" | "former" | "deceased_partner" | null;
    };

    assert.equal(insertedValues.length, 1);
    assert.equal(insertedValues[0]?.normalizedPersonAId, "person-a");
    assert.equal(insertedValues[0]?.normalizedPersonBId, "person-z");
    assert.equal(insertedValues[0]?.spouseStatus, "active");
    assert.equal(created.normalizedPersonAId, "person-a");
    assert.equal(created.normalizedPersonBId, "person-z");
    assert.equal(created.spouseStatus, "active");
  });
});
