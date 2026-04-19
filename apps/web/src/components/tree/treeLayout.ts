import Dagre from "@dagrejs/dagre";
import type {
  ApiPerson,
  ApiRelationship,
  ConstellationEdgeData,
  PersonFlowNode,
  TreeEdge,
} from "./treeTypes";

export function extractYearFromText(text?: string | null): number | null {
  if (!text) return null;
  const m = text.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1]!, 10) : null;
}

const NODE_WIDTH = 96;
const NODE_HEIGHT = 130;
const SPOUSE_GAP = 60;       // pixel gap between adjacent spouse node circles
const SIBLING_GAP = 160;     // center-to-center distance between siblings in same generation
const GENERATION_GAP = 240;  // vertical distance between generation rows
const EDIT_SLOT_GAP = 90;
const UNIT_NODE_HEIGHT = 96;

type FamilyUnit = {
  id: string;
  memberIds: string[];
  lane: number;
};

function sortedPair(leftId: string, rightId: string): [string, string] {
  return leftId <= rightId ? [leftId, rightId] : [rightId, leftId];
}

function getChildRailGap(unitCount: number): number {
  if (unitCount <= 1) return SIBLING_GAP;
  if (unitCount === 2) return 148;
  if (unitCount === 3) return 140;
  if (unitCount <= 5) return 130;
  return 118;
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

/** Build layout from people + relationships */
export function computeLayout(
  people: ApiPerson[],
  relationships: ApiRelationship[]
): Map<string, { x: number; y: number }> {
  if (people.length === 0) return new Map();

  const sortedPeople = [...people].sort((a, b) => a.id.localeCompare(b.id));
  const sortedRelationships = [...relationships].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.fromPersonId !== b.fromPersonId) {
      return a.fromPersonId.localeCompare(b.fromPersonId);
    }
    if (a.toPersonId !== b.toPersonId) {
      return a.toPersonId.localeCompare(b.toPersonId);
    }
    return a.id.localeCompare(b.id);
  });
  const parentChildRels = sortedRelationships.filter((r) => r.type === "parent_child");
  const generationLaneByPersonId = buildGenerationLanes(sortedPeople, parentChildRels);
  const familyUnits = buildFamilyUnits(sortedPeople, sortedRelationships, generationLaneByPersonId);
  const unitIdByPersonId = new Map<string, string>();
  for (const unit of familyUnits) {
    for (const memberId of unit.memberIds) unitIdByPersonId.set(memberId, unit.id);
  }

  const g = new Dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    ranksep: GENERATION_GAP,
    nodesep: 132,
    marginx: 120,
    marginy: 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const unit of familyUnits) {
    g.setNode(unit.id, {
      width: unit.memberIds.length === 2 ? NODE_WIDTH * 2 + SPOUSE_GAP : NODE_WIDTH,
      height: UNIT_NODE_HEIGHT,
    });
  }

  for (const relationship of parentChildRels) {
    const fromUnitId = unitIdByPersonId.get(relationship.fromPersonId);
    const toUnitId = unitIdByPersonId.get(relationship.toPersonId);
    if (!fromUnitId || !toUnitId || fromUnitId === toUnitId) continue;
    g.setEdge(fromUnitId, toUnitId);
  }

  Dagre.layout(g);

  const unitCenters = new Map<string, { x: number; y: number }>();
  const minGraphY = g.nodes().length > 0
    ? Math.min(...g.nodes().map((nodeId) => g.node(nodeId)?.y ?? 0))
    : 0;
  for (const unit of familyUnits) {
    const node = g.node(unit.id);
    const centerX = node?.x ?? 0;
    const centerY = minGraphY + unit.lane * GENERATION_GAP;
    unitCenters.set(unit.id, { x: centerX, y: centerY });
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const unit of familyUnits) {
    placeUnitMembers(unit, unitCenters, positions);
  }

  alignChildRows(
    familyUnits,
    sortedPeople,
    sortedRelationships,
    unitIdByPersonId,
    generationLaneByPersonId,
    unitCenters,
    positions,
  );

  return positions;
}

