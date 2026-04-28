import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePositions,
  computeConnections,
  computeSmartWeave,
  computeBoardSize,
  computePinCenter,
  getThreadPath,
  getThreadControlPoints,
  sampleCubicBezier,
  sampleCameraPath,
  findThreadBetween,
} from "./CorkboardLayout.js";

const MEMORIES_FIXTURE = [
  { id: "mem-1", primaryPersonId: "person-a", dateOfEventText: "Summer 1970", kind: "image" },
  { id: "mem-2", primaryPersonId: "person-a", dateOfEventText: "1985", kind: "story" },
  { id: "mem-3", primaryPersonId: "person-b", dateOfEventText: "1990", kind: "voice" },
  { id: "mem-4", primaryPersonId: "person-b", dateOfEventText: "2001", kind: "video" },
  { id: "mem-5", primaryPersonId: "person-c", dateOfEventText: "2010", kind: "document" },
  { id: "mem-6", primaryPersonId: "person-a", dateOfEventText: "2020", kind: "story" },
];

const SINGLE_MEMORY = [
  { id: "mem-solo", primaryPersonId: "person-x", dateOfEventText: "1999", kind: "text" },
];

const NO_DATE_MEMORIES = [
  { id: "nd-1", primaryPersonId: "p-a", dateOfEventText: null, kind: "story" },
  { id: "nd-2", primaryPersonId: "p-b", dateOfEventText: null, kind: "document" },
  { id: "nd-3", primaryPersonId: "p-a", dateOfEventText: null, kind: "voice" },
];

const BRANCH_MEMORIES = [
  { id: "b-1", primaryPersonId: "p-a", dateOfEventText: "1970", kind: "image", branchId: "branch-1" },
  { id: "b-2", primaryPersonId: "p-a", dateOfEventText: "1980", kind: "story", branchId: "branch-1" },
  { id: "b-3", primaryPersonId: "p-b", dateOfEventText: "1990", kind: "voice", branchId: "branch-2" },
  { id: "b-4", primaryPersonId: "p-b", dateOfEventText: "2000", kind: "document", branchId: "branch-2" },
];

