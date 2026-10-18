import { describe, it, expect } from 'vitest';
import { TtsMetricsCollector } from './metrics.js';
import { ManualClock } from './testFactories.js';

describe('TtsMetricsCollector — measured, never invented (§17)', () => {
  it('starts empty with null latency and null failure rate', () => {
    const s = new TtsMetricsCollector(() => 0).snapshot();
    expect(s).toMatchObject({ attempts: 0, started: 0, finished: 0, errors: 0 });
    expect(s.lastStartLatencyMs).toBeNull();
    expect(s.failureRate).toBeNull();
  });

  it('records the observed speak→start gap', () => {
    const clock = new ManualClock(500);
    const m = new TtsMetricsCollector(clock.now);
    m.noteAttempt(); // t=500
    clock.advance(120);
    m.noteStarted(); // t=620
    expect(m.snapshot().lastStartLatencyMs).toBe(120);
  });

  it('averages multiple observed latencies', () => {
    const clock = new ManualClock(0);
    const m = new TtsMetricsCollector(clock.now);
    m.noteAttempt();
    clock.advance(100);
    m.noteStarted();
    m.noteAttempt();
    clock.advance(100);
    m.noteStarted();
    expect(m.snapshot().avgStartLatencyMs).toBe(100);
  });

  it('only counts failure rate against real attempts', () => {
    const m = new TtsMetricsCollector(() => 0);
    m.noteAttempt();
    m.noteError();
    m.noteAttempt();
    m.noteStarted();
    m.noteFinished();
    expect(m.snapshot().failureRate).toBe(0.5);
  });
});
