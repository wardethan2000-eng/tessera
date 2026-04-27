import type { ApiMemory, ApiMemoryMediaItem, ApiPerson } from "../tree/treeTypes";
import type { DriftFilter } from "../tree/DriftMode";

export type DetectedKind = "image" | "video" | "audio" | "link" | "text";

export interface CorkboardMemory {
  id: string;
  memory: ApiMemory;
  person: ApiPerson;
  primaryMedia: ApiMemoryMediaItem | null;
  allMedia: ApiMemoryMediaItem[];
  kind: DetectedKind;
}

export interface PinPosition {
  id: string;
  memoryId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  width: number;
  height: number;
  isStartPin: boolean;
}

export type ThreadType = "temporal" | "person" | "branch";

export interface ThreadConnection {
  id: string;
  from: string;
  to: string;
  type: ThreadType;
  strength: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export type ThreadVisibility = {
  temporal: boolean;
  person: boolean;
  branch: boolean;
};

export interface CorkboardDriftProps {
  treeId: string;
  people: ApiPerson[];
  onClose: () => void;
  onPersonDetail: (personId: string) => void;
  apiBase: string;
  initialFilter?: DriftFilter | null;
}

export type { DriftFilter };