describe("computePositions", () => {
  it("returns empty array for no memories", () => {
    const positions = computePositions([], "test-seed");
    assert.deepEqual(positions, []);
  });

  it("produces one pin per memory", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "test-seed");
    assert.equal(positions.length, MEMORIES_FIXTURE.length);
  });

  it("sets memoryId to the memory id", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "test-seed");
    const memoryIds = positions.map((p) => p.memoryId).sort();
    const expected = MEMORIES_FIXTURE.map((m) => m.id).sort();
    assert.deepEqual(memoryIds, expected);
  });

  it("sets the first chronologically-ordered pin as start pin", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "test-seed");
    const startPins = positions.filter((p) => p.isStartPin);
    assert.equal(startPins.length, 1);
    assert.equal(startPins[0]!.memoryId, "mem-1");
  });

  it("assigns rotation within -4 to +4 degrees", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "test-seed");
    for (const pin of positions) {
      assert.ok(pin.rotation >= -4, `rotation ${pin.rotation} >= -4`);
      assert.ok(pin.rotation <= 4, `rotation ${pin.rotation} <= 4`);
    }
  });

  it("assigns different dimensions per kind", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "test-seed");
    const byId = new Map(positions.map((p) => [p.memoryId, p]));
    const imagePin = byId.get("mem-1")!;
    const storyPin = byId.get("mem-2")!;
    const voicePin = byId.get("mem-3")!;
    assert.ok(imagePin.width > voicePin.width, "photos wider than voice cards");
    assert.ok(storyPin.height > voicePin.height, "stories taller than voice cards");
  });

  it("is deterministic for a given seed", () => {
    const a = computePositions(MEMORIES_FIXTURE, "seed-abc");
    const b = computePositions(MEMORIES_FIXTURE, "seed-abc");
    assert.deepEqual(a, b);
  });

  it("produces different layouts for different seeds", () => {
    const a = computePositions(MEMORIES_FIXTURE, "seed-aaa");
    const b = computePositions(MEMORIES_FIXTURE, "seed-bbb");
    let same = true;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i]!.x !== b[i]!.x || a[i]!.y !== b[i]!.y) {
        same = false;
        break;
      }
    }
    assert.ok(!same, "different seeds should produce different layouts");
  });

  it("enforces minimum spacing between pins", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "spacing-test");
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j]!.x - positions[i]!.x;
        const dy = positions[j]!.y - positions[i]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        assert.ok(dist >= 600, `pin ${i} and ${j} are ${dist}px apart (min ~600, target 700)`);
      }
    }
  });

  it("handles a single memory gracefully", () => {
    const positions = computePositions(SINGLE_MEMORY, "single-test");
    assert.equal(positions.length, 1);
    assert.ok(positions[0]!.isStartPin);
  });

  it("handles memories without dates", () => {
    const positions = computePositions(NO_DATE_MEMORIES, "nodate-test");
    assert.equal(positions.length, 3);
    const startPins = positions.filter((p) => p.isStartPin);
    assert.equal(startPins.length, 1);
  });

  it("keeps all positions within board bounds", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "bounds-test");
    const board = computeBoardSize(positions.length);
    for (const pin of positions) {
      assert.ok(pin.x >= 200, `x ${pin.x} >= 200`);
      assert.ok(pin.y >= 200, `y ${pin.y} >= 200`);
      assert.ok(pin.x <= board.width - 200, `x ${pin.x} <= ${board.width - 200}`);
      assert.ok(pin.y <= board.height - 200, `y ${pin.y} <= ${board.height - 200}`);
    }
  });

  it("clusters same-person memories near each other on the board", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "cluster-test");
    const byPerson = new Map<string, { x: number; y: number }[]>();
    for (const pin of positions) {
      const mem = MEMORIES_FIXTURE.find((m) => m.id === pin.memoryId);
      if (!mem) continue;
      const group = byPerson.get(mem.primaryPersonId) ?? [];
      group.push({ x: pin.x, y: pin.y });
      byPerson.set(mem.primaryPersonId, group);
    }

    for (const [, group] of byPerson) {
      if (group.length < 2) continue;
      let totalDist = 0;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const dx = group[j]!.x - group[i]!.x;
          const dy = group[j]!.y - group[i]!.y;
          totalDist += Math.sqrt(dx * dx + dy * dy);
        }
      }
      const avgDist = totalDist / ((group.length * (group.length - 1)) / 2);
      assert.ok(avgDist < 800, `person group pins avg dist ${avgDist} should be < 800`);
    }
  });
});

describe("computeConnections", () => {
  it("returns empty array for no memories", () => {
    const positions = computePositions([], "test");
    const connections = computeConnections([], positions);
    assert.deepEqual(connections, []);
  });

  it("creates temporal threads between chronologically adjacent memories", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "conn-test");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const temporal = connections.filter((c) => c.type === "temporal");
    assert.ok(temporal.length >= MEMORIES_FIXTURE.length - 1, "should have at least n-1 temporal connections");
  });

  it("creates person threads between memories of the same person", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "conn-test");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const personConns = connections.filter((c) => c.type === "person");
    assert.ok(personConns.length >= 1, "person-a has 3 memories, should have at least 1 person thread");
  });

  it("creates era threads between memories of the same year", () => {
    const eraMemories = [
      { id: "e1", primaryPersonId: "p-a", dateOfEventText: "Summer 1985", kind: "image" },
      { id: "e2", primaryPersonId: "p-b", dateOfEventText: "1985", kind: "story" },
      { id: "e3", primaryPersonId: "p-c", dateOfEventText: "Fall 1985", kind: "voice" },
    ];
    const positions = computePositions(eraMemories, "era-test");
    const connections = computeConnections(eraMemories, positions);
    const eraConns = connections.filter((c) => c.type === "era");
    assert.ok(eraConns.length >= 1, "should have era connections for same-year memories");
  });

  it("does not duplicate connections that already exist as temporal", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "dedup-test");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const ids = connections.map((c) => c.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, "all connection ids should be unique");
  });

  it("sets temporal strength higher than person strength", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "strength-test");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const temporal = connections.find((c) => c.type === "temporal");
    const person = connections.find((c) => c.type === "person");
    if (temporal && person) {
      assert.ok(temporal.strength > person.strength);
    }
  });

  it("creates branch threads when branchId is present", () => {
    const positions = computePositions(BRANCH_MEMORIES, "branch-test");
    const connections = computeConnections(BRANCH_MEMORIES, positions);
    const branchConns = connections.filter((c) => c.type === "branch");
    assert.ok(branchConns.length >= 2, "should have branch connections within each branch");
  });

  it("does not create branch threads when no branchId is present", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "no-branch-test");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const branchConns = connections.filter((c) => c.type === "branch");
    assert.equal(branchConns.length, 0, "should have no branch connections without branchId");
  });

  it("caps outgoing threads per pin to MAX_OUTGOING_THREADS_PER_PIN", () => {
    const manyMemories = Array.from({ length: 30 }, (_, i) => ({
      id: `mem-${i}`,
      primaryPersonId: i < 10 ? "person-a" : i < 20 ? "person-b" : "person-c",
      dateOfEventText: `${1970 + i}`,
      kind: "image" as const,
    }));
    const positions = computePositions(manyMemories, "cap-test");
    const connections = computeConnections(manyMemories, positions);
    const outgoingCount = new Map<string, number>();
    for (const c of connections) {
      outgoingCount.set(c.from, (outgoingCount.get(c.from) ?? 0) + 1);
      outgoingCount.set(c.to, (outgoingCount.get(c.to) ?? 0) + 1);
    }
    for (const [, count] of outgoingCount) {
      assert.ok(count <= 6, `pin has ${count} outgoing threads, max is 6`);
    }
  });
});

