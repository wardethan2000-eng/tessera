"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PinPosition, ThreadConnection, CameraState } from "./corkboardTypes";
import {
  CAMERA_GLIDE_DURATION,
  CAMERA_GLIDE_ZOOM_MID,
  CAMERA_FOCUSED_ZOOM,
  AMBIENT_DRIFT_SPEED,
  IDLE_THRESHOLD_MS,
} from "./corkboardAnimations";
import { sampleCameraPath, findThreadBetween } from "./CorkboardLayout";

function easeBezier(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * u * 0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * 1;
}

const EASE_P1 = 0.22;
const EASE_P2 = 0.61;

interface UseCorkboardCameraOptions {
  reduceMotion: boolean;
  isPlaying: boolean;
  isExpanded: boolean;
  isDragging: boolean;
}

export function useCorkboardCamera(
  pins: PinPosition[],
  threads: ThreadConnection[],
  options: UseCorkboardCameraOptions,
) {
  const { reduceMotion, isPlaying, isExpanded, isDragging } = options;

  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: CAMERA_FOCUSED_ZOOM });
  const rafRef = useRef<number | null>(null);
  const idleRafRef = useRef<number | null>(null);
  const ambientAngle = useRef(0.7);
  const lastInteraction = useRef(0);
  const isGlidingRef = useRef(false);
  const setCameraCallbackRef = useRef<((c: CameraState) => void) | null>(null);

  const setSetCamera = useCallback((fn: (c: CameraState) => void) => {
    setCameraCallbackRef.current = fn;
  }, []);

  const setCamera = useCallback((c: CameraState) => {
    cameraRef.current = c;
    setCameraCallbackRef.current?.(c);
  }, []);

  const cancelGlide = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    isGlidingRef.current = false;
  }, []);

  const glideToPin = useCallback(
    (fromMemId: string, toMemId: string, durationMs?: number) => {
      cancelGlide();
      isGlidingRef.current = true;
      lastInteraction.current = Date.now();

      const fromPin = pins.find((p) => p.memoryId === fromMemId);
      const toPin = pins.find((p) => p.memoryId === toMemId);
      if (!fromPin || !toPin) {
        const target: CameraState = {
          x: toPin ? toPin.x : cameraRef.current.x,
          y: toPin ? toPin.y : cameraRef.current.y,
          zoom: CAMERA_FOCUSED_ZOOM,
        };
        setCamera(target);
        isGlidingRef.current = false;
        return;
      }

      if (reduceMotion) {
        setCamera({ x: toPin.x, y: toPin.y, zoom: CAMERA_FOCUSED_ZOOM });
        isGlidingRef.current = false;
        return;
      }

      const thread = findThreadBetween(threads, fromMemId, toMemId);
      const threadType = thread?.type ?? "temporal";
      const direction = thread?.from === fromMemId ? 1 : -1;

      const start = { ...cameraRef.current };
      const duration = durationMs ?? CAMERA_GLIDE_DURATION * 1000;
      const startTime = performance.now();

      function tick(now: number) {
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / duration);
        const t = easeBezier(rawT, EASE_P1, EASE_P2);

        const pathT = direction === 1 ? t : 1 - t;
        const point = sampleCameraPath(fromPin!, toPin!, threadType, pathT);

        const zoomT = Math.sin(rawT * Math.PI);
        const midZoom = start.zoom + (CAMERA_GLIDE_ZOOM_MID - start.zoom) * (4 * zoomT - 4 * zoomT * zoomT);

        const next: CameraState = {
          x: point.x,
          y: point.y,
          zoom: rawT < 1 ? midZoom : CAMERA_FOCUSED_ZOOM,
        };
        cameraRef.current = next;
        setCameraCallbackRef.current?.(next);

        if (rawT < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          isGlidingRef.current = false;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [pins, threads, reduceMotion, cancelGlide, setCamera],
  );

  const jumpToPin = useCallback(
    (memId: string) => {
      cancelGlide();
      const pin = pins.find((p) => p.memoryId === memId);
      if (!pin) return;
      const target: CameraState = {
        x: pin.x,
        y: pin.y,
        zoom: CAMERA_FOCUSED_ZOOM,
      };

      if (reduceMotion) {
        setCamera(target);
        return;
      }

      const start = { ...cameraRef.current };
      const duration = 600;
      const startTime = performance.now();

      function tick(now: number) {
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / duration);
        const t = easeBezier(rawT, EASE_P1, EASE_P2);

        const next: CameraState = {
          x: start.x + (target.x - start.x) * t,
          y: start.y + (target.y - start.y) * t,
          zoom: start.zoom + (target.zoom - start.zoom) * t,
        };
        cameraRef.current = next;
        setCameraCallbackRef.current?.(next);

        if (rawT < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [pins, reduceMotion, cancelGlide, setCamera],
  );

  const initCamera = useCallback(
    (memId: string) => {
      cancelGlide();
      const pin = pins.find((p) => p.memoryId === memId);
      const target: CameraState = {
        x: pin ? pin.x : 0,
        y: pin ? pin.y : 0,
        zoom: CAMERA_FOCUSED_ZOOM,
      };
      setCamera(target);
    },
    [pins, cancelGlide, setCamera],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cancelGlide();
      lastInteraction.current = Date.now();
      const cur = cameraRef.current;
      const next: CameraState = {
        ...cur,
        x: cur.x - dx / cur.zoom,
        y: cur.y - dy / cur.zoom,
      };
      setCamera(next);
    },
    [cancelGlide, setCamera],
  );

  const zoomBy = useCallback(
    (factor: number, mouseX: number, mouseY: number) => {
      cancelGlide();
      lastInteraction.current = Date.now();
      const cur = cameraRef.current;
      const nextZoom = Math.min(2.5, Math.max(0.3, cur.zoom * factor));
      const zoomRatio = nextZoom / cur.zoom;
      const nextX = cur.x + (mouseX / cur.zoom - mouseX / (cur.zoom * zoomRatio));
      const nextY = cur.y + (mouseY / cur.zoom - mouseY / (cur.zoom * zoomRatio));
      setCamera({ x: nextX, y: nextY, zoom: nextZoom });
    },
    [cancelGlide, setCamera],
  );

  useEffect(() => {
    if (reduceMotion || isPlaying || isExpanded || isDragging) return;

    let running = true;
    let lastTime = performance.now();

    function drift(now: number) {
      if (!running) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (Date.now() - lastInteraction.current > IDLE_THRESHOLD_MS) {
        const angle = ambientAngle.current;
        const speed = AMBIENT_DRIFT_SPEED;
        const next: CameraState = {
          ...cameraRef.current,
          x: cameraRef.current.x + Math.cos(angle) * speed * dt,
          y: cameraRef.current.y + Math.sin(angle) * speed * dt,
        };
        cameraRef.current = next;
        setCameraCallbackRef.current?.(next);
      }
      idleRafRef.current = requestAnimationFrame(drift);
    }
    idleRafRef.current = requestAnimationFrame(drift);
    return () => {
      running = false;
      if (idleRafRef.current != null) cancelAnimationFrame(idleRafRef.current);
    };
  }, [reduceMotion, isPlaying, isExpanded, isDragging]);

  useEffect(() => {
    return () => {
      cancelGlide();
    };
  }, [cancelGlide]);

  const touchInteraction = useCallback(() => {
    lastInteraction.current = Date.now();
  }, []);

  return {
    cameraRef,
    setCamera,
    setSetCamera,
    glideToPin,
    jumpToPin,
    initCamera,
    panBy,
    zoomBy,
    cancelGlide,
    isGliding: isGlidingRef,
    touchInteraction,
  };
}