import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { afterEach, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://familytree:familytree@localhost:5432/familytree_test";
process.env.WHISPER_API_URL ??= "http://whisper.local/transcribe";

const schema = await import("@familytree/database");
const { db } = await import("./db.js");
const { s3 } = await import("./storage.js");
const {
  buildTranscriptionFilename,
  enqueueMemoryTranscription,
  startTranscriptionWorker,
} = await import("./transcription.js");

const mockDb = db as unknown as {
  insert: any;
  update: any;
  query: any;
  transaction: any;
};

type MemoryRow = {
  id: string;
  transcriptStatus?: string;
  transcriptText?: string | null;
  transcriptLanguage?: string | null;
  transcriptError?: string | null;
  transcriptUpdatedAt?: Date | null;
  updatedAt?: Date | null;
};

type JobRow = {
  id: string;
  memoryId: string;
  treeId: string;
  status: string;
  attempts: number;
  runAfter: Date;
  lockedAt?: Date | null;
  completedAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
  memory?: {
    id: string;
    kind: "voice";
    media?: {
      objectKey: string;
      mimeType: string;
      originalFilename?: string | null;
    } | null;
  } | null;
};

const originalDb = {
  insert: mockDb.insert,
  update: mockDb.update,
  transaction: mockDb.transaction,
  query: mockDb.query,
};
const originalFetch = globalThis.fetch;
const originalS3Send = s3.send;

afterEach(() => {
  mockDb.insert = originalDb.insert;
  mockDb.update = originalDb.update;
  mockDb.transaction = originalDb.transaction;
  mockDb.query = originalDb.query;
  globalThis.fetch = originalFetch;
  s3.send = originalS3Send;
});

function buildUpdateChain(
  table: unknown,
  memory: MemoryRow,
  job: JobRow,
): {
  set: (values: Record<string, unknown>) => {
    where: () => {
      returning: () => Promise<Array<Record<string, unknown>>>;
      then: (resolve: (value: unknown) => void) => void;
    };
  };
} {
  return {
    set: (values) => ({
      where: () => {
        if (table === schema.transcriptionJobs) {
          Object.assign(job, values);
          const row = { ...job };
          return {
            returning: async () => [row],
            then: (resolve) => resolve(undefined),
          };
        }

        if (table === schema.memories) {
          Object.assign(memory, values);
          return {
            returning: async () => [],
            then: (resolve) => resolve(undefined),
          };
        }

        throw new Error("Unexpected table");
      },
    }),
  };
}

describe("transcription pipeline", () => {
  it("builds a useful transcription filename from the source media", () => {
    assert.equal(
      buildTranscriptionFilename("Whispr Note.M4A", "audio/mp4"),
      "Whispr-Note.m4a",
    );
    assert.match(
      buildTranscriptionFilename(undefined, "audio/webm"),
      /^[0-9a-f-]+\.webm$/,
    );
  });

  it("queues voice memories for transcription", async () => {
    const memory: MemoryRow = { id: "memory-1", transcriptStatus: "none" };
    const inserted: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];

    mockDb.insert = () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    });
    mockDb.update = () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updated.push(values);
          Object.assign(memory, values);
          return undefined;
        },
      }),
    });

    await enqueueMemoryTranscription("memory-1", "tree-1");

    assert.equal(inserted.length, 1);
    assert.deepEqual(
      updated[0],
      {
        transcriptStatus: "queued",
        transcriptError: null,
        transcriptUpdatedAt: memory.transcriptUpdatedAt,
        updatedAt: memory.updatedAt,
      },
    );
    assert.equal(memory.transcriptStatus, "queued");
  });

  it("transcribes voice recordings with the original filename and marks completion", async () => {
    const memory: MemoryRow = {
      id: "memory-1",
      transcriptStatus: "none",
    };
    const job: JobRow = {
      id: "job-1",
      memoryId: "memory-1",
      treeId: "tree-1",
      status: "queued",
      attempts: 0,
      runAfter: new Date(Date.now() - 1_000),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      memory: {
        id: "memory-1",
        kind: "voice",
        media: {
          objectKey: "trees/tree-1/media-1",
          mimeType: "audio/mp4",
          originalFilename: "Whispr memo.m4a",
        },
      },
    };
    const loggerEvents: Array<{ msg?: string; obj: unknown }> = [];

    mockDb.query = {
      ...mockDb.query,
      transcriptionJobs: {
        findFirst: async () => job as never,
      },
    };
    mockDb.update = (table: unknown) => buildUpdateChain(table, memory, job);
    mockDb.transaction = async (callback: (tx: typeof mockDb) => Promise<void>) =>
      callback({
        ...mockDb,
        update: (table: unknown) => buildUpdateChain(table, memory, job),
      });

    s3.send = async () => ({
      Body: Readable.from([Buffer.from("audio-bytes")]),
    }) as never;

    globalThis.fetch = async (_url, init) => {
      const form = init?.body as FormData;
      const file = form.get("file");
      assert.ok(file instanceof File);
      assert.equal(file.name, "Whispr-memo.m4a");
      return new Response(JSON.stringify({ text: "Hello there", language: "en" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const stop = startTranscriptionWorker({
      info: (obj, msg) => loggerEvents.push({ obj, msg }),
      warn: (obj, msg) => loggerEvents.push({ obj, msg }),
      error: (obj, msg) => loggerEvents.push({ obj, msg }),
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("worker did not finish")), 3000);
      const check = setInterval(() => {
        if (memory.transcriptStatus === "completed") {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 25);
    });

    stop();

    assert.equal(memory.transcriptStatus, "completed");
    assert.equal(memory.transcriptText, "Hello there");
    assert.equal(memory.transcriptLanguage, "en");
    assert.equal(job.status, "completed");
    assert.equal(job.completedAt instanceof Date, true);
    assert.ok(loggerEvents.some((event) => event.msg === "Transcription job completed"));
  });

  it("requeues a failed transcription before the final retry", async () => {
    const memory: MemoryRow = {
      id: "memory-2",
      transcriptStatus: "none",
    };
    const job: JobRow = {
      id: "job-2",
      memoryId: "memory-2",
      treeId: "tree-1",
      status: "queued",
      attempts: 0,
      runAfter: new Date(Date.now() - 1_000),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      memory: {
        id: "memory-2",
        kind: "voice",
        media: {
          objectKey: "trees/tree-1/media-2",
          mimeType: "audio/webm",
          originalFilename: "Voice Note.webm",
        },
      },
    };

    mockDb.query = {
      ...mockDb.query,
      transcriptionJobs: {
        findFirst: async () => job as never,
      },
    };
    mockDb.update = (table: unknown) => buildUpdateChain(table, memory, job);
    mockDb.transaction = async (callback: (tx: typeof mockDb) => Promise<void>) =>
      callback({
        ...mockDb,
        update: (table: unknown) => buildUpdateChain(table, memory, job),
      });

    s3.send = async () => ({
      Body: Readable.from([Buffer.from("audio-bytes")]),
    }) as never;
    globalThis.fetch = async () =>
      new Response("bad gateway", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });

    const stop = startTranscriptionWorker({
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("worker did not finish")), 3000);
      const check = setInterval(() => {
        if (memory.transcriptStatus === "queued" && job.attempts === 1) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 25);
    });

    stop();

    assert.equal(memory.transcriptStatus, "queued");
    assert.equal(job.status, "queued");
    assert.equal(job.attempts, 1);
    assert.ok(memory.transcriptError?.includes("Whisper request failed"));
  });
});
