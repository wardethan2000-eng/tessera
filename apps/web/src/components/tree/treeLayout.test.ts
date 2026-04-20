import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEdges,
  buildEditSlots,
  buildParentPlaceholderGroups,
  computeLayout,
  GENERATION_GAP,
  MIN_LANE_GAP,
  getLineageFocusIds,
  NODE_WIDTH,
  ROW_GAP,
  SPOUSE_ATTACH_GAP,
} from "./treeLayout.js";
import type { ApiPerson, ApiRelationship } from "./treeTypes";

const peopleFixture: ApiPerson[] = [
  { id: "parent-a", name: "Parent A", birthYear: 1970 },
  { id: "parent-b", name: "Parent B", birthYear: 1972 },
  { id: "child-elder", name: "Child Elder", birthYear: 1995 },
  { id: "child-middle", name: "Child Middle", birthYear: 1998 },
  { id: "child-younger", name: "Child Younger", birthYear: 2001 },
  { id: "grandchild-1", name: "Grandchild One", birthYear: 2024 },
];

const relationshipFixture: ApiRelationship[] = [
  {
    id: "spouse-parent-a-parent-b",
    fromPersonId: "parent-a",
    toPersonId: "parent-b",
    type: "spouse",
    spouseStatus: "active",
  },
  {
    id: "parent-a-child-elder",
    fromPersonId: "parent-a",
    toPersonId: "child-elder",
    type: "parent_child",
  },
  {
    id: "parent-a-child-middle",
    fromPersonId: "parent-a",
    toPersonId: "child-middle",
    type: "parent_child",
  },
  {
    id: "parent-a-child-younger",
    fromPersonId: "parent-a",
    toPersonId: "child-younger",
    type: "parent_child",
  },
  {
    id: "parent-b-child-elder",
    fromPersonId: "parent-b",
    toPersonId: "child-elder",
    type: "parent_child",
  },
  {
    id: "parent-b-child-middle",
    fromPersonId: "parent-b",
    toPersonId: "child-middle",
    type: "parent_child",
  },
  {
    id: "parent-b-child-younger",
    fromPersonId: "parent-b",
    toPersonId: "child-younger",
    type: "parent_child",
  },
  {
    id: "child-younger-grandchild-1",
    fromPersonId: "child-younger",
    toPersonId: "grandchild-1",
    type: "parent_child",
  },
];

const overlapFixturePeople: ApiPerson[] = [
  { id: "amy", name: "Amy" },
  { id: "barry", name: "Barry" },
  { id: "melani", name: "Melani" },
  { id: "ethan", name: "Ethan" },
  { id: "morgan", name: "Morgan" },
  { id: "kaleb", name: "Kaleb" },
];

const overlapFixtureRelationships: ApiRelationship[] = [
  { id: "melani-ethan", fromPersonId: "melani", toPersonId: "ethan", type: "parent_child" },
  { id: "melani-morgan", fromPersonId: "melani", toPersonId: "morgan", type: "parent_child" },
  { id: "melani-kaleb", fromPersonId: "melani", toPersonId: "kaleb", type: "parent_child" },
  { id: "barry-amy", fromPersonId: "barry", toPersonId: "amy", type: "sibling" },
];

const siblingPlaceholderPeople: ApiPerson[] = [
  { id: "amy", name: "Amy", birthYear: 1970 },
  { id: "melani", name: "Melani", birthYear: 1973 },
  { id: "barry", name: "Barry", birthYear: 1972 },
  { id: "ethan", name: "Ethan", birthYear: 2000 },
];

const siblingPlaceholderRelationships: ApiRelationship[] = [
  { id: "amy-melani", fromPersonId: "amy", toPersonId: "melani", type: "sibling" },
  { id: "melani-barry", fromPersonId: "melani", toPersonId: "barry", type: "spouse", spouseStatus: "active" },
  { id: "melani-ethan", fromPersonId: "melani", toPersonId: "ethan", type: "parent_child" },
];

