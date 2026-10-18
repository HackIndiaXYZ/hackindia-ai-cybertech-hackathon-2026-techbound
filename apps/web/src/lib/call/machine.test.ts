import { describe, it, expect } from 'vitest';
import { nextCallState, isTerminalCallState, callStateLabel, aggregateCallEvent } from './machine.js';

/**
 * Call state machine (plan §12). The critical guarantee: we never report
 * "connected" unless a CONNECTED event moved us there, and terminal states are
 * explicit. These tests are deterministic inputs — no timers or fakes.
 */
describe('call state machine (§12)', () => {
  it('idle -> connecting on START, then -> connected on CONNECTED', () => {
    const a = nextCallState('idle', { type: 'START' });
    expect(a).toBe('connecting');
    expect(nextCallState(a, { type: 'CONNECTED' })).toBe('connected');
  });

  it('ringing accepts into connecting', () => {
    expect(nextCallState('idle', { type: 'RING' })).toBe('ringing');
    expect(nextCallState('ringing', { type: 'ACCEPT' })).toBe('connecting');
  });

  it('connected peers dropping move to reconnecting, then reconnect', () => {
    expect(nextCallState('connected', { type: 'RECONNECTING' })).toBe('reconnecting');
    expect(nextCallState('reconnecting', { type: 'RECONNECTED' })).toBe('connected');
  });

  it('ignores unknown/no-op transitions instead of corrupting state', () => {
    expect(nextCallState('idle', { type: 'CONNECTED' })).toBe('idle');
    expect(nextCallState('ended', { type: 'CONNECTED' })).toBe('ended');
  });

  it('failed recovers only via an explicit START, and end is always reachable', () => {
    expect(nextCallState('failed', { type: 'START' })).toBe('connecting');
    expect(nextCallState('failed', { type: 'CONNECTED' })).toBe('failed');
    for (const s of ['connecting', 'connected', 'reconnecting'] as const) {
      expect(nextCallState(s, { type: 'ENDED' })).toBe('ended');
    }
  });

  it('marks ended and failed terminal, connected not', () => {
    expect(isTerminalCallState('ended')).toBe(true);
    expect(isTerminalCallState('failed')).toBe(true);
    expect(isTerminalCallState('connected')).toBe(false);
  });

  it('has a human label for every state (non-color-only cue, §28)', () => {
    expect(callStateLabel('connected')).toMatch(/connected/i);
    expect(callStateLabel('reconnecting')).toMatch(/reconnect/i);
  });

  it('aggregates all peer statuses so one callback cannot lie about the whole call (§12.18, Phase 4B)', () => {
    // Nothing known yet: no event, the machine keeps its truthful state.
    expect(aggregateCallEvent([])).toBeNull();
    expect(aggregateCallEvent(['connecting'])).toBeNull();
    // Only a fully live mesh deserves "connected".
    expect(aggregateCallEvent(['connected', 'connected'])).toEqual({ type: 'CONNECTED' });
    // One down, one live → the call is reconnecting, not connected.
    expect(aggregateCallEvent(['connected', 'disconnected'])).toEqual({ type: 'RECONNECTING' });
    expect(aggregateCallEvent(['connected', 'failed', 'connecting'])).toEqual({ type: 'RECONNECTING' });
    // Everything down (and none pending) → connection lost outright.
    expect(aggregateCallEvent(['disconnected', 'failed', 'closed'])).toEqual({ type: 'DISCONNECTED' });
    // Still setting up, nothing broken → honest silence, no fake event.
    expect(aggregateCallEvent(['connecting', 'new'])).toBeNull();
  });
});
