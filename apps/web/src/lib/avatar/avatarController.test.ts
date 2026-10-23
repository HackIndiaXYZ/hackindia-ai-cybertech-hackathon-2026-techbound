import { describe, it, expect } from 'vitest';
import type { AvatarCommandPayload, IslConcept } from '@isl/shared-types';
import { AvatarController } from './avatarController.js';
import { FakeAvatarAdapter, createVirtualScheduler } from './testFactories.js';
import { PLACEHOLDER_CLIPS, SAMPLE_SEQUENCE_GESTURE_IDS } from './constants.js';

function build() {
  const adapter = new FakeAvatarAdapter();
  const vs = createVirtualScheduler();
  const controller = new AvatarController(adapter, { scheduler: vs.schedule, perf: { minSamples: 2 } });
  return { adapter, vs, controller };
}

function makeConcept(): IslConcept {
  return {
    conceptId: 'c1',
    sourceText: 'hello there',
    normalizedMeaning: 'greeting',
    gestureIds: ['sign-thank', 'nonexistent-sign'],
    ordering: 0,
    confidence: 0.5,
    facialExpression: 'affirmative',
    timingMs: 400,
  };
}

describe('AvatarController (§17 facade over a fake rig)', () => {
  it('plays a known gesture immediately and drives expression', () => {
    const { adapter, controller } = build();
    const result = controller.playGesture('wave');
    expect(result.accepted).toBe(1);
    expect(adapter.playedClips[0].clipId).toBe('wave');
    expect(adapter.expressionChanges.length).toBeGreaterThan(0);
  });

  it('reports an unknown gesture without animating anything', () => {
    const { adapter, controller } = build();
    const result = controller.playGesture('not-a-sign');
    expect(result.unrecognized).toEqual(['not-a-sign']);
    expect(result.accepted).toBe(0);
    expect(adapter.playedClips).toHaveLength(0);
  });

  it('plays the full sample sequence in order as time advances', () => {
    const { adapter, vs, controller } = build();
    const result = controller.playSampleSequence();
    expect(result.accepted).toBe(SAMPLE_SEQUENCE_GESTURE_IDS.length);
    const started = adapter.playedClips.map((p) => p.clipId);
    // First clip starts now; advance enough to drain the whole queue.
    for (let i = 0; i < SAMPLE_SEQUENCE_GESTURE_IDS.length + 1; i += 1) vs.advance(5_000);
    const order = adapter.playedClips.map((p) => p.clipId);
    expect(order.length).toBe(SAMPLE_SEQUENCE_GESTURE_IDS.length);
    expect(order.every((clip) => PLACEHOLDER_CLIPS.includes(clip as never))).toBe(true);
    expect(started[0]).toBe(order[0]);
    expect(controller.isPlaying()).toBe(false);
  });

  it('validates and queues a raw avatar:command payload, dropping invalid commands (§7)', () => {
    const { adapter, controller } = build();
    const payload: AvatarCommandPayload = {
      participantUserId: 'peer-1',
      commands: [
        { gestureId: 'wave', animationClipId: 'wave', facialExpression: 'neutral', durationMs: 500, transition: 'crossfade', sequenceIndex: 0, isPlaceholder: true },
        { gestureId: 'bad', animationClipId: '', facialExpression: 'neutral', durationMs: 500, transition: 'blend', sequenceIndex: 1, isPlaceholder: true },
      ],
    };
    const result = controller.handleCommandPayload(payload);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toEqual([{ index: 1, reason: 'invalid-clip-id' }]);
    expect(adapter.playedClips).toHaveLength(1);
  });

  it('maps a translated concept into queued commands and surfaces unrecognized gestures', () => {
    const { controller } = build();
    const result = controller.enqueueConcept(makeConcept());
    expect(result.accepted).toBe(2);
    expect(result.unrecognized).toEqual(['nonexistent-sign']);
  });

  it('measures FPS from real adapter frames once enough samples accrue', () => {
    const { adapter, controller } = build();
    adapter.emitFrame(25);
    expect(controller.perfSnapshot().fps).toBeNull();
    adapter.emitFrame(25);
    expect(controller.perfSnapshot().fps).toBeCloseTo(40);
  });

  it('reset stops playback, clears the queue and tears down on dispose', () => {
    const { adapter, controller } = build();
    controller.playSequence(['wave', 'point']);
    controller.reset();
    expect(controller.queueSnapshot().state).toBe('idle');
    expect(adapter.resetCount).toBeGreaterThan(0);
    controller.dispose();
    expect(adapter.disposeCount).toBe(1);
  });
});
