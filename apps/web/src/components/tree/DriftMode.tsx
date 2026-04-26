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
  casting?: boolean;
  castDeviceName?: string | null;
}

export type DriftFilter = {
  mode?: "remembrance";
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
const MAX_SEEN_ENTRIES = 500;

type BackdropStyle =
  | "blur-soft"
  | "blur-heavy"
  | "blur-dark"
  | "blur-mono"
  | "gradient"
  | "ink";

type BackdropStyleDef = {
  id: BackdropStyle;
  photoBrightness: number;
  blurPx: number;
  saturate: number;
  grayscale: number;
  scale: number;
  vignette: string;
  useGradientWhenNoPhoto: boolean;
};

const BACKDROP_STYLES: BackdropStyleDef[] = [
  {
    id: "blur-soft",
    photoBrightness: 0.6,
    blurPx: 48,
    saturate: 1.2,
    grayscale: 0,
    scale: 1.12,
    vignette: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "blur-heavy",
    photoBrightness: 0.55,
    blurPx: 90,
    saturate: 1.3,
    grayscale: 0,
    scale: 1.2,
    vignette: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "blur-dark",
    photoBrightness: 0.3,
    blurPx: 60,
    saturate: 1.1,
    grayscale: 0,
    scale: 1.15,
    vignette: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.6) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "blur-mono",
    photoBrightness: 0.5,
    blurPx: 55,
    saturate: 1,
    grayscale: 1,
    scale: 1.15,
    vignette: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "gradient",
    photoBrightness: 0,
    blurPx: 0,
    saturate: 1,
    grayscale: 0,
    scale: 1,
    vignette: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)",
    useGradientWhenNoPhoto: true,
  },
  {
    id: "ink",
    photoBrightness: 0,
    blurPx: 0,
    saturate: 1,
    grayscale: 0,
    scale: 1,
    vignette: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)",
    useGradientWhenNoPhoto: false,
  },
];

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
    const recent = entries.slice(entries.length - MAX_SEEN_ENTRIES);
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
      const recent = entries.slice(entries.length - MAX_SEEN_ENTRIES);
      for (const [k, v] of recent) pruned[k] = v;
      window.localStorage.setItem(SEEN_STORAGE_KEY_PREFIX + treeId, JSON.stringify(pruned));
    } else {
      window.localStorage.setItem(SEEN_STORAGE_KEY_PREFIX + treeId, JSON.stringify(map));
    }
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
  casting,
  castDeviceName,
}: DriftModeProps) {
  const [items, setItems] = useState<DriftItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [backdropStyle] = useState<BackdropStyle>("blur-soft");
  const [videoMuted, setVideoMuted] = useState(true);
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
      setLoadError(null);
      const peopleById = new Map(people.map((p) => [p.id, p]));

      const params = new URLSearchParams();
      if (initialFilter?.personId) params.set("personId", initialFilter.personId);
      if (initialFilter?.mode) params.set("mode", initialFilter.mode);
      if (initialFilter?.yearStart != null)
        params.set("yearStart", String(initialFilter.yearStart));
      if (initialFilter?.yearEnd != null)
        params.set("yearEnd", String(initialFilter.yearEnd));
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
  const filterPersonId = initialFilter?.personId ?? null;

  const remembranceSubject = useMemo(() => {
    if (!isRemembrance || !filterPersonId) return null;
    return people.find((p) => p.id === filterPersonId) ?? null;
  }, [isRemembrance, filterPersonId, people]);

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

  useEffect(() => {
    if (!isPlaying || items.length === 0 || !currentKind) return;
    if (currentKind === "video" || currentKind === "audio") return;

    const startedAt = Date.now();
    startedAtRef.current = startedAt;

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

  useEffect(() => {
    if (!current) return;
    const map = loadSeenMap(treeId);
    map[current.memory.id] = Date.now();
    persistSeenMap(treeId, map);
  }, [current, treeId]);

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

  const backdropPhotoUrl = useMemo(() => {
    if (!current) return null;
    if (currentKind === "image" && resolvedMediaUrl) return resolvedMediaUrl;
    const mediaItemsInMemory = current.memory.mediaItems ?? [];
    const firstPhoto = mediaItemsInMemory.find(
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

  const transcriptCaption = useMemo(() => {
    if (!current || currentKind !== "audio") return null;
    return current.memory.transcriptText ?? null;
  }, [current, currentKind]);

  const effectiveBackdropStyle: BackdropStyle = isRemembrance ? "blur-mono" : backdropStyle;
  const activeBackdrop =
    BACKDROP_STYLES.find((s) => s.id === effectiveBackdropStyle) ?? BACKDROP_STYLES[0]!;

  const showPhotoBackdrop =
    backdropPhotoUrl != null &&
    activeBackdrop.blurPx > 0 &&
    effectiveBackdropStyle !== "ink" &&
    effectiveBackdropStyle !== "gradient";

  const rootBackground =
    activeBackdrop.useGradientWhenNoPhoto && !showPhotoBackdrop
      ? gradientBackdrop
      : "var(--ink)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      className="drift-root"
      style={{ background: rootBackground }}
    >
      <AnimatePresence mode="wait">
        {showPhotoBackdrop && backdropPhotoUrl && (
          <motion.div
            key={`backdrop:${effectiveBackdropStyle}:${backdropPhotoUrl}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
            className="drift-backdrop"
            style={{
              backgroundImage: `url(${backdropPhotoUrl})`,
              filter: `blur(${activeBackdrop.blurPx}px) saturate(${activeBackdrop.saturate}) brightness(${activeBackdrop.photoBrightness}) grayscale(${activeBackdrop.grayscale})`,
              transform: `scale(${activeBackdrop.scale})`,
            }}
          />
        )}
      </AnimatePresence>

      <div
        className="drift-vignette"
        style={{ background: activeBackdrop.vignette }}
      />

      <button onClick={onClose} className="drift-close">
        ×{casting ? ` Casting to ${castDeviceName ?? "TV"}` : " Exit drift"}
      </button>

      {isRemembrance && remembranceSubject && (
        <div className="drift-remembrance-header">
          <div className="drift-remembrance-label">In memory of</div>
          <div className="drift-remembrance-name">{remembranceSubject.name}</div>
        </div>
      )}

      {current && !isLoading && currentKind && (
        <div className="drift-kind-chip">
          {formatKindLabel(currentKind, current.memory)}
          {current.itemCount > 1 ? ` · ${current.itemIndex + 1} / ${current.itemCount}` : ""}
          {current.memory.dateOfEventText ? ` · ${current.memory.dateOfEventText}` : ""}
        </div>
      )}

      <button
        onClick={() => setIsPlaying((p) => !p)}
        className="drift-autoplay-toggle"
      >
        <span
          className="drift-autoplay-dot"
          style={{ background: isPlaying ? "var(--moss)" : "var(--ink-faded)" }}
        />
        {isPlaying ? "Playing" : "Paused"}
      </button>

      {currentKind === "video" && (
        <button
          onClick={() => setVideoMuted((m) => !m)}
          className="drift-mute-toggle"
        >
          {videoMuted ? "Unmute" : "Mute"}
        </button>
      )}

      <button
        onClick={stepBack}
        className="drift-nav-zone drift-nav-zone--left"
        aria-label="Previous"
      />
      <button
        onClick={advance}
        className="drift-nav-zone drift-nav-zone--right"
        aria-label="Next"
      />

      {isLoading && (
        <div className="drift-loader" />
      )}

      {loadError && !isLoading && items.length === 0 && (
        <div className="drift-empty">
          <div className="drift-empty__title">Could not load drift.</div>
          <div className="drift-empty__body">{loadError}</div>
          <button onClick={onClose} className="drift-empty__btn">Close</button>
        </div>
      )}

      {!isLoading && !loadError && items.length === 0 && (
        <div className="drift-empty">
          <div className="drift-empty__title">Nothing to drift through yet.</div>
          <div className="drift-empty__body">
            Add photos, stories, or voice recordings to a person and they&apos;ll start showing up here.
          </div>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {!isLoading && current && currentKind && (
          <motion.div
            key={current.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
            className={`drift-content drift-content--${currentKind}`}
          >
            {currentKind === "image" && resolvedMediaUrl && (
              <div className="drift-image-frame">
                <motion.img
                  src={resolvedMediaUrl}
                  alt={current.memory.title}
                  initial={reduceMotion ? false : { scale: 1.0, opacity: 0.92 }}
                  animate={
                    reduceMotion
                      ? { scale: 1.0, opacity: 1 }
                      : { scale: 1.06, opacity: 1 }
                  }
                  transition={{
                    duration: reduceMotion ? 0 : computedDurationMs / 1000,
                    ease: "linear",
                  }}
                  className="drift-image"
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
                muted={videoMuted}
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
                className="drift-video"
              />
            )}

            {currentKind === "audio" && resolvedMediaUrl && (
              <div className="drift-audio-block">
                <div
                  className={`drift-audio-orb ${isPlaying ? "drift-audio-orb--playing" : ""}`}
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
                      setProgress(Math.min(100, (el.currentTime / el.duration) * 100));
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
                {transcriptCaption && (
                  <p className="drift-transcript">{transcriptCaption}</p>
                )}
              </div>
            )}

            {currentKind === "link" && (
              <div className="drift-link-block">
                {resolvedLinkPreview && (
                  <img
                    src={resolvedLinkPreview}
                    alt={current.memory.title}
                    className="drift-link-preview"
                  />
                )}
                {current.media?.linkedMediaOpenUrl && (
                  <a
                    href={current.media.linkedMediaOpenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="drift-link-url"
                  >
                    {current.media.linkedMediaLabel || "Open in Drive ↗"}
                  </a>
                )}
              </div>
            )}

            {currentKind !== "image" && currentKind !== "video" && (
              <h2 className="drift-title">
                {current.memory.title}
              </h2>
            )}

            {currentKind === "text" && (current.memory.body || current.memory.transcriptText) && (
              <p className="drift-body">
                {current.memory.body || current.memory.transcriptText}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {current && !isLoading && (
        <div className="drift-bottom">
          <div className="drift-bottom__attribution">
            <div className="drift-bottom__name">{current.person.name}</div>
            <div className="drift-bottom__detail">
              {current.memory.title}
              {current.memory.dateOfEventText ? ` · ${current.memory.dateOfEventText}` : ""}
            </div>
          </div>
          <button
            onClick={() => onPersonDetail(current.person.id)}
            className="drift-bottom__cta"
          >
            Open {current.person.name}&apos;s archive →
          </button>
        </div>
      )}

      <div className="drift-progress-track">
        <div
          className="drift-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}