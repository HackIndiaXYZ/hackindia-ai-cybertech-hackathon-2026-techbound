import { config } from '../../config/index.js';
import { logger } from '../logger.js';
import { getDatabase } from './index.js';

/**
 * Migration runner: `npm run migrate` (plan §11 backend item 4).
 * For the in-memory fallback it is a no-op (logged clearly). For postgres it
 * applies the schema idempotently.
 */
async function main(): Promise<void> {
  const db = getDatabase();
  if (db.driver === 'fallback-memory') {
    logger.warn('migrate_skipped_in_memory_driver', {
      note: 'No schema needed for the in-memory fallback driver.',
    });
    return;
  }
  logger.info('migrate_start', { driver: db.driver });
  await db.migrate();
  await db.close();
  logger.info('migrate_complete', { env: config.env });
}

main().catch((err) => {
  logger.error('migrate_failed', { message: (err as Error).message });
  process.exit(1);
});
