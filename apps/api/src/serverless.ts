import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './infra/logger.js';
import { getDatabase } from './infra/db/index.js';
import { unimplementedProviders } from './services/providerRegistry.js';

/**
 * Serverless entrypoint (Vercel) — the same Express app as `index.ts`, minus the
 * pieces a request-scoped runtime cannot host:
 *
 * - No `http.createServer().listen()`: the platform hands us (req, res) directly.
 * - No `attachSignaling()`: Socket.io needs a long-lived server, so WebRTC call
 *   signaling is unavailable in this build. Everything else (auth, sessions,
 *   speech/tts/isl proxying, health, metrics) is plain request/response and works.
 *   Deploy `node dist/index.js` on a persistent host (see render.yaml / Dockerfile)
 *   when live calls must be enabled.
 *
 * Cold start runs `migrate()` once per instance when the postgres driver is
 * configured; with the in-memory fallback driver there is nothing to migrate.
 */
const app = createApp();

for (const p of unimplementedProviders()) {
  logger.warn('serverless_provider_flag_unimplemented', {
    capability: p.capability,
    configured: p.configured,
  });
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (config.db.driver !== 'postgres') return Promise.resolve();
  schemaReady ??= getDatabase()
    .migrate()
    .then(() => logger.info('serverless_migration_applied'))
    .catch((err: unknown) => {
      // Do not cache a failed migration: the next request retries it.
      schemaReady = null;
      logger.error('serverless_migration_failed', { message: (err as Error).message });
      throw err;
    });
  return schemaReady;
}

/**
 * Vercel calls THIS default export with a real (req, res) pair.
 *
 * The `.vc-config.json` handler value must name the *file* (`index.js`), not
 * `index.handler`. Naming an export switches the launcher into AWS-Lambda mode and
 * this function then receives `({ body, action }, context)` instead of streams —
 * Express dies later inside `unpipe` with "stream.listeners is not a function".
 */
export async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await ensureSchema();
  } catch {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'DATABASE_UNAVAILABLE' }));
    return;
  }
  app(req, res);
}

export default handler;
