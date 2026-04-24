"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { VoiceRecorderField } from "@/components/tree/VoiceRecorderField";
import { useSession } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api-base";
import {
  MemoryLightbox,
  type LightboxMemory,
} from "@/components/tree/MemoryLightbox";
import {
  MemoryVisibilityControl,
  describeTreeVisibility,
  type TreeVisibilityLevel,
} from "@/components/tree/MemoryVisibilityControl";
import { getProxiedMediaUrl, handleMediaError } from "@/lib/media-url";
import {
  isCanonicalMemoryId,
  isCanonicalTreeId,
  resolveCanonicalTreeId,
} from "@/lib/tree-route";
import { usePendingVoiceTranscriptionRefresh } from "@/lib/usePendingVoiceTranscriptionRefresh";

const API = getApiBase();

type MemoryKind = "story" | "photo" | "voice" | "document" | "other";

type ResolvedPlace = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode?: string | null;
  adminRegion?: string | null;
  locality?: string | null;
};

type MemoryMediaItem = {
  id: string;
  sortOrder: number;
  mediaId: string | null;
  mediaUrl: string | null;
  mimeType?: string | null;
  linkedMediaProvider?: "google_drive" | null;
  linkedMediaOpenUrl?: string | null;
  linkedMediaSourceUrl?: string | null;
  linkedMediaLabel?: string | null;
};

type MemoryPerspective = {
  id: string;
  body: string | null;
  mediaUrl: string | null;
  mimeType?: string | null;
  createdAt: string;
  updatedAt: string;
  contributor: {
    id: string;
    name: string;
    email: string;
  } | null;
  contributorPerson: {
    id: string;
    displayName: string;
    portraitUrl: string | null;
  } | null;
};

type MemoryDetail = {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string | null;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
  transcriptError?: string | null;
  dateOfEventText: string | null;
  createdAt: string;
  mediaUrl: string | null;
  mimeType?: string | null;
  linkedMediaProvider?: "google_drive" | null;
  linkedMediaOpenUrl?: string | null;
  linkedMediaSourceUrl?: string | null;
  linkedMediaLabel?: string | null;
  mediaItems: MemoryMediaItem[];
  place?: ResolvedPlace | null;
  primaryPerson: {
    id: string;
    displayName: string;
    portraitUrl: string | null;
  } | null;
  contributor: {
    id: string;
    name: string;
    email: string;
  } | null;
  prompt: {
    id: string;
    questionText: string;
    status: "pending" | "answered" | "dismissed";
    fromUserName: string | null;
    toPerson: {
      id: string;
      displayName: string;
    } | null;
  } | null;
  perspectives: MemoryPerspective[];
  perspectiveSummary?: {
    totalCount: number;
  };
  directSubjects: Array<{
    id: string;
    displayName: string;
  }>;
  reachRules: Array<{
    kind: "immediate_family" | "ancestors" | "descendants" | "whole_tree";
    seedPersonId: string | null;
    seedPersonName: string | null;
    scopeTreeId: string | null;
  }>;
  treeVisibilityLevel?: TreeVisibilityLevel;
  treeVisibilityIsOverride?: boolean;
  treeVisibilityUnlockDate?: string | null;
  relatedMemories: Array<{
    id: string;
    kind: MemoryKind;
    title: string;
    body: string | null;
    transcriptText?: string | null;
    transcriptStatus?: "none" | "queued" | "processing" | "completed" | "failed";
    transcriptError?: string | null;
    dateOfEventText: string | null;
    mediaUrl: string | null;
    mimeType?: string | null;
    linkedMediaProvider?: "google_drive" | null;
    linkedMediaOpenUrl?: string | null;
    linkedMediaSourceUrl?: string | null;
    linkedMediaLabel?: string | null;
    primaryPerson: {
      id: string;
      displayName: string;
      portraitUrl: string | null;
    } | null;
  }>;
  relatedMemorySummary?: {
    directSubjectCount: number;
    hasPromptThread: boolean;
  };
  viewerCanAddPerspective: boolean;
  viewerCanEdit?: boolean;
  viewerCanDelete?: boolean;
  viewerCanManageVisibility: boolean;
};

function getKindLabel(kind: MemoryKind): string {
  switch (kind) {
    case "story":
      return "Story";
    case "photo":
      return "Photo";
    case "voice":
      return "Voice";
    case "document":
      return "Document";
    default:
      return "Memory";
  }
}

function isAudioMimeType(mimeType?: string | null): boolean {
  return (mimeType?.toLowerCase() ?? "").startsWith("audio/");
}

function getReachLabel(rule: MemoryDetail["reachRules"][number]): string {
  switch (rule.kind) {
    case "immediate_family":
      return rule.seedPersonName
        ? `Shared through ${rule.seedPersonName}'s immediate family`
        : "Shared through immediate family";
    case "ancestors":
      return rule.seedPersonName
        ? `Shared through ${rule.seedPersonName}'s ancestor line`
        : "Shared through ancestors";
    case "descendants":
      return rule.seedPersonName
        ? `Shared through ${rule.seedPersonName}'s descendant line`
        : "Shared through descendants";
    case "whole_tree":
      return "Shared with this whole tree";
    default:
      return "Shared through family context";
  }
}

function getTranscriptLabel(memory: MemoryDetail): string | null {
  if (memory.kind !== "voice") return null;
  if (memory.transcriptStatus === "completed" && memory.transcriptText) {
    return memory.transcriptText;
  }
  if (memory.transcriptStatus === "completed") {
    return "Transcript unavailable.";
  }
  if (memory.transcriptStatus === "failed") {
    return memory.transcriptError ?? "Transcription failed.";
  }
  if (memory.transcriptStatus === "queued" || memory.transcriptStatus === "processing") {
    return "Transcribing…";
  }
  return null;
}

function getRelatedMemoryPreviewText(memory: MemoryDetail["relatedMemories"][number]): string | null {
  const body = memory.body?.trim();
  if (body) {
    return body;
  }

  const transcript = memory.transcriptText?.trim();
  if (transcript) {
    return transcript;
  }

  const linkedLabel = memory.linkedMediaLabel?.trim();
  if (linkedLabel) {
    return linkedLabel;
  }

  return null;
}

