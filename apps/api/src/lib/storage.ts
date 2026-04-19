import {
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MEDIA_BUCKET = process.env.MINIO_BUCKET ?? "familytree-media";

export const s3 = new S3Client({
  endpoint: `http://${process.env.MINIO_ENDPOINT ?? "localhost"}:${process.env.MINIO_PORT ?? "9000"}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "familytree",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "familytree-dev-secret",
  },
  forcePathStyle: true, // required for MinIO
});

/**
 * MIME types allowed for upload. Anything outside this set is rejected at presign time
 * so we never store or serve untrusted content types.
 */
export const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/mpeg",
  "video/3gpp",
  "video/x-msvideo",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/flac",
  "audio/x-m4a",
  "audio/opus",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has((mime.toLowerCase().split(";")[0] ?? "").trim());
}

/**
 * Returns the Content-Disposition value for a given MIME type and filename.
 * Images, video, audio, and PDF can be rendered inline; everything else is a download.
 */
export function contentDisposition(mime: string, filename: string): string {
  const base = (mime.toLowerCase().split(";")[0] ?? "").trim();
  const isInline =
    base.startsWith("image/") ||
    base.startsWith("video/") ||
    base.startsWith("audio/") ||
    base === "application/pdf";
  const safeFilename = filename.replace(/[^a-zA-Z0-9._\-() ]/g, "_");
  return isInline
    ? `inline; filename="${safeFilename}"`
    : `attachment; filename="${safeFilename}"`;
}

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: MEDIA_BUCKET }));
  } catch (err) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
    if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") {
      throw err;
    }
  }
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: MEDIA_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export function mediaUrl(objectKey: string): string {
  const apiBase = (process.env.API_BASE_URL ?? "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  return `${apiBase}/api/media?key=${encodeURIComponent(objectKey)}`;
}
