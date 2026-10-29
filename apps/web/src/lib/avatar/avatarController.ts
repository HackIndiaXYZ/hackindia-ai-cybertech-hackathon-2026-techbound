/**
 * High-level avatar facade and the single integration point for Phase 3A
 * (plan §17 architecture chain: Viewer → CommandAdapter → AnimationController →
 * Rig → Loader → Babylon). It wires the gesture mapper, animation controller,
 * expression/lip-sync controllers and the performance monitor over one render
 * adapter, and exposes intent-level actions (play a gesture, a sequence, feed an
 * ISL concept, or apply a raw avatar:command payload).
 *
 * Nothing here touches Babylon/WebGL directly — that is the adapter's job — so
 * the entire surface is exercised by deterministic unit tests with a fake rig.
 */
import type { AvatarAnimationCommand, AvatarCommandPayload, FacialExpression, IslConcept } from '@isl/shared-types';
import { SAMPLE_SEQUENCE_GESTURE_IDS } from './constants.js';
import { GestureMapper } from './gestureMapper.js';
import { AvatarAnimationController, type EnqueueResult } from './animationController.js';
import { FacialExpressionController } from './facialExpression.js';
import { LipSyncController, type LipSyncOptions } from './lipSync.js';
import { AvatarPerformanceMonitor, type PerfMonitorOptions, type PerfSnapshot } from './perfMonitor.js';
import { adaptAvatarCommandPayload, type AdaptedPayload } from './commandAdapter.js';
import type { AvatarQueueSnapshot, AvatarRenderAdapter, Scheduler } from './types.js';

export interface PlayResult extends EnqueueResult {
  /** Gesture ids with no registered clip — reported, never fabricated. */
  unrecognized: string[];
}

export interface AvatarControllerOptions {
  scheduler?: Scheduler;
  onStateChange?: (snapshot: AvatarQueueSnapshot) => void;
  lipSync?: LipSyncOptions;
  perf?: PerfMonitorOptions;
}

export class AvatarController {
  readonly mapper: GestureMapper;
  readonly animation: AvatarAnimationController;
  readonly expression: FacialExpressionController;
  readonly lipSync: LipSyncController;
  readonly perf: AvatarPerformanceMonitor;

  private readonly detachFrames: () => void;

  constructor(private readonly adapter: AvatarRenderAdapter, options: AvatarControllerOptions = {}) {
    this.mapper = new GestureMapper();
    this.expression = new FacialExpressionController(adapter);
    this.animation = new AvatarAnimationController(adapter, this.expression, {
      scheduler: options.scheduler,
      onStateChange: options.onStateChange,
    });
    this.lipSync = new LipSyncController(adapter, options.lipSync);
    this.perf = new AvatarPerformanceMonitor(options.perf);
    this.detachFrames = this.perf.attach(adapter);
  }

  getRig() {
    return this.adapter.rig;
  }

  isPlaying(): boolean {
    return this.animation.isPlaying();
  }

  playGesture(gestureId: string, mode: 'append' | 'replace' = 'replace'): PlayResult {
    const { descriptor, recognized } = this.mapper.resolve(gestureId);
    if (!recognized) return { accepted: 0, rejectedClips: [], unrecognized: [gestureId] };
    const result = this.animation.enqueue([this.mapper.toCommand(descriptor.gestureId)], mode);
    return { ...result, unrecognized: [] };
  }

  playSequence(gestureIds: readonly string[]): PlayResult {
    const unrecognized = gestureIds.filter((id) => !this.mapper.resolve(id).recognized);
    const known = gestureIds.filter((id) => this.mapper.resolve(id).recognized);
    const result = this.animation.enqueue(this.mapper.toSequence(known), 'replace');
    return { ...result, unrecognized };
  }

  playSampleGesture(): PlayResult {
    return this.playGesture('wave', 'replace');
  }

  playSampleSequence(): PlayResult {
    return this.playSequence(SAMPLE_SEQUENCE_GESTURE_IDS);
  }

  /** Phase 3A path: an ISL concept's gestures become queued commands. */
  enqueueConcept(concept: IslConcept): PlayResult {
    const { commands, unrecognized } = this.mapper.fromConcept(concept);
    const result = this.animation.enqueue(commands, 'append');
    return { ...result, unrecognized };
  }

  /**
   * Phase 3A batch path: an ordered list of concepts (a whole intermediate
   * representation) becomes one command sequence with a running sequence index,
   * so a fresh translation can replace the previous pose in a single enqueue.
   */
  enqueueConcepts(concepts: readonly IslConcept[], mode: 'append' | 'replace' = 'replace'): PlayResult {
    const commands: AvatarAnimationCommand[] = [];
    const unrecognized: string[] = [];
    for (const concept of concepts) {
      const mapped = this.mapper.fromConcept(concept, commands.length);
      commands.push(...mapped.commands);
      unrecognized.push(...mapped.unrecognized);
    }
    const result = this.animation.enqueue(commands, mode);
    return { ...result, unrecognized };
  }

  /** Existing-contract path: validate + queue a raw avatar:command payload (§7). */
  handleCommandPayload(payload: AvatarCommandPayload): AdaptedPayload & PlayResult {
    const adapted = adaptAvatarCommandPayload(payload);
    const result = this.animation.enqueue(adapted.commands, 'append');
    return { ...adapted, ...result, unrecognized: [] };
  }

  setExpression(expression: FacialExpression): void {
    this.expression.setExpression(expression);
  }

  /** Feed one lip-sync amplitude sample (synthetic in Phase 2D). */
  pushLipSyncSample(sample: number): number {
    return this.lipSync.push(sample);
  }

  stop(): void {
    this.animation.stop();
  }

  reset(): void {
    this.animation.reset();
    this.lipSync.reset();
    this.perf.reset();
  }

  queueSnapshot(): AvatarQueueSnapshot {
    return this.animation.snapshot();
  }

  perfSnapshot(): PerfSnapshot {
    return this.perf.getSnapshot();
  }

  dispose(): void {
    this.detachFrames();
    this.animation.dispose();
    this.adapter.dispose();
  }
}