const siblingInheritedParentsPeople: ApiPerson[] = [
  { id: "thyfault-dad", name: "Thyfault Dad", birthYear: 1948 },
  { id: "thyfault-mom", name: "Thyfault Mom", birthYear: 1950 },
  { id: "amy", name: "Amy", birthYear: 1970 },
  { id: "melani", name: "Melani", birthYear: 1973 },
  { id: "barry", name: "Barry", birthYear: 1972 },
  { id: "ethan", name: "Ethan", birthYear: 2000 },
];

const siblingInheritedParentsRelationships: ApiRelationship[] = [
  { id: "amy-melani", fromPersonId: "amy", toPersonId: "melani", type: "sibling" },
  { id: "thyfault-dad-melani", fromPersonId: "thyfault-dad", toPersonId: "melani", type: "parent_child" },
  { id: "thyfault-mom-melani", fromPersonId: "thyfault-mom", toPersonId: "melani", type: "parent_child" },
  { id: "melani-barry", fromPersonId: "melani", toPersonId: "barry", type: "spouse", spouseStatus: "active" },
  { id: "melani-ethan", fromPersonId: "melani", toPersonId: "ethan", type: "parent_child" },
];

const siblingFullParentsPeople: ApiPerson[] = [
  { id: "barry", name: "Barry", birthYear: 1972 },
  { id: "virginia", name: "Virginia", birthYear: 1949 },
  { id: "ron", name: "Ron", birthYear: 1947 },
  { id: "amy", name: "Amy", birthYear: 1970 },
  { id: "melani", name: "Melani", birthYear: 1973 },
  { id: "ethan", name: "Ethan", birthYear: 2000 },
];

const siblingFullParentsRelationships: ApiRelationship[] = [
  { id: "barry-melani", fromPersonId: "barry", toPersonId: "melani", type: "spouse", spouseStatus: "active" },
  { id: "melani-amy", fromPersonId: "melani", toPersonId: "amy", type: "sibling" },
  { id: "ron-amy", fromPersonId: "ron", toPersonId: "amy", type: "parent_child" },
  { id: "ron-melani", fromPersonId: "ron", toPersonId: "melani", type: "parent_child" },
  { id: "virginia-amy", fromPersonId: "virginia", toPersonId: "amy", type: "parent_child" },
  { id: "virginia-melani", fromPersonId: "virginia", toPersonId: "melani", type: "parent_child" },
  { id: "barry-ethan", fromPersonId: "barry", toPersonId: "ethan", type: "parent_child" },
  { id: "melani-ethan", fromPersonId: "melani", toPersonId: "ethan", type: "parent_child" },
];

const overlappingFamilyParentsPeople: ApiPerson[] = [
  { id: "david", name: "David", birthYear: 1948 },
  { id: "jan", name: "Jan", birthYear: 1950 },
  { id: "ron", name: "Ron", birthYear: 1947 },
  { id: "virginia", name: "Virginia", birthYear: 1949 },
  { id: "amy", name: "Amy", birthYear: 1970 },
  { id: "melani", name: "Melani", birthYear: 1973 },
  { id: "barry", name: "Barry", birthYear: 1972 },
  { id: "brent", name: "Brent", birthYear: 1969 },
  { id: "lois", name: "Lois", birthYear: 1975 },
];

