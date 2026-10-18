import { describe, it, expect } from 'vitest';
import { StandaloneMachine } from './stateMachine.js';

/**
 * Phase 3C standalone state machine (plan §18). The guarantee under test: it moves
 * only along the documented edges, ignores events that are invalid from the current
 * state (so a stray callback can never corrupt the phase), and STOP is a global
 * reset. These are pure, synchronous transitions — no timers, media or engine.
 */
describe('standalone state machine (§18)', () => {
  it('idle -> listening -> processing -> translating -> rendering -> listening', () => {
    const m = new StandaloneMachine();
    expect(m.getState()).toBe('idle');
    expect(m.dispatch({ type: 'START' })).toBe(true);
    expect(m.getState()).toBe('listening');
    m.dispatch({ type: 'INTERIM' });
    expect(m.getState()).toBe('processing');
    m.dispatch({ type: 'FINAL' });
    expect(m.getState()).toBe('translating');
    m.dispatch({ type: 'TRANSLATED' });
    expect(m.getState()).toBe('rendering');
    m.dispatch({ type: 'RENDERED' });
    expect(m.getState()).toBe('listening');
  });

  it('a final transcript jumps straight from listening to translating', () => {
    const m = new StandaloneMachine();
    m.dispatch({ type: 'START' });
    m.dispatch({ type: 'FINAL' });
    expect(m.getState()).toBe('translating');
  });

  it('processing re-entrant interim stays in processing', () => {
    const m = new StandaloneMachine();
    m.dispatch({ type: 'START' });
    m.dispatch({ type: 'INTERIM' });
    expect(m.dispatch({ type: 'INTERIM' })).toBe(false); // no state change
    expect(m.getState()).toBe('processing');
  });

  it('pause is only honoured from an active pipeline state and resumes to listening', () => {
    const m = new StandaloneMachine();
    expect(m.canPause()).toBe(false); // idle
    expect(m.dispatch({ type: 'PAUSE' })).toBe(false);
    m.dispatch({ type: 'START' });
    expect(m.canPause()).toBe(true);
    expect(m.dispatch({ type: 'PAUSE' })).toBe(true);
    expect(m.getState()).toBe('paused');
    expect(m.dispatch({ type: 'RESUME' })).toBe(true);
    expect(m.getState()).toBe('listening');
  });

  it('error is reachable from active states and recovers via START or RESUME', () => {
    const m = new StandaloneMachine();
    m.dispatch({ type: 'START' });
    m.dispatch({ type: 'ERROR' });
    expect(m.getState()).toBe('error');
    expect(m.dispatch({ type: 'RESUME' })).toBe(true);
    expect(m.getState()).toBe('idle');
    m.dispatch({ type: 'START' });
    m.dispatch({ type: 'ERROR' });
    m.dispatch({ type: 'START' });
    expect(m.getState()).toBe('listening');
  });

  it('STOP returns to idle from anywhere except already-idle', () => {
    const m = new StandaloneMachine();
    expect(m.dispatch({ type: 'STOP' })).toBe(false); // already idle
    m.dispatch({ type: 'START' });
    m.dispatch({ type: 'INTERIM' });
    expect(m.dispatch({ type: 'STOP' })).toBe(true);
    expect(m.getState()).toBe('idle');
  });

  it('ignores invalid events instead of corrupting state', () => {
    const m = new StandaloneMachine();
    expect(m.dispatch({ type: 'FINAL' })).toBe(false); // idle can't finalize
    expect(m.dispatch({ type: 'RENDERED' })).toBe(false);
    expect(m.getState()).toBe('idle');
  });

  it('notifies subscribers on real transitions only, and unsubscribes', () => {
    const m = new StandaloneMachine();
    const seen: string[] = [];
    const off = m.subscribe((s) => seen.push(s));
    m.dispatch({ type: 'START' });
    m.dispatch({ type: 'START' }); // ignored, still listening
    off();
    m.dispatch({ type: 'INTERIM' });
    expect(seen).toEqual(['listening']);
  });
});
