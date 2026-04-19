import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import * as schema from "@familytree/database";
import { db } from "./db.js";
import { MEDIA_BUCKET, s3 } from "./storage.js";

const POLL_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_SECONDS = 60;
const STALE_LOCK_THRESHOLD_MS = 10 * 60 * 1_000; // 10 minutes
const MIME_EXTENSION_MAP: Record<string, string> = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
};

type LoggerLike = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (
    body &&
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
      "function"
  ) {
    const data = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(data);
  }

  if (body instanceof Readable) {
    return streamToBuffer(body);
  }

  if (
    body &&
    typeof body === "object" &&
    Symbol.asyncIterator in body
  ) {
    const stream = Readable.from(body as AsyncIterable<Uint8Array>);
    return streamToBuffer(stream);
  }

  throw new Error("Unsupported media stream response");
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return cleaned.slice(0, 80) || "audio";
}

export function buildTranscriptionFilename(
  originalFilename: string | null | undefined,
  mimeType: string,
): string {
  const normalizedMimeType = mimeType.toLowerCase();
  const fallbackExtension = MIME_EXTENSION_MAP[normalizedMimeType] ?? "audio";

  const trimmedName = originalFilename?.trim();
  if (!trimmedName) {
    return `${randomUUID()}.${fallbackExtension}`;
  }

  const fileName = trimmedName.split(/[\\/]/).pop() ?? trimmedName;
  const lastDot = fileName.lastIndexOf(".");
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const extension =
    lastDot > 0 && lastDot < fileName.length - 1
      ? fileName.slice(lastDot + 1).toLowerCase()
      : fallbackExtension;

  return `${sanitizeFilenamePart(baseName)}.${sanitizeFilenamePart(extension)}`;
}