function toLightboxMemory(memory: MemoryDetail, mediaItem?: MemoryMediaItem | null): LightboxMemory {
  const selectedMedia = mediaItem ?? memory.mediaItems[0] ?? null;
  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    transcriptText: memory.transcriptText,
    transcriptLanguage: memory.transcriptLanguage,
    transcriptStatus: memory.transcriptStatus,
    transcriptError: memory.transcriptError,
    dateOfEventText: memory.dateOfEventText,
    mediaUrl: selectedMedia?.mediaUrl ?? memory.mediaUrl,
    mimeType: selectedMedia?.mimeType ?? memory.mimeType,
    linkedMediaProvider: selectedMedia?.linkedMediaProvider ?? memory.linkedMediaProvider,
    linkedMediaOpenUrl: selectedMedia?.linkedMediaOpenUrl ?? memory.linkedMediaOpenUrl,
    linkedMediaSourceUrl: selectedMedia?.linkedMediaSourceUrl ?? memory.linkedMediaSourceUrl,
    linkedMediaLabel: selectedMedia?.linkedMediaLabel ?? memory.linkedMediaLabel,
    treeVisibilityLevel: memory.treeVisibilityLevel,
    treeVisibilityIsOverride: memory.treeVisibilityIsOverride,
  };
}

function MetadataPill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: "1px solid var(--rule)",
        background: "var(--paper)",
        color: "var(--ink-faded)",
        fontFamily: "var(--font-ui)",
        fontSize: 11,
        letterSpacing: "0.06em",
        padding: "6px 10px",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function memoryNavItemStyle(active: boolean) {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    color: active ? "#fff" : "var(--ink-faded)",
    background: active ? "var(--moss)" : "transparent",
    border: active ? "1px solid rgba(78,93,66,0.28)" : "1px solid transparent",
    borderRadius: 999,
    padding: "5px 12px",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  } as const;
}

