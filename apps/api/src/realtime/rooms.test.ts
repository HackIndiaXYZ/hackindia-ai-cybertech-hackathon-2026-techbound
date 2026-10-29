import { describe, it, expect, beforeEach } from 'vitest';
import { RoomRegistry } from './rooms.js';

describe('RoomRegistry (signaling lifecycle, plan §11 item 3)', () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry();
  });

  it('tracks members per room', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice' });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob' });
    expect(reg.members('s1')).toHaveLength(2);
    expect(reg.activeRoomCount()).toBe(1);
  });

  it('removes member and cleans empty rooms on leave', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice' });
    const res = reg.leave('a');
    expect(res?.sessionId).toBe('s1');
    expect(reg.members('s1')).toHaveLength(0);
    expect(reg.activeRoomCount()).toBe(0);
  });

  it('findUserRoom resolves the socket room for a user', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice' });
    const found = reg.findUserRoom('u1');
    expect(found).toEqual({ sessionId: 's1', roomId: 'a' });
    expect(reg.findUserRoom('nope')).toBeNull();
  });

  it('leave for unknown socket returns null', () => {
    expect(reg.leave('ghost')).toBeNull();
  });
});

describe('RoomRegistry host authority (plan §19 moderation + failover)', () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry();
  });

  it('first member of an empty room is host, later joiners are members', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice' });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob' });
    expect(reg.hostUserId('s1')).toBe('u1');
    expect(reg.roleOf('s1', 'u2')).toBe('member');
  });

  it('honours an explicit role from the persisted session on join', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice', role: 'member' });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob', role: 'host' });
    expect(reg.hostUserId('s1')).toBe('u2');
  });

  it('promotes the earliest remaining member when the host leaves', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice', role: 'host', joinedAt: 100 });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob', role: 'member', joinedAt: 200 });
    reg.join('s1', { socketId: 'c', userId: 'u3', displayName: 'Cara', role: 'member', joinedAt: 150 });
    const res = reg.leave('a');
    expect(res?.promoted?.userId).toBe('u3'); // earliest remaining by joinedAt
    expect(reg.hostUserId('s1')).toBe('u3');
  });

  it('a member leaving does not trigger promotion', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice', role: 'host' });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob', role: 'member' });
    const res = reg.leave('b');
    expect(res?.promoted).toBeUndefined();
    expect(reg.hostUserId('s1')).toBe('u1');
  });

  it('setHost moves authority to a connected member and demotes the old host', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice', role: 'host' });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob', role: 'member' });
    const promoted = reg.setHost('s1', 'u2');
    expect(promoted?.userId).toBe('u2');
    expect(reg.hostUserId('s1')).toBe('u2');
    expect(reg.roleOf('s1', 'u1')).toBe('member');
  });

  it('setHost returns null for a user not in the room', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice', role: 'host' });
    expect(reg.setHost('s1', 'ghost')).toBeNull();
  });

  it('socketsForUser returns every connection of a user (multi-tab/reconnect)', () => {
    reg.join('s1', { socketId: 'a', userId: 'u1', displayName: 'Alice' });
    reg.join('s1', { socketId: 'a2', userId: 'u1', displayName: 'Alice' });
    reg.join('s1', { socketId: 'b', userId: 'u2', displayName: 'Bob' });
    expect(reg.socketsForUser('s1', 'u1').sort()).toEqual(['a', 'a2']);
    expect(reg.isLastMemberForUser('s1', 'u2')).toBe(true);
    expect(reg.isLastMemberForUser('s1', 'u1')).toBe(false);
  });
});