describe("computeSmartWeave", () => {
  it("returns empty array for no memories", () => {
    const result = computeSmartWeave([], {});
    assert.deepEqual(result, []);
  });

  it("returns all memory ids in chronological order", () => {
    const result = computeSmartWeave(MEMORIES_FIXTURE, {});
    assert.equal(result.length, MEMORIES_FIXTURE.length);
    assert.equal(result[0], "mem-1");
    assert.equal(result[1], "mem-2");
    assert.equal(result[2], "mem-3");
    assert.equal(result[3], "mem-4");
    assert.equal(result[4], "mem-5");
    assert.equal(result[5], "mem-6");
  });

  it("does not repeat any memory id", () => {
    const result = computeSmartWeave(MEMORIES_FIXTURE, {});
    const unique = new Set(result);
    assert.equal(result.length, unique.size);
  });

  it("starts with the earliest memory when no seen-map bias", () => {
    const result = computeSmartWeave(MEMORIES_FIXTURE, {});
    assert.equal(result[0], "mem-1");
  });

  it("prioritizes unseen memories first when seen-map is provided", () => {
    const seenMap = { "mem-1": Date.now(), "mem-2": Date.now() };
    const result = computeSmartWeave(MEMORIES_FIXTURE, seenMap);
    assert.ok(!result.slice(0, 2).includes("mem-1"), "mem-1 should not be in first 2");
    assert.ok(!result.slice(0, 2).includes("mem-2"), "mem-2 should not be in first 2");
  });

  it("handles single memory", () => {
    const result = computeSmartWeave(SINGLE_MEMORY, {});
    assert.deepEqual(result, ["mem-solo"]);
  });

  it("handles memories without dates", () => {
    const result = computeSmartWeave(NO_DATE_MEMORIES, {});
    assert.equal(result.length, 3);
  });
});

describe("computeBoardSize", () => {
  it("returns minimum base dimensions for 0 pins", () => {
    const size = computeBoardSize(0);
    assert.ok(size.width >= 8000);
    assert.ok(size.height >= 6000);
  });

  it("scales up for large pin counts", () => {
    const small = computeBoardSize(10);
    const large = computeBoardSize(200);
    assert.ok(large.width > small.width);
    assert.ok(large.height > small.height);
  });
});

describe("computePinCenter", () => {
  it("returns board center for no pins", () => {
    const center = computePinCenter([]);
    assert.equal(center.x, 4000);
    assert.equal(center.y, 3000);
  });

  it("returns start pin position as center", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "center-test");
    const center = computePinCenter(positions);
    const startPin = positions.find((p) => p.isStartPin)!;
    assert.equal(center.x, startPin.x);
    assert.equal(center.y, startPin.y);
  });
});

