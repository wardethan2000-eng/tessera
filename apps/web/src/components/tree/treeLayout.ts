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
const GENERATION_GAP = 240;  // vertical distance between generation rows
const EDIT_SLOT_GAP = 90;
const ROW_GAP = 84;
const SPOUSE_ATTACH_GAP = 120;

function sortedPair(leftId: string, rightId: string): [string, string] {
  return leftId <= rightId ? [leftId, rightId] : [rightId, leftId];
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

type RowToken = {
  anchorId: string;
  attachedSpouseIds: string[];
  parentSignature: string;
};

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
  const generationLaneByPersonId = propagateSpouseLanes(
    sortedPeople,
    sortedRelationships,
    buildGenerationLanes(sortedPeople, parentChildRels),
  );
  const parentIdsByChild = buildParentIdsByChild(sortedRelationships);
  const childIdsByParent = buildChildIdsByParent(sortedRelationships);
  const activeSpousesByPersonId = buildActiveSpouseMap(sortedRelationships);
  const attachedAnchorByPersonId = buildAttachedSpouseMap(
    sortedPeople,
    generationLaneByPersonId,
    parentIdsByChild,
    childIdsByParent,
    activeSpousesByPersonId,
  );
  const peopleById = new Map(sortedPeople.map((person) => [person.id, person]));
  const laneValues = [...generationLaneByPersonId.values()];
  const maxLane = laneValues.length > 0 ? Math.max(...laneValues) : 0;
  const positions = new Map<string, { x: number; y: number }>();

  for (let lane = 0; lane <= maxLane; lane += 1) {
    const rowPositions = computeLanePositions(
      lane,
      sortedPeople,
      generationLaneByPersonId,
      parentIdsByChild,
      attachedAnchorByPersonId,
      activeSpousesByPersonId,
      peopleById,
    );

    for (const [personId, x] of rowPositions.entries()) {
      positions.set(personId, {
        x: x - NODE_WIDTH / 2,
        y: lane * GENERATION_GAP - NODE_HEIGHT / 2,
      });
    }
  }

  alignParentsOverChildren(
    sortedRelationships,
    activeSpousesByPersonId,
    attachedAnchorByPersonId,
    positions,
  );

  return positions;
}

function buildParentIdsByChild(relationships: ApiRelationship[]) {
  const parentIdsByChild = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent_child") continue;
    const existing = parentIdsByChild.get(relationship.toPersonId) ?? [];
    existing.push(relationship.fromPersonId);
    parentIdsByChild.set(relationship.toPersonId, existing);
  }
  for (const [childId, parentIds] of parentIdsByChild.entries()) {
    parentIdsByChild.set(childId, [...new Set(parentIds)].sort());
  }
  return parentIdsByChild;
}

function buildChildIdsByParent(relationships: ApiRelationship[]) {
  const childIdsByParent = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent_child") continue;
    const existing = childIdsByParent.get(relationship.fromPersonId) ?? [];
    existing.push(relationship.toPersonId);
    childIdsByParent.set(relationship.fromPersonId, existing);
  }
  for (const [parentId, childIds] of childIdsByParent.entries()) {
    childIdsByParent.set(parentId, [...new Set(childIds)].sort());
  }
  return childIdsByParent;
}

function buildActiveSpouseMap(relationships: ApiRelationship[]) {
  const activeSpousesByPersonId = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (
      relationship.type !== "spouse" ||
      (relationship.spouseStatus ?? "active") !== "active"
    ) {
      continue;
    }
    const fromList = activeSpousesByPersonId.get(relationship.fromPersonId) ?? [];
    fromList.push(relationship.toPersonId);
    activeSpousesByPersonId.set(relationship.fromPersonId, fromList);

    const toList = activeSpousesByPersonId.get(relationship.toPersonId) ?? [];
    toList.push(relationship.fromPersonId);
    activeSpousesByPersonId.set(relationship.toPersonId, toList);
  }

  for (const [personId, spouseIds] of activeSpousesByPersonId.entries()) {
    activeSpousesByPersonId.set(personId, [...new Set(spouseIds)].sort());
  }

  return activeSpousesByPersonId;
}

