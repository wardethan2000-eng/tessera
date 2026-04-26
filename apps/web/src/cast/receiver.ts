const NAMESPACE = "urn:x-cast:com.tessera.drift";

const PHOTO_DURATION_MS = 6000;
const REMEMBRANCE_PACING_MULTIPLIER = 1.6;
const STORY_MIN_MS = 8000;
const STORY_MAX_MS = 45000;
const WORDS_PER_MINUTE = 200;
const MEDIA_MAX_MS = 60000;
const DOCUMENT_CARD_MS = 8000;

type DriftItem = {
  key: string;
  memoryId: string;
  kind: string;
  title: string;
  body: string | null;
  transcriptText: string | null;
  dateOfEventText: string | null;
  personName: string;
  personPortraitUrl: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  linkedMediaPreviewUrl: string | null;
  linkedMediaOpenUrl: string | null;
  linkedMediaLabel: string | null;
  itemIndex: number;
  itemCount: number;
};

type DetectedKind = "image" | "video" | "audio" | "link" | "text";

let items: DriftItem[] = [];
let currentIndex = 0;
let isPlaying = true;
let castToken = "";
let apiBase = "";
let treeId = "";
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let progressStart = 0;
let currentDuration = PHOTO_DURATION_MS;
let videoEl: HTMLVideoElement | null = null;
let audioEl: HTMLAudioElement | null = null;
let isMuted = true;
let isRemembrance = false;
let filterPersonId: string | null = null;

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

function detectKind(item: DriftItem): DetectedKind {
  const mime = item.mimeType ?? "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/") || (item.mediaUrl && !mime)) return "image";
  if (item.linkedMediaPreviewUrl || item.linkedMediaOpenUrl) return "link";
  return "text";
}

function readingTimeMs(text: string | null): number {
  if (!text) return STORY_MIN_MS;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = Math.round((words / WORDS_PER_MINUTE) * 60000);
  return Math.min(STORY_MAX_MS, Math.max(STORY_MIN_MS, ms));
}

function computedDurationMs(item: DriftItem, kind: DetectedKind): number {
  let base: number;
  switch (kind) {
    case "image": base = PHOTO_DURATION_MS; break;
    case "text": base = readingTimeMs(item.body ?? item.transcriptText); break;
    case "link": base = DOCUMENT_CARD_MS; break;
    case "video":
    case "audio": base = MEDIA_MAX_MS; break;
    default: base = PHOTO_DURATION_MS;
  }
  if (isRemembrance && kind !== "video" && kind !== "audio") {
    base = Math.round(base * REMEMBRANCE_PACING_MULTIPLIER);
  }
  return base;
}

