import Dagre from "@dagrejs/dagre";
import type {
  ApiPerson,
  ApiRelationship,
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

/** Build dagre layout from people + parent_child relationships */
export function computeLayout(
  people: ApiPerson[],
  relationships: ApiRelationship[]
): Map<string, { x: number; y: number }> {
  const g = new Dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    ranksep: 220,
    nodesep: 140,
    marginx: 80,
    marginy: 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const p of people) {
    g.setNode(p.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const r of relationships) {
    if (r.type === "parent_child") {
      g.setEdge(r.fromPersonId, r.toPersonId);
    }
  }

  Dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId);
    if (node) {
      positions.set(nodeId, {
        x: node.x - NODE_WIDTH / 2,
        y: node.y - NODE_HEIGHT / 2,
      });
    }
  }
  return positions;
}

/** Build ReactFlow person nodes */
export function buildPersonNodes(
  people: ApiPerson[],
  positions: Map<string, { x: number; y: number }>,
  selectedPersonId: string | null,
  currentUserId: string | null
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
      },
      draggable: false,
    };
  });
}

/** Build visual ReactFlow edges */
export function buildEdges(relationships: ApiRelationship[]): TreeEdge[] {
  return relationships.flatMap((r) => {
    if (r.type === "parent_child") {
      return [
        {
          id: `edge-${r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "smoothstep",
          style: { stroke: "var(--rule)", strokeWidth: 1.5 },
          animated: false,
        } as TreeEdge,
      ];
    }
    if (r.type === "spouse") {
      return [
        {
          id: `edge-${r.id}`,
          source: r.fromPersonId,
          target: r.toPersonId,
          type: "straight",
          style: {
            stroke: "var(--rule)",
            strokeWidth: 1,
            strokeDasharray: "4 4",
          },
          animated: false,
        } as TreeEdge,
      ];
    }
    return [];
  });
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
