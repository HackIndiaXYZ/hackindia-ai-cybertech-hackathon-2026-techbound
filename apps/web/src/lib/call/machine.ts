import type { CallState } from '@isl/shared-types';
import type { PeerConnectionStatus } from '../webrtc/peer.js';

/**
 * Pure call state machine (plan §12). The UI is driven entirely by this
 * explicit transition table so a user always knows the real connection state
 * — we never render "connected" unless a peer channel is genuinely open.
 *
 * Kept free of any browser/WebRTC types so it can be unit-tested with
 * deterministic inputs (§12 "deterministic mocks").
 */

export type CallEvent =
  | { type: 'START' } // user initiates/accepts a session (idle -> connecting)
  | { type: 'RING' } // an inbound offer arrived before we are up (-> ringing)
  | { type: 'ACCEPT' } // ringing accepted (ringing -> connecting)
  | { type: 'CONNECTED' } // at least one peer channel open (-> connected)
  | { type: 'RECONNECTING' } // a live peer dropped, auto-retry in progress
  | { type: 'RECONNECTED' } // retry succeeded (reconnecting -> connected)
  | { type: 'DISCONNECTED' } // link lost with no retry pending
  | { type: 'FAILED'; reason?: string } // unrecoverable error
  | { type: 'ENDED'; reason?: string }; // call ended intentionally

const TRANSITIONS: Record<CallState, Partial<Record<CallEvent['type'], CallState>>> = {
  idle: {
    START: 'connecting',
    RING: 'ringing',
    FAILED: 'failed',
  },
  connecting: {
    CONNECTED: 'connected',
    RING: 'ringing',
    RECONNECTING: 'reconnecting',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    ENDED: 'ended',
  },
  ringing: {
    ACCEPT: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    ENDED: 'ended',
  },
  connected: {
    RECONNECTING: 'reconnecting',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    ENDED: 'ended',
  },
  reconnecting: {
    CONNECTED: 'connected',
    RECONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    FAILED: 'failed',
    ENDED: 'ended',
  },
  disconnected: {
    START: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed',
    ENDED: 'ended',
  },
  failed: {
    // A failure is recoverable only by an explicit new attempt.
    START: 'connecting',
    ENDED: 'ended',
  },
  ended: {
    START: 'connecting', // allow re-dial from the ended screen
  },
};

/** Terminal states stop timers and tear down media. */
export function isTerminalCallState(state: CallState): boolean {
  return state === 'ended' || state === 'failed';
}

/**
 * Resolve the next state for an event. Unknown transitions are ignored (the
 * state is returned unchanged) so stray/late events can never corrupt the UI.
 */
export function nextCallState(current: CallState, event: CallEvent): CallState {
  return TRANSITIONS[current][event.type] ?? current;
}

/**
 * Collapse *all* peer connection statuses into one honest call event (Phase
 * 4B). Dispatching straight from a single peer flapped the whole call in a
 * group (peer B going `connecting` after peer A's drop erased
 * 'reconnecting'). The rules: everything connected → CONNECTED; at least one
 * live and at least one down → RECONNECTING; none live and every known peer
 * down → DISCONNECTED; still setting up (nothing down, nothing connected) →
 * no event, keep whatever the machine already says.
 */
export function aggregateCallEvent(
  statuses: readonly PeerConnectionStatus[],
): Extract<CallEvent, { type: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' }> | null {
  if (statuses.length === 0) return null;
  if (statuses.every((s) => s === 'connected')) return { type: 'CONNECTED' };
  const anyDown = statuses.some((s) => s === 'disconnected' || s === 'failed');
  const anyConnected = statuses.some((s) => s === 'connected');
  if (anyDown && anyConnected) return { type: 'RECONNECTING' };
  if (
    !anyConnected &&
    statuses.every((s) => s === 'disconnected' || s === 'failed' || s === 'closed')
  ) {
    return { type: 'DISCONNECTED' };
  }
  return null;
}

/** Human-facing, non-color-only label for a call state (§28). */
export function callStateLabel(state: CallState): string {
  return {
    idle: 'Ready to start',
    connecting: 'Connecting…',
    ringing: 'Incoming call',
    connected: 'Connected',
    reconnecting: 'Reconnecting…',
    disconnected: 'Connection lost',
    failed: 'Call failed',
    ended: 'Call ended',
  }[state];
}

/** Map a call state to a StatusIndicator tone (never color-only; see §28). */
export type CallTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_BY_STATE: Record<CallState, CallTone> = {
  idle: 'neutral',
  connecting: 'info',
  ringing: 'info',
  connected: 'success',
  reconnecting: 'warning',
  disconnected: 'warning',
  failed: 'danger',
  ended: 'neutral',
};

export function callStateTone(state: CallState): CallTone {
  return TONE_BY_STATE[state];
}
