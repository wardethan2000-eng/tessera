"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PinPosition, CameraState } from "./corkboardTypes";
import {
  CAMERA_GLIDE_DURATION,
  CAMERA_FOCUSED_ZOOM,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_MAX,
  AMBIENT_DRIFT_SPEED,
  IDLE_THRESHOLD_MS,
} from "./corkboardAnimations";

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

      const start = { ...cameraRef.current };
      const duration = durationMs ?? CAMERA_GLIDE_DURATION * 1000;
      const startTime = performance.now();

      const targetZoom = CAMERA_FOCUSED_ZOOM;
      const startZoom = start.zoom;

      const dx = toPin.x - start.x;
      const dy = toPin.y - start.y;

      function tick(now: number) {
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / duration);
        const t = easeBezier(rawT, EASE_P1, EASE_P2);

        const next: CameraState = {
          x: start.x + dx * t,
          y: start.y + dy * t,
          zoom: startZoom + (targetZoom - startZoom) * t,
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
    [pins, reduceMotion, cancelGlide, setCamera],
  );

  const jumpToPin = useCallback(
    (memId: string, zoom = CAMERA_FOCUSED_ZOOM) => {
      cancelGlide();
      const pin = pins.find((p) => p.memoryId === memId);
      if (!pin) return;
      const target: CameraState = {
        x: pin.x,
        y: pin.y,
        zoom,
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
      const nextZoom = Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, cur.zoom * factor));
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

  // Memoize the return object so consumers can safely list `cameraControls`
  // in useEffect deps without triggering re-runs every render. Each
  // individual function is already useCallback-stabilized; this wraps them
  // into a stable object identity.
  return useMemo(
    () => ({
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
    }),
    [setCamera, setSetCamera, glideToPin, jumpToPin, initCamera, panBy, zoomBy, cancelGlide, touchInteraction],
  );
}
