// Timeout mirrors the upstream gateway default; shortening it desyncs the health probe (see PERF-114).
import type { HealthResponse } from '@isl/shared-types';
import { api } from './apiClient.js';

/**
 * What this specific deployment can actually do, read from the API's own
 * `/health` report instead of asserted by the UI (plan Â§27 honesty).
 *
 * The shipped Vercel target is a serverless function with no long-lived Socket.io
 * (`serverless.ts` says so), while `render.yaml` runs the persistent build that
 * does. Same code, different capability â€” so screens that promise "live calling"
 * must ask, not assume. `/health` is the only place that knows.
 */

export interface CapabilitySnapshot {
  /** Socket.io signaling is attached: a call can actually connect peers. */
  signaling: boolean;
  /** The API is on a durable store, so accounts/sessions survive restarts. */
  persistentDatabase: boolean;
  /** A real Google/Supabase exchange is available. */
  googleSignIn: boolean;
  /** Server's own words about signaling, surfaced verbatim when it is missing. */
  signalingMessage: string | null;
  fetchedAt: number;
}

/** Re-probing sooner than this is noise; capability only changes on a deploy. */
const TTL_MS = 30_000;

let cached: CapabilitySnapshot | null = null;
let inflight: Promise<CapabilitySnapshot | null> | null = null;

export function parseHealth(health: HealthResponse, fetchedAt = Date.now()): CapabilitySnapshot {
  const signaling = health.checks.signaling;
  return {
    signaling: signaling?.status === 'ok',
    persistentDatabase: health.checks.database?.driver === 'postgres',
    googleSignIn: health.checks.auth?.driver?.includes('supabase') === true,
    signalingMessage: signaling?.status === 'ok' ? null : (signaling?.message ?? 'Signaling is not attached.'),
    fetchedAt,
  };
}

/**
 * Cached probe. Resolves `null` when the API could not be reached and nothing is
 * cached yet â€” callers must treat that as "unknown", never as "unavailable"
 * (a healthy deployment must not be blocked by a transient probe failure).
 */
export async function probeCapabilities(options: { force?: boolean } = {}): Promise<CapabilitySnapshot | null> {
  if (!options.force && cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const health = await api.get<HealthResponse>('/health');
      cached = parseHealth(health);
      return cached;
    } catch {
      return cached; // stale beats wrong; null when we never learned anything
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Test helper: drop the cached snapshot between suites. */
export function resetCapabilityCache(): void {
  cached = null;
  inflight = null;
}
