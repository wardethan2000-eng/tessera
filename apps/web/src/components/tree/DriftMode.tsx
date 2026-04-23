"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ApiMemory, ApiMemoryMediaItem, ApiPerson } from "./treeTypes";
import { getProxiedMediaUrl } from "@/lib/media-url";

interface DriftItem {
  key: string;
  memory: ApiMemory;
  person: ApiPerson;
  media: ApiMemoryMediaItem | null;
  itemIndex: number;
  itemCount: number;
}

interface DriftModeProps {
  treeId: string;
  people: ApiPerson[];
  onClose: () => void;
  onPersonDetail: (personId: string) => void;
  apiBase: string;
  initialFilter?: DriftFilter | null;
}

export type DriftFilter = {
  mode?: "remembrance" | "branch";
  personId?: string;
  yearStart?: number;
  yearEnd?: number;
};

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

const PHOTO_DURATION_MS = 6000;
const REMEMBRANCE_PACING_MULTIPLIER = 1.6;
const STORY_MIN_MS = 8000;
const STORY_MAX_MS = 45000;
const WORDS_PER_MINUTE = 200;
const MEDIA_MAX_MS = 60000;
const DEFAULT_MEDIA_FALLBACK_MS = 15000;
const DOCUMENT_CARD_MS = 8000;
const SEEN_STORAGE_KEY_PREFIX = "tessera:drift:seen:";
const BACKDROP_STORAGE_KEY = "tessera:drift:backdrop";

type BackdropStyle =
  | "blur-soft"
  | "blur-heavy"
  | "blur-dark"
  | "blur-mono"
  | "gradient"
  | "ink"
  | "none";

type BackdropStyleDef = {
  id: BackdropStyle;
  label: string;
  photoFilter: string | null;
  photoBrightness: number;
  blurPx: number;
  saturate: number;
  grayscale: number;
  scale: number;
  vignette: string | null;
  useGradientWhenNoPhoto: boolean;
};

const BACKDROP_STYLES: BackdropStyleDef[] = [
  {
    id: "blur-soft",
    label: "Blurred photo · soft",
    photoFilter: null,
    photoBrightness: 0.6,
    blurPx: 48,
    saturate: 1.2,
    grayscale: 0,
    scale: 1.12,
    vignette:
      "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "blur-heavy",
    label: "Blurred photo · heavy",
    photoFilter: null,
    photoBrightness: 0.55,
    blurPx: 90,
    saturate: 1.3,
    grayscale: 0,
    scale: 1.2,
    vignette:
      "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "blur-dark",
    label: "Blurred photo · dark",
    photoFilter: null,
    photoBrightness: 0.3,
    blurPx: 60,
    saturate: 1.1,
    grayscale: 0,
    scale: 1.15,
    vignette:
      "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "blur-mono",
    label: "Blurred photo · mono",
    photoFilter: null,
    photoBrightness: 0.5,
    blurPx: 55,
    saturate: 1,
    grayscale: 1,
    scale: 1.15,
    vignette:
      "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "gradient",
    label: "Kind-tinted gradient",
    photoFilter: null,
    photoBrightness: 0,
    blurPx: 0,
    saturate: 1,
    grayscale: 0,
    scale: 1,
    vignette:
      "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "ink",
    label: "Ink + vignette",
    photoFilter: null,
    photoBrightness: 0,
    blurPx: 0,
    saturate: 1,
    grayscale: 0,
    scale: 1,
    vignette:
      "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)",
    useGradientWhenNoPhoto: false,
  },
  {
    id: "none",
    label: "Pure ink (no backdrop)",
    photoFilter: null,
    photoBrightness: 0,
    blurPx: 0,
    saturate: 1,
    grayscale: 0,
    scale: 1,
    vignette: null,
    useGradientWhenNoPhoto: false,
  },
];

function loadSeenMap(treeId: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY_PREFIX + treeId);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistSeenMap(treeId: string, map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SEEN_STORAGE_KEY_PREFIX + treeId,
      JSON.stringify(map),
    );
  } catch {
    // Quota errors are fine to swallow — bias is best-effort.
  }
}

type DetectedKind = "image" | "video" | "audio" | "link" | "text";

function detectItemKind(item: DriftItem): DetectedKind {
  const mime = item.media?.mimeType ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/") || (item.media?.mediaUrl && !mime)) return "image";
  if (item.media?.linkedMediaPreviewUrl || item.media?.linkedMediaOpenUrl) return "link";
  if (item.memory.kind === "voice") return "audio";
  return "text";
}

