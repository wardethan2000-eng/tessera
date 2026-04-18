/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type ReactFlowProps,
} from "@xyflow/react";
import ReactFlowBase from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React from "react";

import { PersonNode as PersonNodeComponent } from "./PersonNode";
import { MemoryCardNode as MemoryCardNodeComponent } from "./MemoryCardNode";
import type {
  ApiPerson,
  ApiRelationship,
  ApiMemory,
  FocusLevel,
  PersonFlowNode,
  MemoryCardFlowNode,
  TreeFlowNode,
  TreeEdge,
} from "./treeTypes";
import {
  computeLayout,
  buildPersonNodes,
  buildEdges,
  getImmediateFamily,
  buildMemoryCardNodes,
  buildMemoryEdges,
} from "./treeLayout";

// Cast to avoid React 19 JSX type incompatibility with @xyflow/react's React 18 types
const ReactFlow = ReactFlowBase as unknown as React.ComponentType<ReactFlowProps<TreeFlowNode, TreeEdge>>;

const NODE_TYPES = {
  person: PersonNodeComponent,
  memoryCard: MemoryCardNodeComponent,
};

interface TreeCanvasProps {
  treeId: string;
  treeName: string;
  people: ApiPerson[];
  relationships: ApiRelationship[];
  currentUserId: string | null;
  currentUserPersonId: string | null;
  onMemoryClick: (memory: ApiMemory, person: ApiPerson) => void;
  onDriftClick: () => void;
  onPersonDetailClick: (personId: string) => void;
  apiBase: string;
}

