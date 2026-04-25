"use client";

import { useCallback, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;
const PAN_MOMENTUM_DECAY = 0.92;
const PAN_MOMENTUM_THRESHOLD = 0.15;
const PAN_MOMENTUM_INTERVAL = 16;

export function useMomentumCamera(
  reactFlow: ReactFlowInstance,
) {
  const velocityRef = useRef({ x: 0, y: 0 });
  const momentumRafRef = useRef<number | null>(null);
  const lastPanEventRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current != null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
    lastPanEventRef.current = null;
  }, []);

  const momentumTick = useCallback(() => {
    const { x, y } = velocityRef.current;
    const speed = Math.sqrt(x * x + y * y);
    if (speed < PAN_MOMENTUM_THRESHOLD) {
      velocityRef.current = { x: 0, y: 0 };
      momentumRafRef.current = null;
      return;
    }

    const viewport = reactFlow.getViewport();
    reactFlow.setViewport(
      {
        x: viewport.x + x,
        y: viewport.y + y,
        zoom: viewport.zoom,
      },
      { duration: PAN_MOMENTUM_INTERVAL },
    );

    velocityRef.current = {
      x: x * PAN_MOMENTUM_DECAY,
      y: y * PAN_MOMENTUM_DECAY,
    };
    momentumRafRef.current = requestAnimationFrame(momentumTick);
  }, [reactFlow]);

  const startMomentum = useCallback(() => {
    if (momentumRafRef.current != null) return;
    momentumRafRef.current = requestAnimationFrame(momentumTick);
  }, [momentumTick]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      stopMomentum();

      const viewport = reactFlow.getViewport();

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.01;
        const factor = Math.pow(ZOOM_STEP, delta);
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));

        const rootEl = (reactFlow as unknown as { domNode?: Element | null }).domNode;
        const rect = rootEl?.getBoundingClientRect();
        const mouseX = rect ? e.clientX - rect.left : 0;
        const mouseY = rect ? e.clientY - rect.top : 0;

        const zoomRatio = nextZoom / viewport.zoom;
        const nextX = mouseX - (mouseX - viewport.x) * zoomRatio;
        const nextY = mouseY - (mouseY - viewport.y) * zoomRatio;

        reactFlow.setViewport(
          { x: nextX, y: nextY, zoom: nextZoom },
          { duration: 400 },
        );
      } else {
        const deltaX = e.deltaX * 0.8;
        const deltaY = e.deltaY * 0.8;
        reactFlow.setViewport(
          {
            x: viewport.x - deltaX,
            y: viewport.y - deltaY,
            zoom: viewport.zoom,
          },
          { duration: 200 },
        );
      }
    },
    [reactFlow, stopMomentum],
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as Element).closest(".react-flow__node")) return;
      stopMomentum();
      lastPanEventRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    },
    [stopMomentum],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!lastPanEventRef.current) return;
      if ((e.target as Element).closest(".react-flow__node")) return;

      const prev = lastPanEventRef.current;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      const dt = Date.now() - prev.t;

      const viewport = reactFlow.getViewport();
      reactFlow.setViewport(
        {
          x: viewport.x + dx,
          y: viewport.y + dy,
          zoom: viewport.zoom,
        },
        { duration: 0 },
      );

      if (dt > 0) {
        velocityRef.current = {
          x: (dx / dt) * PAN_MOMENTUM_INTERVAL,
          y: (dy / dt) * PAN_MOMENTUM_INTERVAL,
        };
      }

      lastPanEventRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    },
    [reactFlow],
  );

  const handlePointerUp = useCallback(() => {
    if (lastPanEventRef.current) {
      lastPanEventRef.current = null;
      startMomentum();
    }
  }, [startMomentum]);

  const fitViewSmooth = useCallback(
    (options?: { padding?: number; duration?: number }) => {
      stopMomentum();
      reactFlow.fitView({
        duration: options?.duration ?? 800,
        padding: options?.padding ?? 0.12,
      });
    },
    [reactFlow, stopMomentum],
  );

  const fitBoundsSmooth = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      options?: { padding?: number; duration?: number },
    ) => {
      stopMomentum();
      reactFlow.fitBounds(bounds, {
        duration: options?.duration ?? 800,
        padding: options?.padding ?? 0.22,
      });
    },
    [reactFlow, stopMomentum],
  );

  const setCenterSmooth = useCallback(
    (x: number, y: number, options?: { zoom?: number; duration?: number }) => {
      stopMomentum();
      reactFlow.setCenter(x, y, {
        duration: options?.duration ?? 600,
        zoom: options?.zoom ?? 1.4,
      });
    },
    [reactFlow, stopMomentum],
  );

  return {
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    fitViewSmooth,
    fitBoundsSmooth,
    setCenterSmooth,
    stopMomentum,
  };
}