function buildFamilyUnits(
  people: ApiPerson[],
  relationships: ApiRelationship[],
  generationLaneByPersonId: Map<string, number>,
) {
  const activeSpouseRelationships = relationships
    .filter(
      (rel) => rel.type === "spouse" && (rel.spouseStatus ?? "active") === "active",
    )
    .sort((a, b) => {
      const [aLeft, aRight] = sortedPair(a.fromPersonId, a.toPersonId);
      const [bLeft, bRight] = sortedPair(b.fromPersonId, b.toPersonId);
      return `${aLeft}|${aRight}`.localeCompare(`${bLeft}|${bRight}`);
    });
  const activeSpouseCountByPersonId = new Map<string, number>();
  for (const rel of activeSpouseRelationships) {
    activeSpouseCountByPersonId.set(
      rel.fromPersonId,
      (activeSpouseCountByPersonId.get(rel.fromPersonId) ?? 0) + 1,
    );
    activeSpouseCountByPersonId.set(
      rel.toPersonId,
      (activeSpouseCountByPersonId.get(rel.toPersonId) ?? 0) + 1,
    );
  }
  const assigned = new Set<string>();
  const units: FamilyUnit[] = [];

  for (const rel of activeSpouseRelationships) {
    if ((activeSpouseCountByPersonId.get(rel.fromPersonId) ?? 0) !== 1) continue;
    if ((activeSpouseCountByPersonId.get(rel.toPersonId) ?? 0) !== 1) continue;
    const [leftPersonId, rightPersonId] = sortedPair(rel.fromPersonId, rel.toPersonId);
    if (assigned.has(leftPersonId) || assigned.has(rightPersonId)) continue;
    assigned.add(leftPersonId);
    assigned.add(rightPersonId);
    units.push({
      id: `unit:${leftPersonId}:${rightPersonId}`,
      memberIds: [leftPersonId, rightPersonId],
      lane: Math.min(
        generationLaneByPersonId.get(leftPersonId) ?? 0,
        generationLaneByPersonId.get(rightPersonId) ?? 0,
      ),
    });
  }

  for (const person of people) {
    if (assigned.has(person.id)) continue;
    assigned.add(person.id);
    units.push({
      id: `unit:${person.id}`,
      memberIds: [person.id],
      lane: generationLaneByPersonId.get(person.id) ?? 0,
    });
  }

  return units.sort((a, b) => {
    if (a.lane !== b.lane) return a.lane - b.lane;
    return a.id.localeCompare(b.id);
  });
}

function placeUnitMembers(
  unit: FamilyUnit,
  unitCenters: Map<string, { x: number; y: number }>,
  positions: Map<string, { x: number; y: number }>,
) {
  const center = unitCenters.get(unit.id);
  if (!center) return;
  if (unit.memberIds.length === 1) {
    positions.set(unit.memberIds[0]!, {
      x: center.x - NODE_WIDTH / 2,
      y: center.y - NODE_HEIGHT / 2,
    });
    return;
  }

  const [leftPersonId, rightPersonId] = unit.memberIds;
  const halfUnit = (NODE_WIDTH + SPOUSE_GAP) / 2;
  positions.set(leftPersonId!, {
    x: center.x - halfUnit - NODE_WIDTH / 2,
    y: center.y - NODE_HEIGHT / 2,
  });
  positions.set(rightPersonId!, {
    x: center.x + halfUnit - NODE_WIDTH / 2,
    y: center.y - NODE_HEIGHT / 2,
  });
}