async function transcribeAudioObject(
  objectKey: string,
  mimeType: string,
  originalFilename?: string | null,
) {
  const whisperUrl = process.env.WHISPER_API_URL;
  if (!whisperUrl) {
    throw new Error("WHISPER_API_URL is not configured");
  }

  const object = await s3.send(
    new GetObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: objectKey,
    }),
  );

  if (!object.Body) {
    throw new Error("Audio object body not found");
  }

  const fileBytes = await bodyToBuffer(object.Body);
  const form = new FormData();
  form.append(
    "file",
    new Blob([fileBytes], {
      type: mimeType || "audio/mpeg",
    }),
    buildTranscriptionFilename(originalFilename, mimeType || "audio/mpeg"),
  );
  form.append("model", process.env.WHISPER_MODEL ?? "whisper-1");

  const headers: Record<string, string> = {};
  if (process.env.WHISPER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.WHISPER_API_KEY}`;
  }

  const response = await fetch(whisperUrl, {
    method: "POST",
    headers,
    body: form,
  });

  const textBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `Whisper request failed (${response.status}): ${textBody.slice(0, 500)}`,
    );
  }

  const json = JSON.parse(textBody) as { text?: string; language?: string };
  const transcript = json.text?.trim();
  if (!transcript) {
    throw new Error("Transcription response missing text");
  }

  return {
    text: transcript,
    language: json.language ?? null,
  };
}

function nextRetryDate(attempts: number): Date {
  const seconds = BASE_RETRY_SECONDS * 2 ** Math.max(0, attempts - 1);
  return new Date(Date.now() + seconds * 1000);
}

export async function enqueueMemoryTranscription(
  memoryId: string,
  treeId: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(schema.transcriptionJobs)
    .values({
      memoryId,
      treeId,
      status: "queued",
      attempts: 0,
      runAfter: now,
      createdAt: now,
      updatedAt: now,
      lastError: null,
      lockedAt: null,
      completedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.transcriptionJobs.memoryId,
      set: {
        status: "queued",
        runAfter: now,
        updatedAt: now,
        lastError: null,
        lockedAt: null,
        completedAt: null,
      },
    });

  await db
    .update(schema.memories)
    .set({
      transcriptStatus: "queued",
      transcriptError: null,
      transcriptUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.memories.id, memoryId));
}

export function startTranscriptionWorker(logger: LoggerLike): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const now = new Date();

      // Recover any jobs stuck in "processing" — e.g. server crashed mid-job.
      const staleThreshold = new Date(now.getTime() - STALE_LOCK_THRESHOLD_MS);
      await db
        .update(schema.transcriptionJobs)
        .set({ status: "queued", lockedAt: null, updatedAt: now })
        .where(
          and(
            eq(schema.transcriptionJobs.status, "processing"),
            isNotNull(schema.transcriptionJobs.lockedAt),
            lte(schema.transcriptionJobs.lockedAt, staleThreshold),
          ),
        );

      const nextJob = await db.query.transcriptionJobs.findFirst({
        where: (j) =>
          and(eq(j.status, "queued"), lte(j.runAfter, now)),
        with: {
          memory: {
            with: { media: true },
          },
        },
        orderBy: (j) => [asc(j.runAfter), asc(j.createdAt)],
      });

      if (!nextJob) return;

      const [locked] = await db
        .update(schema.transcriptionJobs)
        .set({
          status: "processing",
          lockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.transcriptionJobs.id, nextJob.id),
            eq(schema.transcriptionJobs.status, "queued"),
          ),
        )
        .returning();
      if (!locked) return;

      await db
        .update(schema.memories)
        .set({
          transcriptStatus: "processing",
          transcriptError: null,
          transcriptUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.memories.id, nextJob.memoryId));

      try {
        if (!nextJob.memory) {
          throw new Error("Transcription job memory not found");
        }
        if (nextJob.memory.kind !== "voice") {
          throw new Error("Transcription jobs only support voice memories");
        }
        if (!nextJob.memory.media) {
          throw new Error("Voice memory has no media");
        }

        const result = await transcribeAudioObject(
          nextJob.memory.media.objectKey,
          nextJob.memory.media.mimeType,
          nextJob.memory.media.originalFilename,
        );
        const completedAt = new Date();

        await db.transaction(async (tx) => {
          await tx
            .update(schema.memories)
            .set({
              transcriptText: result.text,
              transcriptLanguage: result.language,
              transcriptStatus: "completed",
              transcriptError: null,
              transcriptUpdatedAt: completedAt,
              updatedAt: completedAt,
            })
            .where(eq(schema.memories.id, nextJob.memoryId));

          await tx
            .update(schema.transcriptionJobs)
            .set({
              status: "completed",
              completedAt,
              lockedAt: null,
              updatedAt: completedAt,
              lastError: null,
            })
            .where(eq(schema.transcriptionJobs.id, nextJob.id));
        });

        logger.info(
          { jobId: nextJob.id, memoryId: nextJob.memoryId },
          "Transcription job completed",
        );
      } catch (err) {
        const attempts = locked.attempts + 1;
        const isPermanentFailure = attempts >= MAX_ATTEMPTS;
        const errorText =
          err instanceof Error ? err.message : "Unknown transcription error";
        const now2 = new Date();

        await db.transaction(async (tx) => {
          await tx
            .update(schema.transcriptionJobs)
            .set({
              status: isPermanentFailure ? "failed" : "queued",
              attempts,
              runAfter: isPermanentFailure ? locked.runAfter : nextRetryDate(attempts),
              lockedAt: null,
              updatedAt: now2,
              lastError: errorText.slice(0, 4000),
              completedAt: isPermanentFailure ? now2 : null,
            })
            .where(eq(schema.transcriptionJobs.id, nextJob.id));

          await tx
            .update(schema.memories)
            .set({
              transcriptStatus: isPermanentFailure ? "failed" : "queued",
              transcriptError: errorText.slice(0, 4000),
              transcriptUpdatedAt: now2,
              updatedAt: now2,
            })
            .where(eq(schema.memories.id, nextJob.memoryId));
        });

        logger.warn(
          {
            jobId: nextJob.id,
            memoryId: nextJob.memoryId,
            attempts,
            permanent: isPermanentFailure,
            error: errorText,
          },
          "Transcription job failed",
        );
      }
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Transcription worker tick error",
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  void tick();

  return () => clearInterval(timer);
}
