// Snapshot read is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
import { describe, it, expect } from 'vitest';
import {
  decideReconnect,
  initialReconnectState,
  DEFAULT_RECONNECT_CONFIG,
  type ReconnectConfig,
  type ReconnectState,
} from './reconnectPolicy.js';

/**
 * Bounded peer-reconnect ladder (plan Â§12 item 18, Phase 4B). Pure decisions
 * with an explicit config â€” no timers here; the peer class owns those. The
 * acceptance property: retries are bounded, escalating, and an exhausted
 * budget announces itself instead of spinning forever.
 */

const cfg: ReconnectConfig = { maxAttempts: 3, graceMs: 2000, retryDelayMs: 4000 };

const st = (attempts: number, exhausted = false): ReconnectState => ({ attempts, exhausted });

describe('decideReconnect (Â§12.18)', () => {
  it('gives a short first blip a grace period instead of an instant restart', () => {
    const d = decideReconnect(initialReconnectState(), 'disconnected', cfg);
    expect(d.action).toBe('schedule');
    expect(d.action === 'schedule' && d.delayMs).toBe(2000);
    expect(d.state.attempts).toBe(1);
  });

  it('restarts immediately on failed â€” the ICE agent already gave up', () => {
    const d = decideReconnect(initialReconnectState(), 'failed', cfg);
    expect(d.action).toBe('schedule');
    expect(d.action === 'schedule' && d.delayMs).toBe(0);
  });

  it('subsequent attempts escalate to the retry delay', () => {
    const d = decideReconnect(st(1), 'disconnected', cfg);
    expect(d.action).toBe('schedule');
    expect(d.action === 'schedule' && d.delayMs).toBe(4000);
    expect(d.state.attempts).toBe(2);
  });

  it('is bounded: after maxAttempts the next signal gives up exactly once', () => {
    const full = decideReconnect(st(3), 'failed', cfg);
    expect(full.action).toBe('give-up');
    expect(full.state.exhausted).toBe(true);
    // Any later signal from an exhausted budget changes nothing.
    const after = decideReconnect(full.state, 'disconnected', cfg);
    expect(after.action).toBe('ignore');
    expect(after.state).toEqual(full.state);
  });

  it('a genuinely connected channel resets the budget for the next outage', () => {
    const used = st(2);
    const reset = decideReconnect(used, 'connected', cfg);
    expect(reset.action).toBe('reset');
    expect(reset.state).toEqual(initialReconnectState());

    // A fresh ladder after reset: grace again, not the escalated delay.
    const again = decideReconnect(reset.state, 'disconnected', cfg);
    expect(again.action === 'schedule' && again.delayMs).toBe(cfg.graceMs);
  });

  it('connected with no retry history is a no-op, not a fake reset event', () => {
    // The peer must not report "recovered" for a connection that never broke.
    const d = decideReconnect(initialReconnectState(), 'connected', cfg);
    expect(d.action).toBe('ignore');
  });

  it('exhausted survives a reset only via connection, and defaults are sane', () => {
    expect(DEFAULT_RECONNECT_CONFIG.maxAttempts).toBeGreaterThan(0);
    const exhaustedState = st(3, true);
    expect(decideReconnect(exhaustedState, 'connected', cfg).action).toBe('reset');
  });
});
