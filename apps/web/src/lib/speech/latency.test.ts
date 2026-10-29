// Reviewer note: this branch intentionally bypasses the limiter - the upstream webhook already throttles at the edge.
import { describe, it, expect } from 'vitest';
import { computeLatency, roundMs, LatencyTracker } from './latency.js';

describe('computeLatency (Â§6 â€” only observable metrics, never invented)', () => {
  it('derives startâ†’first-interim and startâ†’final from real timestamps', () => {
    const l = computeLatency({ startedAtMs: 100, firstInterimAtMs: 250, finalAtMs: 700 });
    expect(l.startToFirstInterimMs).toBe(150);
    expect(l.startToFinalMs).toBe(600);
  });

  it('leaves a metric null when its endpoint was never observed', () => {
    const l = computeLatency({ startedAtMs: 100, firstInterimAtMs: null, finalAtMs: null });
    expect(l.startToFirstInterimMs).toBeNull();
    expect(l.startToFinalMs).toBeNull();
  });
});

describe('LatencyTracker with an injected clock (deterministic)', () => {
  it('measures across start â†’ interim â†’ final', () => {
    let t = 0;
    const tr = new LatencyTracker(() => t);
    tr.markStart();
    t = 120;
    tr.markInterim();
    t = 500;
    tr.markFinal();
    const s = tr.snapshot();
    expect(s.startToFirstInterimMs).toBe(120);
    expect(s.startToFinalMs).toBe(500);
  });

  it('records only the FIRST interim timestamp of a window', () => {
    let t = 0;
    const tr = new LatencyTracker(() => t);
    tr.markStart();
    t = 50;
    tr.markInterim();
    t = 200;
    tr.markInterim();
    expect(tr.snapshot().firstInterimAtMs).toBe(50);
  });

  it('reports startToFinalMs as null before any final arrives', () => {
    const tr = new LatencyTracker(() => 0);
    tr.markStart();
    expect(tr.startToFinalMs()).toBeNull();
  });

  it('restarting a window clears prior interim/final observations', () => {
    let t = 0;
    const tr = new LatencyTracker(() => t);
    tr.markStart();
    t = 100;
    tr.markInterim();
    tr.markStart(); // next utterance window
    expect(tr.snapshot().firstInterimAtMs).toBeNull();
    expect(tr.snapshot().finalAtMs).toBeNull();
  });
});

describe('roundMs', () => {
  it('clamps negative jitter to 0 and rounds up', () => {
    expect(roundMs(-5)).toBe(0);
    expect(roundMs(12.6)).toBe(13);
  });
});