function buildGenerationLanes(
  people: ApiPerson[],
  parentChildRelationships: ApiRelationship[],
): Map<string, number> {
  const personIds = people.map((person) => person.id);
  const personIdSet = new Set(personIds);
  const childrenByParentId = new Map<string, Set<string>>();
  const parentIdsByChildId = new Map<string, Set<string>>();
  const indegreeByPersonId = new Map<string, number>(
    personIds.map((personId) => [personId, 0]),
  );
  const laneByPersonId = new Map<string, number>(personIds.map((personId) => [personId, 0]));

  for (const rel of parentChildRelationships) {
    if (!personIdSet.has(rel.fromPersonId) || !personIdSet.has(rel.toPersonId)) continue;

    const children = childrenByParentId.get(rel.fromPersonId) ?? new Set<string>();
    children.add(rel.toPersonId);
    childrenByParentId.set(rel.fromPersonId, children);

    const parents = parentIdsByChildId.get(rel.toPersonId) ?? new Set<string>();
    parents.add(rel.fromPersonId);
    parentIdsByChildId.set(rel.toPersonId, parents);
  }

  for (const [childId, parentIds] of parentIdsByChildId.entries()) {
    indegreeByPersonId.set(childId, parentIds.size);
  }

  const ranking = [...people].sort((a, b) => {
    if ((a.birthYear ?? Number.POSITIVE_INFINITY) !== (b.birthYear ?? Number.POSITIVE_INFINITY)) {
      return (a.birthYear ?? Number.POSITIVE_INFINITY) - (b.birthYear ?? Number.POSITIVE_INFINITY);
    }
    return a.id.localeCompare(b.id);
  });
  const rankByPersonId = new Map<string, number>(
    ranking.map((person, index) => [person.id, index]),
  );

  const queue = ranking
    .filter((person) => (indegreeByPersonId.get(person.id) ?? 0) === 0)
    .map((person) => person.id);
  const processed = new Set<string>();

  while (queue.length > 0) {
    const personId = queue.shift();
    if (!personId || processed.has(personId)) continue;
    processed.add(personId);

    const parentLane = laneByPersonId.get(personId) ?? 0;
    const children = [...(childrenByParentId.get(personId) ?? [])].sort((a, b) => {
      const rankA = rankByPersonId.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rankByPersonId.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });
    for (const childId of children) {
      const currentLane = laneByPersonId.get(childId) ?? 0;
      laneByPersonId.set(childId, Math.max(currentLane, parentLane + 1));

      const nextIndegree = (indegreeByPersonId.get(childId) ?? 0) - 1;
      indegreeByPersonId.set(childId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(childId);
        queue.sort((a, b) => {
          const rankA = rankByPersonId.get(a) ?? Number.MAX_SAFE_INTEGER;
          const rankB = rankByPersonId.get(b) ?? Number.MAX_SAFE_INTEGER;
          if (rankA !== rankB) return rankA - rankB;
          return a.localeCompare(b);
        });
      }
    }
  }

  const unresolvedIds = ranking
    .map((person) => person.id)
    .filter((personId) => !processed.has(personId));
  for (const personId of unresolvedIds) {
    const parentLanes = [...(parentIdsByChildId.get(personId) ?? [])]
      .map((parentId) => laneByPersonId.get(parentId))
      .filter((lane): lane is number => lane !== undefined);

    if (parentLanes.length > 0) {
      laneByPersonId.set(personId, Math.max(...parentLanes) + 1);
      continue;
    }

    laneByPersonId.set(personId, 0);
  }

  return laneByPersonId;
}

function alignChildRows(
  familyUnits: FamilyUnit[],
  people: ApiPerson[],
  relationships: ApiRelationship[],
  unitIdByPersonId: Map<string, string>,
  generationLaneByPersonId: Map<string, number>,
  unitCenters: Map<string, { x: number; y: number }>,
  positions: Map<string, { x: number; y: number }>,
) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const unitsById = new Map(familyUnits.map((unit) => [unit.id, unit]));
  const parentIdsByChild = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    if (relationship.type !== "parent_child") continue;
    const current = parentIdsByChild.get(relationship.toPersonId) ?? new Set<string>();
    current.add(relationship.fromPersonId);
    parentIdsByChild.set(relationship.toPersonId, current);
  }

  const childUnitsByParentSignature = new Map<string, { parentIds: string[]; childUnitIds: string[] }>();
  for (const [childId, parentIdsRaw] of parentIdsByChild.entries()) {
    const parentIds = [...parentIdsRaw].sort();
    const childUnitId = unitIdByPersonId.get(childId);
    if (!childUnitId) continue;
    const signature = parentIds.join("|");
    const existing = childUnitsByParentSignature.get(signature);
    if (existing) {
      if (!existing.childUnitIds.includes(childUnitId)) existing.childUnitIds.push(childUnitId);
      continue;
    }
    childUnitsByParentSignature.set(signature, { parentIds, childUnitIds: [childUnitId] });
  }

  for (const group of childUnitsByParentSignature.values()) {
    if (group.childUnitIds.length === 0) continue;
    const parentCenters = group.parentIds
      .map((parentId) => unitCenters.get(unitIdByPersonId.get(parentId) ?? ""))
      .filter((value): value is { x: number; y: number } => Boolean(value));

    const currentChildCenters = group.childUnitIds
      .map((unitId) => unitCenters.get(unitId))
      .filter((value): value is { x: number; y: number } => Boolean(value));

    const parentCenterX =
      parentCenters.length > 0
        ? average(parentCenters.map((entry) => entry.x))
        : average(currentChildCenters.map((entry) => entry.x));

    const sortedChildUnits = [...group.childUnitIds].sort((leftUnitId, rightUnitId) => {
      const leftUnit = unitsById.get(leftUnitId);
      const rightUnit = unitsById.get(rightUnitId);
      const leftBirthYear = Math.min(
        ...(leftUnit?.memberIds.map((memberId) => peopleById.get(memberId)?.birthYear ?? Number.POSITIVE_INFINITY) ?? [Number.POSITIVE_INFINITY]),
      );
      const rightBirthYear = Math.min(
        ...(rightUnit?.memberIds.map((memberId) => peopleById.get(memberId)?.birthYear ?? Number.POSITIVE_INFINITY) ?? [Number.POSITIVE_INFINITY]),
      );
      if (leftBirthYear !== rightBirthYear) return leftBirthYear - rightBirthYear;
      return leftUnitId.localeCompare(rightUnitId);
    });

    const childGap = getChildRailGap(sortedChildUnits.length);
    const totalWidth = (sortedChildUnits.length - 1) * childGap;
    const currentRailCenterX = average(
      sortedChildUnits
        .map((unitId) => unitCenters.get(unitId))
        .filter((value): value is { x: number; y: number } => Boolean(value))
        .map((entry) => entry.x),
    );
    const targetRailCenterX =
      currentRailCenterX === 0
        ? parentCenterX
        : parentCenterX * 0.78 + currentRailCenterX * 0.22;
    const startCenterX = targetRailCenterX - totalWidth / 2;
    sortedChildUnits.forEach((unitId, index) => {
      const unit = unitsById.get(unitId);
      if (!unit) return;
      const lane = Math.max(
        ...unit.memberIds.map((memberId) => generationLaneByPersonId.get(memberId) ?? 0),
      );
      unitCenters.set(unit.id, {
        x: startCenterX + index * childGap,
        y: lane * GENERATION_GAP,
      });
      placeUnitMembers(unit, unitCenters, positions);
    });
  }
}

