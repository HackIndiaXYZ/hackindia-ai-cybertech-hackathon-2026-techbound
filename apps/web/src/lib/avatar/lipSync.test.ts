import { describe, it, expect } from 'vitest';
import { LipSyncController, smoothMouthOpen } from './lipSync.js';
import { FakeAvatarAdapter } from './testFactories.js';

describe('smoothMouthOpen (rough lip-sync math)', () => {
  it('moves a fraction alpha toward the target', () => {
    expect(smoothMouthOpen(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothMouthOpen(0.3, 1, 1)).toBeCloseTo(1);
    expect(smoothMouthOpen(0.3, 1, 0)).toBeCloseTo(0.3);
  });

  it('clamps out-of-range inputs into 0..1', () => {
    expect(smoothMouthOpen(0, 5, 1)).toBe(1);
    expect(smoothMouthOpen(-2, 0.5, 1)).toBeCloseTo(0.5);
  });
});

describe('LipSyncController (§6, explicitly rough)', () => {
  it('smooths toward a loud sample over successive pushes and feeds the adapter', () => {
    const adapter = new FakeAvatarAdapter();
    const ctrl = new LipSyncController(adapter, { alpha: 0.5 });
    const first = ctrl.push(1);
    expect(first).toBeCloseTo(0.5);
    const second = ctrl.push(1);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(1);
    expect(adapter.mouthValues.length).toBe(2);
  });

  it('treats sub-threshold samples as silence and closes the mouth', () => {
    const ctrl = new LipSyncController(undefined, { alpha: 1, silenceThreshold: 0.1 });
    ctrl.push(0.8);
    expect(ctrl.push(0.05)).toBe(0);
  });

  it('reset returns the mouth fully closed', () => {
    const ctrl = new LipSyncController(undefined, { alpha: 1 });
    ctrl.push(0.9);
    expect(ctrl.reset()).toBeUndefined();
    expect(ctrl.getValue()).toBe(0);
  });
});
