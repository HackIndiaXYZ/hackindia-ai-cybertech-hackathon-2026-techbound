/**
 * The clean, explicit state machine for the Phase 3C standalone translator
 * (VIBECODER_MASTER_PLAN.md §18). It is deliberately small and side-effect-free:
 * it only decides the next {@link StandaloneState} from the current state plus an
 * event, and notifies subscribers. All real work (dictation, translation, avatar)
 * stays in the seams it orchestrates — the machine never touches media itself, so
 * it is trivially unit-testable in isolation.
 *
 * Transition discipline: an event that is not valid from the current state is
 * ignored (returns false, no state change). That keeps the UI honest about what
 * phase it is actually in and prevents stray callbacks from corrupting it.
 */
import type { StandaloneEvent, StandaloneState } from './types.js';

export type StateListener = (state: StandaloneState) => void;

/** Guard: can this state be paused from? Transient/active pipeline states can. */
const PAUSABLE: ReadonlySet<StandaloneState> = new Set<StandaloneState>([
  'listening',
  'processing',
  'translating',
  'rendering',
]);

export class StandaloneMachine {
  private state: StandaloneState = 'idle';
  /** Where RESUME returns to. The pipeline resumes capture, so it is 'listening'. */
  private resumeTo: StandaloneState = 'listening';
  private readonly listeners = new Set<StateListener>();

  getState(): StandaloneState {
    return this.state;
  }

  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Feed one event. Returns true when it caused a transition, false when the
   * event was not valid from the current state (and was therefore ignored).
   */
  dispatch(event: StandaloneEvent): boolean {
    const next = this.nextState(this.state, event);
    if (!next || next === this.state) return false;
    if (event.type === 'PAUSE') this.resumeTo = 'listening';
    this.state = next;
    this.notify();
    return true;
  }

  /** Pure transition function: the single source of truth for allowed edges. */
  private nextState(current: StandaloneState, event: StandaloneEvent): StandaloneState | null {
    // STOP is a global reset to idle from anywhere except already-idle.
    if (event.type === 'STOP') return current === 'idle' ? null : 'idle';

    switch (current) {
      case 'idle':
        switch (event.type) {
          case 'START':
            return 'listening';
          case 'ERROR':
            return 'error';
          default:
            return null;
        }

      case 'listening':
        switch (event.type) {
          case 'INTERIM':
            return 'processing';
          case 'FINAL':
            return 'translating';
          case 'PAUSE':
            return 'paused';
          case 'ERROR':
            return 'error';
          default:
            return null;
        }

      case 'processing':
        switch (event.type) {
          case 'INTERIM':
            return 'processing';
          case 'FINAL':
            return 'translating';
          case 'PAUSE':
            return 'paused';
          case 'ERROR':
            return 'error';
          default:
            return null;
        }

      case 'translating':
        switch (event.type) {
          case 'TRANSLATED':
            return 'rendering';
          case 'PAUSE':
            return 'paused';
          case 'ERROR':
            return 'error';
          default:
            return null;
        }

      case 'rendering':
        switch (event.type) {
          case 'RENDERED':
            return 'listening';
          case 'PAUSE':
            return 'paused';
          case 'ERROR':
            return 'error';
          default:
            return null;
        }

      case 'paused':
        switch (event.type) {
          case 'RESUME':
            return this.resumeTo;
          case 'ERROR':
            return 'error';
          default:
            return null;
        }

      case 'error':
        switch (event.type) {
          case 'START':
            return 'listening';
          case 'RESUME':
            return 'idle';
          default:
            return null;
        }

      default:
        return null;
    }
  }

  /** PAUSE is only meaningful from an active pipeline state. */
  canPause(): boolean {
    return PAUSABLE.has(this.state);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