/** Build ReactFlow person nodes */
export function buildPersonNodes(
  people: ApiPerson[],
  positions: Map<string, { x: number; y: number }>,
  selectedPersonId: string | null,
  currentUserId: string | null,
  focusPersonIds: Set<string> | null = null,
): PersonFlowNode[] {
  return people.map((person) => {
    const pos = positions.get(person.id) ?? { x: 0, y: 0 };

    return {
      id: person.id,
      type: "person" as const,
      position: pos,
      data: {
        personId: person.id,
        name: person.name,
        birthYear: person.birthYear,
        deathYear: person.deathYear,
        portraitUrl: person.portraitUrl,
        essenceLine: person.essenceLine,
        isYou: person.id === currentUserId,
        isFocused: person.id === selectedPersonId,
        isDimmed: focusPersonIds ? !focusPersonIds.has(person.id) : false,
      },
      draggable: false,
    };
  });
}

/** Build visual ReactFlow edges */
export function buildEdges(
  relationships: ApiRelationship[],
  positions: Map<string, { x: number; y: number }>,
  focusPersonIds: Set<string> | null = null,
): TreeEdge[] {
  const parentIdsByChild = new Map<string, string[]>();
  const activeSpousePairs = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type === "parent_child") {
      const existing = parentIdsByChild.get(relationship.toPersonId) ?? [];
      existing.push(relationship.fromPersonId);
      parentIdsByChild.set(relationship.toPersonId, existing);
    }
    if (
      relationship.type === "spouse" &&
      (relationship.spouseStatus ?? "active") === "active"
    ) {
      const [leftId, rightId] = sortedPair(
        relationship.fromPersonId,
        relationship.toPersonId,
      );
      activeSpousePairs.add(`${leftId}|${rightId}`);
    }
  }

  return relationships.flatMap((r) => {
    const isLocal = focusPersonIds
      ? focusPersonIds.has(r.fromPersonId) && focusPersonIds.has(r.toPersonId)
      : true;
    const baseOpacity = isLocal ? 0.95 : 0.1;
    if (r.type === "parent_child") {
      const parentIds = [...(parentIdsByChild.get(r.toPersonId) ?? [])].sort();
      const hasFamilyUnion =
        parentIds.length === 2 &&
        activeSpousePairs.has(`${parentIds[0]}|${parentIds[1]}`);
      const sourceCenter = getNodeCenter(r.fromPersonId, positions);
      const targetCenter = getNodeCenter(r.toPersonId, positions);
      const allParentCenters = parentIds
        .map((parentId) => getNodeCenter(parentId, positions))
        .filter((value): value is { x: number; y: number } => Boolean(value));
      const unionX =
        hasFamilyUnion && allParentCenters.length > 0
          ? allParentCenters.reduce((sum, center) => sum + center.x, 0) /
            allParentCenters.length
          : sourceCenter?.x;
      const unionY =
        hasFamilyUnion && allParentCenters.length > 0 && targetCenter
          ? Math.min(
              Math.max(...allParentCenters.map((center) => center.y)) + 26,
              targetCenter.y - NODE_HEIGHT / 2 - 34,
            )
          : undefined;
      return [
        {
          id: `edge-${r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "constellationParent",
          data: {
            kind: "parent_child",
            unionX,
            unionY,
            opacity: baseOpacity,
            strokeWidth: isLocal ? 1.35 : 1,
          } satisfies ConstellationEdgeData,
          animated: false,
        } as TreeEdge,
      ];
    }
    if (r.type === "spouse") {
      const spouseStatus = r.spouseStatus ?? "active";
      const spouseStyle =
        spouseStatus === "active"
          ? { strokeDasharray: "5 4", strokeWidth: 1.2 }
          : spouseStatus === "deceased_partner"
            ? { strokeDasharray: "1 5", strokeWidth: 1 }
            : { strokeDasharray: "2 6", strokeWidth: 1 };
      return [
        {
          id: `edge-${r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "constellationSpouse",
          data: {
            kind: "spouse",
            opacity:
              spouseStatus === "active"
                ? baseOpacity
                : spouseStatus === "deceased_partner"
                  ? baseOpacity * 0.85
                  : baseOpacity * 0.65,
            strokeWidth: spouseStyle.strokeWidth,
            strokeDasharray: spouseStyle.strokeDasharray,
          } satisfies ConstellationEdgeData,
          animated: false,
        } as TreeEdge,
      ];
    }
    if (r.type === "sibling") {
      return [];
    }
    return [];
  });
}

