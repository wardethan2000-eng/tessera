"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  Background,
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
  familyMapHref?: string;
  people: ApiPerson[];
  relationships: ApiRelationship[];
  currentUserPersonId: string | null;
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
  familyMapHref,
  people,
  relationships,
  currentUserPersonId,
  onDriftClick,
  onPersonDetailClick,
  onAddMemoryClick,
  onRequestMemoryClick,
  onSearchClick,
  onConstellationChanged,
  onSelectedPersonChange,
}: TreeCanvasProps) {
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const [nodes, setNodes, onNodesChange] = useNodesState<TreeFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TreeEdge>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [lineageMode, setLineageMode] = useState<LineageFocusMode>("full");
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
  const layoutRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const didInitializeLineageRef = useRef(false);

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
  const renderPeople = useMemo(
    () =>
      renderFocusIds
        ? people.filter((person) => renderFocusIds.has(person.id))
        : people,
    [people, renderFocusIds],
  );
  const renderRelationships = useMemo(
    () =>
      renderFocusIds
        ? relationships.filter(
            (relationship) =>
              renderFocusIds.has(relationship.fromPersonId) &&
              renderFocusIds.has(relationship.toPersonId),
          )
        : relationships,
    [relationships, renderFocusIds],
  );
  const layout = useMemo(
    () => computeLayout(renderPeople, renderRelationships),
    [renderPeople, renderRelationships]
  );

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (didInitializeLineageRef.current) return;
    if (!currentUserPersonId) return;
    if (!people.some((person) => person.id === currentUserPersonId)) return;

    didInitializeLineageRef.current = true;
    setSelectedPersonId(currentUserPersonId);
    setLineageMode("birth");
  }, [currentUserPersonId, people]);

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
      renderFocusIds,
    );
    const edgeList = buildEdges(renderRelationships, layout, renderFocusIds);
    setNodes(personNodes);
    setEdges(edgeList);
  }, [
    renderPeople,
    renderRelationships,
    layout,
    selectedPersonId,
    currentUserPersonId,
    renderFocusIds,
    setNodes,
    setEdges,
  ]);

  // Initial fitView after nodes are set
  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlow.fitView({ duration: 600, padding: 0.12 });
    }, 120);
    return () => clearTimeout(timer);
  // Only run on mount / people change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.length]);

  const selectPerson = useCallback(
    (personId: string, focusCamera = true) => {
      setSelectedPersonId(personId);
      const nextLineageMode = lineageMode === "full" ? "birth" : lineageMode;
      if (lineageMode === "full") {
        setLineageMode("birth");
      }
      if (focusCamera) {
        const bounds =
          getFocusBoundsForIds(
            getLineageFocusIds(personId, relationships, nextLineageMode),
            layoutRef.current,
          );
        if (bounds) {
          reactFlow.fitBounds(bounds, { duration: 650, padding: 0.16 });
          return;
        }
        const pos = layoutRef.current.get(personId);
        if (pos) {
          reactFlow.setCenter(pos.x + 48, pos.y + 65, { duration: 600, zoom: 1.4 });
        }
      }
    },
    [lineageMode, reactFlow, relationships]
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
      reactFlow.fitView({ duration: 600, padding: 0.12 });
    }, 50);
  }, [reactFlow, resetEditDrafts]);

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
      reactFlow.fitBounds(bounds, { duration: 650, padding: 0.18 });
      return;
    }
    const pos = layoutRef.current.get(currentUserPersonId);
    if (pos) {
      reactFlow.setCenter(pos.x + 48, pos.y + 65, { duration: 600, zoom: 1.2 });
    }
  }, [currentUserPersonId, reactFlow, relationships]);

  const handleZoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 300 });
  }, [reactFlow]);

  const handleZoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 300 });
  }, [reactFlow]);

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
            reactFlow.fitBounds(bounds, { duration: 500, padding: 0.2 });
          }, 30);
          return;
        }
      }
      setTimeout(() => {
        reactFlow.fitView({ duration: 420, padding: 0.24 });
      }, 30);
      return;
    }

    setTimeout(() => {
      reactFlow.fitView({ duration: 420, padding: 0.12 });
    }, 30);
  }, [
    currentUserPersonId,
    editMode,
    people,
    reactFlow,
    relationships,
    resetEditDrafts,
    selectedPersonId,
  ]);

  useEffect(() => {
    if (editMode || !selectedPersonId) return;

    const timer = setTimeout(() => {
      if (lineageMode === "full") {
        reactFlow.fitView({ duration: 560, padding: 0.12 });
        return;
      }

      const bounds = getFocusBoundsForIds(lineageFocusIds, layout);
      if (bounds) {
        reactFlow.fitBounds(bounds, {
          duration: 760,
          padding: 0.22,
        });
      }
    }, 20);
    return () => clearTimeout(timer);
  }, [
    editMode,
    layout,
    lineageFocusIds,
    lineageMode,
    reactFlow,
    relationships,
    selectedPersonId,
  ]);

  const selectedPerson = selectedPersonId
    ? people.find((p) => p.id === selectedPersonId) ?? null
    : null;

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
          backgroundImage:
            "radial-gradient(circle at 8% 14%, rgba(177,165,145,0.22) 0 1px, transparent 1.5px), radial-gradient(circle at 22% 30%, rgba(177,165,145,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 39% 12%, rgba(177,165,145,0.16) 0 1px, transparent 1.5px), radial-gradient(circle at 61% 22%, rgba(177,165,145,0.2) 0 1px, transparent 1.5px), radial-gradient(circle at 74% 38%, rgba(177,165,145,0.14) 0 1px, transparent 1.5px), radial-gradient(circle at 90% 16%, rgba(177,165,145,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 14% 62%, rgba(177,165,145,0.16) 0 1px, transparent 1.5px), radial-gradient(circle at 31% 74%, rgba(177,165,145,0.14) 0 1px, transparent 1.5px), radial-gradient(circle at 53% 66%, rgba(177,165,145,0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 79% 70%, rgba(177,165,145,0.15) 0 1px, transparent 1.5px)",
          opacity: 0.75,
        }}
      />
      {/* Canvas header */}
      <div
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 20px",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
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

          <div style={toolbarSegmentedStyle}>
            <a href={`/trees/${treeId}/atrium`} style={toolbarNavItemStyle(false)}>
              Atrium
            </a>
            <a href={`/trees/${treeId}`} style={toolbarNavItemStyle(true)}>
              Tree
            </a>
            {familyMapHref && (
              <a href={familyMapHref} style={toolbarNavItemStyle(false)}>
                Map
              </a>
            )}
          </div>

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
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 8,
            maxWidth: "min(100%, 980px)",
          }}
        >
          {onSearchClick && (
            <button
              onClick={onSearchClick}
              style={{
                ...toolbarButtonStyle,
              }}
            >
              <span>⌕</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                Search
                <kbd
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 10,
                    background: "var(--paper)",
                    border: "1px solid var(--rule)",
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: "var(--ink-faded)",
                  }}
                >
                  ⌘K
                </kbd>
              </span>
            </button>
          )}

          <button
            onClick={onDriftClick}
            style={toolbarAccentButtonStyle}
          >
            Drift
          </button>

          {onAddMemoryClick && (
            <button
              onClick={onAddMemoryClick}
              style={toolbarPrimaryButtonStyle}
            >
              + Add
            </button>
          )}

          {onRequestMemoryClick && (
            <button
              onClick={onRequestMemoryClick}
              style={toolbarButtonStyle}
            >
              Request a memory
            </button>
          )}

          <a
            href={`/trees/${treeId}/inbox`}
            style={toolbarButtonStyle}
            title="Inbox"
          >
            Inbox
          </a>

          <a
            href={`/trees/${treeId}/settings`}
            style={toolbarButtonStyle}
          >
            Settings
          </a>
        </div>
      </div>

      {/* Left zoom controls */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 60,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <button
          onClick={handleZoomIn}
          style={zoomControlStyle}
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          style={zoomControlStyle}
        >
          −
        </button>
        <button
          onClick={handleLocateMe}
          disabled={!currentUserPersonId}
          title="Locate me"
          style={{
            ...zoomControlStyle,
            cursor: !currentUserPersonId ? "default" : "pointer",
            fontSize: 14,
            color: !currentUserPersonId ? "var(--rule)" : "var(--moss)",
          }}
        >
          ⊕
        </button>
      </div>

      {/* Legend button */}
      <div style={{ position: "absolute", left: 16, bottom: 18, zIndex: 10 }}>
        <button
          onClick={() => setShowLegend((v) => !v)}
          style={{
            ...toolbarButtonStyle,
            fontSize: 11,
            padding: "6px 11px",
          }}
        >
          Legend
        </button>

        {/* Legend panel */}
        {showLegend && (
          <div
            style={{
              position: "absolute",
              bottom: 36,
              left: 0,
              ...floatingPanelStyle,
              padding: "14px 16px",
              minWidth: 180,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                color: "var(--ink-faded)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Legend
            </div>
            {[
              {
                ring: "1.5px solid var(--rule)",
                label: "Family member",
              },
              {
                ring: "2px solid var(--moss)",
                label: "That's you",
              },
              {
                ring: "1.5px dashed var(--ink)",
                label: "Selected",
              },
            ].map(({ ring, label }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: ring,
                    background: "var(--paper-deep)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    color: "var(--ink-soft)",
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
            <div
              style={{
                borderTop: "1px solid var(--rule)",
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              {[
                { dash: "none", label: "Parent / child" },
                { dash: "2 4", label: "Sibling" },
                { dash: "4 4", label: "Spouse" },
              ].map(({ dash, label }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <svg width="24" height="10">
                    <line
                      x1="0"
                      y1="5"
                      x2="24"
                      y2="5"
                      stroke="var(--rule)"
                      strokeWidth="1.5"
                      strokeDasharray={dash === "none" ? undefined : dash}
                    />
                  </svg>
                  <span
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      color: "var(--ink-soft)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
        panOnScroll={false}
        zoomOnScroll={true}
        minZoom={0.15}
        maxZoom={2.5}
        style={{ background: "transparent", paddingTop: CANVAS_TOP_PADDING }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          style={{ background: "transparent" }}
          gap={44}
          size={1}
          color="rgba(177,165,145,0.22)"
        />
      </ReactFlow>

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
                        label="Essence line"
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

      {/* Cinematic person overlay */}
      {!editMode && (
        <CinematicPersonOverlay
          person={selectedPerson}
          onClose={clearSelection}
          onEnter={onPersonDetailClick}
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
  const stroke = "rgba(177, 165, 145, 0.95)";
  const opacity = edgeData?.opacity ?? 1;
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
        style={{ stroke, opacity, strokeWidth, cursor: "pointer" }}
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
      style={{ stroke, opacity, strokeWidth, cursor: "pointer" }}
    />
  );
}

function SpouseEdge({
  id,
  data,
}: EdgeProps<TreeEdge>) {
  const edgeData = data as ConstellationEdgeData | undefined;
  const stroke = "rgba(177, 165, 145, 0.95)";
  const opacity = edgeData?.opacity ?? 1;
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
      style={{
        stroke,
        opacity,
        strokeWidth,
        strokeDasharray: edgeData?.strokeDasharray,
        cursor: "pointer",
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

const zoomControlStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  background: "rgba(246,241,231,0.94)",
  border: "1px solid var(--rule)",
  borderRadius: 999,
  cursor: "pointer",
  fontFamily: "var(--font-ui)",
  fontSize: 18,
  color: "var(--ink)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backdropFilter: "blur(10px)",
  boxShadow: "0 14px 30px rgba(28,25,21,0.08)",
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

const toolbarAccentButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  color: "var(--moss)",
  border: "1px solid rgba(78,93,66,0.28)",
  background: "rgba(246,241,231,0.92)",
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
