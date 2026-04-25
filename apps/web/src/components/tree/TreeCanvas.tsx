"use client";
import { getApiBase } from "@/lib/api-base";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  ReactFlowProvider,
  ReactFlow as ReactFlowBase,
  type EdgeProps,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React from "react";

import { PersonNode as PersonNodeComponent } from "./PersonNode";
import { CinematicPersonOverlay } from "./CinematicPersonOverlay";
import { PersonBanner } from "./PersonBanner";
import { DecadeRail } from "./DecadeRail";
import { FamilySelector } from "./FamilySelector";
import { GearIcon, InboxIcon } from "./SurfaceToolbarIcons";
import { useMomentumCamera } from "./useMomentumCamera";
import type {
  ApiPerson,
  ConstellationEdgeData,
  ApiRelationship,
  PersonFlowNode,
  TreeFlowNode,
  TreeEdge,
} from "./treeTypes";
import {
  computeLayout,
  buildPersonNodes,
  buildEdges,
  buildEditSlots,
  buildParentPlaceholderGroups,
  getFocusBoundsForIds,
  getConstellationFocusBounds,
  getConstellationFocusIds,
  getLineageFocusIds,
  getAvailableDecades,
  inferGenerationDecades,
  computeClusterCentroids,
  type LineageFocusMode,
} from "./treeLayout";

// Cast to avoid React 19 JSX type incompatibility with @xyflow/react's React 18 types
const ReactFlow = ReactFlowBase as unknown as React.ComponentType<ReactFlowProps<TreeFlowNode, TreeEdge>>;

const NODE_TYPES = {
  person: PersonNodeComponent,
};

const EDGE_TYPES = {
  constellationParent: ParentChildEdge,
  constellationSpouse: SpouseEdge,
};

const CONTROL_SURFACE = "rgba(246,241,231,0.82)";
const CONTROL_BORDER = "rgba(177,165,145,0.48)";
const CANVAS_TOP_PADDING = 68;
const PERSON_BANNER_WIDTH = 320;
const CANVAS_BACKGROUND =
  "radial-gradient(circle at 20% 18%, rgba(255,255,255,0.72), transparent 32%), radial-gradient(circle at 82% 20%, rgba(226,214,194,0.38), transparent 28%), linear-gradient(180deg, #f7f2e9 0%, #f1eadf 100%)";

interface HoverState {
  personId: string;
  screenX: number;
  screenY: number;
}

interface TreeCanvasProps {
  treeId: string;
  treeName: string;
  people: ApiPerson[];
  relationships: ApiRelationship[];
  currentUserPersonId: string | null;
  initialSelectedPersonId?: string | null;
  onDriftClick: () => void;
  onPersonDetailClick: (personId: string) => void;
  onAddMemoryClick?: () => void;
  onRequestMemoryClick?: () => void;
  onSearchClick?: () => void;
  onConstellationChanged?: () => Promise<void> | void;
  onSelectedPersonChange?: (personId: string | null) => void;
}

type EditRelationKind = "parent" | "child" | "sibling" | "spouse";

interface PendingRelation {
  anchorPersonId: string;
  kind: EditRelationKind;
}

interface CreatePersonFormState {
  displayName: string;
  essenceLine: string;
  birthDateText: string;
  deathDateText: string;
  isLiving: boolean;
  relationshipStartDateText: string;
}

type RelationTargetMode = "new" | "existing";

type EditInteractionState =
  | { mode: "idle" }
  | { mode: "node-selected"; personId: string }
  | { mode: "create-link-modal"; personId: string; relationKind: EditRelationKind }
  | { mode: "edge-editing"; relationshipId: string };

