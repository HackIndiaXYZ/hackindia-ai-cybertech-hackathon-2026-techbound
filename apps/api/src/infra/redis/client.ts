import { Redis } from 'ioredis';
import type { KVStore } from './types.js';
import { logger } from '../logger.js';

/** Real Redis-backed KV store using ioredis (lazy connect, keyed TTL). */
export function createRedisKVStore(url: string): KVStore {
  const isTls = url.startsWith('rediss://') || process.env.REDIS_TLS === 'true';
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    lazyConnect: true,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((target) => err.message.includes(target));
    },
  });

  client.on('error', (err) => logger.error('redis_error', { message: err.message }));

  client.connect().catch((err) => {
    logger.warn('redis_initial_connect_failed', { message: err.message });
  });

  return {
    driver: 'redis',
    async get(key) {
      return client.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds) await client.set(key, value, 'EX', ttlSeconds);
      else await client.set(key, value);
    },
    async del(key) {
      await client.del(key);
    },
    async incr(key, ttlSeconds) {
      const val = await client.incr(key);
      if (val === 1 && ttlSeconds) await client.expire(key, ttlSeconds);
      return val;
    },
    async keysByPrefix(prefix) {
      // SCAN-based to avoid KEYS blocking in production.
      const pattern = `${prefix}*`;
      const out: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        out.push(...batch);
      } while (cursor !== '0');
      return out;
    },
    async health() {
      const start = process.hrtime.bigint();
      try {
        await client.ping();
        return {
          ok: true,
          driver: 'redis',
          latencyMs: Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 100) / 100,
        };
      } catch (err) {
        return { ok: false, driver: 'redis', message: (err as Error).message };
      }
    },
    async close() {
      await client.quit().catch(() => client.disconnect());
    },
  };
}
