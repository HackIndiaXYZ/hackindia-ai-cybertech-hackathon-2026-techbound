import { describe, it, expect } from 'vitest';
import { AvatarPerformanceMonitor } from './perfMonitor.js';
import { FakeAvatarAdapter } from './testFactories.js';

describe('AvatarPerformanceMonitor (§12 measured, never claimed)', () => {
  it('reports null FPS and unmet target with no data', () => {
    const m = new AvatarPerformanceMonitor({ minSamples: 3 });
    expect(m.getFps()).toBeNull();
    expect(m.meetsTarget()).toBe(false);
    expect(m.hasMeasuredData()).toBe(false);
  });

  it('computes a rolling average FPS from measured frame deltas', () => {
    const m = new AvatarPerformanceMonitor({ targetFps: 30, minSamples: 2 });
    // 25 ms per frame => 40 FPS.
    m.record(25);
    m.record(25);
    expect(m.getFps()).toBeCloseTo(40);
    expect(m.meetsTarget()).toBe(true);
  });

  it('ignores non-positive deltas so a stalled loop cannot inflate FPS', () => {
    const m = new AvatarPerformanceMonitor();
    m.record(0);
    m.record(-5);
    m.record(Number.NaN);
    expect(m.getFps()).toBeNull();
  });

  it('bounds the rolling window to the configured size', () => {
    const m = new AvatarPerformanceMonitor({ windowSize: 3 });
    for (let i = 0; i < 10; i += 1) m.record(20);
    expect(m.getSnapshot().samples).toBe(3);
  });

  it('records real frames when attached to an adapter frame stream', () => {
    const adapter = new FakeAvatarAdapter();
    const m = new AvatarPerformanceMonitor({ minSamples: 1 });
    const detach = m.attach(adapter);
    adapter.emitFrame(50); // 20 FPS
    expect(m.getFps()).toBeCloseTo(20);
    detach();
    adapter.emitFrame(50);
    expect(m.getSnapshot().samples).toBe(1); // no longer subscribed
  });

  it('reset clears all retained samples', () => {
    const m = new AvatarPerformanceMonitor();
    m.record(16);
    m.reset();
    expect(m.getFps()).toBeNull();
  });
});