function TreeCanvasInner({
  treeId,
  treeName,
  people,
  relationships,
  currentUserPersonId,
  initialSelectedPersonId,
  onDriftClick,
  onPersonDetailClick,
  onAddMemoryClick,
  onRequestMemoryClick,
  onSearchClick,
  onConstellationChanged,
  onSelectedPersonChange,
}: TreeCanvasProps) {
  const API = getApiBase();
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const momentumCamera = useMomentumCamera(reactFlow);
  const [nodes, setNodes, onNodesChange] = useNodesState<TreeFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TreeEdge>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [lineageMode, setLineageMode] = useState<LineageFocusMode>("full");
  const [activeDecade, setActiveDecade] = useState<number | null>(null);
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const [editInteraction, setEditInteraction] = useState<EditInteractionState>({ mode: "idle" });
  const [editingRelationshipType, setEditingRelationshipType] = useState<
    "parent_child" | "sibling" | "spouse"
  >("parent_child");
  const [editingRelationshipSpouseStatus, setEditingRelationshipSpouseStatus] = useState<
    "active" | "former" | "deceased_partner"
  >("active");
  const [editingRelationshipStartDateText, setEditingRelationshipStartDateText] =
    useState("");
  const [editingRelationshipEndDateText, setEditingRelationshipEndDateText] =
    useState("");
  const [savingRelationship, setSavingRelationship] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [relationTargetMode, setRelationTargetMode] = useState<RelationTargetMode>("new");
  const [existingPersonId, setExistingPersonId] = useState("");
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePersonFormState>({
    displayName: "",
    essenceLine: "",
    birthDateText: "",
    deathDateText: "",
    isLiving: true,
    relationshipStartDateText: "",
  });
  const [firstPersonModalOpen, setFirstPersonModalOpen] = useState(false);
  const [firstPersonForm, setFirstPersonForm] = useState({
    displayName: "",
    essenceLine: "",
    birthDateText: "",
    deathDateText: "",
    isLiving: true,
  });
  const [firstPersonError, setFirstPersonError] = useState<string | null>(null);
  const [creatingFirstPerson, setCreatingFirstPerson] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [arrivalPhase, setArrivalPhase] = useState<"entering" | "resolving" | "complete" | "pre">("pre");
  const [grainTileDataUrl, setGrainTileDataUrl] = useState<string | null>(null);
  const didArriveRef = useRef(false);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 28;
    }
    ctx.putImageData(imageData, 0, 0);
    setGrainTileDataUrl(canvas.toDataURL("image/png"));
  }, []);
  const layoutRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const didInitializeLineageRef = useRef(false);

  const resetToolbarTimer = useCallback(() => {
    setToolbarVisible(true);
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    if (!editMode) {
      toolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), 3000);
    }
  }, [editMode]);

  useEffect(() => {
    if (editMode) {
      setToolbarVisible(true);
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
      return;
    }
    resetToolbarTimer();
    return () => {
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    };
  }, [editMode, resetToolbarTimer]);

  const immediateFocusIds = useMemo(
    () => getConstellationFocusIds(selectedPersonId, relationships),
    [selectedPersonId, relationships],
  );
  const lineageFocusIds = useMemo(
    () => getLineageFocusIds(selectedPersonId, relationships, lineageMode),
    [selectedPersonId, relationships, lineageMode],
  );
  const activeFocusIds = editMode ? immediateFocusIds : lineageFocusIds;
  const renderFocusIds =
    !editMode && lineageMode !== "full" && lineageFocusIds ? lineageFocusIds : null;

  const familyFocusIds = useMemo(() => {
    if (!activeFamily) return null;
    const ids = new Set<string>();
    for (const person of people) {
      const last = person.lastName?.trim();
      const maiden = person.maidenName?.trim();
      if (last === activeFamily || maiden === activeFamily) {
        ids.add(person.id);
        continue;
      }
      if (!last && !maiden) {
        const parts = person.name.trim().split(/\s+/);
        if (parts.length >= 2 && parts[parts.length - 1] === activeFamily) {
          ids.add(person.id);
        }
      }
    }
    // Include spouses of family members even if they have a different last name
    for (const rel of relationships) {
      if (rel.type === "spouse") {
        if (ids.has(rel.fromPersonId) && !ids.has(rel.toPersonId)) {
          ids.add(rel.toPersonId);
        }
        if (ids.has(rel.toPersonId) && !ids.has(rel.fromPersonId)) {
          ids.add(rel.fromPersonId);
        }
      }
    }
    if (ids.size === 0) return null;
    return ids;
  }, [people, relationships, activeFamily]);

  const displayFocusIds = useMemo(() => {
    if (familyFocusIds && lineageFocusIds) {
      const combined = new Set(familyFocusIds);
      for (const id of lineageFocusIds) combined.add(id);
      return combined;
    }
    return familyFocusIds ?? lineageFocusIds ?? null;
  }, [familyFocusIds, lineageFocusIds]);

  const renderPeople = people;
  const renderRelationships = relationships;
  const layout = useMemo(
    () => computeLayout(renderPeople, renderRelationships),
    [renderPeople, renderRelationships]
  );

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const familyClusters = useMemo(
    () => computeClusterCentroids(people, relationships, layout),
    [people, relationships, layout]
  );

  useEffect(() => {
    if (didInitializeLineageRef.current) return;
    if (initialSelectedPersonId && people.some((p) => p.id === initialSelectedPersonId)) {
      didInitializeLineageRef.current = true;
      setSelectedPersonId(initialSelectedPersonId);
      setLineageMode("household");
      return;
    }
    if (!currentUserPersonId) return;
    if (!people.some((person) => person.id === currentUserPersonId)) return;

    didInitializeLineageRef.current = true;
    setSelectedPersonId(currentUserPersonId);
    setLineageMode("household");
  }, [currentUserPersonId, initialSelectedPersonId, people]);

  useEffect(() => {
    onSelectedPersonChange?.(selectedPersonId);
  }, [onSelectedPersonChange, selectedPersonId]);

  // Rebuild nodes whenever people/layout/selected changes
  useEffect(() => {
    const personNodes = buildPersonNodes(
      renderPeople,
      layout,
      selectedPersonId,
      currentUserPersonId,
      displayFocusIds,
      activeDecade,
    );
    const edgeList = buildEdges(renderRelationships, layout, displayFocusIds, renderPeople, activeDecade);
    setNodes(personNodes);
    setEdges(edgeList);
  }, [
    renderPeople,
    renderRelationships,
    layout,
    selectedPersonId,
    currentUserPersonId,
    displayFocusIds,
    activeDecade,
    setNodes,
    setEdges,
  ]);

  useEffect(() => {
    if (people.length === 0) {
      setArrivalPhase("pre");
      return;
    }

    if (arrivalPhase !== "pre" && arrivalPhase !== "entering") return;

    const isFirstVisit = !didArriveRef.current;
    didArriveRef.current = true;

    setArrivalPhase("entering");

    const setupTimer = setTimeout(() => {
      if (isFirstVisit && currentUserPersonId && layoutRef.current.has(currentUserPersonId)) {
        const pos = layoutRef.current.get(currentUserPersonId)!;
        reactFlow.setCenter(pos.x + 48, pos.y + 65, { duration: 0, zoom: 0.9 });
      } else {
        reactFlow.fitView({ duration: 0, padding: 0.12 });
      }

      const resolveDelay = isFirstVisit ? 300 : 100;
      const completeDelay = isFirstVisit ? 1100 : 700;

      const resolveTimer = setTimeout(() => {
        setArrivalPhase("resolving");
        momentumCamera.fitViewSmooth({
          duration: isFirstVisit ? 800 : 500,
          padding: 0.12,
        });
      }, resolveDelay);

      const completeTimer = setTimeout(() => {
        setArrivalPhase("complete");
        if (initialSelectedPersonId && people.some((p) => p.id === initialSelectedPersonId)) {
          setTimeout(() => {
            const focusIds = getLineageFocusIds(initialSelectedPersonId, relationships, "household");
            const bounds = getFocusBoundsForIds(focusIds, layoutRef.current);
            if (bounds) {
              momentumCamera.fitBoundsSmooth(bounds, { duration: 600, padding: 0.22 });
            }
          }, 100);
        }
      }, completeDelay);

      return () => {
        clearTimeout(resolveTimer);
        clearTimeout(completeTimer);
      };
    }, 0);

    return () => clearTimeout(setupTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.length, arrivalPhase]);

  const availableDecades = useMemo(() => getAvailableDecades(people), [people]);

  // When active decade changes, pan to the relevant people
  useEffect(() => {
    if (activeDecade === null) return;
    const genDecades = inferGenerationDecades(people, layoutRef.current);
    const relevantIds = new Set(
      people
        .filter((p) => {
          if (p.birthYear != null) {
            const birthDecade = Math.floor(p.birthYear / 10) * 10;
            const aliveEnd = p.deathYear ?? new Date().getFullYear();
            const aliveEndDecade = Math.floor(aliveEnd / 10) * 10;
            return activeDecade >= birthDecade && activeDecade <= aliveEndDecade;
          }
          const guessed = genDecades.get(p.id);
          if (guessed != null) {
            return Math.abs(guessed - activeDecade) <= 10;
          }
          return false;
        })
        .map((p) => p.id),
    );
    if (relevantIds.size === 0) return;
    const bounds = getFocusBoundsForIds(relevantIds, layoutRef.current);
    if (bounds) {
      momentumCamera.fitBoundsSmooth(bounds, { duration: 800, padding: 0.22 });
    }
  // Only trigger on decade change, not layout changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDecade, momentumCamera]);

  // Zoom to family when active family changes
  useEffect(() => {
    if (!familyFocusIds || familyFocusIds.size === 0) return;
    const bounds = getFocusBoundsForIds(familyFocusIds, layoutRef.current);
    if (bounds) {
      momentumCamera.fitBoundsSmooth(bounds, { duration: 800, padding: 0.22 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFamily, momentumCamera]);

  const selectPerson = useCallback(
    (personId: string, _focusCamera = true) => {
      setSelectedPersonId(personId);
      if (lineageMode === "full") {
        setLineageMode("household");
      }
    },
    [lineageMode]
  );

  const resetRelationshipEditorDrafts = useCallback(() => {
    setEditingRelationshipType("parent_child");
    setEditingRelationshipSpouseStatus("active");
    setEditingRelationshipStartDateText("");
    setEditingRelationshipEndDateText("");
  }, []);

  const resetEditDrafts = useCallback(() => {
    setEditInteraction({ mode: "idle" });
    setCreateError(null);
    setShowAdvancedForm(false);
    resetRelationshipEditorDrafts();
  }, [resetRelationshipEditorDrafts]);

  const clearSelection = useCallback(() => {
    setSelectedPersonId(null);
    setLineageMode("full");
    resetEditDrafts();
    setTimeout(() => {
      momentumCamera.fitViewSmooth({ duration: 800, padding: 0.12 });
    }, 50);
  }, [momentumCamera, resetEditDrafts]);

  const handleNodeClick: NodeMouseHandler<TreeFlowNode> = useCallback(
    (_, node) => {
      if (node.type !== "person") return;
      const personNode = node as PersonFlowNode;

      if (editMode) {
        setSelectedPersonId(personNode.data.personId);
        setEditInteraction({ mode: "node-selected", personId: personNode.data.personId });
        setCreateError(null);
        setShowAdvancedForm(false);
        resetRelationshipEditorDrafts();
        return;
      }

      // Cancel any pending single-click timer
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      // Debounce: wait to see if a double-click follows
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        selectPerson(personNode.data.personId);
      }, 240);
    },
    [editMode, resetRelationshipEditorDrafts, selectPerson]
  );

  const handleNodeDoubleClick: NodeMouseHandler<TreeFlowNode> = useCallback(
    (_, node) => {
      if (editMode) return;
      if (node.type !== "person") return;
      const personNode = node as PersonFlowNode;

      // Cancel pending single-click action
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      onPersonDetailClick(personNode.data.personId);
    },
    [editMode, onPersonDetailClick]
  );

  const handlePaneClick = useCallback(() => {
    if (editMode) {
      if (selectedPersonId || editInteraction.mode !== "idle") {
        clearSelection();
      }
      return;
    }
    if (selectedPersonId) clearSelection();
  }, [clearSelection, editInteraction.mode, editMode, selectedPersonId]);

  const handleNodeMouseEnter: NodeMouseHandler<TreeFlowNode> = useCallback(
    (event, node) => {
      if (node.type !== "person") return;
      const personNode = node as PersonFlowNode;
      setHoverState({
        personId: personNode.data.personId,
        screenX: event.clientX,
        screenY: event.clientY,
      });
    },
    []
  );

  const handleNodeMouseLeave: NodeMouseHandler<TreeFlowNode> = useCallback(() => {
    setHoverState(null);
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!currentUserPersonId) return;
    const bounds = getConstellationFocusBounds(
      currentUserPersonId,
      relationships,
      layoutRef.current,
    );
    if (bounds) {
      momentumCamera.fitBoundsSmooth(bounds, { duration: 800, padding: 0.18 });
      return;
    }
    const pos = layoutRef.current.get(currentUserPersonId);
    if (pos) {
      momentumCamera.setCenterSmooth(pos.x + 48, pos.y + 65, { duration: 600, zoom: 1.2 });
    }
  }, [currentUserPersonId, momentumCamera, relationships]);

  const handleToggleEditMode = useCallback(() => {
    const next = !editMode;
    setEditMode(next);
    resetEditDrafts();

    if (next) {
      const targetPersonId = selectedPersonId ?? currentUserPersonId ?? people[0]?.id ?? null;
      if (targetPersonId) {
        setSelectedPersonId(targetPersonId);
        setEditInteraction({ mode: "node-selected", personId: targetPersonId });
        const bounds = getConstellationFocusBounds(
          targetPersonId,
          relationships,
          layoutRef.current,
        );
        if (bounds) {
          setTimeout(() => {
            momentumCamera.fitBoundsSmooth(bounds, { duration: 600, padding: 0.2 });
          }, 30);
          return;
        }
      }
      setTimeout(() => {
        momentumCamera.fitViewSmooth({ duration: 600, padding: 0.24 });
      }, 30);
      return;
    }

    setTimeout(() => {
      momentumCamera.fitViewSmooth({ duration: 600, padding: 0.12 });
    }, 30);
  }, [
    currentUserPersonId,
    editMode,
    momentumCamera,
    people,
    relationships,
    resetEditDrafts,
    selectedPersonId,
  ]);

  useEffect(() => {
    if (editMode || !selectedPersonId) return;

    const timer = setTimeout(() => {
      if (lineageMode === "full") {
        momentumCamera.fitViewSmooth({ duration: 800, padding: 0.12 });
        return;
      }

      const bounds = getFocusBoundsForIds(lineageFocusIds, layout);
      if (bounds) {
        const shiftedBounds = {
          ...bounds,
          x: bounds.x - PERSON_BANNER_WIDTH / 2,
          width: bounds.width + PERSON_BANNER_WIDTH / 2,
        };
        momentumCamera.fitBoundsSmooth(shiftedBounds, {
          duration: 800,
          padding: 0.22,
        });
        return;
      }
      const pos = layoutRef.current.get(selectedPersonId);
      if (pos) {
        momentumCamera.setCenterSmooth(pos.x + 48 - PERSON_BANNER_WIDTH / 2, pos.y + 65, { duration: 600, zoom: 1.4 });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [
    editMode,
    layout,
    lineageFocusIds,
    lineageMode,
    momentumCamera,
    relationships,
    selectedPersonId,
  ]);

  const selectedPerson = selectedPersonId
    ? people.find((p) => p.id === selectedPersonId) ?? null
    : null;

  const [personOtherTrees, setPersonOtherTrees] = useState<
    Array<{ id: string; name: string; role: string }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedPersonId) {
      setPersonOtherTrees([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const res = await fetch(`${API}/api/people/${selectedPersonId}/trees`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setPersonOtherTrees([]);
          return;
        }
        const data = (await res.json()) as Array<{
          id: string;
          name: string;
          role: string;
        }>;
        if (!cancelled) {
          setPersonOtherTrees(data.filter((entry) => entry.id !== treeId));
        }
      } catch {
        if (!cancelled) setPersonOtherTrees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API, selectedPersonId, treeId]);

  const hoveredPerson = hoverState
    ? people.find((p) => p.id === hoverState.personId) ?? null
    : null;

  const pendingRelation = useMemo<PendingRelation | null>(() => {
    if (editInteraction.mode !== "create-link-modal") {
      return null;
    }
    return {
      anchorPersonId: editInteraction.personId,
      kind: editInteraction.relationKind,
    };
  }, [editInteraction]);

  const relationAnchorPerson = pendingRelation
    ? people.find((p) => p.id === pendingRelation.anchorPersonId) ?? null
    : null;
  const existingRelationCandidates = useMemo(
    () =>
      pendingRelation
        ? people
            .filter((person) => person.id !== pendingRelation.anchorPersonId)
            .sort((left, right) => left.name.localeCompare(right.name))
        : [],
    [pendingRelation, people],
  );

  const editingRelationship = useMemo(() => {
    if (editInteraction.mode !== "edge-editing") return null;
    return relationships.find((r) => r.id === editInteraction.relationshipId) ?? null;
  }, [editInteraction, relationships]);

  const projectedEditSlots = useMemo(() => {
    if (!editMode || !selectedPersonId || editInteraction.mode !== "node-selected") {
      return [];
    }

    const rootBounds = rootRef.current?.getBoundingClientRect() ?? null;
    const flowToScreenPosition = (
      reactFlow as typeof reactFlow & {
        flowToScreenPosition?: (point: { x: number; y: number }) => { x: number; y: number };
      }
    ).flowToScreenPosition;
    const projectPoint = (x: number, y: number) => {
      if (flowToScreenPosition && rootBounds) {
        const screenPoint = flowToScreenPosition({ x, y });
        return {
          x: screenPoint.x - rootBounds.left,
          y: screenPoint.y - rootBounds.top,
        };
      }
      return {
        x: x * viewport.zoom + viewport.x,
        y: y * viewport.zoom + viewport.y + CANVAS_TOP_PADDING,
      };
    };

    return buildEditSlots(selectedPersonId, relationships, layout).map((slot) => {
      const projected = projectPoint(slot.flowX, slot.flowY);
      return {
        kind: slot.kind,
        x: projected.x,
        y: projected.y,
        label: slot.label,
      };
    });
  }, [
    editInteraction.mode,
    editMode,
    layout,
    reactFlow,
    relationships,
    selectedPersonId,
    viewport.x,
    viewport.y,
    viewport.zoom,
  ]);

  const parentPlaceholderGroups = useMemo(() => {
    return buildParentPlaceholderGroups(renderPeople, renderRelationships, layout).map((group) => ({
      ...group,
      isDimmed: activeFocusIds
        ? group.childAnchors.every((anchor) => !activeFocusIds.has(anchor.personId))
        : false,
    }));
  }, [
    activeFocusIds,
    layout,
    renderPeople,
    renderRelationships,
  ]);

  const projectedFamilyClusters = useMemo(() => {
    const rootBounds = rootRef.current?.getBoundingClientRect() ?? null;
    const flowToScreenPosition = (
      reactFlow as typeof reactFlow & {
        flowToScreenPosition?: (point: { x: number; y: number }) => { x: number; y: number };
      }
    ).flowToScreenPosition;
    const projectPoint = (x: number, y: number) => {
      if (flowToScreenPosition && rootBounds) {
        const screenPoint = flowToScreenPosition({ x, y });
        return {
          x: screenPoint.x - rootBounds.left,
          y: screenPoint.y - rootBounds.top,
        };
      }
      return {
        x: x * viewport.zoom + viewport.x,
        y: y * viewport.zoom + viewport.y + CANVAS_TOP_PADDING,
      };
    };

    const isDimmed = activeFocusIds != null;
    return familyClusters.map((cluster) => {
      const center = projectPoint(cluster.centerX, cluster.centerY);
      const halfW = (cluster.width / 2) * viewport.zoom;
      const halfH = (cluster.height / 2) * viewport.zoom;
      const anyVisible = isDimmed
        ? cluster.memberIds.some((id) => activeFocusIds?.has(id))
        : true;
      return {
        ...cluster,
        screenX: center.x,
        screenY: center.y,
        halfW,
        halfH,
        clusterDimmed: isDimmed && !anyVisible,
      };
    });
  }, [familyClusters, activeFocusIds, reactFlow, viewport.x, viewport.y, viewport.zoom]);

  const projectedParentPlaceholderGroups = useMemo(() => {
    const rootBounds = rootRef.current?.getBoundingClientRect() ?? null;
    const flowToScreenPosition = (
      reactFlow as typeof reactFlow & {
        flowToScreenPosition?: (point: { x: number; y: number }) => { x: number; y: number };
      }
    ).flowToScreenPosition;
    const projectPoint = (x: number, y: number) => {
      if (flowToScreenPosition && rootBounds) {
        const screenPoint = flowToScreenPosition({ x, y });
        return {
          x: screenPoint.x - rootBounds.left,
          y: screenPoint.y - rootBounds.top,
        };
      }

      return {
        x: x * viewport.zoom + viewport.x,
        y: y * viewport.zoom + viewport.y + CANVAS_TOP_PADDING,
      };
    };

    return parentPlaceholderGroups.map((group) => ({
      ...group,
      branchY: group.branchY === null ? null : projectPoint(0, group.branchY).y,
      childAnchors: group.childAnchors.map((anchor) => ({
        ...anchor,
        ...projectPoint(anchor.x, anchor.y),
      })),
      actualParentAnchors: group.actualParentAnchors.map((anchor) => ({
        ...anchor,
        ...projectPoint(anchor.x, anchor.y),
      })),
      placeholderCenters: group.placeholderCenters.map((placeholder) => ({
        ...placeholder,
        ...projectPoint(placeholder.x, placeholder.y),
      })),
    }));
  }, [
    parentPlaceholderGroups,
    reactFlow,
    viewport.x,
    viewport.y,
    viewport.zoom,
  ]);

  const openRelationFormForPerson = useCallback(
    (anchorPersonId: string, kind: EditRelationKind) => {
      const nextTargetMode =
        (kind === "spouse" || kind === "sibling") && people.length > 1 ? "existing" : "new";
      setEditMode(true);
      setSelectedPersonId(anchorPersonId);
      setEditInteraction({
        mode: "create-link-modal",
        personId: anchorPersonId,
        relationKind: kind,
      });
      setCreateError(null);
      setRelationTargetMode(nextTargetMode);
      setExistingPersonId("");
      setShowAdvancedForm(false);
      setCreateForm({
        displayName: "",
        essenceLine: "",
        birthDateText: "",
        deathDateText: "",
        isLiving: kind === "parent" ? false : true,
        relationshipStartDateText: "",
      });
    },
    [people.length],
  );

  const openRelationForm = useCallback(
    (kind: EditRelationKind) => {
      if (!selectedPersonId) return;
      openRelationFormForPerson(selectedPersonId, kind);
    },
    [openRelationFormForPerson, selectedPersonId],
  );

  const buildRelationshipPayloads = useCallback(
    (anchorPersonId: string, targetPersonId: string, relationKind: EditRelationKind) => {
      const anchorParentIds = relationships
        .filter(
          (relationship) =>
            relationship.type === "parent_child" &&
            relationship.toPersonId === anchorPersonId,
        )
        .map((relationship) => relationship.fromPersonId);

      return relationKind === "parent"
        ? [
            {
              type: "parent_child" as const,
              fromPersonId: targetPersonId,
              toPersonId: anchorPersonId,
            },
          ]
        : relationKind === "child"
          ? [
              {
                type: "parent_child" as const,
                fromPersonId: anchorPersonId,
                toPersonId: targetPersonId,
              },
            ]
          : relationKind === "sibling"
            ? anchorParentIds.length > 0
              ? anchorParentIds.map((parentId) => ({
                  type: "parent_child" as const,
                  fromPersonId: parentId,
                  toPersonId: targetPersonId,
                }))
              : [
                  {
                    type: "sibling" as const,
                    fromPersonId: anchorPersonId,
                    toPersonId: targetPersonId,
                  },
                ]
            : [
                {
                  type: "spouse" as const,
                  fromPersonId: anchorPersonId,
                  toPersonId: targetPersonId,
                  spouseStatus: "active" as const,
                  startDateText: createForm.relationshipStartDateText.trim() || undefined,
                },
              ];
    },
    [createForm.relationshipStartDateText, relationships],
  );

  const submitRelationshipPayloads = useCallback(
    async (
      relationshipPayloads: Array<{
        type: "parent_child" | "sibling" | "spouse";
        fromPersonId: string;
        toPersonId: string;
        spouseStatus?: "active";
        startDateText?: string;
      }>,
      duplicateFallbackMessage: string,
    ) => {
      let createdCount = 0;

      for (const relationshipPayload of relationshipPayloads) {
        const relRes = await fetch(`${API}/api/trees/${treeId}/relationships`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(relationshipPayload),
        });
        if (relRes.ok) {
          createdCount += 1;
          continue;
        }

        const err = (await relRes.json()) as { error?: string };
        const errorMessage = err.error ?? "Relationship failed";
        if (relRes.status === 409 && /already exists/i.test(errorMessage)) {
          continue;
        }
        throw new Error(errorMessage);
      }

      if (createdCount === 0) {
        throw new Error(duplicateFallbackMessage);
      }
    },
    [API, treeId],
  );

  const submitCreateRelatedPerson = useCallback(async () => {
    if (editInteraction.mode !== "create-link-modal" || !relationAnchorPerson) return;

    setCreatingPerson(true);
    setCreateError(null);
    try {
      if (relationTargetMode === "existing") {
        if (!existingPersonId) {
          setCreateError("Choose someone already in this tree.");
          return;
        }

        await submitRelationshipPayloads(
          buildRelationshipPayloads(
            relationAnchorPerson.id,
            existingPersonId,
            editInteraction.relationKind,
          ),
          "These people are already connected that way.",
        );

        await onConstellationChanged?.();
        setSelectedPersonId(existingPersonId);
        setEditInteraction({ mode: "node-selected", personId: existingPersonId });
        return;
      }

      const displayName = createForm.displayName.trim();
      if (!displayName) {
        setCreateError("Please enter a name.");
        return;
      }

      const personRes = await fetch(`${API}/api/trees/${treeId}/people`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          essenceLine: createForm.essenceLine.trim() || undefined,
          birthDateText: createForm.birthDateText.trim() || undefined,
          deathDateText: createForm.deathDateText.trim() || undefined,
          isLiving: createForm.isLiving,
        }),
      });
      if (!personRes.ok) {
        const err = (await personRes.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to create person");
      }
      const created = (await personRes.json()) as { id: string };

      await submitRelationshipPayloads(
        buildRelationshipPayloads(
          relationAnchorPerson.id,
          created.id,
          editInteraction.relationKind,
        ),
        "Person added, but that relationship already existed.",
      );

      await onConstellationChanged?.();
      if (editMode) {
        const nextSelectedPersonId =
          editInteraction.relationKind === "parent"
            ? relationAnchorPerson.id
            : created.id;
        setSelectedPersonId(nextSelectedPersonId);
        setEditInteraction({ mode: "node-selected", personId: nextSelectedPersonId });
      } else {
        selectPerson(created.id);
        setTimeout(() => selectPerson(created.id), 220);
        setEditInteraction({ mode: "idle" });
      }
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : relationTargetMode === "existing"
            ? "Failed to connect person"
            : "Failed to add person",
      );
    } finally {
      setCreatingPerson(false);
    }
  }, [
    API,
    buildRelationshipPayloads,
    createForm.birthDateText,
    createForm.deathDateText,
    createForm.displayName,
    createForm.essenceLine,
    createForm.isLiving,
    editInteraction,
    editMode,
    existingPersonId,
    onConstellationChanged,
    relationAnchorPerson,
    relationTargetMode,
    selectPerson,
    submitRelationshipPayloads,
    treeId,
  ]);

  const submitCreateFirstPerson = useCallback(async () => {
    const displayName = firstPersonForm.displayName.trim();
    if (!displayName) {
      setFirstPersonError("Please enter a name.");
      return;
    }
    setCreatingFirstPerson(true);
    setFirstPersonError(null);
    try {
      const res = await fetch(`${API}/api/trees/${treeId}/people`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          essenceLine: firstPersonForm.essenceLine.trim() || undefined,
          birthDateText: firstPersonForm.birthDateText.trim() || undefined,
          deathDateText: firstPersonForm.deathDateText.trim() || undefined,
          isLiving: firstPersonForm.isLiving,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to create person");
      }
      const created = (await res.json()) as { id: string };
      await onConstellationChanged?.();
      setFirstPersonModalOpen(false);
      setFirstPersonForm({
        displayName: "",
        essenceLine: "",
        birthDateText: "",
        deathDateText: "",
        isLiving: true,
      });
      selectPerson(created.id);
      setTimeout(() => selectPerson(created.id), 220);
    } catch (err) {
      setFirstPersonError(err instanceof Error ? err.message : "Failed to create person");
    } finally {
      setCreatingFirstPerson(false);
    }
  }, [
    firstPersonForm.birthDateText,
    firstPersonForm.deathDateText,
    firstPersonForm.displayName,
    firstPersonForm.essenceLine,
    firstPersonForm.isLiving,
    onConstellationChanged,
    selectPerson,
    treeId,
  ]);

  const handleEdgeClick: EdgeMouseHandler<TreeEdge> = useCallback(
    (_, edge) => {
      if (!editMode) return;
      const relationshipId = edge.id.replace(/^edge-/, "");
      const relation = relationships.find((r) => r.id === relationshipId);
      if (!relation) return;
      setEditingRelationshipType(relation.type);
      setEditingRelationshipSpouseStatus(
        relation.spouseStatus ?? "active",
      );
      setEditingRelationshipStartDateText(relation.startDateText ?? "");
      setEditingRelationshipEndDateText(relation.endDateText ?? "");
      setEditInteraction({ mode: "edge-editing", relationshipId: relation.id });
      setCreateError(null);
      setShowAdvancedForm(false);
    },
    [editMode, relationships],
  );

  const saveRelationshipEdits = useCallback(async () => {
    if (!editingRelationship) return;
    setSavingRelationship(true);
    setCreateError(null);
    try {
      const res = await fetch(
        `${API}/api/trees/${treeId}/relationships/${editingRelationship.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDateText: editingRelationshipStartDateText.trim() || null,
            endDateText: editingRelationshipEndDateText.trim() || null,
            spouseStatus:
              editingRelationshipType === "spouse"
                ? editingRelationshipSpouseStatus
                : null,
          }),
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to update relationship");
      }
      await onConstellationChanged?.();
      setEditInteraction(
        selectedPersonId
          ? { mode: "node-selected", personId: selectedPersonId }
          : { mode: "idle" },
      );
      resetRelationshipEditorDrafts();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to update relationship",
      );
    } finally {
      setSavingRelationship(false);
    }
  }, [
    API,
    editingRelationship,
    editingRelationshipEndDateText,
    editingRelationshipSpouseStatus,
    editingRelationshipStartDateText,
    editingRelationshipType,
    onConstellationChanged,
    resetRelationshipEditorDrafts,
    selectedPersonId,
    treeId,
  ]);

  const disconnectRelationship = useCallback(async () => {
    if (!editingRelationship) return;
    setSavingRelationship(true);
    setCreateError(null);
    try {
      const res = await fetch(
        `${API}/api/trees/${treeId}/relationships/${editingRelationship.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok && res.status !== 204) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to disconnect relationship");
      }
      await onConstellationChanged?.();
      setEditInteraction(
        selectedPersonId
          ? { mode: "node-selected", personId: selectedPersonId }
          : { mode: "idle" },
      );
      resetRelationshipEditorDrafts();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to disconnect relationship",
      );
    } finally {
      setSavingRelationship(false);
    }
  }, [
    API,
    editingRelationship,
    onConstellationChanged,
    resetRelationshipEditorDrafts,
    selectedPersonId,
    treeId,
  ]);

  const closeCreateModal = useCallback(() => {
    setCreateError(null);
    setExistingPersonId("");
    setShowAdvancedForm(false);
    if (pendingRelation) {
      setEditInteraction({
        mode: "node-selected",
        personId: pendingRelation.anchorPersonId,
      });
      return;
    }
    setEditInteraction(
      selectedPersonId
        ? { mode: "node-selected", personId: selectedPersonId }
        : { mode: "idle" },
    );
  }, [pendingRelation, selectedPersonId]);

  const closeEdgeEditor = useCallback(() => {
    setCreateError(null);
    resetRelationshipEditorDrafts();
    setEditInteraction(
      selectedPersonId
        ? { mode: "node-selected", personId: selectedPersonId }
        : { mode: "idle" },
    );
  }, [resetRelationshipEditorDrafts, selectedPersonId]);

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%", position: "relative", background: CANVAS_BACKGROUND }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: grainTileDataUrl ? `url(${grainTileDataUrl})` : undefined,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
          mixBlendMode: "multiply",
          opacity: 0.35,
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 50%, rgba(28,25,21,0.22) 100%)",
          zIndex: 0,
        }}
      />
      {/* Arrival overlay — solid parchment fade, no backdrop-filter */}
      {arrivalPhase !== "complete" && arrivalPhase !== "pre" && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 50,
            background: arrivalPhase === "entering"
              ? "rgba(246,241,231,0.92)"
              : "rgba(246,241,231,0)",
            transition: "background 800ms var(--ease-tessera)",
          }}
        />
      )}

      {/* Auto-show toolbar zone — thin strip at top that makes toolbar reappear on hover */}
      <div
        aria-hidden="true"
        onMouseMove={() => { resetToolbarTimer(); }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          zIndex: 11,
          pointerEvents: toolbarVisible ? "none" : "auto",
        }}
      />
      {/* Canvas header — auto-hides after inactivity */}
      <div
        onMouseEnter={() => { resetToolbarTimer(); }}
        onMouseMove={() => { resetToolbarTimer(); }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          minHeight: 52,
          background: CONTROL_SURFACE,
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${CONTROL_BORDER}`,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "center",
          padding: "8px 20px",
          gap: 16,
          opacity: toolbarVisible ? 1 : 0.15,
          pointerEvents: toolbarVisible ? "auto" : "none",
          transition: `opacity var(--duration-focus) var(--ease-tessera)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              color: "var(--ink)",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {treeName}
          </span>

          {!editMode && (
            <FamilySelector
              people={people}
              activeFamily={activeFamily}
              onSelectFamily={setActiveFamily}
            />
          )}

          <button
            onClick={handleToggleEditMode}
            style={{
              ...(editMode ? toolbarPrimaryButtonStyle : toolbarButtonStyle),
              background: editMode ? "var(--ink)" : toolbarButtonStyle.background,
              border: editMode ? "1px solid rgba(28,25,21,0.32)" : toolbarButtonStyle.border,
            }}
          >
            {editMode ? "Exit edit mode" : "Edit constellation"}
          </button>

          {editMode ? (
            <div style={toolbarHintStyle}>
              Click a person to add family. Click a connection line to edit it.
            </div>
          ) : selectedPerson ? (
            <div style={toolbarSegmentedStyle}>
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  paddingLeft: 6,
                  paddingRight: 2,
                }}
              >
                Lineage
              </span>
              {([
                ["full", "Full tree"],
                ["birth", "Birth family"],
                ["household", "Household"],
              ] as const).map(([mode, label]) => {
                const active = lineageMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLineageMode(mode)}
                    style={{
                      ...toolbarButtonStyle,
                      fontSize: 11,
                      color: active ? "white" : "var(--ink-faded)",
                      background: active ? "var(--moss)" : "transparent",
                      border: active ? "1px solid rgba(78,93,66,0.28)" : "1px solid transparent",
                      boxShadow: "none",
                      padding: "6px 10px",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div
          style={{
            justifySelf: "center",
            display: "flex",
            alignItems: "center",
            minWidth: 0,
          }}
        >
          <div style={toolbarSegmentedStyle}>
            <a href={`/trees/${treeId}/home`} style={toolbarNavItemStyle(false)}>
              Home
            </a>
            <a href={`/trees/${treeId}/tree`} style={toolbarNavItemStyle(true)}>
              Family tree
            </a>
            <button
              type="button"
              onClick={onDriftClick}
              style={toolbarNavButtonStyle(false)}
              title="Explore by era"
            >
              Drift
            </button>
          </div>
        </div>

        <div
          style={{
            justifySelf: "end",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            minWidth: 0,
          }}
        >
          {onAddMemoryClick && (
            <button
              onClick={onAddMemoryClick}
              style={toolbarPrimaryButtonStyle}
            >
              + Add memory
            </button>
          )}

          {(() => {
            const overflowActions = [
              ...(onSearchClick ? [{ label: "Search", action: onSearchClick, shortcut: "⌘K" }] : []),
              ...(onRequestMemoryClick ? [{ label: "Request a memory", action: onRequestMemoryClick }] : []),
              { label: "Messages", action: undefined, href: `/trees/${treeId}/inbox` },
              { label: "Settings", action: undefined, href: `/trees/${treeId}/settings` },
            ];
            if (overflowActions.length === 0) return null;
            return (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setActionsMenuOpen((v) => !v)}
                  style={{
                    ...toolbarButtonStyle,
                    padding: "8px 10px",
                    minWidth: 36,
                    justifyContent: "center",
                  }}
                >
                  ⋯
                </button>
                {actionsMenuOpen && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 18 }}
                      onClick={() => setActionsMenuOpen(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 19,
                        minWidth: 160,
                        background: "rgba(246,241,231,0.96)",
                        border: "1px solid var(--rule)",
                        borderRadius: 10,
                        boxShadow: "0 12px 32px rgba(28,25,21,0.1)",
                        backdropFilter: "blur(12px)",
                        padding: "6px 4px",
                      }}
                    >
                      {overflowActions.map((item) => {
                        const inner = (
                          <>
                            {item.label}
                            {item.shortcut && (
                              <kbd
                                style={{
                                  fontFamily: "var(--font-ui)",
                                  fontSize: 10,
                                  background: "var(--paper)",
                                  border: "1px solid var(--rule)",
                                  borderRadius: 3,
                                  padding: "1px 4px",
                                  color: "var(--ink-faded)",
                                  marginLeft: 8,
                                }}
                              >
                                {item.shortcut}
                              </kbd>
                            )}
                          </>
                        );
                        if (item.href) {
                          return (
                            <a
                              key={item.label}
                              href={item.href}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                fontFamily: "var(--font-ui)",
                                fontSize: 12,
                                color: "var(--ink-soft)",
                                background: "transparent",
                                border: "none",
                                borderRadius: 6,
                                padding: "7px 10px",
                                cursor: "pointer",
                                textDecoration: "none",
                              }}
                            >
                              {inner}
                            </a>
                          );
                        }
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              setActionsMenuOpen(false);
                              item.action?.();
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              fontFamily: "var(--font-ui)",
                              fontSize: 12,
                              color: "var(--ink-soft)",
                              background: "transparent",
                              border: "none",
                              borderRadius: 6,
                              padding: "7px 10px",
                              cursor: "pointer",
                            }}
                          >
                            {inner}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Decade rail */}
      {!editMode && availableDecades.length > 1 && (
        <DecadeRail
          decades={availableDecades}
          activeDecade={activeDecade}
          onSelectDecade={setActiveDecade}
        />
      )}

      {/* Empty-tree first-person CTA */}
      {people.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 14,
              padding: "28px 32px",
              boxShadow: "0 24px 48px rgba(28,25,21,0.12)",
              maxWidth: 420,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)", marginBottom: 8 }}>
              Plant the first seed
            </div>
            <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55, margin: "0 0 20px" }}>
              This lineage has no one in it yet. Add the first person to start
              weaving their story — you can connect parents, spouses, and
              children from their card once they&rsquo;re here.
            </p>
            <button
              onClick={() => {
                setFirstPersonError(null);
                setFirstPersonModalOpen(true);
              }}
              style={{
                ...toolbarPrimaryButtonStyle,
                padding: "10px 18px",
                fontSize: 14,
              }}
            >
              + Add first person
            </button>
          </div>
        </div>
      )}

      {/* First-person create modal */}
      {firstPersonModalOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            background: "rgba(28,25,21,0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !creatingFirstPerson) {
              setFirstPersonModalOpen(false);
            }
          }}
        >
          <div
            style={{
              width: "min(460px, 94vw)",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "20px 20px 16px",
              boxShadow: "0 24px 48px rgba(28,25,21,0.2)",
            }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)", marginBottom: 12 }}>
              Add first person
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 5, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
                Name
                <input
                  autoFocus
                  value={firstPersonForm.displayName}
                  onChange={(e) => setFirstPersonForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. Karsen Adams"
                  style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: "8px 10px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)", background: "var(--paper-deep)" }}
                  disabled={creatingFirstPerson}
                />
              </label>
              <label style={{ display: "grid", gap: 5, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
                Short bio (optional)
                <input
                  value={firstPersonForm.essenceLine}
                  onChange={(e) => setFirstPersonForm((f) => ({ ...f, essenceLine: e.target.value }))}
                  placeholder="A short line that captures them"
                  style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: "8px 10px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)", background: "var(--paper-deep)" }}
                  disabled={creatingFirstPerson}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 5, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
                  Born (optional)
                  <input
                    value={firstPersonForm.birthDateText}
                    onChange={(e) => setFirstPersonForm((f) => ({ ...f, birthDateText: e.target.value }))}
                    placeholder="1990 or March 12, 1990"
                    style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: "8px 10px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)", background: "var(--paper-deep)" }}
                    disabled={creatingFirstPerson}
                  />
                </label>
                <label style={{ display: "grid", gap: 5, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--ink-faded)" }}>
                  Died (optional)
                  <input
                    value={firstPersonForm.deathDateText}
                    onChange={(e) => setFirstPersonForm((f) => ({ ...f, deathDateText: e.target.value, isLiving: e.target.value.trim() ? false : f.isLiving }))}
                    placeholder="Leave blank if living"
                    style={{ border: "1px solid var(--rule)", borderRadius: 8, padding: "8px 10px", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink)", background: "var(--paper-deep)" }}
                    disabled={creatingFirstPerson}
                  />
                </label>
              </div>
              {firstPersonError && (
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--error, #a33)" }}>
                  {firstPersonError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button
                  onClick={() => setFirstPersonModalOpen(false)}
                  disabled={creatingFirstPerson}
                  style={subtleButtonStyle}
                >
                  Cancel
                </button>
                <button
                  onClick={submitCreateFirstPerson}
                  disabled={creatingFirstPerson || !firstPersonForm.displayName.trim()}
                  style={toolbarPrimaryButtonStyle}
                >
                  {creatingFirstPerson ? "Adding…" : "Add to constellation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected-person lineage switcher */}
      {selectedPerson && personOtherTrees.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 68,
            right: 16,
            zIndex: 10,
            maxWidth: 320,
            padding: "10px 12px",
            borderRadius: 12,
            background: CONTROL_SURFACE,
            backdropFilter: "blur(10px)",
            border: `1px solid ${CONTROL_BORDER}`,
            boxShadow: "0 10px 24px rgba(40,30,18,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(63,53,41,0.6)",
            }}
          >
            {selectedPerson.name} also appears in
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {personOtherTrees.map((other) => (
              <a
                key={other.id}
                href={`/trees/${other.id}?focusPersonId=${selectedPersonId}`}
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--moss)",
                  background: "rgba(255,250,244,0.84)",
                  border: `1px solid ${CONTROL_BORDER}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                  textDecoration: "none",
                }}
              >
                Open in {other.name} →
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredPerson && hoverState && !selectedPersonId && !editMode && (
        <div
          style={{
            position: "fixed",
            left: hoverState.screenX + 14,
            top: hoverState.screenY - 16,
            zIndex: 15,
            ...floatingPanelStyle,
            padding: "10px 14px",
            pointerEvents: "none",
            minWidth: 140,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              color: "var(--ink)",
              lineHeight: 1.3,
            }}
          >
            {hoveredPerson.name}
          </div>
          {hoveredPerson.essenceLine && (
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ink-faded)",
                marginTop: 3,
              }}
            >
              {hoveredPerson.essenceLine.slice(0, 40)}
            </div>
          )}
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--moss)",
              marginTop: 6,
            }}
          >
            Click to explore ›
          </div>
        </div>
      )}

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onWheel={momentumCamera.handleWheel as never}
        onMoveStart={momentumCamera.handleMoveStart as never}
        onMove={momentumCamera.handleMove as never}
        onMoveEnd={momentumCamera.handleMoveEnd as never}
        panOnDrag={!editMode}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        nodesDraggable={editMode}
        minZoom={0.15}
        maxZoom={2.5}
        style={{ background: "transparent", paddingTop: CANVAS_TOP_PADDING }}
        proOptions={{ hideAttribution: true }}
      />

      {projectedFamilyClusters.length > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            overflow: "hidden",
          }}
        >
          {projectedFamilyClusters.map((cluster) => (
            <div
              key={cluster.id}
              style={{
                position: "absolute",
                left: cluster.screenX - cluster.halfW,
                top: cluster.screenY - cluster.halfH,
                width: cluster.halfW * 2,
                height: cluster.halfH * 2,
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(212,190,159,0.15) 0%, transparent 70%)",
                opacity: cluster.clusterDimmed ? 0.15 : 1,
                transition: "opacity var(--duration-focus) var(--ease-tessera)",
              }}
            />
          ))}
        </div>
      )}

      {!editMode && projectedFamilyClusters.length > 0 && viewport.zoom < 0.55 && !selectedPersonId && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 3,
            overflow: "hidden",
          }}
        >
          {projectedFamilyClusters
            .filter((c) => c.familyName && !c.clusterDimmed)
            .map((cluster) => (
              <div
                key={`label-${cluster.id}`}
                style={{
                  position: "absolute",
                  left: cluster.screenX,
                  top: cluster.screenY,
                  transform: "translate(-50%, -50%)",
                  fontFamily: "var(--font-display)",
                  fontSize: Math.max(18, Math.min(32, 24 / viewport.zoom)),
                  color: "var(--ink-faded)",
                  opacity: 0.55,
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                  textAlign: "center",
                  transition: "opacity var(--duration-focus) var(--ease-tessera)",
                }}
              >
                {cluster.familyName}
              </div>
            ))}
        </div>
      )}

      {projectedParentPlaceholderGroups.length > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 16,
            overflow: "hidden",
          }}
        >
          {projectedParentPlaceholderGroups.map((group) => (
            <ParentPlaceholderOverlay
              key={group.id}
              branchY={group.branchY}
              childAnchors={group.childAnchors}
              actualParentAnchors={group.actualParentAnchors}
              placeholderCenters={group.placeholderCenters}
              dimmed={group.isDimmed}
              zoom={viewport.zoom}
              onPlaceholderClick={() =>
                openRelationFormForPerson(
                  selectedPersonId && group.memberIds.includes(selectedPersonId)
                    ? selectedPersonId
                    : group.anchorPersonId,
                  "parent",
                )
              }
            />
          ))}
        </div>
      )}

      {/* Edit-mode relationship ghosts aligned to family geometry */}
      {editMode &&
        selectedPerson &&
        editInteraction.mode === "node-selected" &&
        projectedEditSlots.length > 0 && (
        <>
          {projectedEditSlots.map((slot) => (
            <RelationGhost
              key={`${slot.kind}-${slot.x}-${slot.y}`}
              centerX={slot.x}
              centerY={slot.y}
              kind={slot.kind}
              label={slot.label}
              onClick={() => openRelationForm(slot.kind)}
            />
          ))}
        </>
      )}

      {/* Create related person modal */}
      {editInteraction.mode === "create-link-modal" && pendingRelation && relationAnchorPerson && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            background: "rgba(28,25,21,0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <div
            style={{
              width: "min(460px, 94vw)",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 12,
              padding: "20px 20px 16px",
              boxShadow: "0 24px 48px rgba(28,25,21,0.2)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 24,
                color: "var(--ink)",
                marginBottom: 10,
              }}
            >
              {relationTargetMode === "existing" ? "Connect existing person" : "Add person"}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "inline-flex",
                  gap: 6,
                  padding: 4,
                  borderRadius: 999,
                  background: "var(--paper-deep)",
                  border: "1px solid var(--rule)",
                  justifySelf: "start",
                }}
              >
                <button
                  onClick={() => {
                    setRelationTargetMode("existing");
                    setCreateError(null);
                  }}
                  style={{
                    ...subtleButtonStyle,
                    padding: "6px 10px",
                    borderRadius: 999,
                    borderColor:
                      relationTargetMode === "existing" ? "rgba(78,93,66,0.35)" : "transparent",
                    background:
                      relationTargetMode === "existing" ? "rgba(78,93,66,0.12)" : "transparent",
                    color:
                      relationTargetMode === "existing" ? "var(--moss)" : "var(--ink-faded)",
                  }}
                  disabled={creatingPerson}
                >
                  Connect existing
                </button>
                <button
                  onClick={() => {
                    setRelationTargetMode("new");
                    setCreateError(null);
                  }}
                  style={{
                    ...subtleButtonStyle,
                    padding: "6px 10px",
                    borderRadius: 999,
                    borderColor:
                      relationTargetMode === "new" ? "rgba(78,93,66,0.35)" : "transparent",
                    background:
                      relationTargetMode === "new" ? "rgba(78,93,66,0.12)" : "transparent",
                    color: relationTargetMode === "new" ? "var(--moss)" : "var(--ink-faded)",
                  }}
                  disabled={creatingPerson}
                >
                  Add new
                </button>
              </div>

              {relationTargetMode === "existing" ? (
                <>
                  <label
                    style={{
                      display: "grid",
                      gap: 5,
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      color: "var(--ink-faded)",
                    }}
                  >
                    Person
                    <select
                      value={existingPersonId}
                      onChange={(event) => setExistingPersonId(event.target.value)}
                      style={{
                        border: "1px solid var(--rule)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        fontFamily: "var(--font-body)",
                        fontSize: 14,
                        color: "var(--ink)",
                        background: "var(--paper-deep)",
                      }}
                      disabled={creatingPerson}
                    >
                      <option value="">Choose someone already in this tree</option>
                      {existingRelationCandidates.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {pendingRelation.kind === "spouse" && (
                    <FormRow
                      label="Relationship start (optional)"
                      value={createForm.relationshipStartDateText}
                      onChange={(value) =>
                        setCreateForm((s) => ({
                          ...s,
                          relationshipStartDateText: value,
                        }))
                      }
                      placeholder="e.g. 1974"
                    />
                  )}
                </>
              ) : (
                <>
                  <FormRow
                    label="Name *"
                    value={createForm.displayName}
                    onChange={(value) =>
                      setCreateForm((s) => ({ ...s, displayName: value }))
                    }
                    placeholder="Full name"
                  />
                  <button
                    onClick={() => setShowAdvancedForm((v) => !v)}
                    style={{
                      ...subtleButtonStyle,
                      justifySelf: "start",
                      padding: "6px 10px",
                    }}
                    disabled={creatingPerson}
                  >
                    {showAdvancedForm ? "Hide details" : "Add details (optional)"}
                  </button>
                  {showAdvancedForm && (
                    <>
                      <FormRow
                        label="Short bio"
                        value={createForm.essenceLine}
                        onChange={(value) =>
                          setCreateForm((s) => ({ ...s, essenceLine: value }))
                        }
                        placeholder="Short defining line"
                      />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <FormRow
                          label="Birth"
                          value={createForm.birthDateText}
                          onChange={(value) =>
                            setCreateForm((s) => ({ ...s, birthDateText: value }))
                          }
                          placeholder="e.g. 1948"
                        />
                        <FormRow
                          label="Death"
                          value={createForm.deathDateText}
                          onChange={(value) =>
                            setCreateForm((s) => ({ ...s, deathDateText: value }))
                          }
                          placeholder="e.g. 2021"
                        />
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontFamily: "var(--font-ui)",
                          fontSize: 12,
                          color: "var(--ink-soft)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={createForm.isLiving}
                          onChange={(e) =>
                            setCreateForm((s) => ({ ...s, isLiving: e.target.checked }))
                          }
                        />
                        Living
                      </label>
                      {pendingRelation.kind === "spouse" && (
                        <FormRow
                          label="Relationship start (optional)"
                          value={createForm.relationshipStartDateText}
                          onChange={(value) =>
                            setCreateForm((s) => ({
                              ...s,
                              relationshipStartDateText: value,
                            }))
                          }
                          placeholder="e.g. 1974"
                        />
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {createError && (
              <div
                style={{
                  marginTop: 12,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--rose)",
                }}
              >
                {createError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                onClick={closeCreateModal}
                style={subtleButtonStyle}
                disabled={creatingPerson}
              >
                Cancel
              </button>
              <button
                onClick={submitCreateRelatedPerson}
                style={primaryButtonStyle}
                disabled={creatingPerson}
              >
                {creatingPerson
                  ? relationTargetMode === "existing"
                    ? "Connecting…"
                    : "Adding…"
                  : relationTargetMode === "existing"
                    ? "Connect in constellation"
                    : "Add to constellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editInteraction.mode === "edge-editing" && editingRelationship && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 31,
            background: "rgba(28,25,21,0.35)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEdgeEditor();
          }}
        >
          <div
            style={{
              width: "min(360px, 92vw)",
              borderRadius: 12,
              border: "1px solid var(--rule)",
              background: "var(--paper)",
              padding: "16px 16px 14px",
              boxShadow: "0 18px 40px rgba(28,25,21,0.18)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                color: "var(--ink)",
                marginBottom: 10,
              }}
            >
              Edit connection
            </div>
            <label
              style={{
                display: "grid",
                gap: 5,
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-faded)",
                marginBottom: 12,
              }}
            >
              Type
              <div
                style={{
                  border: "1px solid var(--rule)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--ink)",
                  background: "var(--paper-deep)",
                  textTransform: "capitalize",
                }}
              >
                {editingRelationshipType === "parent_child"
                  ? "Parent / child"
                  : editingRelationshipType}
              </div>
            </label>
            {editingRelationshipType === "spouse" && (
              <label
                style={{
                  display: "grid",
                  gap: 5,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--ink-faded)",
                  marginBottom: 12,
                }}
              >
                Spouse status
                <select
                  value={editingRelationshipSpouseStatus}
                  onChange={(e) =>
                    setEditingRelationshipSpouseStatus(
                      e.target.value as "active" | "former" | "deceased_partner",
                    )
                  }
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    color: "var(--ink)",
                    background: "var(--paper-deep)",
                  }}
                >
                  <option value="active">Active</option>
                  <option value="former">Former</option>
                  <option value="deceased_partner">Ended (deceased partner)</option>
                </select>
              </label>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <FormRow
                label="Start"
                value={editingRelationshipStartDateText}
                onChange={setEditingRelationshipStartDateText}
                placeholder="e.g. 1974"
              />
              <FormRow
                label="End"
                value={editingRelationshipEndDateText}
                onChange={setEditingRelationshipEndDateText}
                placeholder="e.g. 2008"
              />
            </div>
            {createError && (
              <div
                style={{
                  marginBottom: 8,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--rose)",
                }}
              >
                {createError}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button
                onClick={disconnectRelationship}
                style={{
                  ...subtleButtonStyle,
                  color: "var(--rose)",
                  borderColor: "rgba(168,93,93,0.35)",
                }}
                disabled={savingRelationship}
              >
                Disconnect
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={closeEdgeEditor}
                  style={subtleButtonStyle}
                  disabled={savingRelationship}
                >
                  Cancel
                </button>
                <button
                  onClick={saveRelationshipEdits}
                  style={primaryButtonStyle}
                  disabled={savingRelationship}
                >
                  {savingRelationship ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Person side banner */}
      {!editMode && (
        <PersonBanner
          person={selectedPerson}
          treeId={treeId}
          relationships={relationships}
          onClose={clearSelection}
          onEnterLife={onPersonDetailClick}
          onPersonUpdated={onConstellationChanged}
          onAddRelation={onAddMemoryClick ? (personId, kind) => {
            openRelationFormForPerson(personId, kind);
          } : undefined}
        />
      )}
    </div>
  );
}

function ParentChildEdge({
  id,
  data,
}: EdgeProps<TreeEdge>) {
  const edgeData = data as ConstellationEdgeData | undefined;
  const isDimmed = (edgeData?.opacity ?? 1) < 0.5;
  const strokeWidth = edgeData?.strokeWidth ?? 1.3;
  const sourceX = edgeData?.renderSourceX;
  const sourceY = edgeData?.renderSourceY;
  const targetX = edgeData?.renderTargetX;
  const targetY = edgeData?.renderTargetY;

  if (
    sourceX === undefined ||
    sourceY === undefined ||
    targetX === undefined ||
    targetY === undefined
  ) {
    return null;
  }

  const edgeClass = isDimmed ? "edge-dimmed" : "edge-pulse";
  const stroke = isDimmed ? "rgba(177, 165, 145, 0.45)" : undefined;
  const edgeStyle: React.CSSProperties = isDimmed
    ? { stroke, strokeWidth, cursor: "pointer" }
    : { strokeWidth, cursor: "pointer" };

  if (
    edgeData?.unionX === undefined ||
    edgeData?.unionY === undefined ||
    Math.abs(edgeData.unionX - sourceX) < 2
  ) {
    const midY = sourceY + (targetY - sourceY) * 0.45;
    const path = [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`,
    ].join(" ");
    return (
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={32}
        className={edgeClass}
        style={edgeStyle}
      />
    );
  }

  const unionX = edgeData.unionX;
  const unionY = edgeData.unionY;
  const descentY = Math.min(targetY - 20, unionY + 42);
  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${unionY}`,
    `Q ${sourceX} ${unionY} ${unionX} ${unionY}`,
    `L ${unionX} ${descentY}`,
    `Q ${unionX} ${descentY} ${targetX} ${descentY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");

  return (
    <BaseEdge
      id={id}
      path={path}
      interactionWidth={32}
      className={edgeClass}
      style={edgeStyle}
    />
  );
}

function SpouseEdge({
  id,
  data,
}: EdgeProps<TreeEdge>) {
  const edgeData = data as ConstellationEdgeData | undefined;
  const isDimmed = (edgeData?.opacity ?? 1) < 0.5;
  const strokeWidth = edgeData?.strokeWidth ?? 1.2;
  const sourceX = edgeData?.renderSourceX;
  const sourceY = edgeData?.renderSourceY;
  const targetX = edgeData?.renderTargetX;
  const targetY = edgeData?.renderTargetY;

  if (
    sourceX === undefined ||
    sourceY === undefined ||
    targetX === undefined ||
    targetY === undefined
  ) {
    return null;
  }

  const edgeClass = isDimmed ? "edge-dimmed" : "edge-shimmer";
  const stroke = isDimmed ? "rgba(177, 165, 145, 0.45)" : undefined;
  const edgeStyle: React.CSSProperties = isDimmed
    ? { stroke, strokeWidth, cursor: "pointer" }
    : { strokeWidth, cursor: "pointer" };

  const controlY = Math.min(sourceY, targetY) - 18;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${targetX} ${targetY}`,
  ].join(" ");
  return (
    <BaseEdge
      id={id}
      path={path}
      interactionWidth={32}
      className={edgeClass}
      style={{
        ...edgeStyle,
        strokeDasharray: edgeData?.strokeDasharray,
      }}
    />
  );
}

function relationLabel(kind: EditRelationKind): string {
  if (kind === "parent") return "Parent";
  if (kind === "child") return "Child";
  if (kind === "sibling") return "Sibling";
  return "Spouse";
}

function ParentPlaceholderOverlay({
  branchY,
  childAnchors,
  actualParentAnchors,
  placeholderCenters,
  dimmed,
  zoom,
  onPlaceholderClick,
}: {
  branchY: number | null;
  childAnchors: Array<{ personId: string; x: number; y: number }>;
  actualParentAnchors: Array<{ personId: string; x: number; y: number }>;
  placeholderCenters: Array<{ id: string; x: number; y: number }>;
  dimmed: boolean;
  zoom: number;
  onPlaceholderClick: () => void;
}) {
  const bubbleSize = 58;
  const opacity = dimmed ? 0.18 : 0.92;
  const childXs = childAnchors.map((anchor) => anchor.x);
  const hasFullPlaceholderParents = actualParentAnchors.length === 0 && placeholderCenters.length === 2;
  const computedBranchY = branchY;
  const showLabel = zoom >= 0.72;

  return (
    <>
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        {hasFullPlaceholderParents && computedBranchY !== null && (
          <>
            <line
              x1={placeholderCenters[0]!.x}
              y1={placeholderCenters[0]!.y}
              x2={placeholderCenters[1]!.x}
              y2={placeholderCenters[1]!.y}
              stroke="rgba(177,165,145,0.78)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity={opacity}
            />
            <line
              x1={(placeholderCenters[0]!.x + placeholderCenters[1]!.x) / 2}
              y1={placeholderCenters[0]!.y + bubbleSize / 2 - 4}
              x2={(placeholderCenters[0]!.x + placeholderCenters[1]!.x) / 2}
              y2={computedBranchY}
              stroke="rgba(177,165,145,0.78)"
              strokeWidth="1.5"
              opacity={opacity}
            />
            <line
              x1={Math.min(...childXs)}
              y1={computedBranchY}
              x2={Math.max(...childXs)}
              y2={computedBranchY}
              stroke="rgba(177,165,145,0.78)"
              strokeWidth="1.5"
              opacity={opacity}
            />
            {childAnchors.map((anchor) => (
              <line
                key={anchor.personId}
                x1={anchor.x}
                y1={computedBranchY}
                x2={anchor.x}
                y2={anchor.y}
                stroke="rgba(177,165,145,0.78)"
                strokeWidth="1.5"
                opacity={opacity}
              />
            ))}
          </>
        )}
        {actualParentAnchors.length === 1 &&
          placeholderCenters.length === 1 && (
            <line
              x1={actualParentAnchors[0]!.x}
              y1={actualParentAnchors[0]!.y}
              x2={placeholderCenters[0]!.x}
              y2={placeholderCenters[0]!.y}
              stroke="rgba(177,165,145,0.78)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity={opacity}
            />
          )}
      </svg>
      {placeholderCenters.map((placeholder) => (
        <div
          key={placeholder.id}
          style={{
            position: "absolute",
            left: placeholder.x - bubbleSize / 2,
            top: placeholder.y - bubbleSize / 2,
            zIndex: 17,
            display: "grid",
            justifyItems: "center",
            gap: 6,
            pointerEvents: "auto",
            opacity,
          }}
        >
          <button
            type="button"
            onClick={onPlaceholderClick}
            title="Add parent"
            style={{
              width: bubbleSize,
              height: bubbleSize,
              borderRadius: "50%",
              border: "1px dashed rgba(78,93,66,0.45)",
              background: "rgba(246,241,231,0.74)",
              color: "var(--moss)",
              fontFamily: "var(--font-ui)",
              fontSize: 24,
              lineHeight: 1,
              cursor: "pointer",
              boxShadow: "0 8px 20px rgba(28,25,21,0.08)",
              backdropFilter: "blur(6px)",
            }}
          >
            +
          </button>
          {showLabel && (
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                background: "rgba(246,241,231,0.88)",
                border: "1px solid rgba(177,165,145,0.5)",
                borderRadius: 999,
                padding: "3px 8px",
                whiteSpace: "nowrap",
                boxShadow: "0 6px 16px rgba(28,25,21,0.06)",
              }}
            >
              Add parent
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function RelationGhost({
  centerX,
  centerY,
  kind,
  label,
  onClick,
}: {
  centerX: number;
  centerY: number;
  kind: EditRelationKind;
  label: string;
  onClick: () => void;
}) {
  const size = 64;
  return (
    <div
      style={{
        position: "absolute",
        left: centerX - size / 2,
        top: centerY - size / 2,
        zIndex: 19,
        display: "grid",
        justifyItems: "center",
        gap: 8,
      }}
    >
      <button
        onClick={onClick}
        title={`Add ${relationLabel(kind)}`}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "1px dashed rgba(78,93,66,0.45)",
          background: "rgba(246,241,231,0.6)",
          color: "var(--moss)",
          fontFamily: "var(--font-ui)",
          fontSize: 24,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 10px 20px rgba(28,25,21,0.08)",
          backdropFilter: "blur(6px)",
        }}
      >
        +
      </button>
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          color: "var(--ink-faded)",
          background: "rgba(246,241,231,0.88)",
          border: "1px solid rgba(177,165,145,0.5)",
          borderRadius: 999,
          padding: "3px 8px",
          whiteSpace: "nowrap",
          boxShadow: "0 6px 16px rgba(28,25,21,0.06)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FormRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: 5,
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        color: "var(--ink-faded)",
      }}
    >
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          border: "1px solid var(--rule)",
          borderRadius: 8,
          padding: "8px 10px",
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--ink)",
          background: "var(--paper-deep)",
        }}
      />
    </label>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  fontWeight: 500,
  color: "white",
  background: "var(--moss)",
  border: "none",
  borderRadius: 7,
  padding: "8px 12px",
  cursor: "pointer",
};

const subtleButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 12,
  color: "var(--ink-faded)",
  background: "none",
  border: "1px solid var(--rule)",
  borderRadius: 7,
  padding: "8px 12px",
  cursor: "pointer",
};

const toolbarButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  color: "var(--ink-faded)",
  background: "rgba(246,241,231,0.76)",
  border: "1px solid var(--rule)",
  borderRadius: 999,
  cursor: "pointer",
  padding: "8px 14px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  textDecoration: "none",
  boxShadow: "0 12px 26px rgba(28,25,21,0.06)",
};

const toolbarPrimaryButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  color: "#fff",
  background: "var(--moss)",
  border: "1px solid rgba(78,93,66,0.28)",
  fontWeight: 500,
};

const toolbarIconButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  padding: "7px 10px",
  justifyContent: "center",
  minWidth: 36,
};

const toolbarHintStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 11,
  color: "var(--ink-faded)",
  background: "rgba(246,241,231,0.76)",
  border: "1px solid var(--rule)",
  borderRadius: 999,
  padding: "8px 12px",
  boxShadow: "0 12px 26px rgba(28,25,21,0.06)",
};

const toolbarSegmentedStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 4,
  borderRadius: 999,
  border: "1px solid var(--rule)",
  background: "rgba(246,241,231,0.76)",
  boxShadow: "0 12px 26px rgba(28,25,21,0.06)",
};

function toolbarNavItemStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    color: active ? "#fff" : "var(--ink-faded)",
    background: active ? "var(--moss)" : "transparent",
    border: active ? "1px solid rgba(78,93,66,0.28)" : "1px solid transparent",
    borderRadius: 999,
    padding: "7px 12px",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    boxShadow: "none",
  };
}

function toolbarNavButtonStyle(active: boolean): React.CSSProperties {
  return {
    ...toolbarNavItemStyle(active),
    cursor: "pointer",
  };
}

const floatingPanelStyle: React.CSSProperties = {
  background: "rgba(246,241,231,0.94)",
  border: "1px solid var(--rule)",
  borderRadius: 14,
  boxShadow: "0 18px 34px rgba(28,25,21,0.1)",
  backdropFilter: "blur(12px)",
};

export function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
