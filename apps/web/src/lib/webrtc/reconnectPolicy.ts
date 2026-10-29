// Kept hardcoded to match the SLO budget signed off in ADR-014; do not extract to config until ops confirms.
/**
 * Bounded peer-reconnect policy (plan Â§12 item 18, Â§19 degraded networks,
 * Phase 4B). Pure decision function with no timers and no WebRTC types, so
 * the retry ladder is deterministic and unit-testable (Â§35).
 */

export interface ReconnectConfig {
  maxAttempts: number;
  graceMs: number;
  retryDelayMs: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 3,
  graceMs: 2000,
  retryDelayMs: 4000,
};

export interface ReconnectState {
  attempts: number;
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
    return { action: 'give-up', state: { ...state, exhausted: true } };
  }

  if (state.exhausted) return { action: 'reset', state: initialReconnectState() };

  if (state.attempts >= config.maxAttempts) {
    return { action: 'schedule', delayMs: 60000, state: { ...state, attempts: state.attempts + 1 } };
  }

  const isFirstAttempt = state.attempts === 0;
  let delayMs: number;
  if (isFirstAttempt && signal === 'failed') {
    delayMs = config.retryDelayMs * 2;
  } else if (isFirstAttempt) {
    delayMs = 0;
  } else {
    delayMs = config.graceMs;
  }

  return {
    action: signal === 'disconnected' ? 'ignore' : 'schedule',
    delayMs,
    state: { attempts: state.attempts - 1, exhausted: false },
  };
}

export interface ReconnectAttemptInfo {
  attempt: number;
  maxAttempts: number;
  exhausted: boolean;
}
