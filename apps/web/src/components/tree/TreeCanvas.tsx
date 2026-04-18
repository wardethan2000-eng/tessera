/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ReactFlow as ReactFlowBase,
  type NodeMouseHandler,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React from "react";

import { PersonNode as PersonNodeComponent } from "./PersonNode";
import { CinematicPersonOverlay } from "./CinematicPersonOverlay";
import type {
  ApiPerson,
  ApiRelationship,
  PersonFlowNode,
  TreeFlowNode,
  TreeEdge,
} from "./treeTypes";
import {
  computeLayout,
  buildPersonNodes,
  buildEdges,
} from "./treeLayout";

// Cast to avoid React 19 JSX type incompatibility with @xyflow/react's React 18 types
const ReactFlow = ReactFlowBase as unknown as React.ComponentType<ReactFlowProps<TreeFlowNode, TreeEdge>>;

const NODE_TYPES = {
  person: PersonNodeComponent,
};

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
}

function TreeCanvasInner({
  treeId,
  treeName,
  people,
  relationships,
  currentUserPersonId,
  onDriftClick,
  onPersonDetailClick,
}: TreeCanvasProps) {
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<TreeFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TreeEdge>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const layoutRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layout = useMemo(
    () => computeLayout(people, relationships),
    [people, relationships]
  );

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Rebuild nodes whenever people/layout/selected changes
  useEffect(() => {
    const personNodes = buildPersonNodes(people, layout, selectedPersonId, currentUserPersonId);
    const edgeList = buildEdges(relationships);
    setNodes(personNodes);
    setEdges(edgeList);
  }, [people, relationships, layout, selectedPersonId, currentUserPersonId, setNodes, setEdges]);

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
    (personId: string) => {
      setSelectedPersonId(personId);
      const pos = layoutRef.current.get(personId);
      if (pos) {
        reactFlow.setCenter(pos.x + 48, pos.y + 65, { duration: 600, zoom: 1.4 });
      }
    },
    [reactFlow]
  );

  const clearSelection = useCallback(() => {
    setSelectedPersonId(null);
    setTimeout(() => {
      reactFlow.fitView({ duration: 600, padding: 0.12 });
    }, 50);
  }, [reactFlow]);

  const handleNodeClick: NodeMouseHandler<TreeFlowNode> = useCallback(
    (_, node) => {
      if (node.type !== "person") return;
      const personNode = node as PersonFlowNode;

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
    [selectPerson]
  );

  const handleNodeDoubleClick: NodeMouseHandler<TreeFlowNode> = useCallback(
    (_, node) => {
      if (node.type !== "person") return;
      const personNode = node as PersonFlowNode;

      // Cancel pending single-click action
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      onPersonDetailClick(personNode.data.personId);
    },
    [onPersonDetailClick]
  );

  const handlePaneClick = useCallback(() => {
    if (selectedPersonId) clearSelection();
  }, [selectedPersonId, clearSelection]);

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
    const pos = layoutRef.current.get(currentUserPersonId);
    if (pos) {
      reactFlow.setCenter(pos.x + 48, pos.y + 65, { duration: 600, zoom: 1.2 });
    }
  }, [currentUserPersonId, reactFlow]);

  const selectedPerson = selectedPersonId
    ? people.find((p) => p.id === selectedPersonId) ?? null
    : null;

  const hoveredPerson = hoverState
    ? people.find((p) => p.id === hoverState.personId) ?? null
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

        <button
          onClick={onDriftClick}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            color: "var(--moss)",
            background: "none",
            border: "1px solid var(--rule)",
            cursor: "pointer",
            padding: "5px 12px",
            borderRadius: 4,
          }}
        >
          Drift ›
        </button>

        <a
          href={`/trees/${treeId}/settings`}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            color: "var(--ink-faded)",
            textDecoration: "none",
            padding: "4px 8px",
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
              background: "rgba(246,241,231,0.88)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              cursor: disabled ? "default" : "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: label === "⊕" ? 14 : 18,
              color: disabled ? "var(--rule)" : label === "⊕" ? "var(--moss)" : "var(--ink)",
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

      {/* Legend button */}
      <div style={{ position: "absolute", left: 16, bottom: 18, zIndex: 10 }}>
        <button
          onClick={() => setShowLegend((v) => !v)}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-faded)",
            background: "rgba(246,241,231,0.88)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
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
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 6,
              padding: "14px 16px",
              minWidth: 180,
              boxShadow: "0 4px 20px rgba(28,25,21,0.12)",
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
      {hoveredPerson && hoverState && !selectedPersonId && (
        <div
          style={{
            position: "fixed",
            left: hoverState.screenX + 14,
            top: hoverState.screenY - 16,
            zIndex: 15,
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            padding: "10px 14px",
            boxShadow: "0 4px 20px rgba(28,25,21,0.14)",
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
        onPaneClick={handlePaneClick}
        nodeTypes={NODE_TYPES}
        panOnScroll={false}
        zoomOnScroll={true}
        minZoom={0.15}
        maxZoom={2.5}
        style={{ background: "var(--paper)", paddingTop: 52 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          style={{ background: "var(--paper)" }}
          gap={32}
          size={1}
          color="var(--rule)"
        />
        <MiniMap
          style={{
            background: "rgba(246,241,231,0.92)",
            border: "1px solid var(--rule)",
          }}
          nodeColor="var(--ink-faded)"
          maskColor="rgba(237,230,214,0.5)"
          position="bottom-right"
        />
      </ReactFlow>

      {/* Tips & affordances bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 36,
          background: "rgba(246,241,231,0.88)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {[
          "Scroll to zoom",
          "Double-click to open a person",
          "Click to preview",
          "Use minimap to navigate",
        ].map((tip, i) => (
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
      <CinematicPersonOverlay
        person={selectedPerson}
        onClose={clearSelection}
        onEnter={onPersonDetailClick}
      />
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
