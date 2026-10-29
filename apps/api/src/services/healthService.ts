import type { HealthComponentStatus, HealthResponse } from '@isl/shared-types';
import { config } from '../config/index.js';
import { getDatabase } from '../infra/db/index.js';
import { getKVStore } from '../infra/redis/index.js';
import { resolveProviders } from './providerRegistry.js';
import { isOAuthDevModeActive, isSupabaseConfigured } from './supabaseAuthService.js';

const startedAt = Date.now();

/** Mutable runtime registry updated by the signaling layer (§26). */
export const runtimeStatus = {
  signalingConnected: false,
  activeRooms: 0,
};

type RawProbe = { ok: boolean; driver: string; latencyMs?: number; message?: string };

export async function buildHealthReport(): Promise<HealthResponse> {
  const db = getDatabase();
  const kv = getKVStore();

  const [dbHealth, redisHealth] = await Promise.all([probe(() => db.health()), probe(() => kv.health())]);

  const api: HealthComponentStatus = { status: 'ok', message: 'HTTP layer up.' };
  const database = componentFromProbe(dbHealth, db.driver);
  const redis = componentFromProbe(redisHealth, kv.driver);
  const signaling: HealthComponentStatus = runtimeStatus.signalingConnected
    ? { status: 'ok', message: `Socket.io ready (${runtimeStatus.activeRooms} rooms).` }
    : { status: 'degraded', message: 'Signaling not yet attached.' };

  // Honest speech status: Phase 2C recognition runs in the browser, so there is
  // no server speech service to be "ok". We never claim a model we do not run.
  const speech: HealthComponentStatus =
    config.providers.speech === 'stub'
      ? {
          status: 'degraded',
          driver: 'client-webspeech',
          message: 'No server speech service; recognition runs on-device (browser Web Speech).',
        }
      : {
          status: 'degraded',
          driver: config.providers.speech,
          message: `Server speech provider '${config.providers.speech}' configured but not verified in this environment.`,
        };

  // Provider flags are switches, not decorations (Phase 4C.3, P2-6): a flag
  // naming an integration that does not exist degrades health *into the
  // rollup*, so a misconfigured deployment is visible to probes instead of
  // pretending the capability exists.
  const missing = resolveProviders().filter((p) => !p.implemented);
  const providers: HealthComponentStatus = missing.length
    ? {
        status: 'degraded',
        driver: missing.map((p) => `${p.capability}=${p.configured}`).join(', '),
        message: `Provider flag(s) name no implementation in this build: ${missing
          .map((p) => `${p.capability}='${p.configured}'`)
          .join(', ')}.`,
      }
    : { status: 'ok', message: 'Every provider flag resolves to an implemented integration.' };

  // Honest auth-mode reporting: credential login always works, so an unconfigured
  // OAuth provider is informational (excluded from the rollup below) rather than
  // a degraded dependency — but it is never reported as working when it is not.
  const auth: HealthComponentStatus = isSupabaseConfigured()
    ? { status: 'ok', driver: 'supabase-google+password', message: 'Supabase Google OAuth verified server-side.' }
    : isOAuthDevModeActive()
      ? { status: 'degraded', driver: 'oauth-dev', message: 'OAuth running on the dev-mode shared secret; not usable in production.' }
      : { status: 'ok', driver: 'password-only', message: 'No OAuth provider configured; credential login only.' };

  // The `speech` component is informational and intentionally excluded from the
  // overall rollup: a browser-side provider has no server to be "down" here.
  const statuses = [api.status, database.status, redis.status, signaling.status, providers.status];
  const overall: HealthResponse['status'] = statuses.includes('down')
    ? 'down'
    : statuses.includes('degraded')
      ? 'degraded'
      : 'ok';

  return {
    status: overall,
    version: '0.1.0',
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks: { api, database, redis, signaling, speech, auth, providers },
  };
}

function componentFromProbe(
  p: RawProbe,
  driver: string,
): HealthComponentStatus {
  if (driver === 'fallback-memory') {
    // Honest reporting: fallbacks are non-persistent, never "ok" for production.
    return { status: 'degraded', driver, message: 'In-memory fallback (non-persistent).' };
  }
  const c: HealthComponentStatus = { status: p.ok ? 'ok' : 'down', driver };
  if (p.latencyMs !== undefined) c.latencyMs = p.latencyMs;
  if (p.message) c.message = p.message;
  return c;
}

async function probe(fn: () => Promise<RawProbe>): Promise<RawProbe> {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, driver: 'unknown', message: (err as Error).message };
  }
}
