"use client";

import { useCallback, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

export function useMomentumCamera(
  reactFlow: ReactFlowInstance,
) {
  const velocityRef = useRef({ x: 0, y: 0 });
  const momentumRafRef = useRef<number | null>(null);
  const PAN_MOMENTUM_DECAY = 0.92;
  const PAN_MOMENTUM_THRESHOLD = 0.15;
  const PAN_MOMENTUM_INTERVAL = 16;

  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current != null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
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

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null) => {
      if (Math.abs(velocityRef.current.x) > PAN_MOMENTUM_THRESHOLD || Math.abs(velocityRef.current.y) > PAN_MOMENTUM_THRESHOLD) {
        startMomentum();
      }
    },
    [startMomentum],
  );

  const handleMoveStart = useCallback(() => {
    stopMomentum();
  }, [stopMomentum]);

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
    handleMoveStart,
    handleMoveEnd,
    fitViewSmooth,
    fitBoundsSmooth,
    setCenterSmooth,
    stopMomentum,
  };
}