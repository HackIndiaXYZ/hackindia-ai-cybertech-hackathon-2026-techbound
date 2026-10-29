import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ActiveSpeakerPayload } from '@isl/shared-types';
import { callStarted } from './callSlice.js';

/**
 * Who is speaking right now (plan §19 item 3). Kept separate from callSlice so
 * the ~50ms VAD cadence never re-render participant/metadata consumers.
 *
 * Facts arrive only via relayed `participant:active-speaker` events. The
 * claim's origin (`decidedBy`) is validated in useCall: a host-forced mute
 * disables the target's own microphone there, so a muted participant cannot
 * keep self-reporting as active — the ring follows real audio, not optimism.
 */

export interface ActiveSpeakerState {
  /** userIds currently marked active. Multiple may speak at once in a group. */
  speaking: Record<string, boolean>;
  /** Most recently active user; drives the spotlight tile when several overlap. */
  lastActiveUserId: string | null;
}

export const initialState: ActiveSpeakerState = {
  speaking: {},
  lastActiveUserId: null,
};

const slice = createSlice({
  name: 'activeSpeaker',
  initialState,
  reducers: {
    activeSpeakerUpdated(state, action: PayloadAction<ActiveSpeakerPayload>) {
      const { userId, active } = action.payload;
      if (active) {
        state.speaking[userId] = true;
        state.lastActiveUserId = userId;
      } else {
        delete state.speaking[userId];
        if (state.lastActiveUserId === userId) {
          const remaining = Object.keys(state.speaking);
          state.lastActiveUserId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
      }
    },
    /** A participant left: nobody keeps speaking for them. */
    speakerCleared(state, action: PayloadAction<string>) {
      delete state.speaking[action.payload];
      if (state.lastActiveUserId === action.payload) state.lastActiveUserId = null;
    },
  },
  extraReducers: (builder) => {
    // A new call starts with silence.
    builder.addCase(callStarted, () => initialState);
  },
});

export const { activeSpeakerUpdated, speakerCleared } = slice.actions;
export default slice.reducer;