function propagateSpouseLanes(
  people: ApiPerson[],
  relationships: ApiRelationship[],
  generationLaneByPersonId: Map<string, number>,
) {
  const laneByPersonId = new Map(generationLaneByPersonId);
  const structuralDegreeByPersonId = new Map<string, number>(
    people.map((person) => [person.id, 0]),
  );

  for (const relationship of relationships) {
    if (relationship.type !== "parent_child") continue;
    structuralDegreeByPersonId.set(
      relationship.fromPersonId,
      (structuralDegreeByPersonId.get(relationship.fromPersonId) ?? 0) + 1,
    );
    structuralDegreeByPersonId.set(
      relationship.toPersonId,
      (structuralDegreeByPersonId.get(relationship.toPersonId) ?? 0) + 1,
    );
  }

  const activeSpouseRelationships = relationships.filter(
    (relationship) =>
      relationship.type === "spouse" &&
      (relationship.spouseStatus ?? "active") === "active",
  );

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const relationship of activeSpouseRelationships) {
      const fromDegree = structuralDegreeByPersonId.get(relationship.fromPersonId) ?? 0;
      const toDegree = structuralDegreeByPersonId.get(relationship.toPersonId) ?? 0;
      const fromLane = laneByPersonId.get(relationship.fromPersonId) ?? 0;
      const toLane = laneByPersonId.get(relationship.toPersonId) ?? 0;

      if (fromDegree === 0 && toDegree > 0 && fromLane !== toLane) {
        laneByPersonId.set(relationship.fromPersonId, toLane);
        changed = true;
      } else if (toDegree === 0 && fromDegree > 0 && toLane !== fromLane) {
        laneByPersonId.set(relationship.toPersonId, fromLane);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return laneByPersonId;
}

function buildAttachedSpouseMap(
  people: ApiPerson[],
  generationLaneByPersonId: Map<string, number>,
  parentIdsByChild: Map<string, string[]>,
  childIdsByParent: Map<string, string[]>,
  activeSpousesByPersonId: Map<string, string[]>,
) {
  const attachedAnchorByPersonId = new Map<string, string>();
  const structuralDegreeByPersonId = new Map<string, number>(
    people.map((person) => [
      person.id,
      (parentIdsByChild.get(person.id)?.length ?? 0) +
        (childIdsByParent.get(person.id)?.length ?? 0),
    ]),
  );

  for (const person of people) {
    const spouseIds = activeSpousesByPersonId.get(person.id) ?? [];
    if (spouseIds.length !== 1) continue;
    if ((structuralDegreeByPersonId.get(person.id) ?? 0) > 0) continue;

    const spouseId = spouseIds[0]!;
    const spouseSpouses = activeSpousesByPersonId.get(spouseId) ?? [];
    if (spouseSpouses.length !== 1) continue;
    if ((generationLaneByPersonId.get(person.id) ?? 0) !== (generationLaneByPersonId.get(spouseId) ?? 0)) {
      continue;
    }

    const spouseStructuralDegree = structuralDegreeByPersonId.get(spouseId) ?? 0;
    if (spouseStructuralDegree === 0 && person.id < spouseId) continue;

    attachedAnchorByPersonId.set(person.id, spouseId);
  }

  return attachedAnchorByPersonId;
}

function computeLanePositions(
  lane: number,
  people: ApiPerson[],
  generationLaneByPersonId: Map<string, number>,
  parentIdsByChild: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  activeSpousesByPersonId: Map<string, string[]>,
  peopleById: Map<string, ApiPerson>,
) {
  const lanePeople = people.filter(
    (person) =>
      (generationLaneByPersonId.get(person.id) ?? 0) === lane &&
      !attachedAnchorByPersonId.has(person.id),
  );
  const tokens = buildLaneTokens(
    lanePeople,
    parentIdsByChild,
    attachedAnchorByPersonId,
    activeSpousesByPersonId,
    peopleById,
  );

  const positions = new Map<string, number>();
  if (tokens.length === 0) return positions;

  const tokenWidths = tokens.map(
    (token) => NODE_WIDTH + token.attachedSpouseIds.length * SPOUSE_ATTACH_GAP,
  );
  const totalWidth =
    tokenWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, tokens.length - 1) * ROW_GAP;
  let cursorX = -totalWidth / 2;

  tokens.forEach((token, index) => {
    const tokenWidth = tokenWidths[index] ?? NODE_WIDTH;
    const anchorCenterX = cursorX + NODE_WIDTH / 2;
    positions.set(token.anchorId, anchorCenterX);

    token.attachedSpouseIds.forEach((spouseId, spouseIndex) => {
      positions.set(
        spouseId,
        anchorCenterX + (spouseIndex + 1) * SPOUSE_ATTACH_GAP,
      );
    });

    cursorX += tokenWidth + ROW_GAP;
  });

  return positions;
}