const overlappingFamilyParentsRelationships: ApiRelationship[] = [
  { id: "david-jan", fromPersonId: "david", toPersonId: "jan", type: "spouse", spouseStatus: "active" },
  { id: "ron-virginia", fromPersonId: "ron", toPersonId: "virginia", type: "spouse", spouseStatus: "active" },
  { id: "barry-melani", fromPersonId: "barry", toPersonId: "melani", type: "spouse", spouseStatus: "active" },
  { id: "amy-brent", fromPersonId: "amy", toPersonId: "brent", type: "spouse", spouseStatus: "active" },
  { id: "melani-amy", fromPersonId: "melani", toPersonId: "amy", type: "sibling" },
  { id: "melani-lois", fromPersonId: "melani", toPersonId: "lois", type: "sibling" },
  { id: "david-barry", fromPersonId: "david", toPersonId: "barry", type: "parent_child" },
  { id: "jan-barry", fromPersonId: "jan", toPersonId: "barry", type: "parent_child" },
  { id: "ron-amy", fromPersonId: "ron", toPersonId: "amy", type: "parent_child" },
  { id: "virginia-amy", fromPersonId: "virginia", toPersonId: "amy", type: "parent_child" },
  { id: "ron-melani", fromPersonId: "ron", toPersonId: "melani", type: "parent_child" },
  { id: "virginia-melani", fromPersonId: "virginia", toPersonId: "melani", type: "parent_child" },
  { id: "ron-lois", fromPersonId: "ron", toPersonId: "lois", type: "parent_child" },
  { id: "virginia-lois", fromPersonId: "virginia", toPersonId: "lois", type: "parent_child" },
];

const liveOverlapPeople: ApiPerson[] = [
  { id: "Amy", name: "Amy" },
  { id: "Barry", name: "Barry" },
  { id: "Brent", name: "Brent" },
  { id: "David", name: "David" },
  { id: "Ethan Ward", name: "Ethan Ward" },
  { id: "Jan", name: "Jan" },
  { id: "Kaleb", name: "Kaleb" },
  { id: "Karsen", name: "Karsen" },
  { id: "Lois", name: "Lois" },
  { id: "Melani", name: "Melani" },
  { id: "Morgan", name: "Morgan" },
  { id: "Ron", name: "Ron" },
  { id: "Virginia", name: "Virginia" },
  { id: "sophie", name: "sophie" },
];

const liveOverlapRelationships: ApiRelationship[] = [
  { id: "amy-brent", fromPersonId: "Amy", toPersonId: "Brent", type: "spouse", spouseStatus: "active" },
  { id: "barry-ethan", fromPersonId: "Barry", toPersonId: "Ethan Ward", type: "parent_child" },
  { id: "barry-kaleb", fromPersonId: "Barry", toPersonId: "Kaleb", type: "parent_child" },
  { id: "barry-morgan", fromPersonId: "Barry", toPersonId: "Morgan", type: "parent_child" },
  { id: "barry-melani", fromPersonId: "Barry", toPersonId: "Melani", type: "spouse", spouseStatus: "active" },
  { id: "david-barry", fromPersonId: "David", toPersonId: "Barry", type: "parent_child" },
  { id: "david-jan", fromPersonId: "David", toPersonId: "Jan", type: "spouse", spouseStatus: "active" },
  { id: "ethan-karsen", fromPersonId: "Ethan Ward", toPersonId: "Karsen", type: "spouse", spouseStatus: "active" },
  { id: "jan-barry", fromPersonId: "Jan", toPersonId: "Barry", type: "parent_child" },
  { id: "kaleb-sophie", fromPersonId: "Kaleb", toPersonId: "sophie", type: "spouse", spouseStatus: "active" },
  { id: "melani-ethan", fromPersonId: "Melani", toPersonId: "Ethan Ward", type: "parent_child" },
  { id: "melani-kaleb", fromPersonId: "Melani", toPersonId: "Kaleb", type: "parent_child" },
  { id: "melani-morgan", fromPersonId: "Melani", toPersonId: "Morgan", type: "parent_child" },
  { id: "melani-amy", fromPersonId: "Melani", toPersonId: "Amy", type: "sibling" },
  { id: "ron-amy", fromPersonId: "Ron", toPersonId: "Amy", type: "parent_child" },
  { id: "ron-lois", fromPersonId: "Ron", toPersonId: "Lois", type: "parent_child" },
  { id: "ron-melani", fromPersonId: "Ron", toPersonId: "Melani", type: "parent_child" },
  { id: "virginia-amy", fromPersonId: "Virginia", toPersonId: "Amy", type: "parent_child" },
  { id: "virginia-lois", fromPersonId: "Virginia", toPersonId: "Lois", type: "parent_child" },
  { id: "virginia-melani", fromPersonId: "Virginia", toPersonId: "Melani", type: "parent_child" },
];

