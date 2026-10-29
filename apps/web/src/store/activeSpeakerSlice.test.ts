import { describe, it, expect } from 'vitest';
import reducer, {
  initialState,
  activeSpeakerUpdated,
  speakerCleared,
} from './activeSpeakerSlice.js';
import { callStarted } from './callSlice.js';
import type { ActiveSpeakerPayload } from '@isl/shared-types';

const claim = (userId: string, active: boolean, decidedBy: ActiveSpeakerPayload['decidedBy'] = 'self'): ActiveSpeakerPayload => ({
  userId,
  active,
  decidedBy,
});

/** Active-speaker slice (plan §19 item 3): relayed claims only, no timers. */
describe('activeSpeakerSlice (§19)', () => {
  it('marks a speaker active and records the most recent one', () => {
    let s = reducer(initialState, activeSpeakerUpdated(claim('u1', true)));
    expect(s.speaking.u1).toBe(true);
    expect(s.lastActiveUserId).toBe('u1');
    s = reducer(s, activeSpeakerUpdated(claim('u2', true)));
    expect(s.lastActiveUserId).toBe('u2');
  });

  it('supports multiple simultaneous speakers in a group', () => {
    let s = reducer(initialState, activeSpeakerUpdated(claim('u1', true)));
    s = reducer(s, activeSpeakerUpdated(claim('u2', true)));
    s = reducer(s, activeSpeakerUpdated(claim('u1', false)));
    expect(Object.keys(s.speaking)).toEqual(['u2']);
    // Falling back to a remaining speaker beats claiming nobody is active.
    expect(s.lastActiveUserId).toBe('u2');
  });

  it('honours host-forced inactive claims', () => {
    let s = reducer(initialState, activeSpeakerUpdated(claim('u1', true)));
    s = reducer(s, activeSpeakerUpdated(claim('u1', false, 'host')));
    expect(s.speaking.u1).toBeUndefined();
    expect(s.lastActiveUserId).toBeNull();
  });

  it('clears a departing participant', () => {
    let s = reducer(initialState, activeSpeakerUpdated(claim('u1', true)));
    s = reducer(s, speakerCleared('u1'));
    expect(s.speaking).toEqual({});
    expect(s.lastActiveUserId).toBeNull();
  });

  it('resets with a fresh call', () => {
    let s = reducer(initialState, activeSpeakerUpdated(claim('u1', true)));
    s = reducer(s, callStarted({ sessionId: 's2', selfUserId: 'u9' }));
    expect(s).toEqual(initialState);
  });
});
