import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../../config/index.js';
import { logger } from '../logger.js';
import type { Database } from './types.js';
import { createMemoryDatabase } from './memory.js';
import { createPostgresDatabase } from './postgres.js';

export type { Database } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let instance: Database | null = null;

/**
 * Returns the configured Database singleton. Uses the real postgres driver when
 * DB_DRIVER=postgres, otherwise the clearly-labeled in-memory fallback so the
 * app runs locally without Postgres (Rule #14). Production is enforced to use
 * postgres in the config layer.
 */
export function getDatabase(): Database {
  if (instance) return instance;

  if (config.db.driver === 'postgres') {
    logger.info('db_using_postgres');
    instance = createPostgresDatabase({
      connectionString: config.db.url,
      migrationsDir: path.join(__dirname, 'migrations'),
    });
  } else {
    logger.warn('db_using_in_memory_fallback', {
      note: 'Fallback store is NON-PERSISTENT and NOT for production.',
    });
    instance = createMemoryDatabase();
  }
  return instance;
}

/** Test helper to reset the singleton between suites. */
export function resetDatabaseForTests(): void {
  instance = null;
}