function TreeCanvasInner({
  treeId,
  treeName,
  people,
  relationships,
  currentUserId,
  currentUserPersonId,
  onMemoryClick,
  onDriftClick,
  onPersonDetailClick,
  apiBase,
}: TreeCanvasProps) {
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<TreeFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TreeEdge>([]);
  const [focusLevel, setFocusLevel] = useState<FocusLevel>(0);
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoriesCache, setMemoriesCache] = useState<Map<string, ApiMemory[]>>(new Map());
  const [hintVisible, setHintVisible] = useState(true);
  const hasInteracted = useRef(false);
  const layoutRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Compute base layout once
  const layout = useMemo(
    () => computeLayout(people, relationships),
    [people, relationships]
  );

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Initialize nodes + edges at Level 0
  useEffect(() => {
    const personNodes = buildPersonNodes(
      people,
      layout,
      null,
      new Set(),
      currentUserPersonId
    );
    const edgeList = buildEdges(relationships);
    setNodes(personNodes);
    setEdges(edgeList);

    setTimeout(() => {
      reactFlow.fitView({ duration: 600, padding: 0.12 });
    }, 100);
  }, [people, relationships, layout, currentUserPersonId, reactFlow, setNodes, setEdges]);

  const fetchMemories = useCallback(
    async (personId: string): Promise<ApiMemory[]> => {
      if (memoriesCache.has(personId)) return memoriesCache.get(personId)!;
      setLoadingMemories(true);
      try {
        const res = await fetch(
          `${apiBase}/api/trees/${treeId}/people/${personId}`,
          { credentials: "include" }
        );
        if (!res.ok) return [];
        const data = await res.json();
        const memories: ApiMemory[] = (data.memories ?? []).map((m: ApiMemory) => ({
          ...m,
          personId: personId,
        }));
        setMemoriesCache((prev) => new Map(prev).set(personId, memories));
        return memories;
      } finally {
        setLoadingMemories(false);
      }
    },
    [apiBase, treeId, memoriesCache]
  );

  const focusPerson = useCallback(
    async (personId: string) => {
      const clusterIds = getImmediateFamily(personId, relationships);
      const memories = await fetchMemories(personId);

      const personPos = layoutRef.current.get(personId) ?? { x: 0, y: 0 };
      const memCardNodes = buildMemoryCardNodes(
        personPos.x,
        personPos.y,
        personId,
        memories
      );
      const memEdges = buildMemoryEdges(personId, memCardNodes);

      // Rebuild person nodes with focus state
      const personNodes = buildPersonNodes(
        people,
        layoutRef.current,
        personId,
        clusterIds,
        currentUserPersonId
      );

      const baseEdges = buildEdges(relationships);
      setNodes([...personNodes, ...memCardNodes]);
      setEdges([...baseEdges, ...memEdges]);
      setFocusedPersonId(personId);
      setFocusLevel(1);

      // Compute bounds for cluster + memory cards
      const clusterNodeIds = [...clusterIds];
      const clusterPositions = clusterNodeIds
        .map((id) => layoutRef.current.get(id))
        .filter(Boolean) as { x: number; y: number }[];

      const memCardPositions = memCardNodes.map((n) => n.position);
      const allPositions = [...clusterPositions, ...memCardPositions];

      if (allPositions.length > 0) {
        const minX = Math.min(...allPositions.map((p) => p.x)) - 60;
        const minY = Math.min(...allPositions.map((p) => p.y)) - 60;
        const maxX = Math.max(...allPositions.map((p) => p.x)) + 160;
        const maxY = Math.max(...allPositions.map((p) => p.y)) + 170;

        reactFlow.fitBounds(
          { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          { duration: 700 }
        );
      }
    },
    [
      people,
      relationships,
      currentUserPersonId,
      fetchMemories,
      reactFlow,
      setNodes,
      setEdges,
    ]
  );

  const unfocus = useCallback(() => {
    const personNodes = buildPersonNodes(
      people,
      layoutRef.current,
      null,
      new Set(),
      currentUserPersonId
    );
    const edgeList = buildEdges(relationships);
    setNodes(personNodes);
    setEdges(edgeList);
    setFocusedPersonId(null);
    setFocusLevel(0);
    setTimeout(() => {
      reactFlow.fitView({ duration: 600, padding: 0.12 });
    }, 50);
  }, [people, relationships, currentUserPersonId, reactFlow, setNodes, setEdges]);

  const handleNodeClick: NodeMouseHandler<TreeFlowNode> = useCallback(
    (_, node) => {
      if (!hasInteracted.current) {
        hasInteracted.current = true;
        setHintVisible(false);
      }

      if (node.type === "person") {
        const personNode = node as PersonFlowNode;
        if (focusedPersonId === personNode.data.personId) {
          // Already focused — navigate to person detail
          onPersonDetailClick(personNode.data.personId);
        } else {
          focusPerson(personNode.data.personId);
        }
      } else if (node.type === "memoryCard") {
        const cardNode = node as MemoryCardFlowNode;
        if (cardNode.data.isOverflow) {
          const personId = cardNode.data.personId;
          onPersonDetailClick(personId);
        } else {
          const person = people.find((p) => p.id === cardNode.data.personId);
          if (person) {
            const memories = memoriesCache.get(cardNode.data.personId) ?? [];
            const memory = memories.find((m) => m.id === cardNode.data.memoryId);
            if (memory) onMemoryClick(memory, person);
          }
        }
      }
    },
    [focusPerson, focusedPersonId, memoriesCache, onMemoryClick, onPersonDetailClick, people]
  );

  const handlePaneClick = useCallback(() => {
    if (!hasInteracted.current) {
      hasInteracted.current = true;
      setHintVisible(false);
    }
    if (focusLevel > 0) unfocus();
  }, [focusLevel, unfocus]);

  const handleLocateMe = useCallback(() => {
    if (!currentUserPersonId) return;
    const pos = layoutRef.current.get(currentUserPersonId);
    if (pos) {
      reactFlow.setCenter(pos.x + 48, pos.y + 65, { duration: 600, zoom: 1.2 });
    }
  }, [currentUserPersonId, reactFlow]);

  const focusedPerson = focusedPersonId
    ? people.find((p) => p.id === focusedPersonId)
    : null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Canvas header */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          height: 52,
          background: "rgba(246, 241, 231, 0.88)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 16,
        }}
      >
        {/* Tree name */}
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

        {/* Breadcrumb */}
        {focusedPerson && (
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "opacity 400ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            }}
          >
            <span>›</span>
            <span
              style={{ color: "var(--ink-soft)", fontStyle: "italic" }}
            >
              {focusedPerson.name}
            </span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Loading indicator */}
        {loadingMemories && (
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faded)" }}>
            Loading…
          </span>
        )}

        {/* Drift button */}
        <button
          onClick={onDriftClick}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "var(--moss)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 10px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Drift ›
        </button>

        {/* Settings */}
        <a
          href={`/trees/${treeId}/settings`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            textDecoration: "none",
          }}
        >
          ⚙
        </a>
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 80,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {[
          { label: "+", action: () => reactFlow.zoomIn({ duration: 300 }) },
          { label: "−", action: () => reactFlow.zoomOut({ duration: 300 }) },
          { label: "⊕", action: handleLocateMe, disabled: !currentUserPersonId },
        ].map(({ label, action, disabled }) => (
          <button
            key={label}
            onClick={action}
            disabled={disabled}
            style={{
              width: 32,
              height: 32,
              background: "rgba(246,241,231,0.88)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              cursor: disabled ? "default" : "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: label === "⊕" ? 14 : 16,
              color: disabled ? "var(--ink-faded)" : label === "⊕" ? "var(--moss)" : "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Canvas hint */}
      {hintVisible && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            background: "rgba(246,241,231,0.7)",
            padding: "6px 14px",
            borderRadius: 20,
            pointerEvents: "none",
            transition: "opacity 600ms cubic-bezier(0.22, 0.61, 0.36, 1)",
            opacity: hintVisible ? 1 : 0,
          }}
        >
          Drag to move · Scroll to zoom
        </div>
      )}

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={NODE_TYPES}
        panOnScroll={false}
        zoomOnScroll={true}
        minZoom={0.15}
        maxZoom={2.5}
        style={{ background: "var(--paper)", paddingTop: 52 }}
        proOptions={{ hideAttribution: true }}
        onMove={() => {
          if (!hasInteracted.current) {
            hasInteracted.current = true;
            setHintVisible(false);
          }
        }}
      >
        <Background
          style={{ background: "var(--paper)" }}
          gap={32}
          size={1}
          color="var(--rule)"
        />
      </ReactFlow>
    </div>
  );
}

export function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
