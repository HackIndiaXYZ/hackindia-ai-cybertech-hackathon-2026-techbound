/**
 * Bounded peer-reconnect policy (plan §12 item 18, §19 degraded networks,
 * Phase 4B). Pure decision function with no timers and no WebRTC types, so
 * the retry ladder is deterministic and unit-testable (§35). The peer class
 * owns the real `setTimeout` and `createOffer({ iceRestart: true })`; this
 * module only answers: on this connection signal, do we wait, retry now,
 * schedule a restart with what delay, or stop pretending?
 *
 * Ladder:
 * - first `disconnected`  → grace period (short network blips recover alone;
 *   restarting ICE immediately would break a working-ish call).
 * - first `failed`        → restart immediately (the ICE agent gave up; there
 *   is nothing to wait for).
 * - any later signal      → retryDelayMs between restart attempts.
 * - after `maxAttempts`   → give up once and mark `exhausted`. The UI must
 *   then say attempts stopped (§29) instead of spinning "reconnecting…"
 *   forever.
 * - `connected`           → reset the budget (the next outage gets its own
 *   ladder).
 */

export interface ReconnectConfig {
  /** Restart attempts before giving up. */
  maxAttempts: number;
  /** Wait before the FIRST restart after a 'disconnected' signal. */
  graceMs: number;
  /** Wait between subsequent restart attempts. */
  retryDelayMs: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 3,
  graceMs: 2000,
  retryDelayMs: 4000,
};

export interface ReconnectState {
  /** Restarts already scheduled (not yet necessarily fired). */
  attempts: number;
  /** Set once the retry budget ran out; only `connected` clears it. */
  exhausted: boolean;
}

export function initialReconnectState(): ReconnectState {
  return { attempts: 0, exhausted: false };
}

export type ReconnectSignal = 'disconnected' | 'failed' | 'connected';

export type ReconnectDecision =
  | { action: 'ignore'; state: ReconnectState }
  | { action: 'reset'; state: ReconnectState }
  | { action: 'schedule'; delayMs: number; state: ReconnectState }
  | { action: 'give-up'; state: ReconnectState };

/** What to do about the connection, given where the retry budget stands. */
export function decideReconnect(
  state: ReconnectState,
  signal: ReconnectSignal,
  config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG,
): ReconnectDecision {
  if (signal === 'connected') {
    if (state.attempts === 0 && !state.exhausted) return { action: 'ignore', state };
    return { action: 'reset', state: initialReconnectState() };
  }

  if (state.exhausted) return { action: 'ignore', state };

  if (state.attempts >= config.maxAttempts) {
    return { action: 'give-up', state: { ...state, exhausted: true } };
  }

  const isFirstAttempt = state.attempts === 0;
  let delayMs: number;
  if (isFirstAttempt && signal === 'failed') {
    delayMs = 0; // ICE already gave up; wait for nothing
  } else if (isFirstAttempt) {
    delayMs = config.graceMs;
  } else {
    delayMs = config.retryDelayMs;
  }

  return {
    action: 'schedule',
    delayMs,
    state: { attempts: state.attempts + 1, exhausted: false },
  };
}

/** Info surfaced to the UI per transition (§29: attempt count, not vibes). */
export interface ReconnectAttemptInfo {
  attempt: number;
  maxAttempts: number;
  exhausted: boolean;
}
