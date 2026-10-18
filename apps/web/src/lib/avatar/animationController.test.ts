import { describe, it, expect } from 'vitest';
import { AvatarAnimationController } from './animationController.js';
import { FacialExpressionController } from './facialExpression.js';
import { FakeAvatarAdapter, createVirtualScheduler, makeCommand } from './testFactories.js';

function build() {
  const adapter = new FakeAvatarAdapter();
  const vs = createVirtualScheduler();
  const expression = new FacialExpressionController(adapter);
  const controller = new AvatarAnimationController(adapter, expression, { scheduler: vs.schedule });
  return { adapter, vs, controller };
}

describe('AvatarAnimationController (§9 sequencing, race-free)', () => {
  it('plays commands sequentially, advancing only when each duration elapses', () => {
    const { adapter, vs, controller } = build();
    controller.enqueue([
      makeCommand({ animationClipId: 'wave', durationMs: 500, sequenceIndex: 0 }),
      makeCommand({ animationClipId: 'point', durationMs: 300, sequenceIndex: 1 }),
    ]);

    expect(adapter.playedClips.map((p) => p.clipId)).toEqual(['wave']);
    expect(controller.isPlaying()).toBe(true);

    vs.advance(500);
    expect(adapter.playedClips.map((p) => p.clipId)).toEqual(['wave', 'point']);

    vs.advance(300);
    expect(controller.isPlaying()).toBe(false);
    expect(controller.snapshot().state).toBe('idle');
  });

  it('passes transition + placeholder + duration through to the adapter and sets the expression', () => {
    const { adapter, controller } = build();
    controller.enqueue([makeCommand({ animationClipId: 'wave', durationMs: 600, transition: 'cut', isPlaceholder: true, facialExpression: 'emphasis' })]);
    expect(adapter.playedClips[0].options).toEqual({ durationMs: 600, transition: 'cut', placeholder: true });
    expect(adapter.expressionChanges.at(-1)?.emphasis).toBe(1);
  });

  it('skips unknown clip ids safely and reports them (§9)', () => {
    const { adapter, controller } = build();
    const result = controller.enqueue([makeCommand({ animationClipId: 'mystery-sign' })]);
    expect(result.accepted).toBe(0);
    expect(result.rejectedClips).toEqual(['mystery-sign']);
    expect(adapter.playedClips).toHaveLength(0);
    expect(controller.isPlaying()).toBe(false);
  });

  it('stop interrupts the current clip and prevents the queued one from starting', () => {
    const { adapter, vs, controller } = build();
    controller.enqueue([
      makeCommand({ animationClipId: 'wave', durationMs: 500 }),
      makeCommand({ animationClipId: 'point', durationMs: 500 }),
    ]);
    controller.stop();
    vs.advance(10_000);
    expect(adapter.playedClips).toHaveLength(1);
    expect(controller.isPlaying()).toBe(false);
    expect(controller.snapshot().length).toBe(0);
  });

  it('a stale timer cannot advance playback after a stop (no race)', () => {
    const { adapter, vs, controller } = build();
    controller.enqueue([makeCommand({ animationClipId: 'wave', durationMs: 500 }), makeCommand({ animationClipId: 'point' })]);
    controller.stop();
    // Even if the underlying timer were to fire, the token guard ignores it.
    vs.advance(500);
    expect(adapter.playedClips).toHaveLength(1);
  });

  it('reset stops playback and returns the rig to rest', () => {
    const { adapter, controller } = build();
    controller.enqueue([makeCommand({ animationClipId: 'wave', durationMs: 500 })]);
    controller.reset();
    expect(adapter.resetCount).toBe(1);
    expect(controller.isPlaying()).toBe(false);
  });

  it("replace mode interrupts pending commands without touching the running one", () => {
    const { controller, adapter } = build();
    controller.enqueue([
      makeCommand({ animationClipId: 'wave' }),
      makeCommand({ animationClipId: 'point' }),
      makeCommand({ animationClipId: 'open-hands' }),
    ]);
    // wave is playing; point + open-hands are pending.
    const result = controller.enqueue([makeCommand({ animationClipId: 'close-hands' })], 'replace');
    expect(result.accepted).toBe(1);
    expect(controller.snapshot().queued.map((c) => c.animationClipId)).toEqual(['close-hands']);
    expect(adapter.playedClips).toHaveLength(1);
  });
});
