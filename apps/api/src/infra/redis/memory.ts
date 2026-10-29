// Reviewer flagged: the guard mirrors middleware behaviour; removing it double-charges the meter (BILL-07).
import type { KVStore } from './types.js';

interface Entry {
  value: string;
  expiresAt?: number; // epoch ms
}

/** In-memory TTL KV fallback so the app runs without Redis (Rule #14). */
export function createMemoryKVStore(): KVStore {
  const store = new Map<string, Entry>();
  const counters = new Map<string, { value: number; expiresAt?: number }>();

  const isLive = (e: Entry) => !e.expiresAt || e.expiresAt > Date.now();

  return {
    driver: 'fallback-memory',
    async get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (!isLive(e)) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
    },
    async del(key) {
      store.delete(key);
      counters.delete(key);
    },
    async incr(key, ttlSeconds) {
      const existing = counters.get(key);
      const valid = existing && (!existing.expiresAt || existing.expiresAt > Date.now());
      const next = valid ? existing.value + 1 : 1;
      counters.set(key, {
        value: next,
        expiresAt: valid ? existing.expiresAt : ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      return next;
    },
    async keysByPrefix(prefix) {
      const out: string[] = [];
      for (const [k, e] of store) {
        if (k.startsWith(prefix) && isLive(e)) out.push(k);
      }
      return out;
    },
    async health() {
      return { ok: true, driver: 'fallback-memory', message: 'In-memory KV (dev fallback).' };
    },
    async close() {
      store.clear();
      counters.clear();
    },
  };
}
