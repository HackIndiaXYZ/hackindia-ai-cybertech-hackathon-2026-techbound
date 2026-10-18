import { describe, it, expect } from 'vitest';
import reducer, {
  initialState,
  callStarted,
  callEvent,
  participantJoined,
  participantLeft,
  participantMuted,
  participantStatus,
  participantReconnect,
  messageReceived,
  mediaToggled,
  selfRoleSet,
  persistenceSet,
  noticeSet,
} from './callSlice.js';

/** Call slice reducer (plan §12) — serializable UI state only. */
describe('callSlice reducer (§12)', () => {
  it('starts a call in the connecting state with self + session recorded', () => {
    const s = reducer(initialState, callStarted({ sessionId: 's1', selfUserId: 'u1' }));
    expect(s.state).toBe('connecting');
    expect(s.sessionId).toBe('s1');
    expect(s.selfUserId).toBe('u1');
  });

  it('routes lifecycle changes through the state machine', () => {
    let s = reducer(initialState, callStarted({ sessionId: 's1', selfUserId: 'u1' }));
    s = reducer(s, callEvent({ type: 'CONNECTED' }));
    expect(s.state).toBe('connected');
    s = reducer(s, callEvent({ type: 'ENDED' }));
    expect(s.state).toBe('ended');
  });

  it('adds, updates and removes participants without duplicates', () => {
    let s = reducer(initialState, participantJoined({ userId: 'u2', displayName: 'Bob', role: 'member' }));
    s = reducer(s, participantJoined({ userId: 'u2', displayName: 'Bob again', role: 'member' }));
    expect(Object.keys(s.participants)).toHaveLength(1);
    expect(s.participants.u2.displayName).toBe('Bob again');
    s = reducer(s, participantMuted({ userId: 'u2', muted: true }));
    expect(s.participants.u2.muted).toBe(true);
    s = reducer(s, participantLeft({ userId: 'u2' }));
    expect(s.participants.u2).toBeUndefined();
  });

  it('starts a group call with truthful defaults and applies persisted presence', () => {
    let s = reducer(initialState, callStarted({ sessionId: 's1', selfUserId: 'u1' }));
    expect(s.selfRole).toBe('member');
    expect(s.hostUserId).toBeNull();
    s = reducer(
      s,
      participantJoined({ userId: 'u2', displayName: 'Ana', role: 'member', muted: true, cameraOn: false }),
    );
    expect(s.participants.u2.muted).toBe(true);
    expect(s.participants.u2.cameraOn).toBe(false);
  });

  it('tracks host authority from server-declared roles (§19)', () => {
    let s = reducer(initialState, callStarted({ sessionId: 's1', selfUserId: 'u1' }));
    s = reducer(s, selfRoleSet({ selfRole: 'member', hostUserId: 'u2' }));
    expect(s.selfRole).toBe('member');
    expect(s.hostUserId).toBe('u2');
    // Host failover: a promotion arrives as a joined upsert…
    s = reducer(s, participantJoined({ userId: 'u1', displayName: 'Me', role: 'host' }));
    expect(s.selfRole).toBe('host');
    expect(s.hostUserId).toBe('u1');
    // …and a departing host clears authority until the room promotes someone.
    s = reducer(s, selfRoleSet({ selfRole: 'member', hostUserId: 'u3' }));
    s = reducer(s, participantLeft({ userId: 'u3' }));
    expect(s.hostUserId).toBeNull();
  });

  it('sets and clears room notices without touching other state', () => {
    let s = reducer(initialState, noticeSet({ tone: 'warning', message: 'Only the host can moderate.' }));
    expect(s.notice?.message).toBe('Only the host can moderate.');
    s = reducer(s, noticeSet(null));
    expect(s.notice).toBeNull();
  });

  it('de-duplicates received messages by id', () => {
    const msg = { id: 'm1', senderUserId: 'u2', body: 'hi', sentAt: 't' };
    let s = reducer(initialState, messageReceived(msg));
    s = reducer(s, messageReceived(msg));
    expect(s.messages).toHaveLength(1);
  });

  it('tracks the persistence posture and resets it for every new call (§22)', () => {
    let s = reducer(initialState, callStarted({ sessionId: 's1', selfUserId: 'u1' }));
    expect(s.persistence).toBe('unknown'); // never assume before the server answers
    s = reducer(s, persistenceSet('on'));
    expect(s.persistence).toBe('on');
    // A fresh call must not inherit the previous call's consent posture.
    s = reducer(s, callStarted({ sessionId: 's2', selfUserId: 'u1' }));
    expect(s.persistence).toBe('unknown');
  });

  it('tracks bounded reconnect accounting per peer and clears it on real recovery (§12.18)', () => {
    let s = reducer(initialState, participantJoined({ userId: 'u2', displayName: 'Bo', role: 'member' }));
    s = reducer(s, participantReconnect({ userId: 'u2', attempt: 2, maxAttempts: 3, exhausted: false }));
    expect(s.participants.u2.reconnect).toEqual({ attempt: 2, maxAttempts: 3, exhausted: false });
    s = reducer(s, participantReconnect({ userId: 'u2', attempt: 3, maxAttempts: 3, exhausted: true }));
    expect(s.participants.u2.reconnect?.exhausted).toBe(true);
    // Genuine recovery ends the story — the counter must not linger.
    s = reducer(s, participantStatus({ userId: 'u2', status: 'connected' }));
    expect(s.participants.u2.reconnect).toBeNull();
  });

  it('toggles media controls', () => {
    const s = reducer(initialState, mediaToggled({ micOn: false, cameraOn: false }));
    expect(s.micOn).toBe(false);
    expect(s.cameraOn).toBe(false);
  });
});
