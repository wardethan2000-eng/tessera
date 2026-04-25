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

const NODE_WIDTH = 112;
const NODE_HEIGHT = 156;
const PORTRAIT_SIZE = 64;
const PORTRAIT_RADIUS = PORTRAIT_SIZE / 2;
const GENERATION_GAP = 260;
const EDIT_SLOT_GAP = 32;
const ROW_GAP = 100;
const SPOUSE_ATTACH_GAP = 144;
const FAMILY_GROUP_GAP = 80;   // extra horizontal gap between different parent-family groups
const FAMILY_BAR_STAGGER = 16; // vertical offset between successive parent-couple branch bars
const MIN_LANE_GAP = 200;

function sortedPair(leftId: string, rightId: string): [string, string] {
  return leftId <= rightId ? [leftId, rightId] : [rightId, leftId];
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getPortraitCenter(
  personId: string,
  positions: Map<string, { x: number; y: number }>,
) {
  const pos = positions.get(personId);
  if (!pos) return null;
  return {
    x: pos.x + NODE_WIDTH / 2,
    y: pos.y + PORTRAIT_RADIUS,
  };
}

function getPortraitTopAnchor(
  personId: string,
  positions: Map<string, { x: number; y: number }>,
) {
  const center = getPortraitCenter(personId, positions);
  if (!center) return null;
  return { x: center.x, y: center.y - PORTRAIT_RADIUS };
}

function getPortraitBottomAnchor(
  personId: string,
  positions: Map<string, { x: number; y: number }>,
) {
  const center = getPortraitCenter(personId, positions);
  if (!center) return null;
  return { x: center.x, y: center.y + PORTRAIT_RADIUS };
}

function getPortraitSideAnchor(
  personId: string,
  positions: Map<string, { x: number; y: number }>,
  side: "left" | "right",
) {
  const center = getPortraitCenter(personId, positions);
  if (!center) return null;
  return {
    x: center.x + (side === "right" ? PORTRAIT_RADIUS : -PORTRAIT_RADIUS),
    y: center.y,
  };
}

function getNodeBottomAnchor(
  personId: string,
  positions: Map<string, { x: number; y: number }>,
) {
  const pos = positions.get(personId);
  if (!pos) return null;
  return { x: pos.x + NODE_WIDTH / 2, y: pos.y + NODE_HEIGHT };
}

type RowToken = {
  anchorId: string;
  memberIds: string[];
  attachedSpouseIds: string[];
  parentSignature: string;
};

type LaneLayoutPlan = {
  positions: Map<string, number>;
  componentMembersByPersonId: Map<string, string[]>;
};

type ExplicitSiblingComponent = {
  id: string;
  memberIds: string[];
};

type ParentChildLink = {
  fromPersonId: string;
  toPersonId: string;
};

export interface ParentPlaceholderGroup {
  id: string;
  anchorPersonId: string;
  memberIds: string[];
  placeholderCenters: Array<{ id: string; x: number; y: number }>;
  childAnchors: Array<{ personId: string; x: number; y: number }>;
  actualParentAnchors: Array<{ personId: string; x: number; y: number }>;
  branchY: number | null;
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
  const explicitSiblingComponents = buildExplicitSiblingComponents(
    sortedPeople,
    sortedRelationships,
  );
  const explicitSiblingComponentByPersonId = new Map<string, string>();
  for (const component of explicitSiblingComponents) {
    for (const memberId of component.memberIds) {
      explicitSiblingComponentByPersonId.set(memberId, component.id);
    }
  }
  const generationLaneByPersonId = propagateSpouseLanes(
    sortedPeople,
    sortedRelationships,
    buildGenerationLanes(
      sortedPeople,
      sortedRelationships,
      parentChildRels,
      explicitSiblingComponents,
    ),
  );
  const derivedSiblingParentState = buildDerivedSiblingParentState(
    sortedPeople.map((person) => person.id),
    sortedRelationships,
    explicitSiblingComponents,
  );
  const parentIdsByChild = derivedSiblingParentState.parentIdsByChild;
  const childIdsByParent = derivedSiblingParentState.childIdsByParent;
  const activeSpousesByPersonId = buildActiveSpouseMap(sortedRelationships);
  const attachedAnchorByPersonId = buildAttachedSpouseMap(
    sortedPeople,
    generationLaneByPersonId,
    parentIdsByChild,
    childIdsByParent,
    activeSpousesByPersonId,
    explicitSiblingComponentByPersonId,
  );
  const peopleById = new Map(sortedPeople.map((person) => [person.id, person]));
  const laneValues = [...generationLaneByPersonId.values()];
  const minLane = laneValues.length > 0 ? Math.min(...laneValues) : 0;
  const maxLane = laneValues.length > 0 ? Math.max(...laneValues) : 0;
  const positions = new Map<string, { x: number; y: number }>();
  const lanePlans: LaneLayoutPlan[] = [];

  for (let lane = minLane; lane <= maxLane; lane += 1) {
    const lanePlan = computeLanePositions(
      lane,
      sortedPeople,
      generationLaneByPersonId,
      parentIdsByChild,
      childIdsByParent,
      attachedAnchorByPersonId,
      activeSpousesByPersonId,
      peopleById,
      explicitSiblingComponentByPersonId,
      positions,
    );
    lanePlans.push(lanePlan);

    for (const [personId, x] of lanePlan.positions.entries()) {
      positions.set(personId, {
        x: x - NODE_WIDTH / 2,
        y: lane * GENERATION_GAP - NODE_HEIGHT / 2,
      });
    }
  }

  const laneComponentMembersByPersonId = new Map<string, string[]>();
  for (const lanePlan of lanePlans) {
    for (const [personId, memberIds] of lanePlan.componentMembersByPersonId.entries()) {
      laneComponentMembersByPersonId.set(personId, memberIds);
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    alignParentsOverChildren(
      sortedRelationships,
      activeSpousesByPersonId,
      attachedAnchorByPersonId,
      laneComponentMembersByPersonId,
      positions,
      "all",
    );
    resolveLaneCollisions(
      sortedRelationships,
      activeSpousesByPersonId,
      attachedAnchorByPersonId,
      laneComponentMembersByPersonId,
      positions,
    );
  }
  alignParentsOverChildren(
    sortedRelationships,
    activeSpousesByPersonId,
    attachedAnchorByPersonId,
    laneComponentMembersByPersonId,
    positions,
    "all",
  );
  resolveLaneCollisions(
    sortedRelationships,
    activeSpousesByPersonId,
    attachedAnchorByPersonId,
    laneComponentMembersByPersonId,
    positions,
  );
  alignParentsOverChildren(
    sortedRelationships,
    activeSpousesByPersonId,
    attachedAnchorByPersonId,
    laneComponentMembersByPersonId,
    positions,
    "single-only",
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

function cloneParentIdsByChild(parentIdsByChild: Map<string, string[]>) {
  return new Map(
    [...parentIdsByChild.entries()].map(([childId, parentIds]) => [
      childId,
      [...parentIds],
    ]),
  );
}

function buildChildIdsByParentFromParentIdsByChild(
  parentIdsByChild: Map<string, string[]>,
) {
  const childIdsByParent = new Map<string, string[]>();

  for (const [childId, parentIds] of parentIdsByChild.entries()) {
    for (const parentId of parentIds) {
      const existing = childIdsByParent.get(parentId) ?? [];
      existing.push(childId);
      childIdsByParent.set(parentId, existing);
    }
  }

  for (const [parentId, childIds] of childIdsByParent.entries()) {
    childIdsByParent.set(parentId, [...new Set(childIds)].sort());
  }

  return childIdsByParent;
}

function buildDerivedSiblingParentState(
  personIds: string[],
  relationships: ApiRelationship[],
  explicitSiblingComponents: ExplicitSiblingComponent[],
) {
  const actualParentIdsByChild = buildParentIdsByChild(relationships);
  const derivedParentIdsByChild = cloneParentIdsByChild(actualParentIdsByChild);

  for (const component of explicitSiblingComponents) {
    const knownParentSets = component.memberIds
      .map((memberId) => actualParentIdsByChild.get(memberId) ?? [])
      .filter((parentIds) => parentIds.length > 0);

    if (knownParentSets.length === 0) continue;

    const sharedParentIds = [...new Set(knownParentSets.flat())].sort();
    if (sharedParentIds.length > 2) {
      // Mixed-family sibling group: propagate the majority parent set to
      // parentless siblings so they participate in family-affinity ordering.
      const parentSetCounts = new Map<string, { ids: string[]; count: number }>();
      for (const parentSet of knownParentSets) {
        const key = parentSet.join("|");
        const entry = parentSetCounts.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          parentSetCounts.set(key, { ids: parentSet, count: 1 });
        }
      }
      let majoritySet: string[] = [];
      let majorityCount = 0;
      for (const { ids, count } of parentSetCounts.values()) {
        if (count > majorityCount) {
          majoritySet = ids;
          majorityCount = count;
        }
      }
      for (const memberId of component.memberIds) {
        const existing = actualParentIdsByChild.get(memberId) ?? [];
        if (existing.length === 0 && majoritySet.length > 0) {
          derivedParentIdsByChild.set(memberId, majoritySet);
        }
      }
      continue;
    }

    for (const memberId of component.memberIds) {
      derivedParentIdsByChild.set(memberId, sharedParentIds);
    }
  }

  const actualParentLinkKeys = new Set(
    relationships
      .filter((relationship) => relationship.type === "parent_child")
      .map((relationship) => `${relationship.fromPersonId}->${relationship.toPersonId}`),
  );
  const inferredParentChildLinks: ParentChildLink[] = [];

  for (const personId of personIds) {
    const parentIds = derivedParentIdsByChild.get(personId) ?? [];
    for (const parentId of parentIds) {
      const linkKey = `${parentId}->${personId}`;
      if (actualParentLinkKeys.has(linkKey)) continue;
      inferredParentChildLinks.push({
        fromPersonId: parentId,
        toPersonId: personId,
      });
    }
  }

  return {
    parentIdsByChild: derivedParentIdsByChild,
    childIdsByParent: buildChildIdsByParentFromParentIdsByChild(derivedParentIdsByChild),
    inferredParentChildLinks,
  };
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
  const activeSpouseRelationships = relationships.filter(
    (relationship) =>
      relationship.type === "spouse" &&
      (relationship.spouseStatus ?? "active") === "active",
  );

  for (let pass = 0; pass < Math.max(3, people.length); pass += 1) {
    let changed = false;
    for (const relationship of activeSpouseRelationships) {
      const fromLane = laneByPersonId.get(relationship.fromPersonId) ?? 0;
      const toLane = laneByPersonId.get(relationship.toPersonId) ?? 0;
      const unifiedLane = Math.max(fromLane, toLane);

      if (fromLane !== unifiedLane) {
        laneByPersonId.set(relationship.fromPersonId, unifiedLane);
        changed = true;
      }
      if (toLane !== unifiedLane) {
        laneByPersonId.set(relationship.toPersonId, unifiedLane);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return laneByPersonId;
}

function buildCoParentMap(parentIdsByChild: Map<string, string[]>) {
  // Two people are "co-parents" if they share at least one child where
  // both appear in the child's parent set.  Used to detect implicit couples
  // (people who clearly raised kids together but have no spouse record).
  const coParentsByPerson = new Map<string, Set<string>>();
  for (const parentIds of parentIdsByChild.values()) {
    if (parentIds.length < 2) continue;
    for (const parentId of parentIds) {
      const set = coParentsByPerson.get(parentId) ?? new Set<string>();
      for (const otherId of parentIds) {
        if (otherId !== parentId) set.add(otherId);
      }
      coParentsByPerson.set(parentId, set);
    }
  }
  return coParentsByPerson;
}

function buildAttachedSpouseMap(
  people: ApiPerson[],
  generationLaneByPersonId: Map<string, number>,
  parentIdsByChild: Map<string, string[]>,
  childIdsByParent: Map<string, string[]>,
  activeSpousesByPersonId: Map<string, string[]>,
  explicitSiblingComponentByPersonId: Map<string, string>,
) {
  const attachedAnchorByPersonId = new Map<string, string>();
  const structuralDegreeByPersonId = new Map<string, number>(
    people.map((person) => [
      person.id,
      (parentIdsByChild.get(person.id)?.length ?? 0) +
        (childIdsByParent.get(person.id)?.length ?? 0),
    ]),
  );
  const siblingWeightByPersonId = new Map<string, number>(
    people.map((person) => [
      person.id,
      explicitSiblingComponentByPersonId.has(person.id) ? 1 : 0,
    ]),
  );
  const coParentsByPerson = buildCoParentMap(parentIdsByChild);

  function pickAnchor(leftId: string, rightId: string): string {
    const leftStructural = structuralDegreeByPersonId.get(leftId) ?? 0;
    const rightStructural = structuralDegreeByPersonId.get(rightId) ?? 0;
    if (leftStructural !== rightStructural) {
      return leftStructural > rightStructural ? leftId : rightId;
    }
    const leftSibling = siblingWeightByPersonId.get(leftId) ?? 0;
    const rightSibling = siblingWeightByPersonId.get(rightId) ?? 0;
    if (leftSibling !== rightSibling) {
      return leftSibling > rightSibling ? leftId : rightId;
    }
    return leftId < rightId ? leftId : rightId;
  }

  // Pass 1: explicit spouse couples (existing behavior).
  for (const person of people) {
    if (attachedAnchorByPersonId.has(person.id)) continue;
    const spouseIds = activeSpousesByPersonId.get(person.id) ?? [];
    if (spouseIds.length !== 1) continue;

    const spouseId = spouseIds[0]!;
    if (attachedAnchorByPersonId.has(spouseId)) continue;
    const spouseSpouses = activeSpousesByPersonId.get(spouseId) ?? [];
    if (spouseSpouses.length !== 1) continue;
    if ((generationLaneByPersonId.get(person.id) ?? 0) !== (generationLaneByPersonId.get(spouseId) ?? 0)) {
      continue;
    }

    const anchorId = pickAnchor(person.id, spouseId);
    const attachedId = anchorId === person.id ? spouseId : person.id;
    attachedAnchorByPersonId.set(attachedId, anchorId);
  }

  // Pass 2: implicit co-parent couples — two people without explicit
  // spouses who share children together.  Without this, the collision
  // resolver pushes them to opposite ends of the row when their family
  // overlaps another family in the same generation.
  for (const person of people) {
    if (attachedAnchorByPersonId.has(person.id)) continue;
    const spouseIds = activeSpousesByPersonId.get(person.id) ?? [];
    if (spouseIds.length > 0) continue;

    const coParents = [...(coParentsByPerson.get(person.id) ?? new Set<string>())];
    if (coParents.length !== 1) continue;
    const partnerId = coParents[0]!;
    if (partnerId === person.id) continue;
    if (attachedAnchorByPersonId.has(partnerId)) continue;

    const partnerSpouses = activeSpousesByPersonId.get(partnerId) ?? [];
    if (partnerSpouses.length > 0) continue;

    const partnerCoParents = coParentsByPerson.get(partnerId) ?? new Set<string>();
    if (partnerCoParents.size !== 1 || !partnerCoParents.has(person.id)) continue;

    if (
      (generationLaneByPersonId.get(person.id) ?? 0) !==
      (generationLaneByPersonId.get(partnerId) ?? 0)
    ) {
      continue;
    }

    const anchorId = pickAnchor(person.id, partnerId);
    const attachedId = anchorId === person.id ? partnerId : person.id;
    attachedAnchorByPersonId.set(attachedId, anchorId);
  }

  return attachedAnchorByPersonId;
}

function computeLanePositions(
  lane: number,
  people: ApiPerson[],
  generationLaneByPersonId: Map<string, number>,
  parentIdsByChild: Map<string, string[]>,
  childIdsByParent: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  activeSpousesByPersonId: Map<string, string[]>,
  peopleById: Map<string, ApiPerson>,
  explicitSiblingComponentByPersonId: Map<string, string>,
  existingPositions?: Map<string, { x: number; y: number }>,
) {
  const lanePeople = people.filter(
    (person) =>
      (generationLaneByPersonId.get(person.id) ?? 0) === lane &&
      !attachedAnchorByPersonId.has(person.id),
  );
    const tokens = buildLaneTokens(
      lanePeople,
      parentIdsByChild,
      childIdsByParent,
      attachedAnchorByPersonId,
      activeSpousesByPersonId,
      peopleById,
      explicitSiblingComponentByPersonId,
      existingPositions,
    );

  const positions = new Map<string, number>();
  const componentMembersByPersonId = new Map<string, string[]>();
  if (tokens.length === 0) {
    return { positions, componentMembersByPersonId };
  }

  const tokenComponentMemberIds = buildTokenComponentMembers(tokens);
  for (const memberIds of tokenComponentMemberIds) {
    for (const memberId of memberIds) {
      componentMembersByPersonId.set(memberId, memberIds);
    }
  }

  const tokenWidths = tokens.map(
    (token) => NODE_WIDTH + token.attachedSpouseIds.length * SPOUSE_ATTACH_GAP,
  );

  // Extra gap between tokens whose anchors belong to different parent families.
  // Both tokens must have a "parents:" signature for the gap to apply so that
  // solo or parentless tokens don't produce spurious gaps.
  const familyTransitionGaps = tokens.map((token, index) => {
    const next = tokens[index + 1];
    if (!next) return 0;
    if (!token.parentSignature.startsWith("parents:")) return 0;
    if (!next.parentSignature.startsWith("parents:")) return 0;
    return token.parentSignature !== next.parentSignature ? FAMILY_GROUP_GAP : 0;
  });

  const totalWidth =
    tokenWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, tokens.length - 1) * ROW_GAP +
    familyTransitionGaps.reduce<number>((sum, gap) => sum + gap, 0);

  // Build family segments: contiguous runs sharing the same parentSignature.
  type TokenSegment = {
    tokens: RowToken[];
    widths: number[];
    totalWidth: number;
    parentSignature: string;
    desiredCenter: number | null;
    interGapBefore: number;
  };
  const tokenSegments: TokenSegment[] = [];
  let segIdx = 0;
  while (segIdx < tokens.length) {
    const sig = tokens[segIdx]!.parentSignature;
    const segStart = segIdx;
    while (segIdx < tokens.length && tokens[segIdx]!.parentSignature === sig) {
      segIdx++;
    }
    const segTokens = tokens.slice(segStart, segIdx);
    const segWidths = segTokens.map((_, j) => tokenWidths[segStart + j] ?? NODE_WIDTH);
    const segTotalWidth =
      segWidths.reduce((sum, w) => sum + w, 0) +
      Math.max(0, segTokens.length - 1) * ROW_GAP;
    const interGapBefore = segStart > 0 ? (familyTransitionGaps[segStart - 1] ?? 0) : 0;
    tokenSegments.push({
      tokens: segTokens,
      widths: segWidths,
      totalWidth: segTotalWidth,
      parentSignature: sig,
      desiredCenter: null,
      interGapBefore,
    });
  }

  // Compute desired center for each parented segment from known parent positions.
  for (const seg of tokenSegments) {
    if (!seg.parentSignature.startsWith("parents:")) continue;
    if (!existingPositions || existingPositions.size === 0) continue;
    const parentIds = seg.parentSignature.slice("parents:".length).split("|").filter(Boolean);
    const parentCenters = parentIds
      .map((id) => existingPositions.get(id))
      .filter((pos): pos is { x: number; y: number } => Boolean(pos))
      .map((pos) => pos.x + NODE_WIDTH / 2);
    if (parentCenters.length > 0) {
      seg.desiredCenter = average(parentCenters);
    }
  }

  // Place segments greedily left-to-right, centering each parented segment
  // over its parents while preventing overlap with previous segments.
  let prevRightEdge: number | null = null;
  const segmentStartXs: number[] = [];
  for (const seg of tokenSegments) {
    const interGap = prevRightEdge !== null ? ROW_GAP + seg.interGapBefore : 0;
    let startX: number;
    if (seg.desiredCenter !== null) {
      const anchoredStart = seg.desiredCenter - seg.totalWidth / 2;
      startX =
        prevRightEdge !== null
          ? Math.max(anchoredStart, prevRightEdge + interGap)
          : anchoredStart;
    } else {
      startX = prevRightEdge !== null ? prevRightEdge + interGap : -totalWidth / 2;
    }
    segmentStartXs.push(startX);
    prevRightEdge = startX + seg.totalWidth;
  }

  // Assign positions within each segment.
  for (let si = 0; si < tokenSegments.length; si++) {
    const seg = tokenSegments[si]!;
    let cursorX = segmentStartXs[si]!;
    for (let ti = 0; ti < seg.tokens.length; ti++) {
      const token = seg.tokens[ti]!;
      const tokenWidth = seg.widths[ti] ?? NODE_WIDTH;
      const anchorCenterX = cursorX + NODE_WIDTH / 2;
      positions.set(token.anchorId, anchorCenterX);
      token.attachedSpouseIds.forEach((spouseId, spouseIndex) => {
        positions.set(spouseId, anchorCenterX + (spouseIndex + 1) * SPOUSE_ATTACH_GAP);
      });
      cursorX += tokenWidth + ROW_GAP;
    }
  }

  return { positions, componentMembersByPersonId };
}

function buildLaneTokens(
  lanePeople: ApiPerson[],
  parentIdsByChild: Map<string, string[]>,
  childIdsByParent: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  activeSpousesByPersonId: Map<string, string[]>,
  peopleById: Map<string, ApiPerson>,
  explicitSiblingComponentByPersonId: Map<string, string>,
  existingPositions?: Map<string, { x: number; y: number }>,
) {
  const attachedSpousesByAnchorId = new Map<string, string[]>();
  for (const [personId, anchorId] of attachedAnchorByPersonId.entries()) {
    const existing = attachedSpousesByAnchorId.get(anchorId) ?? [];
    existing.push(personId);
    attachedSpousesByAnchorId.set(anchorId, existing);
  }

  const bySignature = new Map<string, ApiPerson[]>();
  for (const person of lanePeople) {
    const actualParentSignature = (parentIdsByChild.get(person.id) ?? []).join("|");
    const childSignature = (childIdsByParent.get(person.id) ?? []).join("|");
    const siblingSignature = explicitSiblingComponentByPersonId.get(person.id);
    const familySignature =
      actualParentSignature.length > 0
        ? `parents:${actualParentSignature}`
        : childSignature.length > 0
          ? `children:${childSignature}`
        : siblingSignature
          ? `siblings:${siblingSignature}`
          : `solo:${person.id}`;
    const group = bySignature.get(familySignature) ?? [];
    group.push(person);
    bySignature.set(familySignature, group);
  }

  const tokensBySignature = new Map<string, RowToken[]>();
  for (const [signature, peopleForSignature] of bySignature.entries()) {
    const group = [...peopleForSignature].sort((left, right) => {
      if ((left.birthYear ?? Number.POSITIVE_INFINITY) !== (right.birthYear ?? Number.POSITIVE_INFINITY)) {
        return (left.birthYear ?? Number.POSITIVE_INFINITY) - (right.birthYear ?? Number.POSITIVE_INFINITY);
      }
      return left.id.localeCompare(right.id);
    });

    const signatureTokens: RowToken[] = group.map((person, index) => {
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
      return {
        anchorId: person.id,
        memberIds: [person.id, ...attachedSpouseIds],
        attachedSpouseIds,
        parentSignature: signature || `root:${index}:${person.id}`,
      };
    });
    tokensBySignature.set(signature, signatureTokens);
  }

  const tokenComponents = buildTokenComponents(
    [...tokensBySignature.values()].flat(),
    parentIdsByChild,
    childIdsByParent,
    peopleById,
    explicitSiblingComponentByPersonId,
    existingPositions,
  );
  const orderedComponents = tokenComponents.sort((left, right) => {
    if (existingPositions && existingPositions.size > 0) {
      const leftCenter = getComponentAvgParentCenter(left, parentIdsByChild, existingPositions);
      const rightCenter = getComponentAvgParentCenter(right, parentIdsByChild, existingPositions);
      if (leftCenter !== null && rightCenter !== null && leftCenter !== rightCenter) {
        return leftCenter - rightCenter;
      }
      if (leftCenter !== null && rightCenter === null) return 1;
      if (leftCenter === null && rightCenter !== null) return -1;
    }
    return compareTokenComponents(left, right, peopleById);
  });

  return addSiblingSpacing(orderedComponents.flat());
}

function buildTokenComponents(
  tokens: RowToken[],
  parentIdsByChild: Map<string, string[]>,
  childIdsByParent: Map<string, string[]>,
  peopleById: Map<string, ApiPerson>,
  explicitSiblingComponentByPersonId: Map<string, string>,
  existingPositions?: Map<string, { x: number; y: number }>,
) {
  if (tokens.length <= 1) return tokens.map((token) => [token]);

  const tokenByAnchorId = new Map(tokens.map((token) => [token.anchorId, token]));
  const adjacency = new Map<string, Set<string>>();

  const connect = (leftId: string, rightId: string) => {
    if (leftId === rightId) return;
    const leftNeighbors = adjacency.get(leftId) ?? new Set<string>();
    leftNeighbors.add(rightId);
    adjacency.set(leftId, leftNeighbors);
    const rightNeighbors = adjacency.get(rightId) ?? new Set<string>();
    rightNeighbors.add(leftId);
    adjacency.set(rightId, rightNeighbors);
  };

  const anchorsByKey = new Map<string, string[]>();
  for (const token of tokens) {
    const relationshipKeys = collectTokenRelationshipKeys(
      token,
      parentIdsByChild,
      childIdsByParent,
      explicitSiblingComponentByPersonId,
    );
    for (const key of relationshipKeys) {
      const existing = anchorsByKey.get(key) ?? [];
      existing.push(token.anchorId);
      anchorsByKey.set(key, existing);
    }
  }

  for (const anchorIds of anchorsByKey.values()) {
    for (let index = 1; index < anchorIds.length; index += 1) {
      connect(anchorIds[index - 1]!, anchorIds[index]!);
    }
  }

  const components: RowToken[][] = [];
  const visited = new Set<string>();
  const orderedTokens = [...tokens].sort((left, right) =>
    compareTokenOrder(left, right, peopleById),
  );

  for (const token of orderedTokens) {
    if (visited.has(token.anchorId)) continue;
    const component: RowToken[] = [];
    const queue = [token.anchorId];
    visited.add(token.anchorId);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const currentToken = tokenByAnchorId.get(currentId);
      if (!currentToken) continue;
      component.push(currentToken);

      const neighbors = [...(adjacency.get(currentId) ?? [])].sort();
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    const ordered = orderComponentByFamilyAffinity(
      component,
      parentIdsByChild,
      peopleById,
      existingPositions,
    );
    components.push(ordered);
  }

  return components;
}

/**
 * Reorder tokens within a component so that children from the same parent
 * family are grouped contiguously, with cross-family bridge tokens placed
 * at the boundary between the two families they connect.
 *
 * Uses a deterministic partition approach:
 *   1. Classify each token as "pure" (belongs to exactly one parent family)
 *      or "bridge" (has members from multiple parent families).
 *   2. Order the distinct families left-to-right using existing parent
 *      positions when available, falling back to alphabetical key sort.
 *   3. Emit: [pure family-1] [bridge 1→2] [pure family-2] [bridge 2→3] …
 */
function orderComponentByFamilyAffinity(
  component: RowToken[],
  parentIdsByChild: Map<string, string[]>,
  peopleById: Map<string, ApiPerson>,
  existingPositions?: Map<string, { x: number; y: number }>,
): RowToken[] {
  if (component.length <= 2) {
    return [...component].sort((l, r) => compareTokenOrder(l, r, peopleById));
  }

  // --- Step 1: compute parent-family keys per token -----------------------
  const anchorKeyPerToken = new Map<string, string>();
  const allKeysPerToken = new Map<string, Set<string>>();
  for (const token of component) {
    const allKeys = new Set<string>();
    for (const memberId of token.memberIds) {
      const pids = parentIdsByChild.get(memberId);
      if (pids && pids.length > 0) {
        const key = pids.join("|");
        allKeys.add(key);
        if (memberId === token.anchorId) {
          anchorKeyPerToken.set(token.anchorId, key);
        }
      }
    }
    allKeysPerToken.set(token.anchorId, allKeys);
  }

  // If there are fewer than 2 distinct family keys the component is
  // single-family — plain birth-order sort is sufficient.
  const allFamilyKeys = new Set<string>();
  for (const keys of allKeysPerToken.values()) {
    for (const k of keys) allFamilyKeys.add(k);
  }
  if (allFamilyKeys.size < 2) {
    return [...component].sort((l, r) => compareTokenOrder(l, r, peopleById));
  }

  // --- Step 2: order the family keys left-to-right -----------------------
  const familyAvgX = new Map<string, number>();
  for (const key of allFamilyKeys) {
    const parentIds = key.split("|");
    const xs: number[] = [];
    for (const pid of parentIds) {
      const pos = existingPositions?.get(pid);
      if (pos) xs.push(pos.x);
    }
    if (xs.length > 0) {
      familyAvgX.set(key, xs.reduce((s, x) => s + x, 0) / xs.length);
    }
  }
  const orderedFamilyKeys = [...allFamilyKeys].sort((a, b) => {
    const aX = familyAvgX.get(a);
    const bX = familyAvgX.get(b);
    if (aX !== undefined && bX !== undefined) return aX - bX;
    if (aX !== undefined) return -1;
    if (bX !== undefined) return 1;
    return a.localeCompare(b);
  });

  // --- Step 3: partition tokens into pure / bridge / orphan groups --------
  const pureByFamily = new Map<string, RowToken[]>();
  const bridges: RowToken[] = [];
  const orphans: RowToken[] = [];

  for (const token of component) {
    const allKeys = allKeysPerToken.get(token.anchorId) ?? new Set<string>();
    if (allKeys.size === 0) {
      orphans.push(token);
    } else if (allKeys.size === 1) {
      const key = [...allKeys][0]!;
      const group = pureByFamily.get(key) ?? [];
      group.push(token);
      pureByFamily.set(key, group);
    } else {
      bridges.push(token);
    }
  }

  // Sort within each group by birth-order
  for (const group of pureByFamily.values()) {
    group.sort((l, r) => compareTokenOrder(l, r, peopleById));
  }
  bridges.sort((l, r) => compareTokenOrder(l, r, peopleById));
  orphans.sort((l, r) => compareTokenOrder(l, r, peopleById));

  // --- Step 4: assemble final order --------------------------------------
  // Orphans (tokens with no parent key, e.g. solo persons) are attached to
  // the first family group since they're typically sibling-connected.
  // Bridge tokens are placed at the end of the family their anchor belongs
  // to, so the attached spouse (from the other family) faces outward.
  const usedBridges = new Set<string>();
  const result: RowToken[] = [];

  for (let i = 0; i < orderedFamilyKeys.length; i += 1) {
    const key = orderedFamilyKeys[i]!;

    // Attach orphans to the first family group
    if (i === 0) result.push(...orphans);

    result.push(...(pureByFamily.get(key) ?? []));

    // Insert bridge tokens whose anchor person belongs to this family
    for (const b of bridges) {
      if (usedBridges.has(b.anchorId)) continue;
      const bAnchorKey = anchorKeyPerToken.get(b.anchorId);
      if (bAnchorKey === key) {
        result.push(b);
        usedBridges.add(b.anchorId);
      }
    }
  }

  // Append any remaining unused bridges at the end
  for (const b of bridges) {
    if (!usedBridges.has(b.anchorId)) result.push(b);
  }

  return result;
}

function collectTokenRelationshipKeys(
  token: RowToken,
  parentIdsByChild: Map<string, string[]>,
  childIdsByParent: Map<string, string[]>,
  explicitSiblingComponentByPersonId: Map<string, string>,
) {
  const keys = new Set<string>();

  for (const memberId of token.memberIds) {
    const parentIds = parentIdsByChild.get(memberId) ?? [];
    const childIds = childIdsByParent.get(memberId) ?? [];
    const siblingComponentId = explicitSiblingComponentByPersonId.get(memberId);

    if (parentIds.length > 0) {
      const familySignature = parentIds.join("|");
      keys.add(`parents:${familySignature}`);
      keys.add(`family:${familySignature}`);
    }
    if (childIds.length > 0) keys.add(`children:${childIds.join("|")}`);
    for (const childId of childIds) {
      const childParentIds = parentIdsByChild.get(childId) ?? [];
      if (childParentIds.length > 0) {
        keys.add(`family:${childParentIds.join("|")}`);
      }
    }
    if (siblingComponentId) keys.add(`siblings:${siblingComponentId}`);
  }

  return keys;
}

function compareTokenComponents(
  left: RowToken[],
  right: RowToken[],
  peopleById: Map<string, ApiPerson>,
) {
  const leftRank = getTokenComponentRank(left);
  const rightRank = getTokenComponentRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftBirthYear = getTokenComponentBirthYear(left, peopleById);
  const rightBirthYear = getTokenComponentBirthYear(right, peopleById);
  if (leftBirthYear !== rightBirthYear) return leftBirthYear - rightBirthYear;

  return left[0]!.anchorId.localeCompare(right[0]!.anchorId);
}

/**
 * Compute the average center-x of all known parent positions for a component.
 * Returns null when no parent has a position yet (e.g. the top generation).
 */
function getComponentAvgParentCenter(
  component: RowToken[],
  parentIdsByChild: Map<string, string[]>,
  existingPositions: Map<string, { x: number; y: number }>,
): number | null {
  let totalX = 0;
  let count = 0;
  const seenParents = new Set<string>();
  for (const token of component) {
    for (const memberId of token.memberIds) {
      const parentIds = parentIdsByChild.get(memberId) ?? [];
      for (const parentId of parentIds) {
        if (seenParents.has(parentId)) continue;
        seenParents.add(parentId);
        const pos = existingPositions.get(parentId);
        if (pos) {
          totalX += pos.x + NODE_WIDTH / 2;
          count += 1;
        }
      }
    }
  }
  return count > 0 ? totalX / count : null;
}

function getTokenComponentRank(component: RowToken[]) {
  let hasChildFamily = false;
  let hasParentFamily = false;

  for (const token of component) {
    if (token.parentSignature.startsWith("children:")) hasChildFamily = true;
    if (token.parentSignature.startsWith("parents:")) hasParentFamily = true;
  }

  if (hasChildFamily) return 0;
  if (!hasParentFamily) return 1;
  return 2;
}

function getTokenComponentBirthYear(
  component: RowToken[],
  peopleById: Map<string, ApiPerson>,
) {
  let bestYear = Number.POSITIVE_INFINITY;
  for (const token of component) {
    for (const memberId of token.memberIds) {
      bestYear = Math.min(
        bestYear,
        peopleById.get(memberId)?.birthYear ?? Number.POSITIVE_INFINITY,
      );
    }
  }
  return bestYear;
}

function compareTokenOrder(
  left: RowToken,
  right: RowToken,
  peopleById: Map<string, ApiPerson>,
) {
  const leftBirthYear = Math.min(
    ...left.memberIds.map(
      (memberId) => peopleById.get(memberId)?.birthYear ?? Number.POSITIVE_INFINITY,
    ),
  );
  const rightBirthYear = Math.min(
    ...right.memberIds.map(
      (memberId) => peopleById.get(memberId)?.birthYear ?? Number.POSITIVE_INFINITY,
    ),
  );
  if (leftBirthYear !== rightBirthYear) return leftBirthYear - rightBirthYear;
  return left.anchorId.localeCompare(right.anchorId);
}

function buildTokenComponentMembers(tokens: RowToken[]) {
  return tokens.map((token) => [...token.memberIds].sort());
}

/**
 * Placeholder – family-group spacing is now applied directly in
 * `computeLanePositions` via `familyTransitionGaps`.  This function is
 * retained only so that the call-site in `buildLaneTokens` still compiles.
 */
function addSiblingSpacing(tokens: RowToken[]) {
  return tokens;
}

function hasRelationship(
  relationships: ApiRelationship[],
  leftId: string,
  rightId: string,
  type: ApiRelationship["type"],
  predicate?: (relationship: ApiRelationship) => boolean,
) {
  return relationships.some((relationship) => {
    if (relationship.type !== type) return false;
    const isPair =
      (relationship.fromPersonId === leftId && relationship.toPersonId === rightId) ||
      (relationship.fromPersonId === rightId && relationship.toPersonId === leftId);
    return isPair && (predicate ? predicate(relationship) : true);
  });
}

function resolveLaneCollisions(
  relationships: ApiRelationship[],
  activeSpousesByPersonId: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  componentMembersByPersonId: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
) {
  const componentKeysByLane = new Map<number, string[]>();

  for (const [personId, position] of positions.entries()) {
    const componentMembers = componentMembersByPersonId.get(personId) ?? [personId];
    const componentKey = [...componentMembers].sort().join("|");
    const laneKeys = componentKeysByLane.get(position.y) ?? [];
    if (!laneKeys.includes(componentKey)) {
      laneKeys.push(componentKey);
      componentKeysByLane.set(position.y, laneKeys);
    }
  }

  for (const componentKeys of componentKeysByLane.values()) {
    const orderedComponents = componentKeys
      .map((componentKey) => {
        const memberIds = componentKey.split("|").filter(Boolean);
        const centers = memberIds
          .map((memberId) => getNodeCenter(memberId, positions))
          .filter((value): value is { x: number; y: number } => Boolean(value));
        if (centers.length === 0) return null;
        return {
          key: componentKey,
          anchorId: memberIds[0]!,
          minCenterX: Math.min(...centers.map((center) => center.x)),
          maxCenterX: Math.max(...centers.map((center) => center.x)),
          centerX: average(centers.map((center) => center.x)),
        };
      })
      .filter(
        (
          component,
        ): component is {
          key: string;
          anchorId: string;
          minCenterX: number;
          maxCenterX: number;
          centerX: number;
        } => Boolean(component),
      )
      .sort((left, right) => left.minCenterX - right.minCenterX);

    for (let index = 1; index < orderedComponents.length; index += 1) {
      const left = orderedComponents[index - 1]!;
      const right = orderedComponents[index]!;
      const currentGap = right.minCenterX - left.maxCenterX;
      if (currentGap >= MIN_LANE_GAP) continue;

      const gapDelta = MIN_LANE_GAP - currentGap;
      shiftCluster(
        right.anchorId,
        gapDelta,
        activeSpousesByPersonId,
        attachedAnchorByPersonId,
        componentMembersByPersonId,
        positions,
      );

      right.minCenterX += gapDelta;
      right.maxCenterX += gapDelta;
      right.centerX += gapDelta;
      for (let innerIndex = index + 1; innerIndex < orderedComponents.length; innerIndex += 1) {
        const later = orderedComponents[innerIndex]!;
        if (later.minCenterX - right.maxCenterX >= MIN_LANE_GAP) break;
      }
    }
  }
}

function alignParentsOverChildren(
  relationships: ApiRelationship[],
  activeSpousesByPersonId: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  componentMembersByPersonId: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  parentCountMode: "all" | "single-only" = "all",
) {
  const parentIdsByChild = buildParentIdsByChild(relationships);
  const childGroups = new Map<string, string[]>();

  for (const [childId, parentIds] of parentIdsByChild.entries()) {
    const signature = parentIds.join("|");
    const group = childGroups.get(signature) ?? [];
    group.push(childId);
    childGroups.set(signature, group);
  }

  for (let pass = 0; pass < Math.max(6, childGroups.size * 2); pass += 1) {
    let changed = false;
    for (const [signature, childIds] of childGroups.entries()) {
      const parentIds = signature.split("|").filter(Boolean);
      if (parentCountMode === "single-only" && parentIds.length !== 1) continue;
      const childCenters = childIds
        .map((childId) => getNodeCenter(childId, positions))
        .filter((value): value is { x: number; y: number } => Boolean(value));
      const parentCenters = parentIds
        .map((parentId) => getNodeCenter(parentId, positions))
        .filter((value): value is { x: number; y: number } => Boolean(value));
      if (childCenters.length === 0 || parentCenters.length === 0) continue;

      const targetCenterX = average(childCenters.map((entry) => entry.x));

      if (parentIds.length === 1) {
        const delta = targetCenterX - parentCenters[0]!.x;
        if (Math.abs(delta) >= 1) {
          changed = true;
        }
        shiftCluster(
          parentIds[0]!,
          delta,
          activeSpousesByPersonId,
          attachedAnchorByPersonId,
          componentMembersByPersonId,
          positions,
        );
        clearLaneOverlapAround(
          parentIds[0]!,
          activeSpousesByPersonId,
          attachedAnchorByPersonId,
          componentMembersByPersonId,
          positions,
          undefined,
          delta,
        );
        continue;
      }

      const currentParentCenterX = average(parentCenters.map((entry) => entry.x));
      const delta = targetCenterX - currentParentCenterX;
      if (Math.abs(delta) >= 1) {
        changed = true;
      }

      const shiftedComponentKeys = new Set<string>();
      for (const parentId of parentIds) {
        const componentKey = (componentMembersByPersonId.get(parentId) ?? [parentId])
          .slice()
          .sort()
          .join("|");
        if (shiftedComponentKeys.has(componentKey)) continue;
        shiftedComponentKeys.add(componentKey);
        shiftCluster(
          parentId,
          delta,
          activeSpousesByPersonId,
          attachedAnchorByPersonId,
          componentMembersByPersonId,
          positions,
        );
      }

      // Clear overlaps once per parent group, treating all parents as a unit
      const firstParentId = parentIds[0]!;
      const otherParentIds = parentIds.slice(1);
      clearLaneOverlapAround(
        firstParentId,
        activeSpousesByPersonId,
        attachedAnchorByPersonId,
        componentMembersByPersonId,
        positions,
        otherParentIds,
        delta,
      );
    }
    if (!changed) break;
  }
}

function clearLaneOverlapAround(
  personId: string,
  activeSpousesByPersonId: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  componentMembersByPersonId: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  extraAnchorIds?: string[],
  movementDelta?: number,
) {
  const anchorPosition = positions.get(personId);
  if (!anchorPosition) return;

  const anchorMembers = new Set(componentMembersByPersonId.get(personId) ?? [personId]);
  if (extraAnchorIds) {
    for (const extraId of extraAnchorIds) {
      anchorMembers.add(extraId);
      for (const memberId of componentMembersByPersonId.get(extraId) ?? [extraId]) {
        anchorMembers.add(memberId);
      }
    }
  }

  // Compute full extent of the anchor group
  let anchorMinX = anchorPosition.x;
  let anchorMaxX = anchorPosition.x;
  for (const memberId of anchorMembers) {
    const memberPos = positions.get(memberId);
    if (memberPos && memberPos.y === anchorPosition.y) {
      anchorMinX = Math.min(anchorMinX, memberPos.x);
      anchorMaxX = Math.max(anchorMaxX, memberPos.x);
    }
  }

  const sameLaneEntries = [...positions.entries()]
    .filter(
      ([otherId, otherPosition]) =>
        otherPosition.y === anchorPosition.y && !anchorMembers.has(otherId),
    )
    .sort(([, left], [, right]) => left.x - right.x);

  // Push components that ended up inside the anchor group's extent to the
  // appropriate side based on the movement direction.
  if (movementDelta && Math.abs(movementDelta) > 1) {
    const interiorProcessedKeys = new Set<string>();
    for (const [otherId, otherPosition] of sameLaneEntries) {
      // Component is "interior" if it's between anchorMinX and anchorMaxX
      if (otherPosition.x <= anchorMinX || otherPosition.x >= anchorMaxX) continue;
      const otherKey = (componentMembersByPersonId.get(otherId) ?? [otherId])
        .slice().sort().join("|");
      if (interiorProcessedKeys.has(otherKey)) continue;
      interiorProcessedKeys.add(otherKey);
      if (movementDelta < 0) {
        // Anchor moved left: push interior component to left of anchor
        const pushDelta = anchorMinX - MIN_LANE_GAP - otherPosition.x;
        shiftCluster(
          otherId, pushDelta,
          activeSpousesByPersonId, attachedAnchorByPersonId,
          componentMembersByPersonId, positions,
        );
      } else {
        // Anchor moved right: push interior component to right of anchor
        const pushDelta = anchorMaxX + MIN_LANE_GAP - otherPosition.x;
        shiftCluster(
          otherId, pushDelta,
          activeSpousesByPersonId, attachedAnchorByPersonId,
          componentMembersByPersonId, positions,
        );
      }
    }
  }

  // Re-read sameLaneEntries after interior push
  const updatedSameLaneEntries = [...positions.entries()]
    .filter(
      ([otherId, otherPosition]) =>
        otherPosition.y === anchorPosition.y && !anchorMembers.has(otherId),
    )
    .sort(([, left], [, right]) => left.x - right.x);

  for (let index = updatedSameLaneEntries.length - 1; index >= 0; index -= 1) {
    const [otherId, otherPosition] = updatedSameLaneEntries[index]!;
    if (otherPosition.x >= anchorMinX) continue;
    const gap = anchorMinX - otherPosition.x;
    if (gap >= MIN_LANE_GAP) break;
    shiftCluster(
      otherId,
      -(MIN_LANE_GAP - gap),
      activeSpousesByPersonId,
      attachedAnchorByPersonId,
      componentMembersByPersonId,
      positions,
    );
  }

  for (const [otherId, otherPosition] of updatedSameLaneEntries) {
    if (otherPosition.x <= anchorMaxX) continue;
    const gap = otherPosition.x - anchorMaxX;
    if (gap >= MIN_LANE_GAP) break;
    shiftCluster(
      otherId,
      MIN_LANE_GAP - gap,
      activeSpousesByPersonId,
      attachedAnchorByPersonId,
      componentMembersByPersonId,
      positions,
    );
  }
}

function shiftCluster(
  personId: string,
  deltaX: number,
  activeSpousesByPersonId: Map<string, string[]>,
  attachedAnchorByPersonId: Map<string, string>,
  componentMembersByPersonId: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
) {
  if (Math.abs(deltaX) < 1) return;
  const movedIds = new Set(componentMembersByPersonId.get(personId) ?? [personId]);

  for (const memberId of movedIds) {
    const person = positions.get(memberId);
    if (person) {
      positions.set(memberId, { ...person, x: person.x + deltaX });
    }
  }

  for (const memberId of [...movedIds]) {
    for (const [attachedId, anchorId] of attachedAnchorByPersonId.entries()) {
      if (anchorId !== memberId || movedIds.has(attachedId)) continue;
      const attached = positions.get(attachedId);
      if (!attached) continue;
      positions.set(attachedId, { ...attached, x: attached.x + deltaX });
      movedIds.add(attachedId);
    }
  }

  for (const memberId of [...movedIds]) {
    const spouseIds = activeSpousesByPersonId.get(memberId) ?? [];
    for (const spouseId of spouseIds) {
      if (movedIds.has(spouseId)) continue;
      if (attachedAnchorByPersonId.get(spouseId) === memberId) continue;
      if (attachedAnchorByPersonId.has(memberId)) continue;
      const spouse = positions.get(spouseId);
      if (!spouse) continue;
      positions.set(spouseId, { ...spouse, x: spouse.x + deltaX });
      movedIds.add(spouseId);
    }
  }
}

function buildGenerationLanes(
  people: ApiPerson[],
  relationships: ApiRelationship[],
  parentChildRelationships: ApiRelationship[],
  explicitSiblingComponents: ExplicitSiblingComponent[],
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

  for (const component of explicitSiblingComponents) {
    const componentLane = Math.max(
      ...component.memberIds.map((memberId) => laneByPersonId.get(memberId) ?? 0),
    );
    for (const memberId of component.memberIds) {
      laneByPersonId.set(memberId, componentLane);
    }
  }

  const degreeByPersonId = new Map<string, number>(
    personIds.map((personId) => [personId, 0]),
  );
  for (const relationship of relationships) {
    degreeByPersonId.set(
      relationship.fromPersonId,
      (degreeByPersonId.get(relationship.fromPersonId) ?? 0) + 1,
    );
    degreeByPersonId.set(
      relationship.toPersonId,
      (degreeByPersonId.get(relationship.toPersonId) ?? 0) + 1,
    );
  }
  for (const component of explicitSiblingComponents) {
    for (const memberId of component.memberIds) {
      degreeByPersonId.set(memberId, (degreeByPersonId.get(memberId) ?? 0) + 1);
    }
  }

  for (const personId of personIds) {
    if ((degreeByPersonId.get(personId) ?? 0) === 0) {
      laneByPersonId.set(personId, -1);
    }
  }

  return laneByPersonId;
}

/** Build ReactFlow person nodes */
export function computeDecadeRelevance(
  person: ApiPerson,
  activeDecade: number | null,
  generationDecades: Map<string, number> = new Map(),
): number | null {
  if (activeDecade === null) return null;

  if (person.birthYear != null) {
    const birthDecade = Math.floor(person.birthYear / 10) * 10;
    const deathDecade = person.deathYear != null ? Math.floor(person.deathYear / 10) * 10 : null;
    const aliveEnd = deathDecade ?? 2030;

    if (activeDecade >= birthDecade && activeDecade <= aliveEnd) {
      if (activeDecade === birthDecade) return 1;
      const distance = (activeDecade - birthDecade) / 10;
      return Math.max(0.45, 1 - distance * 0.15);
    }

    const distance = activeDecade < birthDecade
      ? (birthDecade - activeDecade) / 10
      : (activeDecade - aliveEnd) / 10;
    return Math.max(0, 1 - distance * 0.35);
  }

  const guessedDecade = generationDecades.get(person.id);
  if (guessedDecade != null) {
    const diff = (activeDecade - guessedDecade) / 10;
    return Math.max(0.3, 1 - Math.abs(diff) * 0.2);
  }

  return 0.35;
}

export function getAvailableDecades(people: ApiPerson[]): number[] {
  const decades = new Set<number>();
  const currentYear = new Date().getFullYear();
  const currentDecade = Math.floor(currentYear / 10) * 10;

  for (const person of people) {
    if (person.birthYear != null) {
      decades.add(Math.floor(person.birthYear / 10) * 10);
    }
    if (person.deathYear != null) {
      decades.add(Math.floor(person.deathYear / 10) * 10);
    }
  }

  if (decades.size === 0) {
    const earliest = currentDecade - 80;
    for (let d = earliest; d <= currentDecade; d += 10) {
      decades.add(d);
    }
  }

  decades.add(currentDecade);

  const sorted = [...decades].sort((a, b) => a - b);
  const full: number[] = [];
  for (let d = sorted[0]!; d <= sorted[sorted.length - 1]!; d += 10) {
    full.push(d);
  }
  return full;
}

export function inferGenerationDecades(
  people: ApiPerson[],
  positions: Map<string, { x: number; y: number }>,
): Map<string, number> {
  const result = new Map<string, number>();

  type GenInfo = { ySum: number; count: number; decadeSum: number; decadeCount: number };
  const generationBuckets = new Map<number, GenInfo>();
  const Y_TOLERANCE = 40;

  for (const person of people) {
    const pos = positions.get(person.id);
    if (!pos) continue;

    let matched = false;
    for (const [bucketY, info] of generationBuckets) {
      if (Math.abs(pos.y - bucketY) <= Y_TOLERANCE) {
        info.ySum += pos.y;
        info.count += 1;
        if (person.birthYear != null) {
          info.decadeSum += Math.floor(person.birthYear / 10) * 10;
          info.decadeCount += 1;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      const info: GenInfo = { ySum: pos.y, count: 1, decadeSum: 0, decadeCount: 0 };
      if (person.birthYear != null) {
        info.decadeSum = Math.floor(person.birthYear / 10) * 10;
        info.decadeCount = 1;
      }
      generationBuckets.set(pos.y, info);
    }
  }

  const sortedBuckets = [...generationBuckets.entries()].sort((a, b) => a[0] - b[0]);

  const bucketDecades: Map<number, number> = new Map();
  const knownDecades = sortedBuckets
    .filter(([, info]) => info.decadeCount > 0)
    .map(([bucketY, info]) => ({ bucketY, avgDecade: info.decadeSum / info.decadeCount }));

  if (knownDecades.length >= 2) {
    const firstY = knownDecades[0]!.bucketY;
    const firstD = knownDecades[0]!.avgDecade;
    const lastY = knownDecades[knownDecades.length - 1]!.bucketY;
    const lastD = knownDecades[knownDecades.length - 1]!.avgDecade;

    for (const [bucketY] of sortedBuckets) {
      if (bucketY <= firstY) {
        bucketDecades.set(bucketY, firstD);
      } else if (bucketY >= lastY) {
        bucketDecades.set(bucketY, lastD);
      } else {
        const fraction = (bucketY - firstY) / (lastY - firstY);
        bucketDecades.set(bucketY, firstD + fraction * (lastD - firstD));
      }
    }
  } else if (knownDecades.length === 1) {
    const singleDec = knownDecades[0]!.avgDecade;
    for (const [bucketY] of sortedBuckets) {
      bucketDecades.set(bucketY, singleDec + (bucketY - knownDecades[0]!.bucketY) / 240 * 30);
    }
  } else {
    const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
    const topY = sortedBuckets.length > 0 ? sortedBuckets[0]![0] : 0;
    for (const [bucketY] of sortedBuckets) {
      const gensDown = Math.round((bucketY - topY) / 240);
      bucketDecades.set(bucketY, currentDecade - gensDown * 30);
    }
  }

  for (const person of people) {
    if (person.birthYear != null) continue;
    const pos = positions.get(person.id);
    if (!pos) continue;

    for (const [bucketY] of sortedBuckets) {
      if (Math.abs(pos.y - bucketY) <= Y_TOLERANCE) {
        const decade = bucketDecades.get(bucketY);
        if (decade != null) {
          result.set(person.id, Math.round(decade / 10) * 10);
        }
        break;
      }
    }
  }

  return result;
}

export function buildPersonNodes(
  people: ApiPerson[],
  positions: Map<string, { x: number; y: number }>,
  selectedPersonId: string | null,
  currentUserId: string | null,
  focusPersonIds: Set<string> | null = null,
  activeDecade: number | null = null,
): PersonFlowNode[] {
  const generationDecades = activeDecade != null
    ? inferGenerationDecades(people, positions)
    : new Map<string, number>();

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
        birthDateText: person.birthDateText ?? null,
        deathDateText: person.deathDateText ?? null,
        portraitUrl: person.portraitUrl,
        essenceLine: person.essenceLine,
        isYou: person.id === currentUserId,
        isFocused: person.id === selectedPersonId,
        isDimmed: focusPersonIds ? !focusPersonIds.has(person.id) : false,
        decadeRelevance: computeDecadeRelevance(person, activeDecade, generationDecades),
        lastName: person.lastName ?? null,
        maidenName: person.maidenName ?? null,
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
  people: ApiPerson[] = [],
  activeDecade: number | null = null,
): TreeEdge[] {
  const personRelevance = new Map<string, number | null>();
  for (const p of people) {
    personRelevance.set(p.id, computeDecadeRelevance(p, activeDecade));
  }
  const explicitSiblingComponents = buildExplicitSiblingComponentsForPersonIds(
    [...positions.keys()],
    relationships,
  );
  const derivedSiblingParentState = buildDerivedSiblingParentState(
    [...positions.keys()],
    relationships,
    explicitSiblingComponents,
  );
  const parentIdsByChild = derivedSiblingParentState.parentIdsByChild;
  const siblingPairsCoveredByPlaceholderGroups = new Set<string>();
  for (const component of explicitSiblingComponents) {
    const actualParentIds = [
      ...new Set(
        component.memberIds.flatMap((memberId) => parentIdsByChild.get(memberId) ?? []),
      ),
    ];
    for (let index = 0; index < component.memberIds.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < component.memberIds.length; innerIndex += 1) {
        const [leftId, rightId] = sortedPair(
          component.memberIds[index]!,
          component.memberIds[innerIndex]!,
        );
        if (actualParentIds.length > 0) {
          siblingPairsCoveredByPlaceholderGroups.add(`${leftId}|${rightId}`);
          continue;
        }
        siblingPairsCoveredByPlaceholderGroups.add(`${leftId}|${rightId}`);
      }
    }
  }

  const visualRelationships: Array<
    ApiRelationship & { visualId?: string; inferred?: boolean }
  > = [
    ...relationships,
    ...derivedSiblingParentState.inferredParentChildLinks.map((link) => ({
      id: `inferred-parent-child:${link.fromPersonId}:${link.toPersonId}`,
      fromPersonId: link.fromPersonId,
      toPersonId: link.toPersonId,
      type: "parent_child" as const,
      visualId: `inferred-parent-child:${link.fromPersonId}:${link.toPersonId}`,
      inferred: true,
    })),
  ];

  // Pre-compute per-parent-couple stagger index so that different families'
  // horizontal branch bars render at different Y heights.  This prevents
  // visually merging bars when two families share the same generation row.
  const familyBarStagger = new Map<string, number>();
  {
    const familyUnionEntries: Array<{ key: string; avgX: number }> = [];
    const seenFamilies = new Set<string>();
    for (const r of visualRelationships) {
      if (r.type !== "parent_child") continue;
      const pids = [...(parentIdsByChild.get(r.toPersonId) ?? [])].sort();
      if (pids.length !== 2) continue;
      const key = pids.join("|");
      if (seenFamilies.has(key)) continue;
      seenFamilies.add(key);
      const anchors = pids
        .map((pid) => getPortraitBottomAnchor(pid, positions))
        .filter((v): v is { x: number; y: number } => Boolean(v));
      if (anchors.length < 2) continue;
      const avgX = anchors.reduce((s, a) => s + a.x, 0) / anchors.length;
      familyUnionEntries.push({ key, avgX });
    }
    familyUnionEntries.sort((a, b) => a.avgX - b.avgX);
    familyUnionEntries.forEach((entry, idx) => familyBarStagger.set(entry.key, idx));
  }

  return visualRelationships.flatMap((r) => {
    const isLocal = focusPersonIds
      ? focusPersonIds.has(r.fromPersonId) && focusPersonIds.has(r.toPersonId)
      : true;
    let baseOpacity = isLocal ? 0.95 : 0.1;
    if (activeDecade !== null) {
      const fromRel = personRelevance.get(r.fromPersonId) ?? null;
      const toRel = personRelevance.get(r.toPersonId) ?? null;
      const avgRel = fromRel != null && toRel != null ? (fromRel + toRel) / 2 : fromRel ?? toRel ?? 0;
      baseOpacity *= Math.max(0.15, 0.25 + 0.75 * avgRel);
    }
    if (r.type === "parent_child") {
      const parentIds = [...(parentIdsByChild.get(r.toPersonId) ?? [])].sort();
      const hasFamilyUnion = parentIds.length === 2;
      const sourceAnchor = getNodeBottomAnchor(r.fromPersonId, positions);
      const targetAnchor = getPortraitTopAnchor(r.toPersonId, positions);
      const allParentAnchors = parentIds
        .map((parentId) => getNodeBottomAnchor(parentId, positions))
        .filter((value): value is { x: number; y: number } => Boolean(value));
      const unionX =
        hasFamilyUnion && allParentAnchors.length > 0
          ? allParentAnchors.reduce((sum, anchor) => sum + anchor.x, 0) /
            allParentAnchors.length
          : sourceAnchor?.x;
      const staggerIdx = familyBarStagger.get(parentIds.join("|")) ?? 0;
      const unionY =
        hasFamilyUnion && allParentAnchors.length > 0 && targetAnchor
          ? Math.min(
              Math.max(...allParentAnchors.map((anchor) => anchor.y)) + 28 + staggerIdx * FAMILY_BAR_STAGGER,
              targetAnchor.y - 40,
            )
          : undefined;
      return [
        {
          id: `edge-${r.visualId ?? r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "constellationParent",
          data: {
            kind: "parent_child",
            renderSourceX: sourceAnchor?.x,
            renderSourceY: sourceAnchor?.y,
            renderTargetX: targetAnchor?.x,
            renderTargetY: targetAnchor?.y,
            unionX,
            unionY,
            opacity: r.inferred ? baseOpacity * 0.82 : baseOpacity,
            strokeWidth: r.inferred ? (isLocal ? 1.1 : 0.95) : isLocal ? 1.35 : 1,
            strokeDasharray: r.inferred ? "4 4" : undefined,
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
      const fromCenter = getPortraitCenter(r.fromPersonId, positions);
      const toCenter = getPortraitCenter(r.toPersonId, positions);
      const anchorOrder =
        fromCenter && toCenter && fromCenter.x <= toCenter.x
          ? {
              source: getPortraitSideAnchor(r.fromPersonId, positions, "right"),
              target: getPortraitSideAnchor(r.toPersonId, positions, "left"),
            }
          : {
              source: getPortraitSideAnchor(r.fromPersonId, positions, "left"),
              target: getPortraitSideAnchor(r.toPersonId, positions, "right"),
            };
      return [
        {
          id: `edge-${r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "constellationSpouse",
          data: {
            kind: "spouse",
            renderSourceX: anchorOrder.source?.x,
            renderSourceY: anchorOrder.source?.y,
            renderTargetX: anchorOrder.target?.x,
            renderTargetY: anchorOrder.target?.y,
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
      const [leftId, rightId] = sortedPair(r.fromPersonId, r.toPersonId);
      const suppressVisibleSiblingEdge = siblingPairsCoveredByPlaceholderGroups.has(
        `${leftId}|${rightId}`,
      );
      const fromCenter = getPortraitCenter(r.fromPersonId, positions);
      const toCenter = getPortraitCenter(r.toPersonId, positions);
      const anchorOrder =
        fromCenter && toCenter && fromCenter.x <= toCenter.x
          ? {
              source: getPortraitSideAnchor(r.fromPersonId, positions, "right"),
              target: getPortraitSideAnchor(r.toPersonId, positions, "left"),
            }
          : {
              source: getPortraitSideAnchor(r.fromPersonId, positions, "left"),
              target: getPortraitSideAnchor(r.toPersonId, positions, "right"),
            };
      return [
        {
          id: `edge-${r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "constellationSpouse",
          data: {
            kind: "sibling",
            renderSourceX: anchorOrder.source?.x,
            renderSourceY: anchorOrder.source?.y,
            renderTargetX: anchorOrder.target?.x,
            renderTargetY: anchorOrder.target?.y,
            opacity: suppressVisibleSiblingEdge ? 0 : baseOpacity * 0.8,
            strokeWidth: 1,
            strokeDasharray: "2 4",
          } satisfies ConstellationEdgeData,
          animated: false,
        } as TreeEdge,
      ];
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

export type LineageFocusMode = "full" | "birth" | "household";

export function getLineageFocusIds(
  personId: string | null,
  relationships: ApiRelationship[],
  mode: LineageFocusMode,
): Set<string> | null {
  if (!personId || mode === "full") return null;

  const personIds = [...new Set(
    relationships.flatMap((relationship) => [
      relationship.fromPersonId,
      relationship.toPersonId,
    ]),
  )];
  const explicitSiblingComponents = buildExplicitSiblingComponentsForPersonIds(
    personIds,
    relationships,
  );
  const derivedSiblingParentState = buildDerivedSiblingParentState(
    personIds,
    relationships,
    explicitSiblingComponents,
  );
  const parentIdsByChild = derivedSiblingParentState.parentIdsByChild;
  const childIdsByParent = derivedSiblingParentState.childIdsByParent;
  const activeSpousesByPersonId = buildActiveSpouseMap(relationships);
  const siblingIdsByPerson = buildSiblingIdsByPerson(relationships, childIdsByParent);

  const focus = new Set<string>();
  const birthSeeds =
    mode === "birth" ? collectSiblingCluster(personId, siblingIdsByPerson) : new Set<string>([personId]);

  if (mode === "birth") {
    birthSeeds.forEach((id) => focus.add(id));
    const ancestorIds = collectAncestors(birthSeeds, parentIdsByChild);
    ancestorIds.forEach((id) => focus.add(id));
    addSpousesForIds(birthSeeds, activeSpousesByPersonId, focus);
    addSpousesForIds(ancestorIds, activeSpousesByPersonId, focus);
    collectDescendantHouseholds(birthSeeds, childIdsByParent, activeSpousesByPersonId).forEach(
      (id) => focus.add(id),
    );
    return focus;
  }

  focus.add(personId);
  addSpousesForIds(focus, activeSpousesByPersonId);
  collectDescendantHouseholds(focus, childIdsByParent, activeSpousesByPersonId).forEach((id) =>
    focus.add(id),
  );
  return focus;
}

export function getFocusBoundsForIds(
  focusIds: Set<string> | null,
  positions: Map<string, { x: number; y: number }>,
) {
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

export function getConstellationFocusBounds(
  personId: string | null,
  relationships: ApiRelationship[],
  positions: Map<string, { x: number; y: number }>,
) {
  return getFocusBoundsForIds(getConstellationFocusIds(personId, relationships), positions);
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

  const explicitSiblingComponents = buildExplicitSiblingComponentsForPersonIds(
    [...positions.keys()],
    relationships,
  );
  const derivedSiblingParentState = buildDerivedSiblingParentState(
    [...positions.keys()],
    relationships,
    explicitSiblingComponents,
  );
  const parentIds = derivedSiblingParentState.parentIdsByChild.get(personId) ?? [];

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
  const slotSpacing = 132;
  const railY = center.y + NODE_HEIGHT / 2 + EDIT_SLOT_GAP;

  const slots: EditSlot[] = [
    {
      kind: "parent",
      label: "Add parent",
      flowX: 0,
      flowY: railY,
      disabled: parentIds.length >= 2,
      disabledTitle: "This person already has two parents",
    },
    {
      kind: "sibling",
      label: "Add sibling",
      flowX: 0,
      flowY: railY,
    },
    {
      kind: "child",
      label: spouseId ? "Add child to this family" : "Add child",
      flowX: 0,
      flowY: railY,
    },
    {
      kind: "spouse",
      label: "Add spouse",
      flowX: 0,
      flowY: railY,
      disabled: Boolean(activeSpouseRelationship),
      disabledTitle: "This person already has an active spouse",
    },
  ];

  const visibleSlots = slots.filter((slot) => !slot.disabled);
  return visibleSlots.map((slot, index) => ({
    ...slot,
    flowX:
      center.x + (index - (visibleSlots.length - 1) / 2) * slotSpacing,
  }));
}

export function buildParentPlaceholderGroups(
  people: ApiPerson[],
  relationships: ApiRelationship[],
  positions: Map<string, { x: number; y: number }>,
): ParentPlaceholderGroup[] {
  const explicitSiblingComponents = buildExplicitSiblingComponents(people, relationships);
  const derivedSiblingParentState = buildDerivedSiblingParentState(
    people.map((person) => person.id),
    relationships,
    explicitSiblingComponents,
  );
  const parentIdsByChild = derivedSiblingParentState.parentIdsByChild;
  const peopleById = new Set(people.map((person) => person.id));

  return explicitSiblingComponents.flatMap((component) => {
    const childAnchors = component.memberIds
      .map((memberId) => getPortraitTopAnchor(memberId, positions))
      .map((anchor, index) =>
        anchor
          ? {
              personId: component.memberIds[index]!,
              x: anchor.x,
              y: anchor.y,
            }
          : null,
      )
      .filter(
        (
          anchor,
        ): anchor is { personId: string; x: number; y: number } => Boolean(anchor),
      );

    if (childAnchors.length < 2) return [];

    const actualParentIds = [
      ...new Set(
        component.memberIds.flatMap((memberId) => parentIdsByChild.get(memberId) ?? []),
      ),
    ]
      .filter((parentId) => peopleById.has(parentId))
      .sort();
    const missingParentCount = Math.max(0, 2 - actualParentIds.length);
    if (missingParentCount === 0) return [];

    const actualParentAnchors = actualParentIds
      .map((parentId) => getPortraitCenter(parentId, positions))
      .map((anchor, index) =>
        anchor
          ? {
              personId: actualParentIds[index]!,
              x: anchor.x,
              y: anchor.y,
            }
          : null,
      )
      .filter(
        (
          anchor,
        ): anchor is { personId: string; x: number; y: number } => Boolean(anchor),
      );
    const childCenterX = average(childAnchors.map((anchor) => anchor.x));
    const childCenterY = average(childAnchors.map((anchor) => anchor.y + PORTRAIT_RADIUS));
    const placeholderY =
      actualParentAnchors.length > 0
        ? average(actualParentAnchors.map((anchor) => anchor.y))
        : childCenterY - GENERATION_GAP;
    const placeholderSpacing = SPOUSE_ATTACH_GAP;
    const placeholderCenters =
      actualParentAnchors.length === 1 && missingParentCount === 1
        ? [
            {
              id: `${component.id}-placeholder-0`,
              x:
                actualParentAnchors[0]!.x <= childCenterX
                  ? actualParentAnchors[0]!.x + placeholderSpacing
                  : actualParentAnchors[0]!.x - placeholderSpacing,
              y: placeholderY,
            },
          ]
        : Array.from({ length: missingParentCount }, (_, index) => ({
            id: `${component.id}-placeholder-${index}`,
            x:
              childCenterX +
              index * placeholderSpacing -
              ((missingParentCount - 1) * placeholderSpacing) / 2,
            y: placeholderY,
          }));

    return [
      {
        id: `${component.id}-placeholder-group`,
        anchorPersonId: component.memberIds[0]!,
        memberIds: component.memberIds,
        placeholderCenters,
        childAnchors,
        actualParentAnchors,
        branchY:
          actualParentAnchors.length === 0
            ? Math.min(...childAnchors.map((anchor) => anchor.y)) - 56
            : null,
      },
    ];
  });
}

function buildExplicitSiblingComponents(
  people: ApiPerson[],
  relationships: ApiRelationship[],
): ExplicitSiblingComponent[] {
  return buildExplicitSiblingComponentsForPersonIds(
    people.map((person) => person.id),
    relationships,
  );
}

function buildExplicitSiblingComponentsForPersonIds(
  personIds: string[],
  relationships: ApiRelationship[],
): ExplicitSiblingComponent[] {
  const personIdSet = new Set(personIds);
  const parentByPersonId = new Map<string, string>();

  function find(personId: string): string {
    const current = parentByPersonId.get(personId);
    if (!current || current === personId) {
      parentByPersonId.set(personId, personId);
      return personId;
    }
    const root = find(current);
    parentByPersonId.set(personId, root);
    return root;
  }

  function union(leftId: string, rightId: string) {
    const leftRoot = find(leftId);
    const rightRoot = find(rightId);
    if (leftRoot === rightRoot) return;
    if (leftRoot < rightRoot) {
      parentByPersonId.set(rightRoot, leftRoot);
    } else {
      parentByPersonId.set(leftRoot, rightRoot);
    }
  }

  for (const relationship of relationships) {
    if (
      relationship.type !== "sibling" ||
      !personIdSet.has(relationship.fromPersonId) ||
      !personIdSet.has(relationship.toPersonId)
    ) {
      continue;
    }
    union(relationship.fromPersonId, relationship.toPersonId);
  }

  const membersByRoot = new Map<string, string[]>();
  for (const personId of personIdSet) {
    if (!parentByPersonId.has(personId)) continue;
    const rootId = find(personId);
    const members = membersByRoot.get(rootId) ?? [];
    members.push(personId);
    membersByRoot.set(rootId, members);
  }

  return [...membersByRoot.entries()]
    .map(([rootId, memberIds]) => ({
      id: `sibling-group:${rootId}`,
      memberIds: [...new Set(memberIds)].sort(),
    }))
    .filter((component) => component.memberIds.length > 1)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildSiblingIdsByPerson(
  relationships: ApiRelationship[],
  childIdsByParent: Map<string, string[]>,
) {
  const siblingIdsByPerson = new Map<string, Set<string>>();

  const connect = (leftId: string, rightId: string) => {
    if (leftId === rightId) return;
    const left = siblingIdsByPerson.get(leftId) ?? new Set<string>();
    left.add(rightId);
    siblingIdsByPerson.set(leftId, left);

    const right = siblingIdsByPerson.get(rightId) ?? new Set<string>();
    right.add(leftId);
    siblingIdsByPerson.set(rightId, right);
  };

  for (const relationship of relationships) {
    if (relationship.type !== "sibling") continue;
    connect(relationship.fromPersonId, relationship.toPersonId);
  }

  for (const childIds of childIdsByParent.values()) {
    for (let index = 0; index < childIds.length; index += 1) {
      for (let innerIndex = index + 1; innerIndex < childIds.length; innerIndex += 1) {
        connect(childIds[index]!, childIds[innerIndex]!);
      }
    }
  }

  return siblingIdsByPerson;
}

function collectSiblingCluster(
  personId: string,
  siblingIdsByPerson: Map<string, Set<string>>,
) {
  const cluster = new Set<string>([personId]);
  const queue = [personId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const siblingId of siblingIdsByPerson.get(current) ?? []) {
      if (cluster.has(siblingId)) continue;
      cluster.add(siblingId);
      queue.push(siblingId);
    }
  }

  return cluster;
}

function collectAncestors(
  seedIds: Set<string>,
  parentIdsByChild: Map<string, string[]>,
) {
  const ancestors = new Set<string>();
  const queue = [...seedIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const parentId of parentIdsByChild.get(current) ?? []) {
      if (ancestors.has(parentId) || seedIds.has(parentId)) continue;
      ancestors.add(parentId);
      queue.push(parentId);
    }
  }

  return ancestors;
}

function addSpousesForIds(
  seedIds: Set<string>,
  activeSpousesByPersonId: Map<string, string[]>,
  output: Set<string> = seedIds,
) {
  const queue = [...seedIds];
  const visited = new Set<string>(seedIds);

  while (queue.length > 0) {
    const personId = queue.shift();
    if (!personId) continue;
    for (const spouseId of activeSpousesByPersonId.get(personId) ?? []) {
      if (!output.has(spouseId)) {
        output.add(spouseId);
      }
      if (visited.has(spouseId)) continue;
      visited.add(spouseId);
      queue.push(spouseId);
    }
  }

  for (const personId of seedIds) {
    if (!output.has(personId)) {
      output.add(personId);
    }
  }
}

function collectDescendantHouseholds(
  seedIds: Set<string>,
  childIdsByParent: Map<string, string[]>,
  activeSpousesByPersonId: Map<string, string[]>,
) {
  const descendants = new Set<string>();
  const queue = [...seedIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    for (const childId of childIdsByParent.get(current) ?? []) {
      if (!seedIds.has(childId) && !descendants.has(childId)) {
        descendants.add(childId);
        queue.push(childId);
      }
      for (const spouseId of activeSpousesByPersonId.get(childId) ?? []) {
        if (!seedIds.has(spouseId) && !descendants.has(spouseId)) {
          descendants.add(spouseId);
          queue.push(spouseId);
        }
      }
    }
  }

  return descendants;
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

export interface FamilyCluster {
  id: string;
  familyName: string | null;
  memberIds: string[];
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  size: number;
}

export function computeClusterCentroids(
  people: ApiPerson[],
  relationships: ApiRelationship[],
  positions: Map<string, { x: number; y: number }>
): FamilyCluster[] {
  if (people.length === 0) return [];

  const parent = new Map<string, string>();
  function find(id: string): string {
    let root = id;
    let current = parent.get(root);
    while (current != null && current !== root) {
      root = current;
      current = parent.get(root);
    }
    return root;
  }
  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }

  for (const r of relationships) {
    if (r.type === "parent_child") {
      union(r.fromPersonId, r.toPersonId);
    }
    if (r.type === "spouse") {
      union(r.fromPersonId, r.toPersonId);
    }
  }

  const clusterMap = new Map<string, { ids: string[]; name: string | null }>();
  for (const person of people) {
    const root = find(person.id);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, { ids: [], name: null });
    }
    const cluster = clusterMap.get(root)!;
    cluster.ids.push(person.id);
    if (!cluster.name) {
      const name = person.lastName?.trim() || person.maidenName?.trim();
      if (name) cluster.name = name;
    }
  }

  const result: FamilyCluster[] = [];
  let clusterIndex = 0;
  for (const [, cluster] of clusterMap) {
    if (cluster.ids.length < 2) continue;

    const coords = cluster.ids
      .map((id) => positions.get(id))
      .filter((p): p is { x: number; y: number } => p != null);

    if (coords.length < 2) continue;

    const minX = Math.min(...coords.map((c) => c.x));
    const maxX = Math.max(...coords.map((c) => c.x));
    const minY = Math.min(...coords.map((c) => c.y));
    const maxY = Math.max(...coords.map((c) => c.y));

    const padding = 80;
    result.push({
      id: `cluster-${clusterIndex++}`,
      familyName: cluster.name,
      memberIds: cluster.ids,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
      size: cluster.ids.length,
    });
  }

  return result;
}

export {
  NODE_WIDTH,
  NODE_HEIGHT,
  PORTRAIT_SIZE,
  GENERATION_GAP,
  ROW_GAP,
  SPOUSE_ATTACH_GAP,
  MIN_LANE_GAP,
  EDIT_SLOT_GAP,
};
