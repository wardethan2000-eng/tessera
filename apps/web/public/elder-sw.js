// Tessera Elder PWA service worker.
// Goals: app-shell precache, SWR for inbox, Background Sync queue for submits.

const VERSION = "elder-v2";
const SHELL_CACHE = `elder-shell-${VERSION}`;
const RUNTIME_CACHE = `elder-runtime-${VERSION}`;

const SHELL_URLS = ["/elder-icon-192.png", "/elder-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isInboxRequest(url) {
  return /\/api\/elder\/[^/]+\/inbox$/.test(url.pathname);
}
function isSubmitRequest(url) {
  return /\/api\/elder\/[^/]+\/(submit|reply\/[^/]+)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (isInboxRequest(url)) {
      event.respondWith(staleWhileRevalidate(req));
      return;
    }
    if (url.pathname.startsWith("/elder/") || SHELL_URLS.includes(url.pathname)) {
      event.respondWith(networkFirst(req));
      return;
    }
  }
  if (req.method === "POST") {
    const url = new URL(req.url);
    if (isSubmitRequest(url)) {
      event.respondWith(submitWithBackgroundSync(req));
      return;
    }
  }
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await networkPromise) || new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

// --- Background Sync queue ---
const DB_NAME = "elder-queue";
const DB_VERSION = 2;
const STORE = "submissions";
const CAPTURES_STORE = "captures";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!req.result.objectStoreNames.contains(CAPTURES_STORE)) {
        req.result.createObjectStore(CAPTURES_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueSubmission(serialized) {
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(serialized);
    tx.oncomplete = () => res(undefined);
    tx.onerror = () => rej(tx.error);
  });
}

async function readQueue() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function deleteFromQueue(id) {
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res(undefined);
    tx.onerror = () => rej(tx.error);
  });
}

async function submitWithBackgroundSync(req) {
  try {
    return await fetch(req.clone());
  } catch (err) {
    // Save for later
    try {
      const body = await req.clone().text();
      await enqueueSubmission({
        url: req.url,
        method: req.method,
        headers: { "Content-Type": req.headers.get("Content-Type") || "application/json" },
        body,
      });
      if ("sync" in self.registration) {
        try {
          await self.registration.sync.register("elder-submit-queue");
        } catch {}
      }
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      throw err;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "elder-submit-queue") {
    event.waitUntil(drainQueue());
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "DRAIN_ELDER_SUBMIT_QUEUE") {
    event.waitUntil(drainQueue());
  }
});

async function drainQueue() {
  const items = await readQueue();
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (res.ok) await deleteFromQueue(item.id);
    } catch {
      // leave in queue; sync retried
      return;
    }
  }
}
