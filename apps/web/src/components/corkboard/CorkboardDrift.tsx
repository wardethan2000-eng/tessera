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
  CameraState,
  ThreadVisibility,
  DetectedKind,
  ThreadConnection,
} from "./corkboardTypes";
import {
  DURATION_PHOTO,
  DURATION_STORY_MIN,
  DURATION_STORY_MAX,
  DURATION_MEDIA_MAX,
  DURATION_DOCUMENT,
  WORDS_PER_MINUTE,
  REMEMBRANCE_PACING,
  SEEN_STORAGE_KEY_PREFIX,
  MAX_SEEN_ENTRIES,
  BOARD_ENTRY_DURATION,
  CAMERA_FOCUSED_ZOOM,
  CAMERA_GLIDE_DURATION,
  FOCUS_VIGNETTE_OUTER_FACTOR,
} from "./corkboardAnimations";
import {
  computePositions,
  computeConnections,
  computeSmartWeave,
  computeBoardSize,
  findThreadBetween,
} from "./CorkboardLayout";
import { useCorkboardCamera } from "./useCorkboardCamera";
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

function expandedCardLayout(containerSize: { w: number; h: number }) {
  const sideContext = containerSize.w >= 900 ? 280 : 32;
  const verticalContext = containerSize.h >= 720 ? 180 : 120;
  const targetWidth = Math.max(320, Math.min(960, containerSize.w - sideContext));
  const targetHeight = Math.max(420, containerSize.h - verticalContext);
  const width = Math.max(520, Math.min(900, targetWidth));
  const minHeight = Math.max(460, Math.min(680, targetHeight));
  const zoom = 1;
  return { width, minHeight, zoom };
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
  const [traverseLength, setTraverseLength] = useState(0);
  const [currentMemId, setCurrentMemId] = useState<string | null>(null);
  const [nextMemId, setNextMemId] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  // Start at board center at the focused zoom level. The init effect below
  // re-centers on the first pin once layout is ready; staying at the same
  // zoom avoids a jarring zoom-jump as the loader fades.
  const [camera, setCameraState] = useState<CameraState>({
    x: 2000,
    y: 1500,
    zoom: CAMERA_FOCUSED_ZOOM,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [threadVisibility, setThreadVisibility] = useState<ThreadVisibility>({
    temporal: true,
    person: true,
    branch: false,
    era: true,
    place: false,
  });
  const [pinsVisible, setPinsVisible] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 800 });
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [activeRoute, setActiveRoute] = useState<{ from: string; to: string } | null>(null);

  const traverseOrder = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const prevMemIdRef = useRef<string | null>(null);
  const isGlideTransitionRef = useRef(false);

  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const isRemembrance = initialFilter?.mode === "remembrance";
  const remembrancePersonId = isRemembrance ? initialFilter?.personId ?? null : null;

  const remembrancePerson = useMemo(() => {
    if (!remembrancePersonId) return null;
    return people.find((p) => p.id === remembrancePersonId) ?? null;
  }, [remembrancePersonId, people]);

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
        body: i.memory.body,
        title: i.memory.title,
        transcriptText: i.memory.transcriptText,
      })),
      pins,
      people,
    );
  }, [items, pins, people]);

  const cameraControls = useCorkboardCamera(pins, {
    reduceMotion,
    isPlaying,
    isExpanded: expandedPinId !== null,
    isDragging,
  });
  const setCameraCallback = cameraControls.setSetCamera;

  useEffect(() => {
    setCameraCallback(setCameraState);
  }, [setCameraCallback]);

  const boardSize = useMemo(() => computeBoardSize(pins.length), [pins.length]);
  const expandedLayout = useMemo(() => expandedCardLayout(containerSize), [containerSize]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const currentMemory = useMemo(() => {
    if (!currentMemId) return items[0] ?? null;
    return itemsById.get(currentMemId) ?? items[0] ?? null;
  }, [currentMemId, items, itemsById]);

  const expandedMemId = useMemo(
    () => pins.find((p) => p.id === expandedPinId)?.memoryId ?? null,
    [expandedPinId, pins],
  );

  const contextMemoryIds = useMemo(() => {
    if (!expandedMemId) return new Set<string>();
    const related = new Set<string>([expandedMemId]);
    for (const thread of threads) {
      if (thread.from === expandedMemId) related.add(thread.to);
      if (thread.to === expandedMemId) related.add(thread.from);
    }
    if (activeRoute?.from) related.add(activeRoute.from);
    if (activeRoute?.to) related.add(activeRoute.to);
    return related;
  }, [activeRoute, expandedMemId, threads]);

  const activeThreadId = useMemo(() => {
    const routeFrom = activeRoute?.from ?? currentMemId;
    const routeTo = activeRoute?.to ?? nextMemId;
    if (!routeFrom || !routeTo) return null;
    const conn = findThreadBetween(threads, routeFrom, routeTo);
    return conn?.id ?? null;
  }, [activeRoute, currentMemId, nextMemId, threads]);

  const markVisited = useCallback((memId: string) => {
    setVisitedIds((prev) => {
      if (prev.has(memId)) return prev;
      return new Set([...prev, memId]);
    });
    const map = loadSeenMap(treeId);
    map[memId] = Date.now();
    persistSeenMap(treeId, map);
  }, [treeId]);

  const updateIndex = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    const memId = traverseOrder.current[newIndex];
    if (memId) setCurrentMemId(memId);
    const nextId = traverseOrder.current[newIndex + 1] ?? null;
    setNextMemId(nextId);
  }, []);

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

      const smartWeave = computeSmartWeave(
        memories.map((i) => ({
          id: i.id,
          primaryPersonId: i.memory.primaryPersonId,
          dateOfEventText: i.memory.dateOfEventText,
          kind: i.kind,
        })),
        seen,
      );
      traverseOrder.current = smartWeave;
      setTraverseLength(smartWeave.length);
      updateIndex(0);

      if (smartWeave.length > 0) {
        const firstMemId = smartWeave[0]!;
        prevMemIdRef.current = firstMemId;
        markVisited(firstMemId);
      }

      setIsLoading(false);
    };
    fetchAll();
  }, [treeId, people, apiBase, initialFilter, updateIndex, markVisited]);

  // Center the camera on the start pin once pins are computed and ready.
  // Runs after the items → pins useMemo has settled, so the cameraControls
  // closure sees the populated pin array.
  useEffect(() => {
    if (cameraInitialized) return;
    if (pins.length === 0 || traverseOrder.current.length === 0) return;
    const firstMemId = traverseOrder.current[0];
    if (!firstMemId) return;
    cameraControls.initCamera(firstMemId);
    setCameraInitialized(true);
  }, [pins, cameraInitialized, cameraControls]);

  useEffect(() => {
    if (!isLoading && pins.length > 0) {
      const t = setTimeout(() => setPinsVisible(true), 100);
      return () => clearTimeout(t);
    }
  }, [isLoading, pins.length]);

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
    if (isGlideTransitionRef.current) return;
    const len = traverseOrder.current.length;
    setCurrentIndex((i) => {
      const next = i + 1;
      if (next >= len) {
        setIsPlaying(false);
        return i;
      }
      const memId = traverseOrder.current[next];
      if (memId) setCurrentMemId(memId);
      setNextMemId(traverseOrder.current[next + 1] ?? null);
      return next;
    });
  }, []);

  /* ─── Spatial keyboard navigation helpers ────────────────────────────────── */

  const findNearestInDirection = useCallback(
    (fromMemId: string, angleDeg: number): string | null => {
      const fromPin = pins.find((p) => p.memoryId === fromMemId);
      if (!fromPin) return null;

      const fx = fromPin.x;
      const fy = fromPin.y;
      const angleRad = (angleDeg * Math.PI) / 180;
      const dirX = Math.cos(angleRad);
      const dirY = Math.sin(angleRad);

      let best: { id: string; score: number } | null = null;

      for (const pin of pins) {
        if (pin.memoryId === fromMemId) continue;
        const dx = pin.x - fx;
        const dy = pin.y - fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const dot = nx * dirX + ny * dirY; // 1 = same direction, -1 = opposite

        // Only consider pins that are roughly in the requested direction.
        if (dot < 0.15) continue;

        const score = dist * (2.5 - dot); // closer + more aligned = better
        if (!best || score < best.score) {
          best = { id: pin.memoryId, score };
        }
      }

      // Fallback: if nothing is in that direction, pick the closest pin overall.
      if (!best) {
        let closest: { id: string; dist: number } | null = null;
        for (const pin of pins) {
          if (pin.memoryId === fromMemId) continue;
          const dx = pin.x - fx;
          const dy = pin.y - fy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (!closest || dist < closest.dist) {
            closest = { id: pin.memoryId, dist };
          }
        }
        return closest?.id ?? null;
      }

      return best.id;
    },
    [pins]
  );

  /* ─── Navigate spatially instead of chronologically ──────────────────────── */

  const goSpatial = useCallback(
    (directionDeg: number) => {
      if (isGlideTransitionRef.current) return;
      const fromId = currentMemId ?? traverseOrder.current[0];
      if (!fromId) return;
      const targetId = findNearestInDirection(fromId, directionDeg);
      if (!targetId) return;
      const idx = traverseOrder.current.indexOf(targetId);
      if (idx >= 0) updateIndex(idx);
    },
    [currentMemId, updateIndex, findNearestInDirection]
  );

  useEffect(() => {
    const order = traverseOrder.current;
    const curMemId = order[currentIndex];
    const prevMemId = prevMemIdRef.current;

    if (!curMemId || !prevMemId || curMemId === prevMemId) return;

    const glideDuration = expandedPinId
      ? CAMERA_GLIDE_DURATION * 1000 * 0.5
      : CAMERA_GLIDE_DURATION * 1000;
    const targetZoom = expandedPinId ? expandedLayout.zoom : CAMERA_FOCUSED_ZOOM;
    const routeThread = findThreadBetween(threads, prevMemId, curMemId);
    const routeType = routeThread?.type ?? "temporal";

    isGlideTransitionRef.current = true;
    setActiveRoute({ from: prevMemId, to: curMemId });
    cameraControls.glideToPin(prevMemId, curMemId, glideDuration, targetZoom, routeType);

    const glideTimeout = setTimeout(() => {
      isGlideTransitionRef.current = false;
      setActiveRoute(null);
    }, glideDuration + 50);

    prevMemIdRef.current = curMemId;
    markVisited(curMemId);

    return () => clearTimeout(glideTimeout);
  }, [currentIndex, expandedPinId, expandedLayout.zoom, threads, cameraControls, markVisited]);

  useEffect(() => {
    if (!isPlaying || items.length === 0 || !currentMemory) return;
    if (expandedPinId && currentMemory.kind !== "video" && currentMemory.kind !== "audio") return;

    const delay = computedDurationMs + CAMERA_GLIDE_DURATION * 1000;
    timerRef.current = setTimeout(advance, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentIndex, computedDurationMs, advance, items.length, expandedPinId, currentMemory]);

  const handleExpand = useCallback((pinId: string) => {
    setExpandedPinId(pinId);
    if (timerRef.current) clearTimeout(timerRef.current);
    const pin = pins.find((p) => p.id === pinId);
    if (pin) {
      cameraControls.jumpToPin(pin.memoryId, expandedLayout.zoom);
    }
  }, [cameraControls, expandedLayout.zoom, pins]);

  const handleContract = useCallback(() => {
    setExpandedPinId(null);
    if (currentMemId) {
      cameraControls.jumpToPin(currentMemId);
    }
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(".corkboard-pin--current");
      if (el) el.focus();
    });
  }, [cameraControls, currentMemId]);

  const handlePinSelect = useCallback((memId: string, pinId?: string, expand = false) => {
    if (isGlideTransitionRef.current) return;
    const idx = traverseOrder.current.indexOf(memId);
    if (idx < 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (expand && pinId) setExpandedPinId(pinId);
    updateIndex(idx);
  }, [updateIndex]);

  const handleMediaEnded = useCallback(() => {
    advance();
  }, [advance]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (expandedPinId) return;
    // Don't start a board-pan when the user is pressing on a pin or its
    // contents — that lets the pin's own click handler win.
    if ((e.target as HTMLElement).closest(".corkboard-pin")) return;
    cameraControls.cancelGlide();
    cameraControls.touchInteraction();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cx: cameraControls.cameraRef.current.x,
      cy: cameraControls.cameraRef.current.y,
    };
    // Capture on the viewport (currentTarget) so subsequent pointermove
    // events route here regardless of what's under the cursor.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [expandedPinId, cameraControls]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const start = dragStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    cameraControls.panBy(dx, dy);
    dragStartRef.current = { ...start, x: e.clientX, y: e.clientY };
    cameraControls.touchInteraction();
  }, [isDragging, cameraControls]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (expandedPinId) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      cameraControls.touchInteraction();

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.001;
        const factor = Math.pow(1.25, delta);
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        cameraControls.zoomBy(factor, mouseX, mouseY);
      } else {
        cameraControls.panBy(e.deltaX * 0.8, e.deltaY * 0.8);
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [cameraControls, expandedPinId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedPinId) {
          handleContract();
        } else {
          onClose();
        }
        return;
      }

      // Space advances to the next memory (or expands current if not yet current)
      if (e.key === " ") {
        e.preventDefault();
        if (expandedPinId) {
          handleContract();
        } else {
          advance();
        }
        return;
      }

      // Arrow keys navigate spatially on the board
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (expandedPinId) handleContract();
        goSpatial(e.shiftKey ? 30 : 0);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (expandedPinId) handleContract();
        goSpatial(e.shiftKey ? 150 : 180);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (expandedPinId) handleContract();
        goSpatial(e.shiftKey ? 120 : 90);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (expandedPinId) handleContract();
        goSpatial(e.shiftKey ? 60 : 270);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, advance, goSpatial, expandedPinId, handleContract]);

  const handleThreadClick = useCallback((thread: ThreadConnection) => {
    if (!currentMemId) return;
    let targetMemId: string;
    if (thread.from === currentMemId) {
      targetMemId = thread.to;
    } else if (thread.to === currentMemId) {
      targetMemId = thread.from;
    } else {
      return;
    }
    const idx = traverseOrder.current.indexOf(targetMemId);
    if (idx >= 0) {
      updateIndex(idx);
    }
  }, [currentMemId, updateIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const viewportTransform = useMemo(() => {
    const vpWidth = containerSize.w;
    const vpHeight = containerSize.h;
    return {
      transform: `translate3d(${vpWidth / 2 - camera.x * camera.zoom}px, ${vpHeight / 2 - camera.y * camera.zoom}px, 0) scale(${camera.zoom})`,
    };
  }, [camera, containerSize]);

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
        <label className="corkboard-thread-toggle">
          <input
            type="checkbox"
            checked={threadVisibility.era}
            onChange={(e) => setThreadVisibility((v) => ({ ...v, era: e.target.checked }))}
          />
          <span className="corkboard-thread-toggle__label" style={{ color: "var(--ink-faded)" }}>Era</span>
        </label>
        <label className="corkboard-thread-toggle">
          <input
            type="checkbox"
            checked={threadVisibility.place}
            onChange={(e) => setThreadVisibility((v) => ({ ...v, place: e.target.checked }))}
          />
          <span className="corkboard-thread-toggle__label" style={{ color: "var(--rose)" }}>Place</span>
        </label>
      </div>

      {isRemembrance && (remembrancePerson || currentMemory) && (
        <div className="corkboard-remembrance-header">
          <div className="corkboard-remembrance-label">In memory of</div>
          <div className="corkboard-remembrance-name">{remembrancePerson?.name ?? currentMemory?.person.name ?? ""}</div>
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
            activeRoute={activeRoute}
            visibility={threadVisibility}
            width={boardSize.width}
            height={boardSize.height}
            onThreadClick={handleThreadClick}
            currentMemId={currentMemId}
          />

          {pins.map((pin, i) => {
            const mem = itemsById.get(pin.memoryId);
            if (!mem) return null;
            const isCurrentPin = currentMemId === mem.id;
            const isExpanded = expandedPinId === pin.id;
            const isVisited = visitedIds.has(mem.id);
            const isUnfocused = !isCurrentPin && !isExpanded;
            const isContextual = !isExpanded && contextMemoryIds.has(mem.id);
            // Stagger delay caps at 800ms regardless of pin count: with 200
            // memories at 60ms each the last pin would otherwise wait 12s.
            const staggerDelay = pinsVisible
              ? Math.min(800, (i / Math.max(1, pins.length - 1)) * 800)
              : 0;

            return (
              <CorkboardPin
                key={pin.id}
                pin={pin}
                memory={mem}
                isExpanded={isExpanded}
                isCurrent={isCurrentPin}
                isVisited={isVisited}
                isUnfocused={isUnfocused}
                isContextual={isContextual}
                isPlaying={isPlaying}
                onExpand={handleExpand}
                onContract={handleContract}
                onSelect={handlePinSelect}
                reduceMotion={reduceMotion}
                delay={staggerDelay}
                visible={pinsVisible}
                expandedWidth={expandedLayout.width}
                expandedMinHeight={expandedLayout.minHeight}
                onMediaEnded={isExpanded ? handleMediaEnded : undefined}
              />
            );
          })}
        </div>

        <div
          className="corkboard-focus-vignette"
          style={{
            "--focus-x": `${containerSize.w / 2}px`,
            "--focus-y": `${containerSize.h / 2}px`,
            "--focus-radius": `${Math.max(
              expandedPinId
                ? expandedLayout.width * expandedLayout.zoom * 0.72
                : (pins.find((p) => p.memoryId === currentMemId)?.width ?? 220) *
                  FOCUS_VIGNETTE_OUTER_FACTOR *
                  camera.zoom,
              280 * camera.zoom
            )}px`,
          } as React.CSSProperties}
        />
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
          style={{ width: `${(currentIndex / Math.max(1, traverseLength - 1)) * 100}%` }}
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
