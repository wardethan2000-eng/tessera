"use client";

import {
  presignElderUpload,
  submitElderMemory,
  uploadFileToPresigned,
  type ElderSubmitInput,
} from "@/lib/elder-api";

const DB_NAME = "elder-queue";
const DB_VERSION = 2;
const LEGACY_SUBMISSIONS_STORE = "submissions";
const CAPTURES_STORE = "captures";

export type QueuedCaptureFile = {
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type QueuedCapture = {
  id?: number;
  token: string;
  promptId?: string | null;
  input: ElderSubmitInput;
  files: QueuedCaptureFile[];
  createdAt: string;
  lastAttemptAt?: string | null;
  error?: string | null;
};

type LegacySubmission = {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

export function openElderQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("Offline storage is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_SUBMISSIONS_STORE)) {
        db.createObjectStore(LEGACY_SUBMISSIONS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains(CAPTURES_STORE)) {
        db.createObjectStore(CAPTURES_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteItem(db: IDBDatabase, storeName: string, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function putItem<T>(db: IDBDatabase, storeName: string, item: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queueElderCapture(capture: Omit<QueuedCapture, "createdAt">) {
  const db = await openElderQueueDB();
  await putItem(db, CAPTURES_STORE, {
    ...capture,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    error: null,
  });
}

export async function countElderQueue(): Promise<number> {
  try {
    const db = await openElderQueueDB();
    const [legacy, captures] = await Promise.all([
      countStore(db, LEGACY_SUBMISSIONS_STORE),
      countStore(db, CAPTURES_STORE),
    ]);
    return legacy + captures;
  } catch {
    return 0;
  }
}

export async function drainLegacySubmitQueue(): Promise<number> {
  const db = await openElderQueueDB();
  const items = await readAll<LegacySubmission>(db, LEGACY_SUBMISSIONS_STORE);
  let sent = 0;
  for (const item of items) {
    if (!item.id) continue;
    const res = await fetch(item.url, {
      method: item.method,
      headers: item.headers,
      body: item.body,
    });
    if (!res.ok) break;
    await deleteItem(db, LEGACY_SUBMISSIONS_STORE, item.id);
    sent += 1;
  }
  return sent;
}

export async function drainQueuedCaptures(token?: string): Promise<number> {
  const db = await openElderQueueDB();
  const items = await readAll<QueuedCapture>(db, CAPTURES_STORE);
  let sent = 0;
  for (const item of items) {
    if (!item.id) continue;
    if (token && item.token !== token) continue;
    try {
      const mediaIds: string[] = [];
      for (const queuedFile of item.files) {
        const file = new File([queuedFile.blob], queuedFile.name, {
          type: queuedFile.type || "application/octet-stream",
        });
        const { mediaId, uploadUrl } = await presignElderUpload(item.token, file);
        await uploadFileToPresigned(file, uploadUrl);
        mediaIds.push(mediaId);
      }
      await submitElderMemory(
        item.token,
        {
          ...item.input,
          mediaIds: mediaIds.length ? mediaIds : item.input.mediaIds,
        },
        item.promptId ?? undefined,
      );
      await deleteItem(db, CAPTURES_STORE, item.id);
      sent += 1;
    } catch (error) {
      await putItem(db, CAPTURES_STORE, {
        ...item,
        lastAttemptAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Could not send.",
      });
      break;
    }
  }
  return sent;
}

export async function drainAllElderQueues(token?: string): Promise<number> {
  const [legacyCount, captureCount] = await Promise.all([
    drainLegacySubmitQueue().catch(() => 0),
    drainQueuedCaptures(token).catch(() => 0),
  ]);
  return legacyCount + captureCount;
}
