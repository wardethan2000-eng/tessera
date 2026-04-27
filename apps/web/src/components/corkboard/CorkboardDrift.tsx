"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import type { ApiMemory, ApiMemoryMediaItem, ApiPerson } from "../tree/treeTypes";
import type { DriftFilter } from "../tree/DriftMode";
import type {
  CorkboardMemory,
  PinPosition,
  ThreadConnection,
  CameraState,
  ThreadVisibility,
  DetectedKind,
} from "./corkboardTypes";
import {
  CAMERA_TRANSITION_DURATION,
  DURATION_PHOTO,
  DURATION_STORY_MIN,
  DURATION_STORY_MAX,
  DURATION_MEDIA_MAX,
  DURATION_DOCUMENT,
  WORDS_PER_MINUTE,
  REMEMBRANCE_PACING,
  SEEN_STORAGE_KEY_PREFIX,
  MAX_SEEN_ENTRIES,
  IDLE_THRESHOLD_MS,
  AMBIENT_DRIFT_SPEED,
  BOARD_ENTRY_DURATION,
  PIN_EXPAND_DURATION,
  PIN_CONTRACT_DURATION,
} from "./corkboardAnimations";
import {
  computePositions,
  computeConnections,
  computeSmartWeave,
  computeBoardSize,
  computePinCenter,
} from "./CorkboardLayout";
import { CorkboardBackdrop } from "./CorkboardBackdrop";
import { CorkboardPin } from "./CorkboardPin";
import { CorkboardThreadLayer } from "./CorkboardThread";

interface DriftFeedMemory {
  id: string;
  primaryPersonId: string;
  primaryPerson: { id: string; name: string; portraitUrl: string | null } | null;
  kind: ApiMemory["kind"];
  title: string;
  body?: string | null;
  transcriptText?: string | null;
  transcriptStatus?: ApiMemory["transcriptStatus"];
  dateOfEventText?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  mediaItems?: ApiMemoryMediaItem[];
}

function loadSeenMap(treeId: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY_PREFIX + treeId);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed) as [string, number][];
    if (entries.length <= MAX_SEEN_ENTRIES) return parsed;
    entries.sort((a, b) => a[1] - b[1]);
    const pruned: Record<string, number> = {};
    const recent = entries.slice(-MAX_SEEN_ENTRIES);
    for (const [k, v] of recent) pruned[k] = v;
    return pruned;
  } catch {
    return {};
  }
}

function persistSeenMap(treeId: string, map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(map) as [string, number][];
    if (entries.length > MAX_SEEN_ENTRIES) {
      entries.sort((a, b) => a[1] - b[1]);
      const pruned: Record<string, number> = {};
      const recent = entries.slice(-MAX_SEEN_ENTRIES);
      for (const [k, v] of recent) pruned[k] = v;
      window.localStorage.setItem(SEEN_STORAGE_KEY_PREFIX + treeId, JSON.stringify(pruned));
    } else {
      window.localStorage.setItem(SEEN_STORAGE_KEY_PREFIX + treeId, JSON.stringify(map));
    }
  } catch {
    // swallow quota errors
  }
}

function detectItemKind(item: CorkboardMemory): DetectedKind {
  const mime = item.primaryMedia?.mimeType ?? "";
  const mediaUrl = item.primaryMedia?.mediaUrl ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (item.primaryMedia?.linkedMediaPreviewUrl || item.primaryMedia?.linkedMediaOpenUrl) return "link";
  if (mediaUrl) {
    const lower = mediaUrl.toLowerCase().split("?")[0] ?? "";
    if (/\.(mp4|mov|webm|m4v)$/.test(lower)) return "video";
    if (/\.(mp3|m4a|wav|aac|ogg|oga)$/.test(lower)) return "audio";
    if (/\.(jpg|jpeg|png|gif|webp|avif|heic|heif)$/.test(lower)) return "image";
  }
  if (item.memory.kind === "photo" && mediaUrl) return "image";
  if (item.memory.kind === "voice" && mediaUrl) return "audio";
  return "text";
}

