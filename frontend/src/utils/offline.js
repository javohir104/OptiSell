/**
 * Offline mode: sales made without internet wait in this browser and are sent when the
 * connection is back. Each queued sale has an Idempotency-Key, so a sale is never saved twice
 * even if sending is retried. The product list is cached so the till still works offline.
 */
const QUEUE_KEY = 'optisell_offline_sales';
const PRODUCTS_KEY = 'optisell_products_cache';
export const QUEUE_EVENT = 'optisell:offline-queue';

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};

/** No answer from the server at all (offline, DNS, timeout) — not a refusal like 400/409. */
export const isNetworkError = (err) => Boolean(err) && !err.response && (Boolean(err.request) || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED');

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const notify = () => window.dispatchEvent(new Event(QUEUE_EVENT));

export function pendingSales(userId) {
  return read(QUEUE_KEY, []).filter((x) => !userId || x.userId === userId);
}

export function queueSale({ userId, body, key, total, label }) {
  const list = read(QUEUE_KEY, []);
  list.push({ userId, body, key, total, label, createdAt: new Date().toISOString() });
  write(QUEUE_KEY, list);
  notify();
}

function dropKey(key) {
  write(QUEUE_KEY, read(QUEUE_KEY, []).filter((x) => x.key !== key));
}

let flushing = null;

/**
 * Send this user's queued sales one by one. A sale the server refuses (e.g. stock ran out
 * meanwhile) is removed and reported back; a network error stops and keeps the rest for later.
 */
export function flushQueue(userId, post) {
  if (flushing) return flushing;
  flushing = (async () => {
    const result = { sent: 0, failed: [] };
    for (const item of pendingSales(userId)) {
      try {
        await post(item.body, item.key);
        dropKey(item.key);
        result.sent += 1;
      } catch (err) {
        if (isNetworkError(err)) break;
        dropKey(item.key);
        result.failed.push({ ...item, error: err });
      }
    }
    notify();
    return result;
  })().finally(() => { flushing = null; });
  return flushing;
}

export function cacheProducts(userId, products) {
  write(PRODUCTS_KEY, { userId, at: Date.now(), products });
}

export function cachedProducts(userId) {
  const c = read(PRODUCTS_KEY, null);
  return c && c.userId === userId ? c.products : null;
}

/** Locally reduce the cached stock after an offline sale, so the next offline sale sees it. */
export function reduceCachedStock(userId, items) {
  const c = read(PRODUCTS_KEY, null);
  if (!c || c.userId !== userId) return;
  const by = new Map(items.map((it) => [it.product_id, it.quantity]));
  c.products = c.products.map((p) => (by.has(p.id) ? { ...p, stock: Math.max(0, p.stock - by.get(p.id)) } : p));
  write(PRODUCTS_KEY, c);
}