function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/media")) {
    const base = apiBase || (typeof window !== "undefined" ? window.location.origin : "");
    const sep = url.includes("?") ? "&" : "?";
    return `${base}${url}${sep}cast_token=${encodeURIComponent(castToken)}`;
  }
  if (castToken && url.startsWith("http")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}cast_token=${encodeURIComponent(castToken)}`;
  }
  return url;
}

function clearAutoAdvance() {
  if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

function sendState() {
  const item = items[currentIndex] ?? null;
  const message = {
    type: "DRIFT_STATE",
    currentIndex,
    totalItems: items.length,
    isPlaying,
    currentMemory: item ? {
      id: item.memoryId,
      title: item.title,
      kind: detectKind(item),
      dateOfEventText: item.dateOfEventText,
    } : null,
    currentItem: item ? {
      personName: item.personName,
      portraitUrl: item.personPortraitUrl,
    } : null,
  };

  try {
    context.sendCustomMessage(NAMESPACE, undefined, JSON.stringify(message));
  } catch {
    // ignore send errors
  }
}

function advance() {
  clearAutoAdvance();
  currentIndex = items.length === 0 ? 0 : (currentIndex + 1) % items.length;
  renderCurrent();
}

function stepBack() {
  clearAutoAdvance();
  currentIndex = items.length === 0 ? 0 : (currentIndex - 1 + items.length) % items.length;
  renderCurrent();
}

function play() {
  isPlaying = true;
  scheduleAutoAdvance();
  sendState();
}

function pause() {
  isPlaying = false;
  clearAutoAdvance();
  sendState();
}

function renderCurrent() {
  const root = document.getElementById("drift-root");
  if (!root) return;

  clearAutoAdvance();

  if (items.length === 0) {
    root.innerHTML = '<div class="drift-waiting">Ready to drift</div>';
    sendState();
    return;
  }

  const item = items[currentIndex];
  if (!item) return;
  const kind = detectKind(item);
  currentDuration = computedDurationMs(item, kind);

  let backdropHtml = "";
  const photoUrl = kind === "image" ? resolveMediaUrl(item.mediaUrl) : null;
  if (photoUrl) {
    backdropHtml = `<div class="drift-backdrop drift-backdrop--visible" style="background-image:url(${photoUrl})"></div>`;
  }

  let contentHtml = "";

  switch (kind) {
    case "image": {
      const imgSrc = resolveMediaUrl(item.mediaUrl) ?? "";
      const dur = (currentDuration / 1000).toFixed(1);
      contentHtml = `
        <div class="drift-content drift-content--image drift-content--visible" style="--duration:${dur}s">
          <div class="drift-image-frame">
            <img class="drift-image" src="${imgSrc}" alt="${escapeHtml(item.title)}" style="animation-duration:${dur}s" />
          </div>
        </div>`;
      break;
    }
    case "video": {
      const vidSrc = resolveMediaUrl(item.mediaUrl) ?? "";
      contentHtml = `
        <div class="drift-content drift-content--video drift-content--visible">
          <video class="drift-video" src="${vidSrc}" autoplay playsinline muted></video>
        </div>`;
      break;
    }
    case "audio": {
      const audSrc = resolveMediaUrl(item.mediaUrl) ?? "";
      const transcriptHtml = item.transcriptText
        ? `<p class="drift-transcript">${escapeHtml(item.transcriptText)}</p>`
        : "";
      contentHtml = `
        <div class="drift-content drift-content--audio drift-content--visible">
          <div class="drift-audio-block">
            <div class="drift-audio-orb drift-audio-orb--playing"><span>Listening</span></div>
            ${transcriptHtml}
          </div>
        </div>`;
      break;
    }
    case "link": {
      const previewHtml = item.linkedMediaPreviewUrl
        ? `<img src="${resolveMediaUrl(item.linkedMediaPreviewUrl)}" alt="${escapeHtml(item.title)}" style="max-height:60vh;max-width:80vw;object-fit:contain;border-radius:8px" />`
        : "";
      contentHtml = `
        <div class="drift-content drift-content--link drift-content--visible">
          ${previewHtml}
          ${item.linkedMediaLabel ? `<div style="margin-top:16px;font-size:14px;opacity:0.6">${escapeHtml(item.linkedMediaLabel)}</div>` : ""}
        </div>`;
      break;
    }
    case "text":
    default: {
      const bodyHtml = item.body || item.transcriptText
        ? `<div class="drift-body">${escapeHtml(item.body ?? item.transcriptText ?? "")}</div>`
        : "";
      contentHtml = `
        <div class="drift-content drift-content--text drift-content--visible">
          <div class="drift-title">${escapeHtml(item.title)}</div>
          ${bodyHtml}
        </div>`;
      break;
    }
  }

  const remembranceHtml = isRemembrance && filterPersonId
    ? `<div class="drift-remembrance-header"><div class="drift-remembrance-label">In memory of</div></div>`
    : "";

  const kindLabel = formatKindLabel(kind, item);
  const datePart = item.dateOfEventText ? ` · ${item.dateOfEventText}` : "";
  const indexPart = item.itemCount > 1 ? ` · ${item.itemIndex + 1} / ${item.itemCount}` : "";

  root.innerHTML = `
    ${backdropHtml}
    <div class="drift-vignette"></div>
    ${remembranceHtml}
    <div class="drift-kind-chip">${kindLabel}${indexPart}${datePart}</div>
    ${contentHtml}
    <div class="drift-bottom">
      <div class="drift-bottom__attribution">
        <div class="drift-bottom__name">${escapeHtml(item.personName)}</div>
        <div class="drift-bottom__detail">${escapeHtml(item.title)}${datePart}</div>
      </div>
    </div>
    <div class="drift-progress-track">
      <div class="drift-progress-fill" id="drift-progress" style="width:0%"></div>
    </div>
  `;

  if (kind === "video" || kind === "audio") {
    const mediaEl = root.querySelector(kind === "video" ? "video" : "audio") as HTMLMediaElement | null;
    if (mediaEl) {
      if (kind === "video") videoEl = mediaEl as HTMLVideoElement;
      if (kind === "audio") audioEl = mediaEl as HTMLAudioElement;
      mediaEl.muted = kind === "video" ? isMuted : false;
      mediaEl.onended = () => advance();
      mediaEl.ontimeupdate = () => {
        if (mediaEl.duration && Number.isFinite(mediaEl.duration)) {
          updateProgress((mediaEl.currentTime / mediaEl.duration) * 100);
          if (mediaEl.currentTime * 1000 >= MEDIA_MAX_MS) advance();
        }
      };
    }
  }

  progressStart = Date.now();

  if (isPlaying && kind !== "video" && kind !== "audio") {
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - progressStart;
      updateProgress(Math.min(100, (elapsed / currentDuration) * 100));
    }, 50);

    autoAdvanceTimer = setTimeout(() => advance(), currentDuration);
  }

  sendState();
}

function updateProgress(pct: number) {
  const el = document.getElementById("drift-progress");
  if (el) el.style.width = `${pct}%`;
}

function formatKindLabel(kind: DetectedKind, item: DriftItem): string {
  switch (kind) {
    case "image": return "Photo";
    case "video": return "Video";
    case "audio": return "Voice";
    case "link": return "Linked media";
    case "text":
    default: return "Story";
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchDrift(filter: Record<string, string | number | null | undefined> | null) {
  const root = document.getElementById("drift-root");
  if (root) root.innerHTML = '<div class="drift-waiting">Loading drift...</div>';

  const params = new URLSearchParams();
  params.set("cast_token", castToken);
  if (filter?.personId) params.set("personId", String(filter.personId));
  if (filter?.mode) params.set("mode", String(filter.mode));
  if (filter?.yearStart != null) params.set("yearStart", String(filter.yearStart));
  if (filter?.yearEnd != null) params.set("yearEnd", String(filter.yearEnd));

  const base = apiBase || window.location.origin;
  const url = `${base}/api/trees/${treeId}/drift?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Drift fetch failed: ${res.status}`);
    const data = await res.json() as {
      memories: Array<{
        id: string;
        primaryPersonId: string;
        primaryPerson: { id: string; name: string; portraitUrl: string | null } | null;
        kind: string;
        title: string;
        body: string | null;
        transcriptText: string | null;
        transcriptStatus: string | null;
        dateOfEventText: string | null;
        mediaUrl: string | null;
        mimeType: string | null;
        mediaItems: Array<{
          id: string;
          mediaUrl: string | null;
          mimeType: string | null;
          linkedMediaPreviewUrl: string | null;
          linkedMediaOpenUrl: string | null;
          linkedMediaLabel: string | null;
        }>;
      }>;
    };

    items = [];
    for (const memory of data.memories) {
      const personName = memory.primaryPerson?.name ?? "Unknown";
      const personPortraitUrl = resolveMediaUrl(memory.primaryPerson?.portraitUrl ?? null);
      const mediaItems = (memory.mediaItems ?? []).filter(
        (i) => i.mediaUrl || i.linkedMediaPreviewUrl || i.linkedMediaOpenUrl,
      );

      if (mediaItems.length === 0) {
        items.push({
          key: `${memory.id}:solo`,
          memoryId: memory.id,
          kind: memory.kind,
          title: memory.title,
          body: memory.body,
          transcriptText: memory.transcriptText,
          dateOfEventText: memory.dateOfEventText,
          personName,
          personPortraitUrl,
          mediaUrl: resolveMediaUrl(memory.mediaUrl),
          mimeType: memory.mimeType,
          linkedMediaPreviewUrl: null,
          linkedMediaOpenUrl: null,
          linkedMediaLabel: null,
          itemIndex: 0,
          itemCount: 1,
        });
      } else {
        mediaItems.forEach((mi, idx) => {
          items.push({
            key: `${memory.id}:${mi.id}`,
            memoryId: memory.id,
            kind: memory.kind,
            title: memory.title,
            body: memory.body,
            transcriptText: memory.transcriptText,
            dateOfEventText: memory.dateOfEventText,
            personName,
            personPortraitUrl,
            mediaUrl: resolveMediaUrl(mi.mediaUrl),
            mimeType: mi.mimeType ?? null,
            linkedMediaPreviewUrl: mi.linkedMediaPreviewUrl ?? null,
            linkedMediaOpenUrl: mi.linkedMediaOpenUrl ?? null,
            linkedMediaLabel: mi.linkedMediaLabel ?? null,
            itemIndex: idx,
            itemCount: mediaItems.length,
          });
        });
      }
    }

    currentIndex = 0;
    isPlaying = true;
    renderCurrent();

    try {
      context.sendCustomMessage(NAMESPACE, undefined, JSON.stringify({
        type: "DRIFT_LOADED",
        itemCount: items.length,
      }));
    } catch { /* ignore */ }
  } catch (err) {
    if (root) {
      root.innerHTML = `<div class="drift-error">Could not load drift.<br/>${escapeHtml(String(err))}</div>`;
    }
    try {
      context.sendCustomMessage(NAMESPACE, undefined, JSON.stringify({
        type: "DRIFT_ERROR",
        message: String(err),
      }));
    } catch { /* ignore */ }
  }
}

context.addCustomMessageListener(NAMESPACE, (event: cast.framework.CastReceiverCustomMessage) => {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(event.data as string);
  } catch {
    return;
  }

  switch (message.type) {
    case "START_DRIFT": {
      const data = message as { treeId: string; filter: Record<string, unknown> | null; castToken: string; apiBase: string };
      treeId = data.treeId;
      castToken = data.castToken;
      apiBase = data.apiBase;
      isRemembrance = (data.filter as { mode?: string })?.mode === "remembrance";
      filterPersonId = (data.filter as { personId?: string })?.personId ?? null;
      fetchDrift(data.filter as Record<string, string | number | null | undefined> | null);
      break;
    }
    case "ADVANCE":
      advance();
      break;
    case "STEP_BACK":
      stepBack();
      break;
    case "PLAY":
      play();
      break;
    case "PAUSE":
      pause();
      break;
    case "JUMP_TO": {
      const idx = Number(message.index);
      if (Number.isFinite(idx) && idx >= 0 && idx < items.length) {
        clearAutoAdvance();
        currentIndex = idx;
        renderCurrent();
      }
      break;
    }
    case "MUTE":
      isMuted = Boolean(message.muted);
      if (videoEl) videoEl.muted = isMuted;
      break;
    case "CHANGE_FILTER": {
      const filter = message.filter as Record<string, string | number | null | undefined> | null;
      isRemembrance = (filter as { mode?: string })?.mode === "remembrance";
      filterPersonId = (filter as { personId?: string })?.personId ?? null;
      fetchDrift(filter);
      break;
    }
    case "STOP_DRIFT":
      clearAutoAdvance();
      items = [];
      currentIndex = 0;
      const root = document.getElementById("drift-root");
      if (root) root.innerHTML = '<div class="drift-waiting">Drift ended</div>';
      sendState();
      try {
        context.sendCustomMessage(NAMESPACE, undefined, JSON.stringify({ type: "DRIFT_ENDED" }));
      } catch { /* ignore */ }
      break;
  }
});

context.start({
  disableIdleTimeout: true,
  maxInactivity: 3600,
});