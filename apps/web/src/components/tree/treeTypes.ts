import type { Node, Edge } from "@xyflow/react";

export type PersonNodeData = {
  personId: string;
  name: string;
  birthYear?: number | null;
  deathYear?: number | null;
  portraitUrl?: string | null;
  essenceLine?: string | null;
  isYou: boolean;
  /** True when this person's cinematic overlay is open */
  isFocused: boolean;
};

export type PersonFlowNode = Node<PersonNodeData, "person">;
export type TreeFlowNode = PersonFlowNode;

/** @deprecated use PersonFlowNode */
export type PersonNode = PersonFlowNode;
/** @deprecated use PersonFlowNode */
export type TreeNode = PersonFlowNode;

export type TreeEdge = Edge;

/** Raw API person as returned by the API */
export interface ApiPerson {
  id: string;
  name: string;
  birthYear?: number | null;
  deathYear?: number | null;
  essenceLine?: string | null;
  portraitMediaId?: string | null;
  portraitUrl?: string | null;
  linkedUserId?: string | null;
}

export interface ApiRelationship {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  type: "parent_child" | "sibling" | "spouse";
}

export interface ApiMemory {
  id: string;
  primaryPersonId: string;
  contributorUserId?: string | null;
  kind: "photo" | "story";
  title: string;
  body?: string | null;
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  /** Convenience: set by the fetching component to the owning person's id */
  personId?: string;
}