function getPosition(positions: Map<string, { x: number; y: number }>, personId: string) {
  const position = positions.get(personId);
  assert.ok(position, `Missing position for ${personId}`);
  return position;
}

function layoutSnapshot(layout: Map<string, { x: number; y: number }>) {
  return Object.fromEntries(
    [...layout.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, position]) => [
        id,
        {
          x: Number(position.x.toFixed(3)),
          y: Number(position.y.toFixed(3)),
        },
      ]),
  );
}

describe("computeLayout", () => {
  it("keeps generations in lanes and groups active spouses", () => {
    const positions = computeLayout(peopleFixture, relationshipFixture);

    const parentA = getPosition(positions, "parent-a");
    const parentB = getPosition(positions, "parent-b");
    const elder = getPosition(positions, "child-elder");
    const middle = getPosition(positions, "child-middle");
    const younger = getPosition(positions, "child-younger");
    const grandchild = getPosition(positions, "grandchild-1");

    // Spouses share the same Y
    assert.equal(parentA.y, parentB.y);

    // Active spouses sit with the configured attached-spouse spacing.
    assert.equal(Math.abs(parentA.x - parentB.x), SPOUSE_ATTACH_GAP);

    // Children are all on the same row, one generation below parents
    assert.equal(elder.y, middle.y);
    assert.equal(middle.y, younger.y);
    assert.ok(elder.y > parentA.y);
    assert.equal(elder.y - parentA.y, GENERATION_GAP);

    // Grandchild is one generation below their parent
    assert.ok(grandchild.y > younger.y);
    assert.equal(grandchild.y - younger.y, GENERATION_GAP);
  });

  it("clusters siblings by birth year with stable spacing", () => {
    const positions = computeLayout(peopleFixture, relationshipFixture);
    const siblingIds = ["child-elder", "child-middle", "child-younger"];
    const orderedSiblings = siblingIds
      .map((id) => ({ id, position: getPosition(positions, id) }))
      .sort((a, b) => a.position.x - b.position.x);

    assert.deepEqual(
      orderedSiblings.map((entry) => entry.id),
      ["child-elder", "child-middle", "child-younger"],
    );
    // Siblings stay ordered by birth year and nodes never overlap.
    const gap01 = orderedSiblings[1]!.position.x - orderedSiblings[0]!.position.x;
    const gap12 = orderedSiblings[2]!.position.x - orderedSiblings[1]!.position.x;
    assert.ok(gap01 >= 0, `gap01=${gap01} should be non-negative`);
    assert.ok(gap12 >= 0, `gap12=${gap12} should be non-negative`);
  });

  it("is deterministic regardless of input ordering", () => {
    const baseline = computeLayout(peopleFixture, relationshipFixture);
    const shuffled = computeLayout(
      [...peopleFixture].reverse(),
      [...relationshipFixture].reverse(),
    );
    const rerun = computeLayout(peopleFixture, relationshipFixture);

    assert.deepEqual(layoutSnapshot(shuffled), layoutSnapshot(baseline));
    assert.deepEqual(layoutSnapshot(rerun), layoutSnapshot(baseline));
  });

  it("keeps unrelated root-row people from colliding after parent alignment", () => {
    const positions = computeLayout(overlapFixturePeople, overlapFixtureRelationships);
    const amy = getPosition(positions, "amy");
    const barry = getPosition(positions, "barry");
    const melani = getPosition(positions, "melani");

    assert.ok(Math.abs(barry.x - melani.x) >= 160);
    assert.ok(Math.abs(melani.x - amy.x) >= 160);
  });

  it("places all people in a single row when there are no relationships", () => {
    const people: ApiPerson[] = [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "Bob" },
      { id: "carol", name: "Carol" },
    ];
    const positions = computeLayout(people, []);

    const alice = getPosition(positions, "alice");
    const bob = getPosition(positions, "bob");
    const carol = getPosition(positions, "carol");

    // All on same row
    assert.equal(alice.y, bob.y);
    assert.equal(bob.y, carol.y);
    assert.ok(alice.y < 0);

    // Sorted alphabetically (alice < bob < carol) and spaced by node width + row gap.
    const sorted = [alice, bob, carol].sort((a, b) => a.x - b.x);
    assert.equal(sorted[1]!.x - sorted[0]!.x, NODE_WIDTH + ROW_GAP);
    assert.equal(sorted[2]!.x - sorted[1]!.x, NODE_WIDTH + ROW_GAP);
  });

  it("keeps explicit siblings grouped together even when parents are missing", () => {
    const positions = computeLayout(siblingPlaceholderPeople, siblingPlaceholderRelationships);
    const amy = getPosition(positions, "amy");
    const melani = getPosition(positions, "melani");
    const barry = getPosition(positions, "barry");

    assert.equal(amy.y, melani.y);
    assert.ok(Math.abs(amy.x - melani.x) >= NODE_WIDTH + 32);
    assert.equal(barry.y, melani.y);
    assert.equal(Math.abs(barry.x - melani.x), SPOUSE_ATTACH_GAP);
    assert.ok(barry.x > melani.x);
  });

  it("builds a fixed horizontal action rail under the selected person", () => {
    const positions = computeLayout(peopleFixture, relationshipFixture);
    const slots = buildEditSlots("child-middle", relationshipFixture, positions);

    assert.ok(slots.length >= 3);
    assert.ok(slots.every((slot) => slot.flowY === slots[0]!.flowY));
    for (let index = 1; index < slots.length; index += 1) {
      assert.ok(slots[index]!.flowX > slots[index - 1]!.flowX);
    }
  });

  it("builds clickable missing-parent placeholders for explicit sibling groups", () => {
    const positions = computeLayout(siblingPlaceholderPeople, siblingPlaceholderRelationships);
    const placeholderGroups = buildParentPlaceholderGroups(
      siblingPlaceholderPeople,
      siblingPlaceholderRelationships,
      positions,
    );

    assert.equal(placeholderGroups.length, 1);
    assert.equal(placeholderGroups[0]!.placeholderCenters.length, 2);
    assert.equal(placeholderGroups[0]!.actualParentAnchors.length, 0);
    assert.ok(placeholderGroups[0]!.branchY !== null);
    assert.deepEqual(
      placeholderGroups[0]!.childAnchors.map((anchor) => anchor.personId).sort(),
      ["amy", "melani"],
    );
  });

  it("derives shared parents across explicit sibling groups for layout and controls", () => {
    const positions = computeLayout(
      siblingInheritedParentsPeople,
      siblingInheritedParentsRelationships,
    );
    const amy = getPosition(positions, "amy");
    const melani = getPosition(positions, "melani");
    const dad = getPosition(positions, "thyfault-dad");
    const mom = getPosition(positions, "thyfault-mom");
    const editSlots = buildEditSlots("amy", siblingInheritedParentsRelationships, positions);

    assert.equal(amy.y, melani.y);
    assert.ok(amy.x < melani.x);
    assert.equal(dad.y, mom.y);
    assert.ok(dad.y < amy.y);
    assert.equal(editSlots.some((slot) => slot.kind === "parent"), false);
  });

  it("draws inferred parent connectors for siblings who inherit known parents", () => {
    const positions = computeLayout(
      siblingInheritedParentsPeople,
      siblingInheritedParentsRelationships,
    );
    const edges = buildEdges(siblingInheritedParentsRelationships, positions);
    const inferredDadEdge = edges.find(
      (edge) => edge.id === "edge-inferred-parent-child:thyfault-dad:amy",
    );
    const inferredMomEdge = edges.find(
      (edge) => edge.id === "edge-inferred-parent-child:thyfault-mom:amy",
    );

    assert.ok(inferredDadEdge);
    assert.ok(inferredMomEdge);
    assert.equal(inferredDadEdge.data?.kind, "parent_child");
    assert.equal(inferredDadEdge.data?.strokeDasharray, "4 4");
    assert.equal(inferredMomEdge.data?.strokeDasharray, "4 4");
  });

  it("uses derived sibling parents in birth-lineage focus", () => {
    const focusIds = getLineageFocusIds("amy", siblingInheritedParentsRelationships, "birth");

    assert.ok(focusIds);
    assert.ok(focusIds.has("amy"));
    assert.ok(focusIds.has("melani"));
    assert.ok(focusIds.has("thyfault-dad"));
    assert.ok(focusIds.has("thyfault-mom"));
    assert.ok(focusIds.has("barry"));
    assert.ok(focusIds.has("ethan"));
  });

  it("keeps active spouses on the same generation even when both have structural relationships", () => {
    const positions = computeLayout(
      siblingFullParentsPeople,
      siblingFullParentsRelationships,
    );
    const barry = getPosition(positions, "barry");
    const melani = getPosition(positions, "melani");

    assert.equal(barry.y, melani.y);
    assert.equal(Math.abs(barry.x - melani.x), SPOUSE_ATTACH_GAP);
  });

  it("renders two known parents as a shared branch and hides redundant sibling dashes", () => {
    const positions = computeLayout(
      siblingFullParentsPeople,
      siblingFullParentsRelationships,
    );
    const edges = buildEdges(siblingFullParentsRelationships, positions);
    const ronMelani = edges.find((edge) => edge.id === "edge-ron-melani");
    const virginiaAmy = edges.find((edge) => edge.id === "edge-virginia-amy");
    const siblingEdge = edges.find((edge) => edge.id === "edge-melani-amy");

    assert.ok(ronMelani);
    assert.ok(virginiaAmy);
    assert.ok(ronMelani.data?.unionX !== undefined);
    assert.ok(ronMelani.data?.unionY !== undefined);
    assert.ok(virginiaAmy.data?.unionX !== undefined);
    assert.ok(virginiaAmy.data?.unionY !== undefined);
    assert.equal(siblingEdge?.data?.opacity, 0);
  });

  it("hides redundant sibling dashes when placeholder parents already represent the sibling group", () => {
    const positions = computeLayout(siblingPlaceholderPeople, siblingPlaceholderRelationships);
    const edges = buildEdges(siblingPlaceholderRelationships, positions);
    const siblingEdge = edges.find((edge) => edge.id === "edge-amy-melani");

    assert.ok(siblingEdge);
    assert.equal(siblingEdge.data?.kind, "sibling");
    assert.equal(siblingEdge.data?.opacity, 0);
  });

  it("focuses a birth family on siblings plus their branches", () => {
    const focusIds = getLineageFocusIds("melani", siblingPlaceholderRelationships, "birth");

    assert.ok(focusIds);
    assert.ok(focusIds.has("melani"));
    assert.ok(focusIds.has("amy"));
    assert.ok(focusIds.has("barry"));
    assert.ok(focusIds.has("ethan"));
  });

  it("focuses a household lineage on spouses and descendants without siblings", () => {
    const focusIds = getLineageFocusIds("melani", siblingPlaceholderRelationships, "household");

    assert.ok(focusIds);
    assert.ok(focusIds.has("melani"));
    assert.ok(focusIds.has("barry"));
    assert.ok(focusIds.has("ethan"));
    assert.equal(focusIds.has("amy"), false);
  });

  it("keeps a spouse's parents anchored over that spouse inside overlapping birth families", () => {
    const positions = computeLayout(
      overlappingFamilyParentsPeople,
      overlappingFamilyParentsRelationships,
    );

    const david = getPosition(positions, "david");
    const jan = getPosition(positions, "jan");
    const ron = getPosition(positions, "ron");
    const virginia = getPosition(positions, "virginia");
    const barry = getPosition(positions, "barry");
    const melani = getPosition(positions, "melani");

    const davidJanCenter = (david.x + jan.x) / 2;
    const ronVirginiaCenter = (ron.x + virginia.x) / 2;

    assert.ok(Math.abs(davidJanCenter - barry.x) < NODE_WIDTH + ROW_GAP * 2);
    assert.ok(Math.abs(ronVirginiaCenter - melani.x) < NODE_WIDTH * 3);
    // Ron+Virginia's pure children come first; David+Jan's child (Barry) follows
    assert.ok(ronVirginiaCenter < davidJanCenter);
  });

  it("keeps a spouse's parents near that spouse in the live overlap case without birth years", () => {
    const positions = computeLayout(liveOverlapPeople, liveOverlapRelationships);

    const david = getPosition(positions, "David");
    const jan = getPosition(positions, "Jan");
    const barry = getPosition(positions, "Barry");
    const melani = getPosition(positions, "Melani");

    const davidJanCenter = (david.x + jan.x) / 2;

    assert.ok(Math.abs(davidJanCenter - barry.x) < NODE_WIDTH + ROW_GAP);
    assert.ok(Math.abs(barry.x - melani.x) <= SPOUSE_ATTACH_GAP);
  });

  it("keeps a single known parent aligned over the spouse-side child after collision resolution", () => {
    const singleParentRelationships = liveOverlapRelationships.filter(
      (relationship) =>
        !(
          (relationship.fromPersonId === "David" && relationship.toPersonId === "Barry") ||
          (relationship.fromPersonId === "David" && relationship.toPersonId === "Jan")
        ),
    );
    const singleParentPeople = liveOverlapPeople.filter((person) => person.id !== "David");
    const positions = computeLayout(singleParentPeople, singleParentRelationships);

    const jan = getPosition(positions, "Jan");
    const barry = getPosition(positions, "Barry");
    const virginia = getPosition(positions, "Virginia");
    const lois = getPosition(positions, "Lois");
    const melani = getPosition(positions, "Melani");

    assert.ok(Math.abs(jan.x - barry.x) < 1);
    assert.ok(jan.x - virginia.x >= MIN_LANE_GAP);
    assert.ok(Math.abs(melani.x - lois.x) >= MIN_LANE_GAP);
  });

  it("groups children by parent family with Kevin sibling and Brian in-law", () => {
    const twoFamilySiblingPeople: ApiPerson[] = [
      { id: "virginia", name: "Virginia", birthYear: 1949 },
      { id: "ron", name: "Ron", birthYear: 1947 },
      { id: "david", name: "David", birthYear: 1948 },
      { id: "jan", name: "Jan", birthYear: 1950 },
      { id: "amy", name: "Amy", birthYear: 1970 },
      { id: "brent", name: "Brent", birthYear: 1969 },
      { id: "kevin", name: "Kevin" },
      { id: "melani", name: "Melani", birthYear: 1973 },
      { id: "barry", name: "Barry", birthYear: 1972 },
      { id: "lois", name: "Lois", birthYear: 1975 },
      { id: "brian", name: "Brian" },
      { id: "vicki", name: "Vicki" },
    ];

    const twoFamilySiblingRelationships: ApiRelationship[] = [
      { id: "ron-virginia", fromPersonId: "ron", toPersonId: "virginia", type: "spouse", spouseStatus: "active" },
      { id: "david-jan", fromPersonId: "david", toPersonId: "jan", type: "spouse", spouseStatus: "active" },
      { id: "amy-brent", fromPersonId: "amy", toPersonId: "brent", type: "spouse", spouseStatus: "active" },
      { id: "melani-barry", fromPersonId: "melani", toPersonId: "barry", type: "spouse", spouseStatus: "active" },
      { id: "brian-vicki", fromPersonId: "brian", toPersonId: "vicki", type: "spouse", spouseStatus: "active" },
      { id: "ron-amy", fromPersonId: "ron", toPersonId: "amy", type: "parent_child" },
      { id: "virginia-amy", fromPersonId: "virginia", toPersonId: "amy", type: "parent_child" },
      { id: "ron-melani", fromPersonId: "ron", toPersonId: "melani", type: "parent_child" },
      { id: "virginia-melani", fromPersonId: "virginia", toPersonId: "melani", type: "parent_child" },
      { id: "ron-lois", fromPersonId: "ron", toPersonId: "lois", type: "parent_child" },
      { id: "virginia-lois", fromPersonId: "virginia", toPersonId: "lois", type: "parent_child" },
      { id: "david-barry", fromPersonId: "david", toPersonId: "barry", type: "parent_child" },
      { id: "jan-barry", fromPersonId: "jan", toPersonId: "barry", type: "parent_child" },
      { id: "david-brian", fromPersonId: "david", toPersonId: "brian", type: "parent_child" },
      { id: "jan-brian", fromPersonId: "jan", toPersonId: "brian", type: "parent_child" },
      { id: "melani-amy", fromPersonId: "melani", toPersonId: "amy", type: "sibling" },
      { id: "kevin-amy", fromPersonId: "kevin", toPersonId: "amy", type: "sibling" },
      { id: "kevin-melani", fromPersonId: "kevin", toPersonId: "melani", type: "sibling" },
      { id: "kevin-lois", fromPersonId: "kevin", toPersonId: "lois", type: "sibling" },
    ];

    const positions = computeLayout(twoFamilySiblingPeople, twoFamilySiblingRelationships);

    const amy = getPosition(positions, "amy");
    const kevin = getPosition(positions, "kevin");
    const melani = getPosition(positions, "melani");
    const barry = getPosition(positions, "barry");
    const lois = getPosition(positions, "lois");
    const brian = getPosition(positions, "brian");

    // All children should be on the same generation row
    assert.equal(amy.y, kevin.y, "Amy and Kevin should be same row");
    assert.equal(kevin.y, melani.y, "Kevin and Melani should be same row");
    assert.equal(melani.y, lois.y, "Melani and Lois should be same row");
    assert.equal(lois.y, brian.y, "Lois and Brian should be same row");

    // Lois must NOT be between Barry and Brian (the user's specific complaint)
    const barryCenter = barry.x + NODE_WIDTH / 2;
    const brianCenter = brian.x + NODE_WIDTH / 2;
    const loisCenter = lois.x + NODE_WIDTH / 2;
    const minDJ = Math.min(barryCenter, brianCenter);
    const maxDJ = Math.max(barryCenter, brianCenter);
    assert.ok(
      loisCenter < minDJ || loisCenter > maxDJ,
      `Lois (${loisCenter}) should not be between Barry (${barryCenter}) and Brian (${brianCenter})`,
    );

    // Kevin (parentless sibling) should be near the Ron+Virginia family
    const ronVirginiaChildrenX = [amy.x, melani.x, lois.x].sort((a, b) => a - b);
    const familyMin = ronVirginiaChildrenX[0]!;
    const familyMax = ronVirginiaChildrenX[ronVirginiaChildrenX.length - 1]!;
    assert.ok(
      kevin.x >= familyMin - (NODE_WIDTH + ROW_GAP) && kevin.x <= familyMax + (NODE_WIDTH + ROW_GAP),
      `Kevin (${kevin.x}) should be near the Ron+Virginia family [${familyMin}, ${familyMax}]`,
    );
  });
});