function readingTimeMs(text: string | null | undefined): number {
  if (!text) return STORY_MIN_MS;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = Math.round((words / WORDS_PER_MINUTE) * 60_000);
  return Math.min(STORY_MAX_MS, Math.max(STORY_MIN_MS, ms));
}

function formatKindLabel(kind: DetectedKind, memory: ApiMemory): string {
  switch (kind) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "audio":
      return memory.kind === "voice" ? "Voice" : "Audio";
    case "link":
      return "Linked media";
    case "text":
    default:
      return memory.kind === "story" ? "Story" : "Memory";
  }
}

export function DriftMode({
  treeId,
  people,
  onClose,
  onPersonDetail,
  apiBase,
  initialFilter,
}: DriftModeProps) {
  const [items, setItems] = useState<DriftItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [backdropStyle, setBackdropStyle] = useState<BackdropStyle>(() => {
    if (typeof window === "undefined") return "blur-soft";
    const stored = window.localStorage.getItem(BACKDROP_STORAGE_KEY);
    return (BACKDROP_STYLES.find((s) => s.id === stored)?.id ??
      "blur-soft") as BackdropStyle;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BACKDROP_STORAGE_KEY, backdropStyle);
  }, [backdropStyle]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reduceMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      const peopleById = new Map(people.map((p) => [p.id, p]));
      let feed: DriftFeedMemory[] = [];

      const params = new URLSearchParams();
      if (initialFilter?.personId) params.set("personId", initialFilter.personId);
      if (initialFilter?.mode) params.set("mode", initialFilter.mode);
      if (initialFilter?.yearStart != null)
        params.set("yearStart", String(initialFilter.yearStart));
      if (initialFilter?.yearEnd != null)
        params.set("yearEnd", String(initialFilter.yearEnd));
      const qs = params.toString();
      const driftUrl = `${apiBase}/api/trees/${treeId}/drift${qs ? `?${qs}` : ""}`;

      try {
        const res = await fetch(driftUrl, {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { memories: DriftFeedMemory[] };
          feed = data.memories ?? [];
        }
      } catch {
        // fall through to legacy loader
      }

      // Legacy fallback: if the dedicated endpoint is unavailable for any
      // reason, aggregate via per-person fetches so Drift still works.
      if (feed.length === 0) {
        const byMemoryId = new Map<string, DriftFeedMemory>();
        await Promise.all(
          people.map(async (person) => {
            try {
              const res = await fetch(
                `${apiBase}/api/trees/${treeId}/people/${person.id}`,
                { credentials: "include" }
              );
              if (!res.ok) return;
              const data = await res.json();
              for (const memory of (data.memories ?? []) as DriftFeedMemory[]) {
                if (!byMemoryId.has(memory.id)) {
                  byMemoryId.set(memory.id, memory);
                }
              }
            } catch {
              // ignore
            }
          })
        );
        feed = Array.from(byMemoryId.values());
        // Shuffle once client-side since server didn't.
        for (let i = feed.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [feed[i], feed[j]] = [feed[j]!, feed[i]!];
        }
      }

      // Bias: unseen memories first (in server-provided order), then seen
      // memories sorted by oldest-seen-first so nothing drifts back too soon.
      const seen = loadSeenMap(treeId);
      const unseen: DriftFeedMemory[] = [];
      const alreadySeen: DriftFeedMemory[] = [];
      for (const memory of feed) {
        if (seen[memory.id]) alreadySeen.push(memory);
        else unseen.push(memory);
      }
      alreadySeen.sort((a, b) => (seen[a.id] ?? 0) - (seen[b.id] ?? 0));
      feed = [...unseen, ...alreadySeen];

      const flat: DriftItem[] = [];
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
          people[0]!;
        const memoryWithPerson: ApiMemory = {
          ...memory,
          personId: subject.id,
        } as ApiMemory;

        const mediaItems = (memory.mediaItems ?? []).filter(
          (item) =>
            item.mediaUrl || item.linkedMediaPreviewUrl || item.linkedMediaOpenUrl,
        );
        if (mediaItems.length === 0) {
          flat.push({
            key: `${memory.id}:solo`,
            memory: memoryWithPerson,
            person: subject,
            media: null,
            itemIndex: 0,
            itemCount: 1,
          });
        } else {
          mediaItems.forEach((item, idx) => {
            flat.push({
              key: `${memory.id}:${item.id}`,
              memory: memoryWithPerson,
              person: subject,
              media: item,
              itemIndex: idx,
              itemCount: mediaItems.length,
            });
          });
        }
      }

      setItems(flat);
      setCurrentIndex(0);
      setIsLoading(false);
    };
    fetchAll();
  }, [treeId, people, apiBase, initialFilter]);

  const current = items[currentIndex] ?? null;
  const currentKind: DetectedKind | null = current ? detectItemKind(current) : null;

  const isRemembrance = initialFilter?.mode === "remembrance";
  const isBranch = initialFilter?.mode === "branch";
  const branchSubject = useMemo(() => {
    if (!isBranch || !initialFilter?.personId) return null;
    return people.find((p) => p.id === initialFilter.personId) ?? null;
  }, [isBranch, initialFilter?.personId, people]);
  const remembranceSubject = useMemo(() => {
    if (!isRemembrance || !initialFilter?.personId) return null;
    return people.find((p) => p.id === initialFilter.personId) ?? null;
  }, [isRemembrance, initialFilter?.personId, people]);

  const computedDurationMs = useMemo(() => {
    if (!current || !currentKind) return PHOTO_DURATION_MS;
    let base: number;
    switch (currentKind) {
      case "image":
        base = PHOTO_DURATION_MS;
        break;
      case "text":
        base = readingTimeMs(current.memory.body ?? current.memory.transcriptText ?? "");
        break;
      case "link":
        base = DOCUMENT_CARD_MS;
        break;
      case "video":
      case "audio":
        base = MEDIA_MAX_MS;
        break;
      default:
        base = PHOTO_DURATION_MS;
    }
    if (isRemembrance && currentKind !== "video" && currentKind !== "audio") {
      base = Math.round(base * REMEMBRANCE_PACING_MULTIPLIER);
    }
    return base;
  }, [current, currentKind, isRemembrance]);

  const advance = useCallback(() => {
    setProgress(0);
    setCurrentIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
  }, [items.length]);

  const stepBack = useCallback(() => {
    setProgress(0);
    setCurrentIndex((i) =>
      items.length === 0 ? 0 : (i - 1 + items.length) % items.length
    );
  }, [items.length]);

  const jumpToNextMemory = useCallback(() => {
    if (items.length === 0) return;
    setProgress(0);
    setCurrentIndex((i) => {
      const currentMemoryId = items[i]?.memory.id;
      for (let step = 1; step <= items.length; step += 1) {
        const idx = (i + step) % items.length;
        if (items[idx]?.memory.id !== currentMemoryId) return idx;
      }
      return i;
    });
  }, [items]);

  const jumpToPrevMemory = useCallback(() => {
    if (items.length === 0) return;
    setProgress(0);
    setCurrentIndex((i) => {
      const currentMemoryId = items[i]?.memory.id;
      for (let step = 1; step <= items.length; step += 1) {
        const idx = (i - step + items.length) % items.length;
        if (items[idx]?.memory.id !== currentMemoryId) {
          // Jump to the first item of that memory.
          const memoryId = items[idx]?.memory.id;
          let first = idx;
          while (first > 0 && items[first - 1]?.memory.id === memoryId) {
            first -= 1;
          }
          return first;
        }
      }
      return i;
    });
  }, [items]);

  // Timer + progress for photo/text/link kinds (video/audio drive their own).
  useEffect(() => {
    if (!isPlaying || items.length === 0 || !currentKind) return;
    if (currentKind === "video" || currentKind === "audio") return;

    startedAtRef.current = Date.now();
    setProgress(0);

    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setProgress(Math.min(100, (elapsed / computedDurationMs) * 100));
    }, 50);

    timerRef.current = setTimeout(advance, computedDurationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [isPlaying, currentIndex, currentKind, computedDurationMs, advance, items.length]);

  // Reset progress when switching items of any kind.
  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  // Record the currently-drifting memory as seen so future sessions bias
  // toward content the viewer hasn't encountered recently.
  useEffect(() => {
    if (!current) return;
    const map = loadSeenMap(treeId);
    map[current.memory.id] = Date.now();
    persistSeenMap(treeId, map);
  }, [current, treeId]);

  // Pause/resume media when isPlaying toggles
  useEffect(() => {
    if (currentKind === "video" && videoRef.current) {
      if (isPlaying) void videoRef.current.play().catch(() => {});
      else videoRef.current.pause();
    }
    if (currentKind === "audio" && audioRef.current) {
      if (isPlaying) void audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, currentKind, currentIndex]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        if (e.shiftKey) jumpToNextMemory();
        else advance();
      }
      if (e.key === "ArrowLeft") {
        if (e.shiftKey) jumpToPrevMemory();
        else stepBack();
      }
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance, stepBack, jumpToNextMemory, jumpToPrevMemory, onClose]);

  const resolvedMediaUrl = getProxiedMediaUrl(current?.media?.mediaUrl ?? null);
  const resolvedLinkPreview = current?.media?.linkedMediaPreviewUrl ?? null;

  // Backdrop: blurred copy of the current photo when available; otherwise
  // fall back to any photo attached to the same memory (gives video/audio/text
  // items a coherent, memory-tinted background); otherwise null and the
  // gradient backdrop below takes over.
  const backdropPhotoUrl = useMemo(() => {
    if (!current) return null;
    if (currentKind === "image" && resolvedMediaUrl) return resolvedMediaUrl;
    const items = current.memory.mediaItems ?? [];
    const firstPhoto = items.find(
      (item) =>
        item.mediaUrl &&
        (item.mimeType?.startsWith("image/") ?? false),
    );
    if (firstPhoto?.mediaUrl) return getProxiedMediaUrl(firstPhoto.mediaUrl);
    return null;
  }, [current, currentKind, resolvedMediaUrl]);

  const gradientBackdrop = useMemo(() => {
    switch (currentKind) {
      case "text":
        return "radial-gradient(ellipse at 30% 20%, rgba(168,138,90,0.22), transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(92,62,42,0.28), transparent 70%), var(--ink)";
      case "audio":
        return "radial-gradient(ellipse at 25% 25%, rgba(86,96,138,0.25), transparent 65%), radial-gradient(ellipse at 75% 75%, rgba(52,38,68,0.35), transparent 70%), var(--ink)";
      case "link":
        return "radial-gradient(ellipse at 40% 30%, rgba(188,148,86,0.22), transparent 60%), radial-gradient(ellipse at 60% 75%, rgba(70,52,40,0.3), transparent 70%), var(--ink)";
      default:
        return "var(--ink)";
    }
  }, [currentKind]);

  const bottomCaptionBody = useMemo(() => {
    if (!current) return null;
    if (currentKind === "audio") {
      const transcript = current.memory.transcriptText;
      if (transcript) return transcript;
    }
    return null;
  }, [current, currentKind]);

  const effectiveBackdropStyle: BackdropStyle = isRemembrance ? "blur-mono" : backdropStyle;
  const activeBackdrop =
    BACKDROP_STYLES.find((s) => s.id === effectiveBackdropStyle) ?? BACKDROP_STYLES[0]!;

  const showPhotoBackdrop =
    backdropPhotoUrl != null &&
    activeBackdrop.blurPx > 0 &&
    effectiveBackdropStyle !== "ink" &&
    effectiveBackdropStyle !== "none" &&
    effectiveBackdropStyle !== "gradient";

  const rootBackground =
    effectiveBackdropStyle === "none"
      ? "var(--ink)"
      : activeBackdrop.useGradientWhenNoPhoto && !showPhotoBackdrop
        ? gradientBackdrop
        : "var(--ink)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: rootBackground,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Backdrop: blurred copy of the current photo for cohesion + full-bleed feel */}
      <AnimatePresence mode="wait">
        {showPhotoBackdrop && backdropPhotoUrl && (
          <motion.div
            key={`backdrop:${effectiveBackdropStyle}:${backdropPhotoUrl}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              backgroundImage: `url(${backdropPhotoUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: `blur(${activeBackdrop.blurPx}px) saturate(${activeBackdrop.saturate}) brightness(${activeBackdrop.photoBrightness}) grayscale(${activeBackdrop.grayscale})`,
              transform: `scale(${activeBackdrop.scale})`,
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* Vignette: darken edges so media always sits in a framed center.
          Kept very subtle. Sits above the backdrop but below content. */}
      {activeBackdrop.vignette && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            background: activeBackdrop.vignette,
          }}
        />
      )}
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          background: "none",
          border: "none",
          color: "var(--ink-faded)",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          cursor: "pointer",
          zIndex: 10,
        }}
      >
        × Exit drift
      </button>

      {/* In memory of overlay (remembrance mode) */}
      {isRemembrance && remembranceSubject && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "var(--font-display)",
            color: "var(--paper)",
            textAlign: "center",
            zIndex: 10,
            pointerEvents: "none",
            textShadow: "0 1px 12px rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 10,
              letterSpacing: 2.5,
              textTransform: "uppercase",
              color: "var(--ink-faded)",
              marginBottom: 4,
            }}
          >
            In memory of
          </div>
          <div style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.2 }}>
            {remembranceSubject.name}
          </div>
        </div>
      )}

      {/* Branch overlay */}
      {isBranch && branchSubject && (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "var(--font-display)",
            color: "var(--paper)",
            textAlign: "center",
            zIndex: 10,
            pointerEvents: "none",
            textShadow: "0 1px 12px rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 10,
              letterSpacing: 2.5,
              textTransform: "uppercase",
              color: "var(--ink-faded)",
              marginBottom: 4,
            }}
          >
            Close to the branch of
          </div>
          <div style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.2 }}>
            {branchSubject.name}
          </div>
        </div>
      )}

      {/* Kind chip + item N/M */}
      {current && !isLoading && currentKind && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--ink-faded)",
            zIndex: 10,
          }}
        >
          {formatKindLabel(currentKind, current.memory)}
          {current.itemCount > 1
            ? ` · ${current.itemIndex + 1} / ${current.itemCount}`
            : ""}
          {current.memory.dateOfEventText
            ? ` · ${current.memory.dateOfEventText}`
            : ""}
        </div>
      )}

      {/* Autoplay toggle */}
      <button
        onClick={() => setIsPlaying((p) => !p)}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          background: "none",
          border: "1px solid rgba(217,208,188,0.3)",
          borderRadius: 20,
          color: "var(--paper-deep)",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          cursor: "pointer",
          padding: "5px 14px",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isPlaying ? "var(--moss)" : "var(--ink-faded)",
            display: "inline-block",
          }}
        />
        {isPlaying ? "Playing" : "Paused"}
      </button>

      {/* Backdrop style selector (dev-facing knob for trying looks). Hidden in
          remembrance mode where the mono backdrop is enforced. */}
      {!isRemembrance && (
        <select
          value={backdropStyle}
          onChange={(e) => setBackdropStyle(e.target.value as BackdropStyle)}
          aria-label="Backdrop style"
          style={{
            position: "absolute",
            top: 20,
            right: 140,
            background: "rgba(10,10,10,0.5)",
            border: "1px solid rgba(217,208,188,0.3)",
            borderRadius: 20,
            color: "var(--paper-deep)",
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            cursor: "pointer",
            padding: "5px 12px",
            zIndex: 10,
            appearance: "none",
            outline: "none",
          }}
        >
          {BACKDROP_STYLES.map((s) => (
            <option key={s.id} value={s.id} style={{ background: "#1a1a1a" }}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      {/* Navigation zones */}
      <button
        onClick={stepBack}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "25%",
          height: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          zIndex: 5,
          color: "transparent",
        }}
        aria-label="Previous"
      >
        ←
      </button>
      <button
        onClick={advance}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: "25%",
          height: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          zIndex: 5,
          color: "transparent",
        }}
        aria-label="Next"
      >
        →
      </button>

      {isLoading && (
        <div
          style={{
            width: 200,
            height: 20,
            borderRadius: 4,
            background: "rgba(246,241,231,0.1)",
            backgroundImage:
              "linear-gradient(90deg, rgba(246,241,231,0.05) 25%, rgba(246,241,231,0.15) 50%, rgba(246,241,231,0.05) 75%)",
            backgroundSize: "400px 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      )}

      {!isLoading && items.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "var(--paper-deep)",
            fontFamily: "var(--font-body)",
            maxWidth: 480,
            padding: "0 40px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              marginBottom: 12,
            }}
          >
            Nothing to drift through yet.
          </div>
          <div style={{ fontSize: 15, color: "var(--ink-faded)" }}>
            Add photos, stories, or voice recordings to a person and they'll
            start showing up here.
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!isLoading && current && currentKind && (
          <motion.div
            key={current.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            style={{
              maxWidth:
                currentKind === "image" || currentKind === "video" ? "100%" : 860,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding:
                currentKind === "image" || currentKind === "video"
                  ? "60px 24px 140px"
                  : "0 40px",
              gap: 20,
            }}
          >
            {currentKind === "image" && resolvedMediaUrl && (
              <div
                style={{
                  width: "min(96vw, 100%)",
                  height: "82vh",
                  maxHeight: "82vh",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <motion.img
                  src={resolvedMediaUrl}
                  alt={current.memory.title}
                  initial={
                    reduceMotion
                      ? { scale: 1 }
                      : { scale: 1.02, x: 0, y: 0 }
                  }
                  animate={
                    reduceMotion
                      ? { scale: 1 }
                      : {
                          scale: 1.08,
                          x: ((current.itemIndex % 2 === 0 ? 1 : -1) * 18),
                          y: ((current.itemIndex % 3 === 0 ? -1 : 1) * 10),
                        }
                  }
                  transition={{
                    duration: PHOTO_DURATION_MS / 1000,
                    ease: "linear",
                  }}
                  style={{
                    maxHeight: "82vh",
                    maxWidth: "100%",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </div>
            )}

            {currentKind === "video" && resolvedMediaUrl && (
              <video
                ref={videoRef}
                src={resolvedMediaUrl}
                autoPlay
                playsInline
                controls={false}
                muted={false}
                onLoadedMetadata={() => {
                  startedAtRef.current = Date.now();
                }}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  if (el.duration && Number.isFinite(el.duration)) {
                    setProgress(Math.min(100, (el.currentTime / el.duration) * 100));
                    if (el.currentTime * 1000 >= MEDIA_MAX_MS) {
                      advance();
                    }
                  }
                }}
                onEnded={advance}
                style={{
                  maxHeight: "82vh",
                  width: "min(96vw, 100%)",
                  objectFit: "contain",
                  display: "block",
                  background: "black",
                }}
              />
            )}

            {currentKind === "audio" && resolvedMediaUrl && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    width: 160,
                    height: 160,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 30% 30%, var(--moss), rgba(0,0,0,0.2))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--paper)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    animation: isPlaying
                      ? "driftPulse 2.4s ease-in-out infinite"
                      : "none",
                  }}
                >
                  Listening
                </div>
                <audio
                  ref={audioRef}
                  src={resolvedMediaUrl}
                  autoPlay
                  controls={false}
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget;
                    if (el.duration && Number.isFinite(el.duration)) {
                      setProgress(
                        Math.min(100, (el.currentTime / el.duration) * 100),
                      );
                      if (el.currentTime * 1000 >= MEDIA_MAX_MS) {
                        advance();
                      }
                    }
                  }}
                  onEnded={advance}
                  onError={() => {
                    setTimeout(advance, DEFAULT_MEDIA_FALLBACK_MS);
                  }}
                />
                {bottomCaptionBody && (
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 16,
                      color: "var(--paper-deep)",
                      lineHeight: 1.7,
                      maxWidth: "60ch",
                      textAlign: "center",
                      margin: 0,
                      maxHeight: "28vh",
                      overflow: "hidden",
                    }}
                  >
                    {bottomCaptionBody}
                  </p>
                )}
              </div>
            )}

            {currentKind === "link" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                {resolvedLinkPreview && (
                  <img
                    src={resolvedLinkPreview}
                    alt={current.memory.title}
                    style={{
                      maxHeight: "52vh",
                      maxWidth: "100%",
                      objectFit: "contain",
                      display: "block",
                      opacity: 0.95,
                    }}
                  />
                )}
                {current.media?.linkedMediaOpenUrl && (
                  <a
                    href={current.media.linkedMediaOpenUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--paper-deep)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      textDecoration: "underline",
                    }}
                  >
                    {current.media.linkedMediaLabel || "Open in Drive ↗"}
                  </a>
                )}
              </div>
            )}

            {currentKind !== "image" && currentKind !== "video" && (
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: currentKind === "text" ? 32 : 24,
                  color: "var(--paper-deep)",
                  textAlign: "center",
                  lineHeight: 1.3,
                  margin: 0,
                }}
              >
                {current.memory.title}
              </h2>
            )}

            {currentKind === "text" && (current.memory.body || current.memory.transcriptText) && (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 17,
                  color: "var(--paper-deep)",
                  lineHeight: 1.8,
                  maxWidth: "60ch",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                {current.memory.body || current.memory.transcriptText}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom attribution + person link */}
      {current && !isLoading && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 40,
            right: 40,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                color: "var(--paper-deep)",
              }}
            >
              {current.person.name}
            </div>
            <div>
              {current.memory.title}
              {current.memory.dateOfEventText
                ? ` · ${current.memory.dateOfEventText}`
                : ""}
            </div>
          </div>

          <button
            onClick={() => onPersonDetail(current.person.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--paper-deep)",
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Open {current.person.name}'s archive →
          </button>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "rgba(217,208,188,0.15)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "var(--moss)",
            transition: "width 50ms linear",
          }}
        />
      </div>

      <style jsx global>{`
        @keyframes driftPulse {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.06); opacity: 1; }
        }
      `}</style>
    </motion.div>
  );
}