function buildLaneTokens(
  lanePeople: ApiPerson[],
  parentIdsByChild: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  activeSpousesByPersonId: Map<string, string[]>,
  peopleById: Map<string, ApiPerson>,
) {
  const attachedSpousesByAnchorId = new Map<string, string[]>();
  for (const [personId, anchorId] of attachedAnchorByPersonId.entries()) {
    const existing = attachedSpousesByAnchorId.get(anchorId) ?? [];
    existing.push(personId);
    attachedSpousesByAnchorId.set(anchorId, existing);
  }

  const bySignature = new Map<string, ApiPerson[]>();
  for (const person of lanePeople) {
    const parentSignature = (parentIdsByChild.get(person.id) ?? []).join("|");
    const group = bySignature.get(parentSignature) ?? [];
    group.push(person);
    bySignature.set(parentSignature, group);
  }

  const signatureOrder = [...bySignature.entries()]
    .sort(([leftSignature, leftPeople], [rightSignature, rightPeople]) => {
      const leftHasParents = leftSignature.length > 0;
      const rightHasParents = rightSignature.length > 0;
      if (leftHasParents !== rightHasParents) return leftHasParents ? 1 : -1;

      const leftBirthYear = Math.min(
        ...leftPeople.map((person) => person.birthYear ?? Number.POSITIVE_INFINITY),
      );
      const rightBirthYear = Math.min(
        ...rightPeople.map((person) => person.birthYear ?? Number.POSITIVE_INFINITY),
      );
      if (leftBirthYear !== rightBirthYear) return leftBirthYear - rightBirthYear;
      return leftSignature.localeCompare(rightSignature);
    })
    .map(([signature]) => signature);

  const tokens: RowToken[] = [];
  for (const signature of signatureOrder) {
    const group = [...(bySignature.get(signature) ?? [])].sort((left, right) => {
      if ((left.birthYear ?? Number.POSITIVE_INFINITY) !== (right.birthYear ?? Number.POSITIVE_INFINITY)) {
        return (left.birthYear ?? Number.POSITIVE_INFINITY) - (right.birthYear ?? Number.POSITIVE_INFINITY);
      }
      return left.id.localeCompare(right.id);
    });

    group.forEach((person, index) => {
      const attachedSpouseIds = [...(attachedSpousesByAnchorId.get(person.id) ?? [])].sort(
        (leftId, rightId) => {
          const left = peopleById.get(leftId);
          const right = peopleById.get(rightId);
          if ((left?.birthYear ?? Number.POSITIVE_INFINITY) !== (right?.birthYear ?? Number.POSITIVE_INFINITY)) {
            return (left?.birthYear ?? Number.POSITIVE_INFINITY) - (right?.birthYear ?? Number.POSITIVE_INFINITY);
          }
          return leftId.localeCompare(rightId);
        },
      );
      tokens.push({
        anchorId: person.id,
        attachedSpouseIds,
        parentSignature: signature || `root:${index}:${person.id}`,
      });
    });

    if (tokens.length > 0 && signature !== signatureOrder[signatureOrder.length - 1]) {
      const lastToken = tokens[tokens.length - 1];
      if (lastToken) {
        lastToken.attachedSpouseIds.push(...[]);
      }
    }
  }

  return addSiblingSpacing(tokens);
}

