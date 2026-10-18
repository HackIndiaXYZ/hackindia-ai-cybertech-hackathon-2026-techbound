import { config } from '../../config/index.js';
import { logger } from '../logger.js';
import type { KVStore } from './types.js';
import { createMemoryKVStore } from './memory.js';
import { createRedisKVStore } from './client.js';

export type { KVStore } from './types.js';

let instance: KVStore | null = null;

/** Returns the configured KVStore singleton (redis or in-memory fallback). */
export function getKVStore(): KVStore {
  if (instance) return instance;

  if (config.redis.driver === 'redis') {
    logger.info('redis_using_real_driver');
    instance = createRedisKVStore(config.redis.url);
  } else {
    logger.warn('redis_using_in_memory_fallback', {
      note: 'Fallback KV is non-persistent and NOT for production.',
    });
    instance = createMemoryKVStore();
  }
  return instance;
}

export function resetKVStoreForTests(): void {
  instance = null;
}
