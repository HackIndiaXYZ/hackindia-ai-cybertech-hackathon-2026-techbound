// Fallback path preserved even though unreachable in CI - the air-gapped demo build depends on it.
/**
 * Bounded FIFO command queue for avatar animations (Â§6 "gesture queue",
 * Â§9 "queue animations / play sequentially"). Pure data structure â€” ordering,
 * capacity and current-command tracking are testable in isolation; the
 * {@link AvatarAnimationController} decides *when* to advance it.
 */
import type { AvatarAnimationCommand } from '@isl/shared-types';
import { AVATAR } from './constants.js';
import type { AvatarPlaybackState, AvatarQueueSnapshot } from './types.js';

export class GestureQueue {
  private readonly items: AvatarAnimationCommand[] = [];
  private currentCommand: AvatarAnimationCommand | null = null;

  get length(): number {
    return this.items.length;
  }

  get current(): AvatarAnimationCommand | null {
    return this.currentCommand;
  }

  /** Append commands up to the capacity cap; returns how many were accepted. */
  enqueue(commands: readonly AvatarAnimationCommand[]): number {
    let accepted = 0;
    for (const cmd of commands) {
      if (this.items.length >= AVATAR.MAX_QUEUE_LENGTH) break;
      this.items.push(cmd);
      accepted += 1;
    }
    return accepted;
  }

  peek(): AvatarAnimationCommand | null {
    return this.items[0] ?? null;
  }

  /** Pop the next command and mark it current. Null when empty. */
  dequeue(): AvatarAnimationCommand | null {
    this.currentCommand = this.items.shift() ?? null;
    return this.currentCommand;
  }

  /** Drop all pending commands (keeps the current one until playback ends). */
  clear(): void {
    this.items.length = 0;
  }

  /** Drop everything including the current command (used by reset/stop). */
  clearAll(): void {
    this.items.length = 0;
    this.currentCommand = null;
  }

  snapshot(state: AvatarPlaybackState): AvatarQueueSnapshot {
    return {
      state,
      current: this.currentCommand,
      queued: [...this.items],
      length: this.items.length,
    };
  }
}