describe("getThreadPath", () => {
  it("returns a valid SVG path string", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "thread-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const path = getThreadPath(from, to, "temporal");
    assert.ok(path.startsWith("M "), "path should start with M");
    assert.ok(path.includes("C "), "path should contain a cubic bezier C");
  });

  it("produces different curvature for temporal vs person threads", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "thread-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const temporalPath = getThreadPath(from, to, "temporal");
    const personPath = getThreadPath(from, to, "person");
    assert.notEqual(temporalPath, personPath);
  });

  it("is deterministic for same inputs", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "thread-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const a = getThreadPath(from, to, "temporal");
    const b = getThreadPath(from, to, "temporal");
    assert.equal(a, b);
  });
});

describe("getThreadControlPoints", () => {
  it("returns control points as numbers", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "cp-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const cp = getThreadControlPoints(from, to, "temporal");
    assert.ok(typeof cp.cx1 === "number");
    assert.ok(typeof cp.cy1 === "number");
    assert.ok(typeof cp.cx2 === "number");
    assert.ok(typeof cp.cy2 === "number");
  });

  it("is deterministic for same inputs", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "cp-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const a = getThreadControlPoints(from, to, "temporal");
    const b = getThreadControlPoints(from, to, "temporal");
    assert.deepEqual(a, b);
  });
});

describe("sampleCubicBezier", () => {
  it("returns start point at t=0", () => {
    const p = sampleCubicBezier(100, 200, 150, 250, 200, 300, 300, 400, 0);
    assert.ok(Math.abs(p.x - 100) < 0.01);
    assert.ok(Math.abs(p.y - 200) < 0.01);
  });

  it("returns end point at t=1", () => {
    const p = sampleCubicBezier(100, 200, 150, 250, 200, 300, 300, 400, 1);
    assert.ok(Math.abs(p.x - 300) < 0.01);
    assert.ok(Math.abs(p.y - 400) < 0.01);
  });

  it("returns a point between start and end at t=0.5", () => {
    const p = sampleCubicBezier(0, 0, 100, 0, 200, 0, 300, 0, 0.5);
    assert.ok(p.x > 0 && p.x < 300);
    assert.ok(Math.abs(p.y) < 0.01);
  });
});

describe("sampleCameraPath", () => {
  it("returns the from-pin position at t=0", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "cam-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const p = sampleCameraPath(from, to, "temporal", 0);
    assert.ok(Math.abs(p.x - from.x) < 0.01);
    assert.ok(Math.abs(p.y - from.y) < 0.01);
  });

  it("returns the to-pin position at t=1", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "cam-test");
    const from = positions[0]!;
    const to = positions[1]!;
    const p = sampleCameraPath(from, to, "temporal", 1);
    assert.ok(Math.abs(p.x - to.x) < 0.01);
    assert.ok(Math.abs(p.y - to.y) < 0.01);
  });

  it("interpolates along the curve for mid-t values", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "cam-test");
    const from = positions[0]!;
    const to = positions[3]!;
    const p = sampleCameraPath(from, to, "person", 0.5);
    assert.ok(p.x >= Math.min(from.x, to.x) - 200);
    assert.ok(p.x <= Math.max(from.x, to.x) + 200);
  });
});

describe("findThreadBetween", () => {
  it("finds a thread connecting two memories", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "find-thread");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const result = findThreadBetween(connections, "mem-1", "mem-2");
    assert.ok(result !== null, "should find thread between mem-1 and mem-2");
  });

  it("finds thread regardless of direction", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "find-thread");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const a = findThreadBetween(connections, "mem-1", "mem-2");
    const b = findThreadBetween(connections, "mem-2", "mem-1");
    assert.equal(a?.id, b?.id, "should find same thread from either direction");
  });

  it("returns null for unconnected memories", () => {
    const positions = computePositions(MEMORIES_FIXTURE, "find-thread");
    const connections = computeConnections(MEMORIES_FIXTURE, positions);
    const result = findThreadBetween(connections, "mem-1", "mem-5");
    const isDirectlyConnected = connections.some(
      (c) => (c.from === "mem-1" && c.to === "mem-5") || (c.from === "mem-5" && c.to === "mem-1"),
    );
    if (!isDirectlyConnected) {
      assert.equal(result, null);
    }
  });
});