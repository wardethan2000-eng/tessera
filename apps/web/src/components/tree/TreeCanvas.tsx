"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
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
  getConstellationFocusBounds,
  getConstellationFocusIds,
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
  onDriftClick: () => void;
  onPersonDetailClick: (personId: string) => void;
  onAddMemoryClick?: () => void;
  onSearchClick?: () => void;
  onConstellationChanged?: () => Promise<void> | void;
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
  onDriftClick,
  onPersonDetailClick,
  onAddMemoryClick,
  onSearchClick,
  onConstellationChanged,
}: TreeCanvasProps) {
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<TreeFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TreeEdge>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editInteraction, setEditInteraction] = useState<EditInteractionState>({ mode: "idle" });
  const [projectedEditSlots, setProjectedEditSlots] = useState<
    Array<{ kind: EditRelationKind; x: number; y: number; label: string }>
  >([]);
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

  const layout = useMemo(
    () => computeLayout(people, relationships),
    [people, relationships]
  );
  const focusPersonId = editMode ? selectedPersonId : (selectedPersonId ?? hoverState?.personId ?? null);
  const focusPersonIds = useMemo(
    () => getConstellationFocusIds(focusPersonId, relationships),
    [focusPersonId, relationships],
  );

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Rebuild nodes whenever people/layout/selected changes
  useEffect(() => {
    const personNodes = buildPersonNodes(
      people,
      layout,
      selectedPersonId,
      currentUserPersonId,
      focusPersonIds,
    );
    const edgeList = buildEdges(relationships, layout, focusPersonIds);
    setNodes(personNodes);
    setEdges(edgeList);
  }, [
    people,
    relationships,
    layout,
    selectedPersonId,
    currentUserPersonId,
    focusPersonIds,
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
      if (focusCamera) {
        const bounds = getConstellationFocusBounds(
          personId,
          relationships,
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
    [reactFlow, relationships]
  );

  const resetRelationshipEditorDrafts = useCallback(() => {
    setEditingRelationshipType("parent_child");
    setEditingRelationshipSpouseStatus("active");
    setEditingRelationshipStartDateText("");
    setEditingRelationshipEndDateText("");
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPersonId(null);
    setEditInteraction({ mode: "idle" });
    setCreateError(null);
    setShowAdvancedForm(false);
    resetRelationshipEditorDrafts();
    setTimeout(() => {
      reactFlow.fitView({ duration: 600, padding: 0.12 });
    }, 50);
  }, [reactFlow, resetRelationshipEditorDrafts]);

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

  const handleToggleEditMode = useCallback(() => {
    const next = !editMode;
    setEditMode(next);
    setEditInteraction({ mode: "idle" });
    setCreateError(null);
    setShowAdvancedForm(false);
    resetRelationshipEditorDrafts();

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
    resetRelationshipEditorDrafts,
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

  const editingRelationship = useMemo(() => {
    if (editInteraction.mode !== "edge-editing") return null;
    return relationships.find((r) => r.id === editInteraction.relationshipId) ?? null;
  }, [editInteraction, relationships]);

  useEffect(() => {
    if (!editMode) {
      setEditInteraction({ mode: "idle" });
      setCreateError(null);
      setShowAdvancedForm(false);
      resetRelationshipEditorDrafts();
      setProjectedEditSlots([]);
    }
  }, [editMode, resetRelationshipEditorDrafts]);

  // Intentionally removed: former relay useEffect for relation-slot-chosen → create-link-modal
  // openRelationForm() now transitions directly to create-link-modal

  useEffect(() => {
    if (editInteraction.mode !== "edge-editing") return;
    if (editingRelationship) return;
    setEditInteraction(
      selectedPersonId
        ? { mode: "node-selected", personId: selectedPersonId }
        : { mode: "idle" },
    );
    resetRelationshipEditorDrafts();
  }, [editInteraction, editingRelationship, resetRelationshipEditorDrafts, selectedPersonId]);

  const refreshSelectedCenter = useCallback(() => {
    if (!editMode || !selectedPersonId) {
      setProjectedEditSlots([]);
      return;
    }
    if (!rootRef.current) {
      setProjectedEditSlots([]);
      return;
    }
    const rootRect = rootRef.current.getBoundingClientRect();
    const slots = buildEditSlots(selectedPersonId, relationships, layoutRef.current).map(
      (slot) => {
        const screenCenter = reactFlow.flowToScreenPosition({
          x: slot.flowX,
          y: slot.flowY,
        });
        return {
          kind: slot.kind,
          x: screenCenter.x - rootRect.left,
          y: screenCenter.y - rootRect.top,
          label: slot.label,
        };
      },
    );
    setProjectedEditSlots(slots);
  }, [editMode, selectedPersonId, reactFlow, relationships]);

  useEffect(() => {
    refreshSelectedCenter();
  }, [nodes, refreshSelectedCenter]);

  useEffect(() => {
    const onResize = () => refreshSelectedCenter();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [refreshSelectedCenter]);

  const openRelationForm = useCallback(
    (kind: EditRelationKind) => {
      if (!selectedPersonId) return;
      setEditInteraction({
        mode: "create-link-modal",
        personId: selectedPersonId,
        relationKind: kind,
      });
      setCreateError(null);
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
    [selectedPersonId],
  );

  const submitCreateRelatedPerson = useCallback(async () => {
    if (editInteraction.mode !== "create-link-modal" || !relationAnchorPerson) return;
    const relationKind = editInteraction.relationKind;
    const displayName = createForm.displayName.trim();
    if (!displayName) {
      setCreateError("Please enter a name.");
      return;
    }

    setCreatingPerson(true);
    setCreateError(null);
    try {
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

      const relationshipPayload =
        relationKind === "parent"
          ? {
              type: "parent_child",
              fromPersonId: created.id,
              toPersonId: relationAnchorPerson.id,
            }
          : relationKind === "child"
            ? {
                type: "parent_child",
                fromPersonId: relationAnchorPerson.id,
                toPersonId: created.id,
              }
            : relationKind === "sibling"
              ? {
                  type: "sibling",
                  fromPersonId: relationAnchorPerson.id,
                  toPersonId: created.id,
                }
              : {
                  type: "spouse",
                  fromPersonId: relationAnchorPerson.id,
                  toPersonId: created.id,
                  spouseStatus: "active",
                  startDateText:
                    createForm.relationshipStartDateText.trim() || undefined,
                };

      const relRes = await fetch(`${API}/api/trees/${treeId}/relationships`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(relationshipPayload),
      });
      if (!relRes.ok) {
        const err = (await relRes.json()) as { error?: string };
        throw new Error(err.error ?? "Person added but relationship failed");
      }

      await onConstellationChanged?.();
      if (editMode) {
        setSelectedPersonId(created.id);
        setEditInteraction({ mode: "node-selected", personId: created.id });
      } else {
        selectPerson(created.id);
        setTimeout(() => selectPerson(created.id), 220);
        setEditInteraction({ mode: "idle" });
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to add person");
    } finally {
      setCreatingPerson(false);
    }
  }, [
    API,
    createForm.birthDateText,
    createForm.deathDateText,
    createForm.displayName,
    createForm.essenceLine,
    createForm.isLiving,
    createForm.relationshipStartDateText,
    editInteraction,
    onConstellationChanged,
    editMode,
    relationAnchorPerson,
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

  const deleteRelationship = useCallback(async () => {
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
        throw new Error(err.error ?? "Failed to delete relationship");
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
        err instanceof Error ? err.message : "Failed to delete relationship",
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
          height: 52,
          background: CONTROL_SURFACE,
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${CONTROL_BORDER}`,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink)",
            lineHeight: 1,
          }}
        >
          {treeName}
        </span>

        <div style={{ flex: 1 }} />

        {onSearchClick && (
          <button
            onClick={onSearchClick}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              background: "rgba(255,255,255,0.28)",
              border: `1px solid ${CONTROL_BORDER}`,
              borderRadius: 999,
              cursor: "pointer",
              padding: "6px 11px",
              display: "flex",
              alignItems: "center",
              gap: 5,
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
          onClick={handleToggleEditMode}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: 500,
            color: editMode ? "white" : "var(--ink-faded)",
            background: editMode ? "var(--ink)" : "rgba(255,255,255,0.28)",
            border: editMode ? "1px solid rgba(28,25,21,0.32)" : `1px solid ${CONTROL_BORDER}`,
            cursor: "pointer",
            padding: "6px 11px",
            borderRadius: 999,
          }}
        >
          {editMode ? "Exit edit mode" : "Edit constellation"}
        </button>

        <button
          onClick={onDriftClick}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "var(--moss)",
            background: "rgba(255,255,255,0.18)",
            border: `1px solid ${CONTROL_BORDER}`,
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: 999,
          }}
        >
          Drift ›
        </button>

        {onAddMemoryClick && (
          <button
            onClick={onAddMemoryClick}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              fontWeight: 500,
              color: "white",
              background: "var(--moss)",
              border: "1px solid rgba(78,93,66,0.26)",
              cursor: "pointer",
              padding: "6px 14px",
              borderRadius: 999,
            }}
          >
            + Add
          </button>
        )}

        <a
          href={`/trees/${treeId}/atrium`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            textDecoration: "none",
            padding: "5px 9px",
            border: `1px solid ${CONTROL_BORDER}`,
            borderRadius: 999,
            background: "rgba(255,255,255,0.2)",
          }}
        >
          ⌂
        </a>

        <a
          href={`/trees/${treeId}/inbox`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "var(--ink-faded)",
            textDecoration: "none",
            padding: "5px 9px",
            border: `1px solid ${CONTROL_BORDER}`,
            borderRadius: 999,
            background: "rgba(255,255,255,0.2)",
          }}
          title="Inbox"
        >
          ✉
        </a>

        <a
          href={`/trees/${treeId}/settings`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            textDecoration: "none",
            padding: "5px 6px",
          }}
        >
          ⚙
        </a>
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
        {[
          { label: "+", action: () => reactFlow.zoomIn({ duration: 300 }) },
          { label: "−", action: () => reactFlow.zoomOut({ duration: 300 }) },
          { label: "⊕", action: handleLocateMe, disabled: !currentUserPersonId, title: "Locate me" },
        ].map(({ label, action, disabled, title }) => (
          <button
            key={label}
            onClick={action}
            disabled={disabled}
            title={title}
            style={{
              width: 32,
              height: 32,
              background: CONTROL_SURFACE,
              border: `1px solid ${CONTROL_BORDER}`,
              borderRadius: 999,
              cursor: disabled ? "default" : "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: label === "⊕" ? 14 : 18,
              color: disabled ? "var(--rule)" : label === "⊕" ? "var(--moss)" : "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(10px)",
              boxShadow: "0 10px 22px rgba(28,25,21,0.06)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Legend button */}
      <div style={{ position: "absolute", left: 16, bottom: 18, zIndex: 10 }}>
        <button
          onClick={() => setShowLegend((v) => !v)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            background: CONTROL_SURFACE,
            border: `1px solid ${CONTROL_BORDER}`,
            borderRadius: 999,
            padding: "5px 11px",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            boxShadow: "0 10px 22px rgba(28,25,21,0.06)",
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
              background: "rgba(246,241,231,0.95)",
              border: `1px solid ${CONTROL_BORDER}`,
              borderRadius: 12,
              padding: "14px 16px",
              minWidth: 180,
              boxShadow: "0 18px 32px rgba(28,25,21,0.1)",
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
            background: "rgba(246,241,231,0.96)",
            border: `1px solid ${CONTROL_BORDER}`,
            borderRadius: 10,
            padding: "10px 14px",
            boxShadow: "0 18px 30px rgba(28,25,21,0.12)",
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
        onMove={refreshSelectedCenter}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        panOnScroll={false}
        zoomOnScroll={true}
        minZoom={0.15}
        maxZoom={2.5}
        style={{ background: "transparent", paddingTop: 52 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          style={{ background: "transparent" }}
          gap={44}
          size={1}
          color="rgba(177,165,145,0.22)"
        />
        <MiniMap
          style={{
            background: "rgba(246,241,231,0.8)",
            border: `1px solid ${CONTROL_BORDER}`,
            borderRadius: 14,
            boxShadow: "0 18px 28px rgba(28,25,21,0.08)",
          }}
          nodeColor="rgba(112,103,90,0.62)"
          maskColor="rgba(237,230,214,0.66)"
          position="bottom-right"
        />
      </ReactFlow>

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
              Add person
            </div>

            <div style={{ display: "grid", gap: 10 }}>
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
                {creatingPerson ? "Adding…" : "Add to constellation"}
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
              Edit relationship
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
                onClick={deleteRelationship}
                style={{
                  ...subtleButtonStyle,
                  color: "var(--rose)",
                  borderColor: "rgba(168,93,93,0.35)",
                }}
                disabled={savingRelationship}
              >
                Remove
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

      {/* Tips & affordances bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 36,
          background: CONTROL_SURFACE,
          backdropFilter: "blur(10px)",
          borderTop: `1px solid ${CONTROL_BORDER}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {(editMode
          ? ["Select a person, then add a valid relation ghost or click a line", "Click background to reset"]
          : [
              "Scroll to zoom",
              "Double-click to open a person",
              "Click to preview",
              "Use minimap to navigate",
            ]
        ).map((tip, i) => (
          <React.Fragment key={tip}>
            {i > 0 && (
              <span style={{ color: "var(--rule)", fontSize: 10 }}>·</span>
            )}
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
              }}
            >
              {tip}
            </span>
          </React.Fragment>
        ))}
      </div>

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
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<TreeEdge>) {
  const edgeData = data as ConstellationEdgeData | undefined;
  const stroke = "rgba(177, 165, 145, 0.95)";
  const opacity = edgeData?.opacity ?? 1;
  const strokeWidth = edgeData?.strokeWidth ?? 1.3;

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
    return <BaseEdge id={id} path={path} style={{ stroke, opacity, strokeWidth }} />;
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

  return <BaseEdge id={id} path={path} style={{ stroke, opacity, strokeWidth }} />;
}

function SpouseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<TreeEdge>) {
  const edgeData = data as ConstellationEdgeData | undefined;
  const stroke = "rgba(177, 165, 145, 0.95)";
  const opacity = edgeData?.opacity ?? 1;
  const strokeWidth = edgeData?.strokeWidth ?? 1.2;
  const controlY = Math.min(sourceY, targetY) - 18;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${targetX} ${targetY}`,
  ].join(" ");
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke,
        opacity,
        strokeWidth,
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

export function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
