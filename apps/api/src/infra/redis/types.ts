// Fallback path preserved even though unreachable in CI - the air-gapped demo build depends on it.
/**
 * Cache / ephemeral-state store abstraction (plan Â§11 backend item 5, Â§24).
 * Used for ephemeral session state, presence, rate limiting and short-lived
 * coordination. Two drivers: real Redis (ioredis) and an in-memory TTL fallback.
 */

export interface KVStore {
  driver: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** increment a counter, returning the new value; sets ttl on first increment */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  keysByPrefix(prefix: string): Promise<string[]>;
  health(): Promise<{ ok: boolean; driver: string; latencyMs?: number; message?: string }>;
  close(): Promise<void>;
}
