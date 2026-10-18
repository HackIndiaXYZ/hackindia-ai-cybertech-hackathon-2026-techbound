/**
 * Framework-independent animation controller (§9, plan "AnimationController").
 * It accepts validated commands, queues them, plays them sequentially, applies
 * the transition + facial expression through the render adapter, advances on a
 * real (injectable) timer, and handles stop/reset/interrupt without races.
 * Babylon-specific work lives *below* the adapter, never here.
 *
 * Unknown animation names fail safely: a command whose clip the mounted rig
 * cannot animate is skipped and reported rather than silently mishandled.
 */
import type { AvatarAnimationCommand } from '@isl/shared-types';
import { GestureQueue } from './animationQueue.js';
import type { FacialExpressionController } from './facialExpression.js';
import { realScheduler } from './util.js';
import type { AvatarQueueSnapshot, AvatarRenderAdapter, Scheduler } from './types.js';

export interface EnqueueResult {
  accepted: number;
  /** Clip ids skipped because the mounted rig does not support them (§9). */
  rejectedClips: string[];
}

export interface AnimationControllerOptions {
  scheduler?: Scheduler;
  onStateChange?: (snapshot: AvatarQueueSnapshot) => void;
}

export class AvatarAnimationController {
  private readonly queue = new GestureQueue();
  private readonly scheduler: Scheduler;
  private cancelCurrentTimer: (() => void) | null = null;
  private playToken = 0;
  private playing = false;

  constructor(
    private readonly adapter: AvatarRenderAdapter,
    private readonly expression?: FacialExpressionController,
    private readonly options: AnimationControllerOptions = {},
  ) {
    this.scheduler = options.scheduler ?? realScheduler;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  snapshot(): AvatarQueueSnapshot {
    return this.queue.snapshot(this.playing ? 'playing' : 'idle');
  }

  /**
   * Add commands to the queue. `mode: 'replace'` clears pending commands first
   * (an explicit interrupt); `append` (default) chains onto the current queue.
   */
  enqueue(commands: readonly AvatarAnimationCommand[], mode: 'append' | 'replace' = 'append'): EnqueueResult {
    if (mode === 'replace') this.queue.clear();

    const supported = new Set(this.adapter.getSupportedClips());
    const accepted: AvatarAnimationCommand[] = [];
    const rejectedClips: string[] = [];

    for (const cmd of commands) {
      if (supported.has(cmd.animationClipId)) accepted.push(cmd);
      else rejectedClips.push(cmd.animationClipId);
    }

    const count = this.queue.enqueue(accepted);
    this.emit();
    if (!this.playing) this.pump();
    return { accepted: count, rejectedClips };
  }

  /** Interrupt all playback (current + pending) but leave the rig pose intact. */
  stop(): void {
    this.invalidate();
    this.queue.clearAll();
    this.playing = false;
    this.emit();
  }

  /** Stop playback and return the rig to its rest pose + neutral face. */
  reset(): void {
    this.stop();
    this.adapter.reset();
    this.expression?.reset();
  }

  dispose(): void {
    this.invalidate();
    this.playing = false;
    this.queue.clearAll();
  }

  /** Dequeue and play the next command, or finish when the queue empties. */
  private pump(): void {
    const next = this.queue.dequeue();
    if (!next) {
      this.playing = false;
      this.emit();
      return;
    }
    this.playing = true;
    this.emit();

    this.adapter.playClip(next.animationClipId, {
      durationMs: next.durationMs,
      transition: next.transition,
      placeholder: next.isPlaceholder,
    });
    this.expression?.setExpression(next.facialExpression);

    // Token guards against a stale timer firing after stop/reset/new playback.
    const token = ++this.playToken;
    this.cancelCurrentTimer = this.scheduler(() => {
      if (token !== this.playToken) return; // superseded — ignore
      this.cancelCurrentTimer = null;
      this.pump();
    }, next.durationMs);
  }

  private invalidate(): void {
    this.playToken += 1; // invalidate any pending scheduled advance
    this.cancelCurrentTimer?.();
    this.cancelCurrentTimer = null;
  }

  private emit(): void {
    this.options.onStateChange?.(this.snapshot());
  }
}