function legacyMediaItem(memory: DriftFeedMemory): ApiMemoryMediaItem | null {
  if (!memory.mediaUrl) return null;
  return {
    id: `${memory.id}:primary-media`,
    mediaId: null,
    mediaUrl: memory.mediaUrl,
    mimeType: memory.mimeType ?? null,
    linkedMediaProvider: null,
    linkedMediaPreviewUrl: null,
    linkedMediaOpenUrl: null,
    linkedMediaLabel: null,
    sortOrder: -1,
  };
}

function readingTimeMs(text: string | null | undefined): number {
  if (!text) return DURATION_STORY_MIN;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = Math.round((words / WORDS_PER_MINUTE) * 60000);
  return Math.min(DURATION_STORY_MAX, Math.max(DURATION_STORY_MIN, ms));
}

export function CorkboardDrift({
  treeId,
  people,
  onClose,
  onPersonDetail,
  apiBase,
  initialFilter,
}: {
  treeId: string;
  people: ApiPerson[];
  onClose: () => void;
  onPersonDetail: (personId: string) => void;
  apiBase: string;
  initialFilter?: DriftFilter | null;
}) {
  const [items, setItems] = useState<CorkboardMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [expandedPinId, setExpandedPinId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 0.65 });
  const [isDragging, setIsDragging] = useState(false);
  const [threadVisibility, setThreadVisibility] = useState<ThreadVisibility>({
    temporal: true,
    person: true,
    branch: false,
  });
  const [pinsVisible, setPinsVisible] = useState(false);

  const traverseOrder = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const animCameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 0.65 });
  const rafRef = useRef<number | null>(null);
  const idleRafRef = useRef<number | null>(null);
  const ambientAngleRef = useRef(Math.random() * Math.PI * 2);
  const lastInteractionRef = useRef(Date.now());

  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const isRemembrance = initialFilter?.mode === "remembrance";

  const pins = useMemo(() => {
    if (items.length === 0) return [];
    return computePositions(
      items.map((i) => ({
        id: i.id,
        primaryPersonId: i.memory.primaryPersonId,
        dateOfEventText: i.memory.dateOfEventText,
        kind: i.kind,
      })),
      treeId,
    );
  }, [items, treeId]);

  const threads = useMemo(() => {
    if (items.length === 0) return [];
    return computeConnections(
      items.map((i) => ({
        id: i.id,
        primaryPersonId: i.memory.primaryPersonId,
        dateOfEventText: i.memory.dateOfEventText,
        kind: i.kind,
      })),
      pins,
    );
  }, [items, pins]);

  const boardSize = useMemo(() => computeBoardSize(pins.length), [pins.length]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const currentMemory = useMemo(() => {
    const memId = traverseOrder.current[currentIndex];
    if (!memId) return items[0] ?? null;
    return itemsById.get(memId) ?? items[0] ?? null;
  }, [currentIndex, items, itemsById]);

  const currentPin = useMemo(() => {
    if (!currentMemory) return null;
    return pins.find((p) => p.memoryId === currentMemory.id) ?? null;
  }, [currentMemory, pins]);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      setLoadError(null);
      const peopleById = new Map(people.map((p) => [p.id, p]));

      const params = new URLSearchParams();
      if (initialFilter?.personId) params.set("personId", initialFilter.personId);
      if (initialFilter?.mode && initialFilter.mode !== "corkboard") params.set("mode", initialFilter.mode);
      if (initialFilter?.yearStart != null) params.set("yearStart", String(initialFilter.yearStart));
      if (initialFilter?.yearEnd != null) params.set("yearEnd", String(initialFilter.yearEnd));
      const qs = params.toString();
      const driftUrl = `${apiBase}/api/trees/${treeId}/drift${qs ? `?${qs}` : ""}`;

      let feed: DriftFeedMemory[] = [];
      try {
        const res = await fetch(driftUrl, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { memories: DriftFeedMemory[] };
          feed = data.memories ?? [];
        } else {
          setLoadError("Could not load drift feed.");
        }
      } catch {
        setLoadError("Could not connect to the archive.");
      }

      const seen = loadSeenMap(treeId);
      const memories: CorkboardMemory[] = [];

      for (const memory of feed) {
        const subject: ApiPerson =
          (memory.primaryPerson && peopleById.get(memory.primaryPerson.id)) ??
          peopleById.get(memory.primaryPersonId) ??
          (memory.primaryPerson
            ? ({
                id: memory.primaryPerson.id,
                name: memory.primaryPerson.name,
                portraitUrl: memory.primaryPerson.portraitUrl,
              } as ApiPerson)
            : null) ??
          people[0] ??
          ({
            id: memory.primaryPersonId,
            name: "Unknown relative",
            portraitUrl: null,
          } as ApiPerson);

        const memoryWithPerson: ApiMemory = {
          ...memory,
          personId: subject.id,
        } as ApiMemory;

        const childMediaItems = (memory.mediaItems ?? []).filter(
          (item) => item.mediaUrl || item.linkedMediaPreviewUrl || item.linkedMediaOpenUrl,
        );
        const primaryMedia = legacyMediaItem(memory);
        const hasPrimaryInChildren =
          primaryMedia?.mediaUrl &&
          childMediaItems.some((item) => item.mediaUrl === primaryMedia.mediaUrl);
        const allMedia =
          primaryMedia && !hasPrimaryInChildren
            ? [primaryMedia, ...childMediaItems]
            : childMediaItems;

        const cItem: CorkboardMemory = {
          id: memory.id,
          memory: memoryWithPerson,
          person: subject,
          primaryMedia: allMedia.length > 0 ? allMedia[0] ?? null : null,
          allMedia,
          kind: "text",
        };
        cItem.kind = detectItemKind(cItem);
        memories.push(cItem);
      }

      setItems(memories);

      const tempPins = computePositions(
        memories.map((i) => ({
          id: i.id,
          primaryPersonId: i.memory.primaryPersonId,
          dateOfEventText: i.memory.dateOfEventText,
          kind: i.kind,
        })),
        treeId,
      );
      const tempConnections = computeConnections(
        memories.map((i) => ({
          id: i.id,
          primaryPersonId: i.memory.primaryPersonId,
          dateOfEventText: i.memory.dateOfEventText,
          kind: i.kind,
        })),
        tempPins,
      );

      const smartWeave = computeSmartWeave(
        memories.map((i) => ({
          id: i.id,
          primaryPersonId: i.memory.primaryPersonId,
          dateOfEventText: i.memory.dateOfEventText,
          kind: i.kind,
        })),
        tempConnections,
        seen,
      );
      traverseOrder.current = smartWeave;
      setCurrentIndex(0);
      setIsLoading(false);
    };
    fetchAll();
  }, [treeId, people, apiBase, initialFilter]);

  useEffect(() => {
    if (pins.length === 0) return;
    const center = computePinCenter(pins);
    animCameraRef.current = { x: center.x, y: center.y, zoom: 0.65 };
    setCamera({ x: center.x, y: center.y, zoom: 0.65 });
  }, [pins]);

  useEffect(() => {
    if (!isLoading && pins.length > 0) {
      const t = setTimeout(() => setPinsVisible(true), 100);
      return () => clearTimeout(t);
    }
  }, [isLoading, pins.length]);

  useEffect(() => {
    if (!currentMemory) return;
    const map = loadSeenMap(treeId);
    map[currentMemory.memory.id] = Date.now();
    persistSeenMap(treeId, map);
    setVisitedIds((prev) => new Set([...prev, currentMemory.memory.id]));
  }, [currentMemory, treeId]);

  const computedDurationMs = useMemo(() => {
    if (!currentMemory) return DURATION_PHOTO;
    let base: number;
    switch (currentMemory.kind) {
      case "image": base = DURATION_PHOTO; break;
      case "text": base = readingTimeMs(currentMemory.memory.body ?? currentMemory.memory.transcriptText); break;
      case "link": base = DURATION_DOCUMENT; break;
      case "video": case "audio": base = DURATION_MEDIA_MAX; break;
      default: base = DURATION_PHOTO;
    }
    if (isRemembrance && currentMemory.kind !== "video" && currentMemory.kind !== "audio") {
      base = Math.round(base * REMEMBRANCE_PACING);
    }
    return base;
  }, [currentMemory, isRemembrance]);

  const advance = useCallback(() => {
    setCurrentIndex((i) => {
      const next = i + 1;
      return next < traverseOrder.current.length ? next : 0;
    });
  }, []);

  const stepBack = useCallback(() => {
    setCurrentIndex((i) => {
      const prev = i - 1;
      return prev >= 0 ? prev : traverseOrder.current.length - 1;
    });
  }, []);

  useEffect(() => {
    if (!isPlaying || items.length === 0 || !currentMemory) return;
    if (expandedPinId && currentMemory.kind !== "video" && currentMemory.kind !== "audio") return;

    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(advance, computedDurationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentIndex, computedDurationMs, advance, items.length, expandedPinId, currentMemory]);

  const animateCameraTo = useCallback((target: CameraState, durationMs?: number) => {
    if (reduceMotion) {
      animCameraRef.current = target;
      setCamera(target);
      return;
    }
    const start = { ...animCameraRef.current };
    const duration = durationMs ?? CAMERA_TRANSITION_DURATION * 1000;
    const startTime = performance.now();

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const elapsed = now - startTime;
      const rawT = Math.min(1, elapsed / duration);
      const t = 1 - Math.pow(1 - rawT, 3);

      const next: CameraState = {
        x: start.x + (target.x - start.x) * t,
        y: start.y + (target.y - start.y) * t,
        zoom: start.zoom + (target.zoom - start.zoom) * t,
      };
      animCameraRef.current = next;
      setCamera(next);

      if (rawT < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [reduceMotion]);

  useEffect(() => {
    if (!currentPin) return;
    const target: CameraState = {
      x: currentPin.x,
      y: currentPin.y,
      zoom: expandedPinId ? 1.0 : animCameraRef.current.zoom,
    };
    animateCameraTo(target, expandedPinId ? 600 : undefined);
  }, [currentPin, expandedPinId, animateCameraTo]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleExpand = useCallback((pinId: string) => {
    setExpandedPinId(pinId);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleContract = useCallback(() => {
    setExpandedPinId(null);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(".corkboard-pin--current");
      if (el) el.focus();
    });
  }, []);

  const handleMediaEnded = useCallback(() => {
    advance();
  }, [advance]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (expandedPinId) return;
    lastInteractionRef.current = Date.now();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cx: animCameraRef.current.x,
      cy: animCameraRef.current.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [expandedPinId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const start = dragStartRef.current;
    if (!start) return;
    const dx = (e.clientX - start.x) / animCameraRef.current.zoom;
    const dy = (e.clientY - start.y) / animCameraRef.current.zoom;
    const next: CameraState = {
      ...animCameraRef.current,
      x: start.cx - dx,
      y: start.cy - dy,
    };
    animCameraRef.current = next;
    setCamera(next);
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      lastInteractionRef.current = Date.now();

      const cur = animCameraRef.current;
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.001;
        const factor = Math.pow(1.25, delta);
        const nextZoom = Math.min(2.5, Math.max(0.3, cur.zoom * factor));
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const zoomRatio = nextZoom / cur.zoom;
        const nextX = cur.x + (mouseX / cur.zoom - mouseX / (cur.zoom * zoomRatio));
        const nextY = cur.y + (mouseY / cur.zoom - mouseY / (cur.zoom * zoomRatio));
        const next: CameraState = { x: nextX, y: nextY, zoom: nextZoom };
        animCameraRef.current = next;
        setCamera(next);
      } else {
        const next: CameraState = {
          ...cur,
          x: cur.x + e.deltaX * 0.8 / cur.zoom,
          y: cur.y + e.deltaY * 0.8 / cur.zoom,
        };
        animCameraRef.current = next;
        setCamera(next);
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    if (reduceMotion || isPlaying || expandedPinId || isDragging) return;
    let running = true;
    let lastTime = performance.now();
    function drift(now: number) {
      if (!running) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) {
        const angle = ambientAngleRef.current;
        const speed = AMBIENT_DRIFT_SPEED;
        const next: CameraState = {
          ...animCameraRef.current,
          x: animCameraRef.current.x + Math.cos(angle) * speed * dt,
          y: animCameraRef.current.y + Math.sin(angle) * speed * dt,
        };
        animCameraRef.current = next;
        setCamera(next);
      }
      idleRafRef.current = requestAnimationFrame(drift);
    }
    idleRafRef.current = requestAnimationFrame(drift);
    return () => {
      running = false;
      if (idleRafRef.current != null) cancelAnimationFrame(idleRafRef.current);
    };
  }, [reduceMotion, isPlaying, expandedPinId, isDragging]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedPinId) {
          handleContract();
        } else {
          onClose();
        }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (expandedPinId) handleContract();
        advance();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (expandedPinId) handleContract();
        stepBack();
      }
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, advance, stepBack, expandedPinId, handleContract]);

  const activeThreadId = useMemo(() => {
    if (currentIndex < traverseOrder.current.length - 1 && traverseOrder.current.length > 1) {
      const currentMemId = traverseOrder.current[currentIndex];
      const nextMemId = traverseOrder.current[currentIndex + 1];
      if (currentMemId && nextMemId) {
        const conn = threads.find(
          (t) => (t.from === currentMemId && t.to === nextMemId) || (t.from === nextMemId && t.to === currentMemId),
        );
        return conn?.id ?? null;
      }
    }
    return null;
  }, [currentIndex, threads]);

  const viewportTransform = useMemo(() => {
    const el = containerRef.current;
    const vpWidth = el ? el.clientWidth : (typeof window !== "undefined" ? window.innerWidth : 1200);
    const vpHeight = el ? el.clientHeight : (typeof window !== "undefined" ? window.innerHeight : 800);
    return {
      transform: `translate3d(${vpWidth / 2 - camera.x * camera.zoom}px, ${vpHeight / 2 - camera.y * camera.zoom}px, 0) scale(${camera.zoom})`,
    };
  }, [camera]);

  const adjacentMemoryIds = useMemo(() => {
    if (!currentMemory) return new Set<string>();
    const ids = new Set<string>();
    for (const t of threads) {
      if (t.from === currentMemory.id) ids.add(t.to);
      if (t.to === currentMemory.id) ids.add(t.from);
    }
    return ids;
  }, [currentMemory, threads]);

  return (
    <motion.div
      className={`corkboard-root${isRemembrance ? " corkboard-root--remembrance" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: BOARD_ENTRY_DURATION, ease: [0.22, 0.61, 0.36, 1] }}
      ref={containerRef}
    >
      <button onClick={onClose} className="corkboard-close">&times; Exit corkboard</button>

      <button
        onClick={() => setIsPlaying((p) => !p)}
        className="corkboard-autoplay-toggle"
      >
        <span
          className="corkboard-autoplay-dot"
          style={{ background: isPlaying ? "var(--moss)" : "var(--ink-faded)" }}
        />
        {isPlaying ? "Playing" : "Paused"}
      </button>

      <div className="corkboard-controls">
        <label className="corkboard-thread-toggle">
          <input
            type="checkbox"
            checked={threadVisibility.temporal}
            onChange={(e) => setThreadVisibility((v) => ({ ...v, temporal: e.target.checked }))}
          />
          <span className="corkboard-thread-toggle__label" style={{ color: "var(--ink-faded)" }}>Timeline</span>
        </label>
        <label className="corkboard-thread-toggle">
          <input
            type="checkbox"
            checked={threadVisibility.person}
            onChange={(e) => setThreadVisibility((v) => ({ ...v, person: e.target.checked }))}
          />
          <span className="corkboard-thread-toggle__label" style={{ color: "var(--moss)" }}>Person</span>
        </label>
        <label className="corkboard-thread-toggle">
          <input
            type="checkbox"
            checked={threadVisibility.branch}
            onChange={(e) => setThreadVisibility((v) => ({ ...v, branch: e.target.checked }))}
          />
          <span className="corkboard-thread-toggle__label" style={{ color: "var(--rose)" }}>Branch</span>
        </label>
      </div>

      {isRemembrance && currentMemory && (
        <div className="corkboard-remembrance-header">
          <div className="corkboard-remembrance-label">In memory of</div>
          <div className="corkboard-remembrance-name">{currentMemory.person.name}</div>
        </div>
      )}

      <div
        ref={viewportRef}
        className="corkboard-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: expandedPinId ? "default" : isDragging ? "grabbing" : "grab" }}
      >
        <div className="corkboard-board" style={viewportTransform}>
          <CorkboardBackdrop width={boardSize.width} height={boardSize.height} isRemembrance={isRemembrance} />

          <CorkboardThreadLayer
            threads={threads}
            pins={pins}
            activeThreadId={activeThreadId}
            visibility={threadVisibility}
            width={boardSize.width}
            height={boardSize.height}
          />

          {pins.map((pin, i) => {
            const mem = itemsById.get(pin.memoryId);
            if (!mem) return null;
            const isExpanded = expandedPinId === pin.id;
            const isVisited = visitedIds.has(mem.id);
            const isUnfocused = expandedPinId !== null && !isExpanded;
            const isAdjacent = expandedPinId !== null && !isExpanded && adjacentMemoryIds.has(mem.id);

            return (
              <CorkboardPin
                key={pin.id}
                pin={pin}
                memory={mem}
                isExpanded={isExpanded}
                isVisited={isVisited}
                isUnfocused={isUnfocused}
                isAdjacent={isAdjacent}
                isPlaying={isPlaying}
                onExpand={handleExpand}
                onContract={handleContract}
                reduceMotion={reduceMotion}
                delay={pinsVisible ? i * 60 : 0}
                visible={pinsVisible}
                cameraX={camera.x}
                cameraY={camera.y}
                onMediaEnded={isExpanded ? handleMediaEnded : undefined}
              />
            );
          })}
        </div>
      </div>

      {currentMemory && !isLoading && (
        <div className="corkboard-bottom">
          <div className="corkboard-bottom__attribution">
            <div className="corkboard-bottom__name">{currentMemory.person.name}</div>
            <div className="corkboard-bottom__detail">
              {currentMemory.memory.title}
              {currentMemory.memory.dateOfEventText ? ` \u00b7 ${currentMemory.memory.dateOfEventText}` : ""}
            </div>
          </div>
          <button
            onClick={() => onPersonDetail(currentMemory.person.id)}
            className="corkboard-bottom__cta"
          >
            Open {currentMemory.person.name}&apos;s archive &rarr;
          </button>
        </div>
      )}

      <div className="corkboard-progress-track">
        <div
          className="corkboard-progress-fill"
          style={{ width: `${(currentIndex / Math.max(1, traverseOrder.current.length - 1)) * 100}%` }}
        />
      </div>

      {isLoading && <div className="corkboard-loader" />}

      {loadError && !isLoading && items.length === 0 && (
        <div className="corkboard-empty">
          <div className="corkboard-empty__title">Could not load corkboard.</div>
          <div className="corkboard-empty__body">{loadError}</div>
          <button onClick={onClose} className="corkboard-empty__btn">Close</button>
        </div>
      )}

      {!isLoading && !loadError && items.length === 0 && (
        <div className="corkboard-empty">
          <div className="corkboard-empty__title">Nothing to pin yet.</div>
          <div className="corkboard-empty__body">
            Add photos, stories, or voice recordings to a person and they&apos;ll appear on the board.
          </div>
        </div>
      )}
    </motion.div>
  );
}