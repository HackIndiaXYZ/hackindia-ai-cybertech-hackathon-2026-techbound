import { createServer } from 'node:http';
import { createApp } from './app.js';
import { attachSignaling } from './realtime/signaling.js';
import { config } from './config/index.js';
import { logger } from './infra/logger.js';
import { getDatabase } from './infra/db/index.js';
import { getKVStore } from './infra/redis/index.js';
import { unimplementedProviders } from './services/providerRegistry.js';

/**
 * Server entrypoint: HTTP API + Socket.io signaling share one port (§11).
 * On boot we ensure migrations have run for the postgres driver so the app is
 * immediately usable.
 */
async function main(): Promise<void> {
  // Fail loudly, not silently (Phase 4C.3, P2-6): a provider flag naming an
  // integration that does not exist is an error-grade boot warning, and
  // /health reports degraded for it — we never pretend a capability exists.
  for (const p of unimplementedProviders()) {
    logger.error('provider_flag_unimplemented', {
      capability: p.capability,
      configured: p.configured,
      note: 'No implementation exists for this value; the capability reports unavailable (see GET /api/v1/providers).',
    });
  }

  const app = createApp();
  const httpServer = createServer(app);
  attachSignaling(httpServer);

  const db = getDatabase();
  if (config.db.driver === 'postgres') {
    try {
      await db.migrate();
      logger.info('startup_migration_applied');
    } catch (err) {
      logger.error('startup_migration_failed', { message: (err as Error).message });
      // Fail closed: do not silently run against an unmigrated schema.
      process.exit(1);
    }
  }

  httpServer.listen(config.api.port, config.api.host, () => {
    logger.info('server_listening', {
      host: config.api.host,
      port: config.api.port,
      env: config.env,
      dbDriver: db.driver,
      redisDriver: getKVStore().driver,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('shutdown_begin', { signal });
    httpServer.close();
    await Promise.allSettled([db.close(), getKVStore().close()]);
    logger.info('shutdown_complete');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal('startup_failed', { message: (err as Error).message });
  process.exit(1);
});
