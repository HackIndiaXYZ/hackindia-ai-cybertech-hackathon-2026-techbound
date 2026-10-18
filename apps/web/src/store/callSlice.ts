import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CallState, ParticipantRole, ParticipantJoinedPayload } from '@isl/shared-types';
import { nextCallState, type CallEvent } from '../lib/call/machine.js';
import type { PeerConnectionStatus } from '../lib/webrtc/peer.js';
import type { ReconnectAttemptInfo } from '../lib/webrtc/reconnectPolicy.js';

/**
 * Call feature state (plan §12, §19). Holds only serializable, UI-facing state:
 * the state machine value, participant metadata, controls, text-fallback
 * messages and timing. MediaStream objects are intentionally kept in refs
 * inside the useCall hook — they must never enter the Redux store.
 *
 * Phase 3D adds group authority facts: `selfRole` (this user's role in *this*
 * session, resolved from the server join response — never guessed) and
 * `hostUserId` (who currently holds moderation). Both are display/UX inputs
 * only; the server re-authorizes every moderation command regardless of what
 * the client believes (§25).
 */

export interface ParticipantUiState {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  muted: boolean;
  cameraOn: boolean;
  status: PeerConnectionStatus;
  quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
  /**
   * Bounded ICE-restart accounting for this peer (Phase 4B). Present only
   * while recovery is in flight or after an honest give-up; cleared the
   * moment the channel is genuinely connected again.
   */
  reconnect?: ReconnectAttemptInfo | null;
}

export interface CallMessage {
  id: string;
  senderUserId: string;
  body: string;
  sentAt: string;
}

/** A transient, dismissible room notice (moderation feedback, host changes). */
export interface CallNotice {
  tone: 'info' | 'warning' | 'danger';
  message: string;
}

export interface CallSliceState {
  state: CallState;
  sessionId: string | null;
  selfUserId: string | null;
  /** This user's role in the current session, from the server's join answer. */
  selfRole: ParticipantRole;
  /** Who currently holds moderation authority, when the room has told us. */
  hostUserId: string | null;
  /**
   * Persistence posture for this call (Phase 4A, §22): 'unknown' until the
   * server's consent state has been read; 'prompt' when nothing is granted so
   * the UI can ask once; 'on' while artefacts are being written; 'off' when
   * declined or the consent state could not be verified — never persist on
   * uncertainty.
   */
  persistence: 'unknown' | 'prompt' | 'on' | 'off';
  participants: Record<string, ParticipantUiState>;
  messages: CallMessage[];
  notice: CallNotice | null;
  micOn: boolean;
  cameraOn: boolean;
  durationSec: number;
  mediaError: string | null;
  lastError: string | null;
}

export const initialState: CallSliceState = {
  state: 'idle',
  sessionId: null,
  selfUserId: null,
  selfRole: 'member',
  hostUserId: null,
  persistence: 'unknown',
  participants: {},
  messages: [],
  notice: null,
  micOn: true,
  cameraOn: true,
  durationSec: 0,
  mediaError: null,
  lastError: null,
};

const slice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    callStarted(state, action: PayloadAction<{ sessionId: string; selfUserId: string }>) {
      Object.assign(state, initialState);
      state.state = 'connecting';
      state.sessionId = action.payload.sessionId;
      state.selfUserId = action.payload.selfUserId;
    },
    /** Route every lifecycle change through the pure state machine. */
    callEvent(state, action: PayloadAction<CallEvent>) {
      state.state = nextCallState(state.state, action.payload);
      if (action.payload.type === 'ENDED' || action.payload.type === 'FAILED') {
        if ('reason' in action.payload && action.payload.reason) {
          state.lastError = action.payload.reason;
        }
      }
    },
    participantJoined(state, action: PayloadAction<ParticipantJoinedPayload>) {
      const { userId, displayName, role, muted, cameraOn } = action.payload;
      const existing = state.participants[userId];
      if (existing) {
        // Re-join / host promotion: refresh facts without resetting live status.
        existing.displayName = displayName;
        existing.role = role;
        if (muted !== undefined) existing.muted = muted;
        if (cameraOn !== undefined) existing.cameraOn = cameraOn;
      } else {
        state.participants[userId] = {
          userId,
          displayName,
          role,
          muted: muted ?? false,
          cameraOn: cameraOn ?? true,
          status: 'new',
        };
      }
      if (role === 'host') {
        state.hostUserId = userId;
        state.selfRole = userId === state.selfUserId ? 'host' : 'member';
      }
    },
    participantLeft(state, action: PayloadAction<{ userId: string }>) {
      const { userId } = action.payload;
      delete state.participants[userId];
      if (state.hostUserId === userId) state.hostUserId = null; // until the room promotes someone
    },
    participantMuted(state, action: PayloadAction<{ userId: string; muted: boolean }>) {
      const p = state.participants[action.payload.userId];
      if (p) p.muted = action.payload.muted;
    },
    participantCamera(state, action: PayloadAction<{ userId: string; cameraOn: boolean }>) {
      const p = state.participants[action.payload.userId];
      if (p) p.cameraOn = action.payload.cameraOn;
    },
    participantStatus(state, action: PayloadAction<{ userId: string; status: PeerConnectionStatus }>) {
      const p = state.participants[action.payload.userId];
      if (p) {
        p.status = action.payload.status;
        // A live channel ends the recovery story; the tile stops counting.
        if (action.payload.status === 'connected') p.reconnect = null;
      }
    },
    participantReconnect(state, action: PayloadAction<{ userId: string } & ReconnectAttemptInfo>) {
      const p = state.participants[action.payload.userId];
      if (p) {
        p.reconnect = { attempt: action.payload.attempt, maxAttempts: action.payload.maxAttempts, exhausted: action.payload.exhausted };
      }
    },
    participantQuality(state, action: PayloadAction<{ userId: string; quality: ParticipantUiState['quality'] }>) {
      const p = state.participants[action.payload.userId];
      if (p) p.quality = action.payload.quality;
    },
    messageReceived(state, action: PayloadAction<CallMessage>) {
      if (!state.messages.some((m) => m.id === action.payload.id)) {
        state.messages.push(action.payload);
      }
    },
    mediaToggled(state, action: PayloadAction<Partial<Pick<CallSliceState, 'micOn' | 'cameraOn'>>>) {
      Object.assign(state, action.payload);
    },
    /** Server-declared authority for this user; never inferred client-side. */
    selfRoleSet(state, action: PayloadAction<{ selfRole: ParticipantRole; hostUserId: string | null }>) {
      state.selfRole = action.payload.selfRole;
      state.hostUserId = action.payload.hostUserId;
    },
    persistenceSet(state, action: PayloadAction<CallSliceState['persistence']>) {
      state.persistence = action.payload;
    },
    noticeSet(state, action: PayloadAction<CallNotice | null>) {
      state.notice = action.payload;
    },
    mediaErrorSet(state, action: PayloadAction<string | null>) {
      state.mediaError = action.payload;
    },
    durationTicked(state) {
      state.durationSec += 1;
    },
    callReset() {
      return initialState;
    },
  },
});

export const {
  callStarted,
  callEvent,
  participantJoined,
  participantLeft,
  participantMuted,
  participantCamera,
  participantStatus,
  participantQuality,
  participantReconnect,
  messageReceived,
  mediaToggled,
  selfRoleSet,
  persistenceSet,
  noticeSet,
  mediaErrorSet,
  durationTicked,
  callReset,
} = slice.actions;

export default slice.reducer;
