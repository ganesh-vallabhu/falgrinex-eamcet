const memory = new Map();

export function memoize(key, ttlMs, producer) {
  const hit = memory.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = producer();
  if (value && typeof value.then === 'function') {
    const pending = value.then(
      (resolved) => {
        const current = memory.get(key);
        if (current?.value === pending) memory.set(key, { value: resolved, expires: Date.now() + ttlMs });
        return resolved;
      },
      (error) => {
        if (memory.get(key)?.value === pending) memory.delete(key);
        throw error;
      },
    );
    memory.set(key, { value: pending, expires: now + ttlMs });
    return pending;
  }
  memory.set(key, { value, expires: now + ttlMs });
  return value;
}

export function invalidate(prefix) {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

const DB_NAME = 'falgrinex-cache';
const STORE = 'json';
let dbPromise;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

async function readStore(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

async function writeStore(key, value) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

export async function cachedJson(url, cacheKey, { ttlMs = 300_000 } = {}) {
  const key = `json:${cacheKey}`;
  const hit = memoize(key, ttlMs, async () => {
    const stored = await readStore(cacheKey);
    if (stored && stored.expires > Date.now()) return stored.value;
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`);
    const value = await response.json();
    await writeStore(cacheKey, { value, expires: Date.now() + ttlMs });
    return value;
  });
  return hit;
}