function RelatedMemoryCard({
  treeId,
  memory,
}: {
  treeId: string;
  memory: MemoryDetail["relatedMemories"][number];
}) {
  const previewText = getRelatedMemoryPreviewText(memory);
  const resolvedMediaUrl = getProxiedMediaUrl(memory.mediaUrl);
  const mime = memory.mimeType?.toLowerCase() ?? "";
  const isVideo = mime.startsWith("video/");

  return (
    <a
      href={`/trees/${treeId}/memories/${memory.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid var(--rule)",
        background: "var(--paper)",
        textDecoration: "none",
      }}
    >
      {resolvedMediaUrl && !isVideo && (
        <img
          src={resolvedMediaUrl}
          alt={memory.title}
          onError={handleMediaError}
          style={{
            width: "100%",
            height: 180,
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      {resolvedMediaUrl && isVideo && (
        <video
          src={resolvedMediaUrl}
          style={{
            width: "100%",
            height: 180,
            objectFit: "cover",
            display: "block",
            background: "var(--ink)",
          }}
          muted
          playsInline
          preload="metadata"
        />
      )}
      <div style={{ padding: "18px 20px 20px" }}>
        <h3
          style={{
            margin: "0 0 8px",
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 400,
            lineHeight: 1.15,
            color: "var(--ink)",
          }}
        >
          {memory.title}
        </h3>
        {(memory.dateOfEventText || memory.primaryPerson?.displayName) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: previewText ? 10 : 0,
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--ink-faded)",
            }}
          >
            {memory.primaryPerson?.displayName && <span>{memory.primaryPerson.displayName}</span>}
            {memory.dateOfEventText && <span>{memory.dateOfEventText}</span>}
          </div>
        )}
        {previewText && (
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: 16,
              lineHeight: 1.75,
              color: "var(--ink-soft)",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {previewText}
          </p>
        )}
      </div>
    </a>
  );
}

export default function MemoryPage({
  params,
}: {
  params: Promise<{ treeId: string; memoryId: string }>;
}) {
  const { treeId, memoryId } = use(params);
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [memory, setMemory] = useState<MemoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [perspectiveDraft, setPerspectiveDraft] = useState("");
  const [perspectiveMode, setPerspectiveMode] = useState<"text" | "voice">("text");
  const [perspectiveVoiceInputMode, setPerspectiveVoiceInputMode] = useState<"record" | "upload">(
    "record",
  );
  const [perspectiveFile, setPerspectiveFile] = useState<File | null>(null);
  const [perspectiveError, setPerspectiveError] = useState<string | null>(null);
  const [submittingPerspective, setSubmittingPerspective] = useState(false);
  const [editingMemory, setEditingMemory] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDateOfEventText, setEditDateOfEventText] = useState("");
  const [editPlaceLabel, setEditPlaceLabel] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [updatingVisibilityId, setUpdatingVisibilityId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addingMedia, setAddingMedia] = useState(false);
  const [addMediaError, setAddMediaError] = useState<string | null>(null);
  const [addMediaProgress, setAddMediaProgress] = useState<{ current: number; total: number } | null>(null);
  const addMediaInputRef = useRef<HTMLInputElement | null>(null);
  const perspectiveComposerRef = useRef<HTMLDivElement | null>(null);
  const normalizingTreeId = !isCanonicalTreeId(treeId);

  useEffect(() => {
    if (!isPending && !session) router.replace("/auth/signin");
  }, [isPending, router, session]);

  useEffect(() => {
    if (!session || !normalizingTreeId) return;

    let cancelled = false;
    void (async () => {
      const resolvedTreeId = await resolveCanonicalTreeId(API, treeId);
      if (cancelled) return;
      if (resolvedTreeId && resolvedTreeId !== treeId) {
        router.replace(`/trees/${resolvedTreeId}/memories/${memoryId}`);
        return;
      }
      if (!resolvedTreeId) {
        setLoadError("This tree link is invalid or no longer points to an available tree.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memoryId, normalizingTreeId, router, session, treeId]);

  const loadMemory = useCallback(async () => {
    if (!isCanonicalMemoryId(memoryId)) {
      setLoadError("This memory link is invalid or no longer points to an available memory.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API}/api/trees/${treeId}/memories/${memoryId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        setLoadError("This memory could not be opened in the current tree.");
        setMemory(null);
        return;
      }
      setMemory((await response.json()) as MemoryDetail);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load this memory.",
      );
      setMemory(null);
    } finally {
      setLoading(false);
    }
  }, [memoryId, treeId]);

  useEffect(() => {
    if (session && isCanonicalTreeId(treeId)) {
      void (async () => {
        await loadMemory();
      })();
    }
  }, [loadMemory, session, treeId]);

  usePendingVoiceTranscriptionRefresh({
    items: memory
      ? [
          {
            id: memory.id,
            kind: memory.kind,
            transcriptStatus: memory.transcriptStatus,
          },
        ]
      : [],
    refresh: loadMemory,
    enabled: Boolean(session && memory),
  });

  useEffect(() => {
    setSelectedMediaIndex(0);
    setPerspectiveDraft("");
    setPerspectiveMode("text");
    setPerspectiveVoiceInputMode("record");
    setPerspectiveFile(null);
    setPerspectiveError(null);
    setEditingMemory(false);
    setEditTitle(memory?.title ?? "");
    setEditBody(memory?.body ?? "");
    setEditDateOfEventText(memory?.dateOfEventText ?? "");
    setEditPlaceLabel(memory?.place?.label ?? "");
    setEditError(null);
  }, [memory?.id]);

  const handleAddMediaFiles = useCallback(
    async (files: File[]) => {
      if (!memory || files.length === 0) return;
      setAddingMedia(true);
      setAddMediaError(null);
      setAddMediaProgress({ current: 0, total: files.length });
      try {
        const mediaIds: string[] = [];
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          if (!file) continue;
          setAddMediaProgress({ current: i + 1, total: files.length });
          const presignRes = await fetch(`${API}/api/trees/${treeId}/media/presign`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
              sizeBytes: file.size,
            }),
          });
          if (!presignRes.ok) {
            const data = (await presignRes.json().catch(() => null)) as { error?: string } | null;
            throw new Error(data?.error ?? `Failed to prepare upload for ${file.name}.`);
          }
          const { mediaId, uploadUrl } = (await presignRes.json()) as {
            mediaId: string;
            uploadUrl: string;
          };
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!uploadRes.ok) {
            throw new Error(`Failed to upload ${file.name}.`);
          }
          mediaIds.push(mediaId);
        }

        const attachRes = await fetch(
          `${API}/api/trees/${treeId}/memories/${memory.id}/media`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mediaIds }),
          },
        );
        if (!attachRes.ok) {
          const data = (await attachRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Failed to attach media to this memory.");
        }
        const { mediaItems } = (await attachRes.json()) as {
          mediaItems: MemoryMediaItem[];
        };
        setMemory((current) => (current ? { ...current, mediaItems } : current));
      } catch (error) {
        setAddMediaError(
          error instanceof Error ? error.message : "Failed to add media to this memory.",
        );
      } finally {
        setAddingMedia(false);
        setAddMediaProgress(null);
      }
    },
    [memory, treeId],
  );

  const setMemoryTreeVisibility = useCallback(
    async (visibility: TreeVisibilityLevel | null) => {
      if (!memory) return;

      setUpdatingVisibilityId(memory.id);
      const response = await fetch(`${API}/api/trees/${treeId}/memories/${memory.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          visibilityOverride: visibility,
        }),
      });

      if (response.ok) {
        setMemory((current) =>
          current
            ? {
                ...current,
                treeVisibilityLevel: visibility ?? current.treeVisibilityLevel,
                treeVisibilityIsOverride: visibility !== null,
              }
            : current,
        );
        await loadMemory();
      }

      setUpdatingVisibilityId(null);
    },
    [loadMemory, memory, treeId],
  );

  const lightboxMemories = useMemo(
    () =>
      memory
        ? [toLightboxMemory(memory, memory.mediaItems[selectedMediaIndex] ?? memory.mediaItems[0] ?? null)]
        : [],
    [memory, selectedMediaIndex],
  );

  const handleAddPerspective = useCallback(async () => {
    if (!memory || !memory.viewerCanAddPerspective) return;

    const nextBody = perspectiveDraft.trim();
    if (perspectiveMode === "text" && !nextBody) {
      setPerspectiveError("Write a short reflection before adding it.");
      return;
    }
    if (perspectiveMode === "voice" && !perspectiveFile && !nextBody) {
      setPerspectiveError("Record or upload a voice note, or switch back to text.");
      return;
    }

    setSubmittingPerspective(true);
    setPerspectiveError(null);
    try {
      let perspectiveMediaId: string | undefined;

      if (perspectiveFile) {
        const presignRes = await fetch(`${API}/api/trees/${treeId}/media/presign`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: perspectiveFile.name,
            contentType: perspectiveFile.type || "application/octet-stream",
            sizeBytes: perspectiveFile.size,
          }),
        });

        if (!presignRes.ok) {
          const data = (await presignRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Failed to prepare the voice upload.");
        }

        const { mediaId, uploadUrl } = (await presignRes.json()) as {
          mediaId: string;
          uploadUrl: string;
        };
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": perspectiveFile.type || "application/octet-stream" },
          body: perspectiveFile,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload the voice recording.");
        }

        perspectiveMediaId = mediaId;
      }

      const response = await fetch(`${API}/api/trees/${treeId}/memories/${memory.id}/perspectives`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: nextBody || undefined,
          mediaId: perspectiveMediaId,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to add perspective.");
      }

      const createdPerspective = (await response.json()) as MemoryPerspective;
      setMemory((current) =>
        current
          ? {
              ...current,
              perspectives: [...current.perspectives, createdPerspective],
              perspectiveSummary: {
                totalCount: (current.perspectiveSummary?.totalCount ?? current.perspectives.length) + 1,
              },
            }
          : current,
      );
      setPerspectiveDraft("");
      setPerspectiveMode("text");
      setPerspectiveVoiceInputMode("record");
      setPerspectiveFile(null);
    } catch (error) {
      setPerspectiveError(
        error instanceof Error ? error.message : "Failed to add perspective.",
      );
    } finally {
      setSubmittingPerspective(false);
    }
  }, [memory, perspectiveDraft, perspectiveFile, perspectiveMode, treeId]);

  const handleStartEditing = useCallback(() => {
    if (!memory?.viewerCanEdit) return;
    setEditTitle(memory.title);
    setEditBody(memory.body ?? "");
    setEditDateOfEventText(memory.dateOfEventText ?? "");
    setEditPlaceLabel(memory.place?.label ?? "");
    setEditError(null);
    setEditingMemory(true);
  }, [memory]);

  const handleCancelEditing = useCallback(() => {
    setEditingMemory(false);
    setEditError(null);
    if (!memory) return;
    setEditTitle(memory.title);
    setEditBody(memory.body ?? "");
    setEditDateOfEventText(memory.dateOfEventText ?? "");
    setEditPlaceLabel(memory.place?.label ?? "");
  }, [memory]);

  const handleSaveEdit = useCallback(async () => {
    if (!memory?.viewerCanEdit) return;

    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setEditError("Give the memory a title before saving.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      const response = await fetch(`${API}/api/trees/${treeId}/memories/${memory.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: nextTitle,
          body: editBody.trim() || null,
          dateOfEventText: editDateOfEventText.trim() || null,
          placeLabelOverride: editPlaceLabel.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to save memory changes.");
      }

      await loadMemory();
      setEditingMemory(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Failed to save memory changes.",
      );
    } finally {
      setSavingEdit(false);
    }
  }, [editBody, editDateOfEventText, editPlaceLabel, editTitle, loadMemory, memory, treeId]);

  const handleDeleteMemory = useCallback(async () => {
    if (!memory) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(
        `${API}/api/trees/${treeId}/memories/${memory.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to delete memory.");
      }
      router.push(`/trees/${treeId}/home`);
    } catch (error) {
      setDeleting(false);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete memory.",
      );
    }
  }, [memory, router, treeId]);

  const scrollToPerspectiveComposer = useCallback(() => {
    perspectiveComposerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  if (isPending || loading || normalizingTreeId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[220, 320, 280].map((width, index) => (
            <div
              key={index}
              style={{
                width,
                height: 12,
                borderRadius: 4,
                background: "var(--paper-deep)",
                backgroundImage:
                  "linear-gradient(90deg, var(--paper-deep) 25%, var(--rule) 50%, var(--paper-deep) 75%)",
                backgroundSize: "400px 100%",
                animation: "shimmer 1.5s infinite",
              }}
            />
          ))}
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: "100%",
            borderRadius: 16,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            padding: 28,
          }}
        >
          <h1
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 400,
              color: "var(--ink)",
            }}
          >
            This memory could not be opened.
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: 18,
              lineHeight: 1.7,
              color: "var(--ink-soft)",
            }}
          >
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  if (!memory) return null;

  const selectedMedia = memory.mediaItems[selectedMediaIndex] ?? memory.mediaItems[0] ?? null;
  const resolvedMediaUrl = getProxiedMediaUrl(selectedMedia?.mediaUrl ?? memory.mediaUrl);
  const mime = (selectedMedia?.mimeType ?? memory.mimeType ?? "").toLowerCase();
  const isPhoto = memory.kind === "photo" || mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isPdf = mime === "application/pdf";
  const isVoice = memory.kind === "voice" && !isVideo;
  const selectedLinkedMediaOpenUrl = selectedMedia?.linkedMediaOpenUrl ?? memory.linkedMediaOpenUrl;
  const selectedLinkedMediaProvider = selectedMedia?.linkedMediaProvider ?? memory.linkedMediaProvider;
  const hasFocusedViewer = Boolean(resolvedMediaUrl || selectedLinkedMediaOpenUrl);
  const transcriptLabel = getTranscriptLabel(memory);
  const perspectiveCount = memory.perspectiveSummary?.totalCount ?? memory.perspectives.length;
  const visibleSubjects = memory.directSubjects.filter(
    (subject) => subject.id !== memory.primaryPerson?.id,
  );
  const hasContextSection =
    Boolean(memory.contributor) ||
    Boolean(memory.prompt) ||
    memory.relatedMemories.length > 0;

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(8px)",
          background: "rgba(246,241,231,0.88)",
          borderBottom: "1px solid var(--rule)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: 4,
            borderRadius: 999,
            border: "1px solid var(--rule)",
            background: "var(--paper-deep)",
          }}
        >
          <a href={`/trees/${treeId}/home`} style={memoryNavItemStyle(false)}>
            Home
          </a>
          <a href={`/trees/${treeId}/tree`} style={memoryNavItemStyle(false)}>
            Family tree
          </a>
        </div>
        {memory.primaryPerson && (
          <>
            <span style={{ color: "var(--rule)" }}>·</span>
            <a
              href={`/trees/${treeId}/people/${memory.primaryPerson.id}`}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 14,
                color: "var(--ink-faded)",
                textDecoration: "none",
              }}
            >
              {memory.primaryPerson.displayName}
            </a>
          </>
        )}
        <span style={{ color: "var(--rule)" }}>·</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--ink-soft)",
          }}
        >
          {memory.title}
        </span>
      </header>

      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "40px 24px 56px",
          display: "grid",
          gap: 28,
        }}
      >
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.9fr)",
            gap: 28,
            alignItems: "start",
          }}
        >
          <div
            style={{
              borderRadius: 22,
              overflow: "hidden",
              border: "1px solid var(--rule)",
              background: "var(--paper-deep)",
            }}
          >
            {isPhoto && resolvedMediaUrl && (
              <img
                src={resolvedMediaUrl}
                alt={memory.title}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                style={{
                  width: "100%",
                  display: "block",
                  maxHeight: 620,
                  objectFit: "cover",
                  cursor: hasFocusedViewer ? "zoom-in" : "default",
                }}
                onClick={() => {
                  if (hasFocusedViewer) setLightboxOpen(true);
                }}
              />
            )}
            {isVideo && resolvedMediaUrl && (
              <video
                src={resolvedMediaUrl}
                controls
                style={{
                  width: "100%",
                  display: "block",
                  maxHeight: 620,
                  background: "var(--ink)",
                }}
              />
            )}
            {isPdf && resolvedMediaUrl && (
              <iframe
                src={resolvedMediaUrl}
                title={memory.title}
                style={{
                  width: "100%",
                  minHeight: 620,
                  border: "none",
                  background: "white",
                }}
              />
            )}
            {isVoice && resolvedMediaUrl && (
              <div style={{ padding: 32 }}>
                <div
                  style={{
                    height: 120,
                    borderRadius: 18,
                    background: "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    marginBottom: 20,
                  }}
                >
                  {Array.from({ length: 34 }, (_, index) => (
                    <div
                      key={index}
                      style={{
                        width: 4,
                        height: 20 + Math.abs(Math.sin(index * 0.65) * 56),
                        borderRadius: 999,
                        background: "rgba(246,241,231,0.34)",
                      }}
                    />
                  ))}
                </div>
                <audio controls src={resolvedMediaUrl} style={{ width: "100%" }} />
              </div>
            )}
            {!resolvedMediaUrl && !selectedLinkedMediaOpenUrl && (
              <div
                style={{
                  minHeight: 320,
                  padding: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--font-display)",
                      fontSize: 28,
                      color: "var(--ink)",
                    }}
                  >
                    {getKindLabel(memory.kind)}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-body)",
                      fontSize: 17,
                      lineHeight: 1.7,
                      color: "var(--ink-faded)",
                    }}
                  >
                    This memory is primarily textual and lives as a full archival entry.
                  </p>
                </div>
              </div>
            )}
            {memory.mediaItems.length > 1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: 10,
                  padding: 14,
                  borderTop: "1px solid var(--rule)",
                  background: "rgba(255,255,255,0.35)",
                }}
              >
                {memory.mediaItems.map((item, index) => {
                  const itemUrl = getProxiedMediaUrl(item.mediaUrl);
                  const itemMime = item.mimeType?.toLowerCase() ?? "";
                  const itemIsVideo = itemMime.startsWith("video/");
                  const isSelected = index === selectedMediaIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedMediaIndex(index)}
                      style={{
                        borderRadius: 12,
                        overflow: "hidden",
                        border: isSelected ? "2px solid var(--moss)" : "1px solid var(--rule)",
                        background: "var(--paper)",
                        cursor: "pointer",
                        padding: 0,
                        textAlign: "left",
                      }}
                    >
                      {itemUrl && !itemIsVideo ? (
                        <img
                          src={itemUrl}
                          alt={`${memory.title} item ${index + 1}`}
                          style={{
                            width: "100%",
                            height: 88,
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : itemUrl && itemIsVideo ? (
                        <video
                          src={itemUrl}
                          style={{
                            width: "100%",
                            height: 88,
                            objectFit: "cover",
                            display: "block",
                            background: "var(--ink)",
                          }}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <div
                          style={{
                            height: 88,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 10,
                            fontFamily: "var(--font-ui)",
                            fontSize: 12,
                            color: "var(--ink-faded)",
                          }}
                        >
                          {item.linkedMediaLabel || `Item ${index + 1}`}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                borderRadius: 22,
                border: "1px solid var(--rule)",
                background: "var(--paper)",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <MetadataPill>{getKindLabel(memory.kind)}</MetadataPill>
                <MetadataPill>{describeTreeVisibility(memory)}</MetadataPill>
                {selectedLinkedMediaProvider === "google_drive" && (
                  <MetadataPill>Linked from Drive</MetadataPill>
                )}
                {memory.mediaItems.length > 1 && <MetadataPill>{memory.mediaItems.length} items</MetadataPill>}
                {perspectiveCount > 0 && (
                  <MetadataPill>{perspectiveCount} perspective{perspectiveCount === 1 ? "" : "s"}</MetadataPill>
                )}
              </div>

              <div>
                <h1
                  style={{
                    margin: "0 0 10px",
                    fontFamily: "var(--font-display)",
                    fontSize: 44,
                    fontWeight: 400,
                    lineHeight: 1.05,
                    color: "var(--ink)",
                  }}
                >
                  {memory.title}
                </h1>
                {memory.dateOfEventText && (
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--font-ui)",
                      fontSize: 14,
                      color: "var(--ink-faded)",
                    }}
                  >
                    {memory.dateOfEventText}
                  </p>
                )}
                {memory.place?.label && (
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-body)",
                      fontSize: 18,
                      color: "var(--ink-soft)",
                    }}
                  >
                    {memory.place.label}
                  </p>
                )}
              </div>

              {(memory.viewerCanEdit || memory.viewerCanAddPerspective) && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  {memory.viewerCanEdit && (
                    <button
                      type="button"
                      onClick={editingMemory ? handleCancelEditing : handleStartEditing}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        background: editingMemory ? "var(--paper-deep)" : "transparent",
                        color: "var(--ink)",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      {editingMemory ? "Close editor" : "Edit memory"}
                    </button>
                  )}
                  {memory.viewerCanEdit && (
                    <>
                      <input
                        ref={addMediaInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (files.length > 0) {
                            void handleAddMediaFiles(files);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={addingMedia}
                        onClick={() => addMediaInputRef.current?.click()}
                        style={{
                          borderRadius: 999,
                          border: "1px solid var(--rule)",
                          background: "transparent",
                          color: "var(--ink)",
                          cursor: addingMedia ? "wait" : "pointer",
                          fontFamily: "var(--font-ui)",
                          fontSize: 13,
                          padding: "10px 16px",
                          opacity: addingMedia ? 0.6 : 1,
                        }}
                      >
                        {addingMedia && addMediaProgress
                          ? `Uploading ${addMediaProgress.current}/${addMediaProgress.total}…`
                          : "Add photos & videos"}
                      </button>
                    </>
                  )}
                  {memory.viewerCanAddPerspective && (
                    <button
                      type="button"
                      onClick={scrollToPerspectiveComposer}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--moss)",
                        background: "var(--moss)",
                        color: "var(--paper)",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      Add to this memory
                    </button>
                  )}
                  {memory.viewerCanDelete && !confirmingDelete && (
                    <button
                      type="button"
                      onClick={() => { setConfirmingDelete(true); setDeleteError(null); }}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        background: "transparent",
                        color: "var(--ink-faded)",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      Delete memory
                    </button>
                  )}
                </div>
              )}

              {addMediaError && (
                <div
                  role="alert"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "rgba(180, 50, 50, 0.9)",
                  }}
                >
                  {addMediaError}
                </div>
              )}

              {confirmingDelete && memory.viewerCanDelete && (
                <div
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(180, 50, 50, 0.4)",
                    background: "rgba(180, 50, 50, 0.06)",
                    padding: 18,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      color: "var(--ink)",
                    }}
                  >
                    Delete this memory?
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 15,
                      lineHeight: 1.7,
                      color: "var(--ink-soft)",
                    }}
                  >
                    This action cannot be undone. The memory, its perspectives, and all
                    associated data will be permanently removed.
                  </div>
                  {deleteError && (
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 14,
                        color: "rgba(180, 50, 50, 0.9)",
                      }}
                    >
                      {deleteError}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleDeleteMemory}
                      disabled={deleting}
                      style={{
                        borderRadius: 999,
                        border: "1px solid rgba(180, 50, 50, 0.5)",
                        background: "rgba(180, 50, 50, 0.1)",
                        color: "rgba(180, 50, 50, 0.9)",
                        cursor: deleting ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        fontWeight: 600,
                        padding: "10px 16px",
                        opacity: deleting ? 0.6 : 1,
                      }}
                    >
                      {deleting ? "Deleting\u2026" : "Yes, delete permanently"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmingDelete(false); setDeleteError(null); }}
                      disabled={deleting}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        background: "transparent",
                        color: "var(--ink)",
                        cursor: deleting ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {editingMemory && memory.viewerCanEdit && (
                <div
                  style={{
                    borderRadius: 18,
                    border: "1px solid var(--rule)",
                    background: "var(--paper-deep)",
                    padding: 18,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 26,
                        color: "var(--ink)",
                        marginBottom: 4,
                      }}
                    >
                      Edit this memory
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 15,
                        lineHeight: 1.7,
                        color: "var(--ink-soft)",
                      }}
                    >
                      Update the title, narrative, date, or place without replacing the attached media.
                    </div>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        color: "var(--ink-faded)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Title
                    </span>
                    <input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      style={{
                        width: "100%",
                        borderRadius: 12,
                        border: "1px solid var(--rule)",
                        background: "var(--paper)",
                        padding: "12px 14px",
                        fontFamily: "var(--font-body)",
                        fontSize: 16,
                        color: "var(--ink)",
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--ink-faded)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Date
                      </span>
                      <input
                        value={editDateOfEventText}
                        onChange={(event) => setEditDateOfEventText(event.target.value)}
                        placeholder="August 1998"
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid var(--rule)",
                          background: "var(--paper)",
                          padding: "12px 14px",
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                          color: "var(--ink)",
                          boxSizing: "border-box",
                        }}
                      />
                    </label>

                    <label style={{ display: "grid", gap: 6 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 11,
                          color: "var(--ink-faded)",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Place
                      </span>
                      <input
                        value={editPlaceLabel}
                        onChange={(event) => setEditPlaceLabel(event.target.value)}
                        placeholder="Chicago, Illinois"
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid var(--rule)",
                          background: "var(--paper)",
                          padding: "12px 14px",
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                          color: "var(--ink)",
                          boxSizing: "border-box",
                        }}
                      />
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        color: "var(--ink-faded)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Narrative
                    </span>
                    <textarea
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      rows={8}
                      placeholder="Add or revise the story this memory carries."
                      style={{
                        width: "100%",
                        resize: "vertical",
                        borderRadius: 14,
                        border: "1px solid var(--rule)",
                        background: "var(--paper)",
                        padding: "14px 16px",
                        fontFamily: "var(--font-body)",
                        fontSize: 17,
                        lineHeight: 1.8,
                        color: "var(--ink)",
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  {editError && (
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        color: "#9b3d2e",
                      }}
                    >
                      {editError}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleCancelEditing}
                      disabled={savingEdit}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        background: "transparent",
                        color: "var(--ink)",
                        cursor: savingEdit ? "default" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit()}
                      disabled={savingEdit}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--moss)",
                        background: savingEdit ? "var(--paper)" : "var(--moss)",
                        color: savingEdit ? "var(--ink-faded)" : "var(--paper)",
                        cursor: savingEdit ? "default" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      {savingEdit ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              )}

              {memory.primaryPerson && (
                <div>
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      color: "var(--ink-faded)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Narrative anchor
                  </p>
                  <a
                    href={`/trees/${treeId}/people/${memory.primaryPerson.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    {memory.primaryPerson.portraitUrl && (
                      <img
                        src={getProxiedMediaUrl(memory.primaryPerson.portraitUrl) ?? memory.primaryPerson.portraitUrl}
                        alt={memory.primaryPerson.displayName}
                        onError={handleMediaError}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "1px solid var(--rule)",
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 18,
                        color: "var(--ink-soft)",
                      }}
                    >
                      {memory.primaryPerson.displayName}
                    </span>
                  </a>
                </div>
              )}

              {hasFocusedViewer && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    style={{
                      borderRadius: 999,
                      border: "1px solid var(--moss)",
                      background: "none",
                      color: "var(--moss)",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      padding: "10px 16px",
                    }}
                  >
                    Open focused viewer
                  </button>
                  {selectedLinkedMediaOpenUrl && (
                    <a
                      href={selectedLinkedMediaOpenUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        color: "var(--ink-faded)",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                        textDecoration: "none",
                      }}
                    >
                      Open source file
                    </a>
                  )}
                </div>
              )}

              {memory.viewerCanManageVisibility && (
                <div
                  style={{
                    paddingTop: 18,
                    borderTop: "1px solid var(--rule)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      color: "var(--ink-faded)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Memory settings
                  </p>
                  <MemoryVisibilityControl
                    memory={memory}
                    disabled={updatingVisibilityId === memory.id}
                    onChange={(visibility) => void setMemoryTreeVisibility(visibility)}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                borderRadius: 22,
                border: "1px solid var(--rule)",
                background: "var(--paper)",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: "var(--ink-faded)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Direct subjects
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {memory.primaryPerson && (
                    <a
                      href={`/trees/${treeId}/people/${memory.primaryPerson.id}`}
                      style={{
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        padding: "7px 12px",
                        textDecoration: "none",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        color: "var(--ink-soft)",
                      }}
                    >
                      {memory.primaryPerson.displayName}
                    </a>
                  )}
                  {visibleSubjects.map((subject) => (
                    <a
                      key={subject.id}
                      href={`/trees/${treeId}/people/${subject.id}`}
                      style={{
                        border: "1px solid var(--rule)",
                        borderRadius: 999,
                        padding: "7px 12px",
                        textDecoration: "none",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        color: "var(--ink-soft)",
                      }}
                    >
                      {subject.displayName}
                    </a>
                  ))}
                  {!memory.primaryPerson && visibleSubjects.length === 0 && (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "var(--font-body)",
                        fontSize: 16,
                        lineHeight: 1.7,
                        color: "var(--ink-faded)",
                      }}
                    >
                      No directly tagged people are visible in this tree.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: "var(--ink-faded)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Why it appears here
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 16,
                      lineHeight: 1.7,
                      color: "var(--ink-soft)",
                    }}
                  >
                    Tagged directly through the people listed above.
                  </div>
                  {memory.reachRules.map((rule, index) => (
                    <div
                      key={`${rule.kind}-${rule.seedPersonId ?? "tree"}-${index}`}
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 16,
                        lineHeight: 1.7,
                        color: "var(--ink-soft)",
                      }}
                    >
                      {getReachLabel(rule)}
                    </div>
                  ))}
                  {memory.reachRules.length === 0 && (
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 16,
                        lineHeight: 1.7,
                        color: "var(--ink-faded)",
                      }}
                    >
                      This memory currently travels through direct subject tagging only.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section
          style={{
            borderRadius: 22,
            border: "1px solid var(--rule)",
            background: "var(--paper)",
            padding: 32,
            display: "grid",
            gap: 28,
          }}
        >
          {(memory.body || (transcriptLabel && memory.kind !== "voice")) && (
            <div>
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Narrative
              </p>
              {memory.body && (
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 20,
                    lineHeight: 1.95,
                    color: "var(--ink-soft)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {memory.body}
                </div>
              )}
              {!memory.body && transcriptLabel && memory.kind !== "voice" && (
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 20,
                    lineHeight: 1.95,
                    color: "var(--ink-soft)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {transcriptLabel}
                </div>
              )}
            </div>
          )}

          {memory.kind === "voice" && transcriptLabel && (
            <div
              style={{
                paddingTop: 24,
                borderTop: "1px solid var(--rule)",
              }}
            >
              <p
                style={{
                  margin: "0 0 12px",
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  color: "var(--ink-faded)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Transcript
              </p>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 18,
                  lineHeight: 1.85,
                  color: "var(--ink-soft)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {transcriptLabel}
              </div>
            </div>
          )}

          {(memory.perspectives.length > 0 || memory.viewerCanAddPerspective) && (
            <div
              style={{
                paddingTop: 24,
                borderTop: "1px solid var(--rule)",
                display: "grid",
                gap: 18,
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 12px",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: "var(--ink-faded)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Perspectives
                </p>
                <p
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-body)",
                    fontSize: 17,
                    lineHeight: 1.8,
                    color: "var(--ink-soft)",
                  }}
                >
                  Reflections and additions from other family members can live alongside the original memory.
                </p>
              </div>

              {memory.perspectives.length > 0 && (
                <div style={{ display: "grid", gap: 14 }}>
                  {memory.perspectives.map((perspective) => {
                    const perspectiveAudioUrl = perspective.mediaUrl
                      ? getProxiedMediaUrl(perspective.mediaUrl)
                      : null;

                    return (
                      <article
                        key={perspective.id}
                        style={{
                          borderRadius: 18,
                          border: "1px solid var(--rule)",
                          background: "var(--paper-deep)",
                          padding: 20,
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {perspective.contributorPerson?.portraitUrl && (
                              <img
                                src={getProxiedMediaUrl(perspective.contributorPerson.portraitUrl) ?? perspective.contributorPerson.portraitUrl}
                                alt={perspective.contributorPerson.displayName}
                                onError={handleMediaError}
                                style={{
                                  width: 42,
                                  height: 42,
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                  border: "1px solid var(--rule)",
                                }}
                              />
                            )}
                            <div>
                              <div
                                style={{
                                  fontFamily: "var(--font-body)",
                                  fontSize: 18,
                                  lineHeight: 1.4,
                                  color: "var(--ink)",
                                }}
                              >
                                {perspective.contributorPerson?.displayName ??
                                  perspective.contributor?.name ??
                                  perspective.contributor?.email ??
                                  "Family member"}
                              </div>
                              <div
                                style={{
                                  fontFamily: "var(--font-ui)",
                                  fontSize: 12,
                                  color: "var(--ink-faded)",
                                }}
                              >
                                Added{" "}
                                {new Date(perspective.createdAt).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        {perspective.body && (
                          <div
                            style={{
                              fontFamily: "var(--font-body)",
                              fontSize: 18,
                              lineHeight: 1.85,
                              color: "var(--ink-soft)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {perspective.body}
                          </div>
                        )}
                        {perspectiveAudioUrl && isAudioMimeType(perspective.mimeType) && (
                          <audio controls src={perspectiveAudioUrl} style={{ width: "100%" }}>
                            Your browser does not support audio playback.
                          </audio>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {memory.viewerCanAddPerspective && (
                <div
                  ref={perspectiveComposerRef}
                  style={{
                    borderRadius: 18,
                    border: "1px solid var(--rule)",
                    background: "var(--paper)",
                    padding: 20,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 28,
                        lineHeight: 1.2,
                        color: "var(--ink)",
                        marginBottom: 6,
                      }}
                    >
                      Add to this memory
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 16,
                        lineHeight: 1.75,
                        color: "var(--ink-soft)",
                      }}
                    >
                      Add a reflection, correction, missing detail, or voice note as{" "}
                      {session?.user.name ?? session?.user.email ?? "a family member"}.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPerspectiveMode("text");
                        setPerspectiveError(null);
                        setPerspectiveFile(null);
                      }}
                      disabled={submittingPerspective}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        background:
                          perspectiveMode === "text" ? "var(--paper-deep)" : "transparent",
                        color: "var(--ink)",
                        cursor: submittingPerspective ? "default" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "8px 14px",
                      }}
                    >
                      Write it
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPerspectiveMode("voice");
                        setPerspectiveError(null);
                      }}
                      disabled={submittingPerspective}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--rule)",
                        background:
                          perspectiveMode === "voice" ? "var(--paper-deep)" : "transparent",
                        color: "var(--ink)",
                        cursor: submittingPerspective ? "default" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "8px 14px",
                      }}
                    >
                      Add a voice note
                    </button>
                  </div>
                  <textarea
                    value={perspectiveDraft}
                    onChange={(event) => setPerspectiveDraft(event.target.value)}
                    rows={5}
                    placeholder={
                      perspectiveMode === "voice"
                        ? "Optional note or transcript to go with the voice perspective"
                        : "What else should this memory hold?"
                    }
                    style={{
                      width: "100%",
                      resize: "vertical",
                      borderRadius: 14,
                      border: "1px solid var(--rule)",
                      background: "var(--paper-deep)",
                      padding: "14px 16px",
                      fontFamily: "var(--font-body)",
                      fontSize: 17,
                      lineHeight: 1.7,
                      color: "var(--ink)",
                    }}
                  />
                  {perspectiveMode === "voice" && (
                    <div
                      style={{
                        display: "grid",
                        gap: 12,
                        borderRadius: 16,
                        border: "1px solid var(--rule)",
                        background: "var(--paper-deep)",
                        padding: 16,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPerspectiveVoiceInputMode("record");
                            setPerspectiveError(null);
                            setPerspectiveFile(null);
                          }}
                          disabled={submittingPerspective}
                          style={{
                            borderRadius: 999,
                            border: "1px solid var(--rule)",
                            background:
                              perspectiveVoiceInputMode === "record"
                                ? "var(--paper)"
                                : "transparent",
                            color: "var(--ink)",
                            cursor: submittingPerspective ? "default" : "pointer",
                            fontFamily: "var(--font-ui)",
                            fontSize: 13,
                            padding: "8px 14px",
                          }}
                        >
                          Record here
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPerspectiveVoiceInputMode("upload");
                            setPerspectiveError(null);
                            setPerspectiveFile(null);
                          }}
                          disabled={submittingPerspective}
                          style={{
                            borderRadius: 999,
                            border: "1px solid var(--rule)",
                            background:
                              perspectiveVoiceInputMode === "upload"
                                ? "var(--paper)"
                                : "transparent",
                            color: "var(--ink)",
                            cursor: submittingPerspective ? "default" : "pointer",
                            fontFamily: "var(--font-ui)",
                            fontSize: 13,
                            padding: "8px 14px",
                          }}
                        >
                          Upload audio
                        </button>
                      </div>
                      {perspectiveVoiceInputMode === "record" ? (
                        <VoiceRecorderField
                          value={perspectiveFile}
                          onChange={(file) => {
                            setPerspectiveFile(file);
                            setPerspectiveError(null);
                          }}
                          disabled={submittingPerspective}
                          baseName={`memory-perspective-${memory.id}`}
                        />
                      ) : (
                        <label
                          style={{
                            display: "grid",
                            gap: 8,
                            fontFamily: "var(--font-ui)",
                            fontSize: 13,
                            color: "var(--ink-soft)",
                          }}
                        >
                          <span>Choose an audio file</span>
                          <input
                            type="file"
                            accept="audio/*"
                            disabled={submittingPerspective}
                            onChange={(event) => {
                              setPerspectiveFile(event.target.files?.[0] ?? null);
                              setPerspectiveError(null);
                            }}
                            style={{
                              borderRadius: 12,
                              border: "1px solid var(--rule)",
                              background: "var(--paper)",
                              padding: 12,
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  {perspectiveError && (
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        color: "#9b3d2e",
                      }}
                    >
                      {perspectiveError}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => void handleAddPerspective()}
                      disabled={submittingPerspective}
                      style={{
                        borderRadius: 999,
                        border: "1px solid var(--moss)",
                        background: submittingPerspective ? "var(--paper-deep)" : "var(--moss)",
                        color: submittingPerspective ? "var(--ink-faded)" : "var(--paper)",
                        cursor: submittingPerspective ? "default" : "pointer",
                        fontFamily: "var(--font-ui)",
                        fontSize: 13,
                        padding: "10px 16px",
                      }}
                    >
                      {submittingPerspective
                        ? "Adding…"
                        : perspectiveMode === "voice"
                        ? "Add voice perspective"
                        : "Add perspective"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              paddingTop: 24,
              borderTop: "1px solid var(--rule)",
              display: "grid",
              gap: 10,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-faded)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Archive notes
            </p>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 17,
                lineHeight: 1.8,
                color: "var(--ink-soft)",
              }}
            >
              Added to the archive on{" "}
              {new Date(memory.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              .
            </div>
          </div>

          {hasContextSection && (
            <div
              style={{
                paddingTop: 24,
                borderTop: "1px solid var(--rule)",
                display: "grid",
                gap: 24,
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 12px",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: "var(--ink-faded)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Provenance
                </p>
                <div style={{ display: "grid", gap: 12 }}>
                  {memory.contributor && (
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 17,
                        lineHeight: 1.8,
                        color: "var(--ink-soft)",
                      }}
                    >
                      Added by <strong>{memory.contributor.name}</strong>.
                    </div>
                  )}
                  {memory.prompt && (
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid var(--rule)",
                        background: "var(--paper-deep)",
                        padding: 18,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: 12,
                          color: "var(--ink-faded)",
                        }}
                      >
                        {memory.prompt.fromUserName
                          ? `Prompted by ${memory.prompt.fromUserName}`
                          : "Prompted memory"}
                        {memory.prompt.toPerson?.displayName
                          ? ` for ${memory.prompt.toPerson.displayName}`
                          : ""}
                      </div>
                      <blockquote
                        style={{
                          margin: 0,
                          fontFamily: "var(--font-body)",
                          fontSize: 18,
                          lineHeight: 1.8,
                          color: "var(--ink-soft)",
                          borderLeft: "3px solid var(--gilt)",
                          paddingLeft: 14,
                        }}
                      >
                        {memory.prompt.questionText}
                      </blockquote>
                    </div>
                  )}
                </div>
              </div>

              {memory.relatedMemories.length > 0 && (
                <div>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      color: "var(--ink-faded)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Related context
                  </p>
                  <p
                    style={{
                      margin: "0 0 16px",
                      fontFamily: "var(--font-body)",
                      fontSize: 17,
                      lineHeight: 1.75,
                      color: "var(--ink-soft)",
                    }}
                  >
                    Nearby memories that share the same people, narrative anchor, or prompt thread.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {memory.relatedMemories.map((relatedMemory) => (
                      <RelatedMemoryCard
                        key={relatedMemory.id}
                        treeId={treeId}
                        memory={relatedMemory}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {lightboxOpen && (
        <MemoryLightbox
          memories={lightboxMemories}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
          canManageTreeVisibility={memory.viewerCanManageVisibility}
          updatingTreeVisibilityId={updatingVisibilityId}
          onSetTreeVisibility={(_memoryId, visibility) =>
            void setMemoryTreeVisibility(visibility)
          }
        />
      )}
    </main>
  );
}