export function getConstellationFocusIds(
  personId: string | null,
  relationships: ApiRelationship[],
): Set<string> | null {
  if (!personId) return null;
  const focused = new Set<string>([personId]);
  const queue = [{ id: personId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const relationship of relationships) {
      let neighborId: string | null = null;
      if (relationship.fromPersonId === current.id) neighborId = relationship.toPersonId;
      if (relationship.toPersonId === current.id) neighborId = relationship.fromPersonId;
      if (!neighborId || focused.has(neighborId)) continue;

      const maxDepth = relationship.type === "parent_child" ? 2 : 1;
      if (current.depth >= maxDepth) continue;

      focused.add(neighborId);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }

  return focused;
}

export function getConstellationFocusBounds(
  personId: string | null,
  relationships: ApiRelationship[],
  positions: Map<string, { x: number; y: number }>,
) {
  const focusIds = getConstellationFocusIds(personId, relationships);
  if (!focusIds || focusIds.size === 0) return null;

  const memberPositions = [...focusIds]
    .map((focusId) => positions.get(focusId))
    .filter((value): value is { x: number; y: number } => Boolean(value));
  if (memberPositions.length === 0) return null;

  const minX = Math.min(...memberPositions.map((position) => position.x));
  const maxX = Math.max(...memberPositions.map((position) => position.x + NODE_WIDTH));
  const minY = Math.min(...memberPositions.map((position) => position.y));
  const maxY = Math.max(...memberPositions.map((position) => position.y + NODE_HEIGHT));

  return {
    x: minX - 72,
    y: minY - 72,
    width: Math.max(220, maxX - minX + 144),
    height: Math.max(220, maxY - minY + 144),
  };
}

export type EditSlotKind = "parent" | "child" | "sibling" | "spouse";

export interface EditSlot {
  kind: EditSlotKind;
  flowX: number;
  flowY: number;
  label: string;
  disabled?: boolean;
  disabledTitle?: string;
}

function getNodeCenter(
  personId: string,
  positions: Map<string, { x: number; y: number }>,
) {
  const pos = positions.get(personId);
  if (!pos) return null;
  return {
    x: pos.x + NODE_WIDTH / 2,
    y: pos.y + NODE_HEIGHT / 2,
  };
}

export function buildEditSlots(
  personId: string | null,
  relationships: ApiRelationship[],
  positions: Map<string, { x: number; y: number }>,
): EditSlot[] {
  if (!personId) return [];
  const center = getNodeCenter(personId, positions);
  if (!center) return [];

  const parentIds = relationships
    .filter((relationship) => relationship.type === "parent_child" && relationship.toPersonId === personId)
    .map((relationship) => relationship.fromPersonId);
  const childIds = relationships
    .filter((relationship) => relationship.type === "parent_child" && relationship.fromPersonId === personId)
    .map((relationship) => relationship.toPersonId);
  const siblingIds = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type === "sibling") {
      if (relationship.fromPersonId === personId) siblingIds.add(relationship.toPersonId);
      if (relationship.toPersonId === personId) siblingIds.add(relationship.fromPersonId);
    }
    if (relationship.type === "parent_child" && parentIds.includes(relationship.fromPersonId) && relationship.toPersonId !== personId) {
      siblingIds.add(relationship.toPersonId);
    }
  }

  const activeSpouseRelationship =
    relationships.find(
      (relationship) =>
        relationship.type === "spouse" &&
        (relationship.spouseStatus ?? "active") === "active" &&
        (relationship.fromPersonId === personId || relationship.toPersonId === personId),
    ) ?? null;
  const spouseId = activeSpouseRelationship
    ? activeSpouseRelationship.fromPersonId === personId
      ? activeSpouseRelationship.toPersonId
      : activeSpouseRelationship.fromPersonId
    : null;
  const spouseCenter = spouseId ? getNodeCenter(spouseId, positions) : null;
  const unionCenterX = spouseCenter ? (center.x + spouseCenter.x) / 2 : center.x;

  const parentCenters = parentIds
    .map((parentId) => getNodeCenter(parentId, positions))
    .filter((value): value is { x: number; y: number } => Boolean(value));
  const childCenters = childIds
    .map((childId) => getNodeCenter(childId, positions))
    .filter((value): value is { x: number; y: number } => Boolean(value));
  const siblingCenters = [...siblingIds]
    .map((siblingId) => getNodeCenter(siblingId, positions))
    .filter((value): value is { x: number; y: number } => Boolean(value));

  const parentSlotY =
    parentCenters.length > 0
      ? Math.min(...parentCenters.map((entry) => entry.y)) - EDIT_SLOT_GAP
      : center.y - NODE_HEIGHT / 2 - EDIT_SLOT_GAP;
  const siblingSlotY = siblingCenters.length > 0 ? siblingCenters[0]!.y : center.y;
  const childSlotY =
    childCenters.length > 0
      ? Math.max(...childCenters.map((entry) => entry.y)) + EDIT_SLOT_GAP
      : center.y + NODE_HEIGHT / 2 + EDIT_SLOT_GAP;
  const siblingSlotX =
    siblingCenters.length > 0
      ? Math.min(...siblingCenters.map((entry) => entry.x)) - EDIT_SLOT_GAP
      : center.x - NODE_WIDTH / 2 - EDIT_SLOT_GAP;
  const spouseSlotX = spouseCenter
    ? Math.max(center.x, spouseCenter.x) + EDIT_SLOT_GAP
    : center.x + NODE_WIDTH / 2 + EDIT_SLOT_GAP;

  const slots: EditSlot[] = [
    {
      kind: "parent",
      label: "Add parent",
      flowX: parentCenters.length > 0
        ? parentCenters.reduce((sum, entry) => sum + entry.x, 0) / parentCenters.length
        : center.x,
      flowY: parentSlotY,
      disabled: parentIds.length >= 2,
      disabledTitle: "This person already has two parents",
    },
    {
      kind: "sibling",
      label: "Add sibling",
      flowX: siblingSlotX,
      flowY: siblingSlotY,
    },
    {
      kind: "child",
      label: spouseCenter ? "Add child to this family" : "Add child",
      flowX: unionCenterX,
      flowY: childSlotY,
    },
    {
      kind: "spouse",
      label: "Add spouse",
      flowX: spouseSlotX,
      flowY: center.y,
      disabled: Boolean(activeSpouseRelationship),
      disabledTitle: "This person already has an active spouse",
    },
  ];

  return slots.filter((slot) => !slot.disabled);
}

/**
 * Collect immediate family cluster for a person.
 * Returns Set of personIds (person + parents + children + spouses).
 */
export function getImmediateFamily(
  personId: string,
  relationships: ApiRelationship[]
): Set<string> {
  const ids = new Set<string>([personId]);

  for (const r of relationships) {
    if (r.type === "parent_child") {
      if (r.toPersonId === personId) ids.add(r.fromPersonId);
      if (r.fromPersonId === personId) ids.add(r.toPersonId);
    }
    if (r.type === "spouse") {
      if (r.fromPersonId === personId) ids.add(r.toPersonId);
      if (r.toPersonId === personId) ids.add(r.fromPersonId);
    }
  }

  return ids;
}

export { NODE_WIDTH, NODE_HEIGHT };