function addSiblingSpacing(tokens: RowToken[]) {
  if (tokens.length <= 1) return tokens;
  const spaced: RowToken[] = [];
  tokens.forEach((token, index) => {
    spaced.push(token);
    const next = tokens[index + 1];
    if (!next) return;
    if (token.parentSignature === next.parentSignature) return;
    spaced.push({
      anchorId: `gap:${token.anchorId}:${next.anchorId}`,
      attachedSpouseIds: [],
      parentSignature: `gap:${index}`,
    });
  });
  return spaced.filter((token) => !token.anchorId.startsWith("gap:"));
}

function alignParentsOverChildren(
  relationships: ApiRelationship[],
  activeSpousesByPersonId: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  positions: Map<string, { x: number; y: number }>,
) {
  const parentIdsByChild = buildParentIdsByChild(relationships);
  const childGroups = new Map<string, string[]>();

  for (const [childId, parentIds] of parentIdsByChild.entries()) {
    const signature = parentIds.join("|");
    const group = childGroups.get(signature) ?? [];
    group.push(childId);
    childGroups.set(signature, group);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    for (const [signature, childIds] of childGroups.entries()) {
      const parentIds = signature.split("|").filter(Boolean);
      const childCenters = childIds
        .map((childId) => getNodeCenter(childId, positions))
        .filter((value): value is { x: number; y: number } => Boolean(value));
      const parentCenters = parentIds
        .map((parentId) => getNodeCenter(parentId, positions))
        .filter((value): value is { x: number; y: number } => Boolean(value));
      if (childCenters.length === 0 || parentCenters.length === 0) continue;

      const targetCenterX = average(childCenters.map((entry) => entry.x));

      if (parentIds.length === 1) {
        shiftCluster(parentIds[0]!, targetCenterX - parentCenters[0]!.x, activeSpousesByPersonId, attachedAnchorByPersonId, positions);
        continue;
      }

      const currentParentCenterX = average(parentCenters.map((entry) => entry.x));
      const delta = targetCenterX - currentParentCenterX;
      for (const parentId of parentIds) {
        shiftCluster(parentId, delta, activeSpousesByPersonId, attachedAnchorByPersonId, positions);
      }
    }
  }
}

function shiftCluster(
  personId: string,
  deltaX: number,
  activeSpousesByPersonId: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  positions: Map<string, { x: number; y: number }>,
) {
  if (Math.abs(deltaX) < 1) return;
  const person = positions.get(personId);
  if (person) {
    positions.set(personId, { ...person, x: person.x + deltaX });
  }

  for (const [attachedId, anchorId] of attachedAnchorByPersonId.entries()) {
    if (anchorId !== personId) continue;
    const attached = positions.get(attachedId);
    if (!attached) continue;
    positions.set(attachedId, { ...attached, x: attached.x + deltaX });
  }

  const spouseIds = activeSpousesByPersonId.get(personId) ?? [];
  for (const spouseId of spouseIds) {
    if (attachedAnchorByPersonId.get(spouseId) === personId) continue;
    if (attachedAnchorByPersonId.has(personId)) continue;
    const spouse = positions.get(spouseId);
    if (!spouse) continue;
    positions.set(spouseId, { ...spouse, x: spouse.x + deltaX });
  }
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
