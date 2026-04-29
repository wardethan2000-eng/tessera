import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { asc, eq, isNotNull } from "drizzle-orm";
import * as schema from "@tessera/database";
import { db } from "./db.js";
import { MEDIA_BUCKET, s3 } from "./storage.js";

const POLL_INTERVAL_MS = 10_000;

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
  if (body instanceof Readable) return streamToBuffer(body);
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    return streamToBuffer(Readable.from(body as AsyncIterable<Uint8Array>));
  }
  if (
    body &&
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function"
  ) {
    const data = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(data);
  }
  throw new Error("Unsupported stream body");
}

interface ExtractedMetadata {
  checksum: string;
  capturedAt: string | null;
  extra: Record<string, unknown>;
}

function extractExifDateFromJpeg(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  const soi = buffer.readUInt16BE(0);
  if (soi !== 0xffd8) return null;

  let offset = 2;
  while (offset < buffer.length - 4) {
    const marker = buffer.readUInt16BE(offset);
    if (marker === 0xffe1) {
      const segmentLength = buffer.readUInt16BE(offset + 2);
      const segStart = offset + 4;
      if (segStart + 6 <= buffer.length) {
        const exifHeader = buffer.toString("ascii", segStart, segStart + 6);
        if (exifHeader === "Exif\x00\x00" || exifHeader.startsWith("Exif")) {
          const dateStr = findExifDateInSegment(buffer, segStart, segmentLength);
          if (dateStr) return dateStr;
        }
      }
      offset += 2 + segmentLength;
    } else if ((marker & 0xff00) === 0xff00 && marker !== 0xffda) {
      if (offset + 4 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    } else {
      break;
    }
  }
  return null;
}

function findExifDateInSegment(buffer: Buffer, start: number, length: number): string | null {
  const end = Math.min(start + length, buffer.length);
  const segment = buffer.toString("ascii", start, end);
  const dateTimeOriginal = segment.indexOf("DateTimeOriginal\x00\x00");
  if (dateTimeOriginal >= 0) {
    const dateStart = segment.indexOf(":", dateTimeOriginal);
    if (dateStart >= 0) {
      const raw = segment.slice(dateStart - 4, dateStart + 15);
      const cleaned = raw.replace(/\0/g, "").trim();
      if (cleaned.length >= 10) return cleaned.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    }
  }
  const dateTimeIdx = segment.indexOf("DateTime\x00\x00");
  if (dateTimeIdx >= 0) {
    const dateStart = segment.indexOf(":", dateTimeIdx);
    if (dateStart >= 0) {
      const raw = segment.slice(dateStart - 4, dateStart + 15);
      const cleaned = raw.replace(/\0/g, "").trim();
      if (cleaned.length >= 10) return cleaned.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    }
  }
  return null;
}

async function extractMetadataFromS3(
  objectKey: string,
  mimeType: string,
): Promise<ExtractedMetadata> {
  const object = await s3.send(new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: objectKey }));
  if (!object.Body) throw new Error("Object body is empty");

  const buffer = await bodyToBuffer(object.Body);
  const checksum = createHash("sha256").update(buffer).digest("hex");

  let capturedAt: string | null = null;
  const extra: Record<string, unknown> = {};

  if (mimeType.startsWith("image/jpeg") || mimeType.startsWith("image/tiff")) {
    capturedAt = extractExifDateFromJpeg(buffer);
    if (capturedAt) extra.exifDateSource = "EXIF";
  }

  if (mimeType.startsWith("image/")) {
    try {
      for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
          extra.width = 0;
          extra.height = 0;
          break;
        }
      }
    } catch {
      // Dimensions extraction is best-effort
    }
  }

  return { checksum, capturedAt, extra };
}

export function startMetadataExtractionWorker(logger: LoggerLike): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const nextItem = await db.query.importBatchItems.findFirst({
        where: (item, { and, eq, isNull }) =>
          and(eq(item.status, "uploaded"), isNull(item.checksum)),
        with: {
          media: {
            columns: { id: true, objectKey: true, mimeType: true },
          },
        },
        orderBy: (item) => [asc(item.createdAt)],
      });

      if (!nextItem || !nextItem.media) {
        return;
      }

      try {
        const meta = await extractMetadataFromS3(
          nextItem.media.objectKey,
          nextItem.media.mimeType,
        );

        const updateData: Record<string, unknown> = {
          checksum: meta.checksum,
          metadata: meta.extra,
          updatedAt: new Date(),
        };

        if (meta.capturedAt) {
          try {
            updateData.capturedAt = new Date(meta.capturedAt);
          } catch {
            // Invalid date format, skip
          }
        }

        // Check for exact duplicates by checksum within this tree
        const existingWithChecksum = await db.query.importBatchItems.findFirst({
          where: (item, { and, eq, isNotNull }) =>
            and(
              eq(item.checksum, meta.checksum),
              eq(item.treeId, nextItem.treeId),
              isNotNull(item.memoryId),
            ),
          columns: { id: true, memoryId: true },
        });

        if (existingWithChecksum) {
          updateData.reviewState = "needs_duplicate_review";
          logger.info(
            {
              itemId: nextItem.id,
              existingItemId: existingWithChecksum.id,
              checksum: meta.checksum.slice(0, 16),
            },
            "Possible duplicate detected by checksum",
          );
        }

        await db
          .update(schema.importBatchItems)
          .set(updateData)
          .where(eq(schema.importBatchItems.id, nextItem.id));

        // If we extracted a date and this item has a linked memory, update the memory too
        if (meta.capturedAt && nextItem.memoryId) {
          const memory = await db.query.memories.findFirst({
            where: (m, { and, eq, isNull }) =>
              and(eq(m.id, nextItem.memoryId!), isNull(m.dateOfEventText)),
            columns: { id: true },
          });

          if (memory) {
            await db
              .update(schema.memories)
              .set({
                dateOfEventText: meta.capturedAt,
                captureConfidenceJson: { dateSource: "exif", confidence: 0.7 },
                updatedAt: new Date(),
              })
              .where(eq(schema.memories.id, memory.id));

            await db
              .update(schema.importBatchItems)
              .set({ reviewState: "needs_place" })
              .where(eq(schema.importBatchItems.id, nextItem.id));
          }
        }

        logger.info(
          { itemId: nextItem.id, checksum: meta.checksum.slice(0, 16), capturedAt: meta.capturedAt },
          "Metadata extracted for import item",
        );
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        logger.warn({ itemId: nextItem.id, error: errorText }, "Metadata extraction failed for item");

        await db
          .update(schema.importBatchItems)
          .set({
            errorMessage: errorText.slice(0, 4000),
            updatedAt: new Date(),
          })
          .where(eq(schema.importBatchItems.id, nextItem.id));
      }
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Metadata worker tick error",
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