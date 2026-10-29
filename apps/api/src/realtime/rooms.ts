import type { Socket } from 'socket.io';
import type { ParticipantRole } from '@isl/shared-types';

/**
 * In-memory room/participant registry for the signaling layer (plan §11 item 3,
 * §24). This is intentionally ephemeral coordination state; durable session
 * state lives in the database. Room membership is per-socket-id.
 *
 * Phase 3D adds host awareness: moderation commands (§19) must be authorized
 * against who actually hosts the room *right now*, and that answer has to be
 * cheap enough to check on every socket event. The registry therefore tracks
 * role + join order per member and supports host promotion, rather than
 * assuming a session forever has two participants.
 */

export interface RoomMember {
  socketId: string;
  userId: string;
  displayName: string;
  role: ParticipantRole;
  /** Registry clock time of join; used for deterministic host promotion. */
  joinedAt: number;
}

/** Membership facts the caller supplies; role and join order are registry-owned. */
export type RoomMemberInput = {
  socketId: string;
  userId: string;
  displayName: string;
  role?: ParticipantRole;
  joinedAt?: number;
};

export class RoomRegistry {
  private rooms = new Map<string, Map<string, RoomMember>>(); // sessionId -> socketId -> member
  private socketToRoom = new Map<string, string>(); // socketId -> sessionId

  join(sessionId: string, member: RoomMemberInput): void {
    const room = this.rooms.get(sessionId) ?? new Map();
    // First member in an empty room is the host unless told otherwise; a later
    // joiner inherits whatever the REST layer established.
    const role: ParticipantRole = member.role ?? (room.size === 0 ? 'host' : 'member');
    room.set(member.socketId, {
      socketId: member.socketId,
      userId: member.userId,
      displayName: member.displayName,
      role,
      joinedAt: member.joinedAt ?? Date.now(),
    });
    this.rooms.set(sessionId, room);
    this.socketToRoom.set(member.socketId, sessionId);
  }

  leave(socketId: string): { sessionId: string; member?: RoomMember; promoted?: RoomMember } | null {
    const sessionId = this.socketToRoom.get(socketId);
    if (!sessionId) return null;
    const room = this.rooms.get(sessionId);
    const member = room?.get(socketId);
    room?.delete(socketId);
    if (room && room.size === 0) this.rooms.delete(sessionId);
    this.socketToRoom.delete(socketId);
    if (!member || member.role !== 'host' || !room || room.size === 0) {
      return { sessionId, member };
    }
    // Host left the room (disconnect or leave): promote the earliest remaining
    // member so moderation authority never disappears with the host.
    const promoted = this.promoteHost(sessionId);
    return { sessionId, member, promoted: promoted ?? undefined };
  }

  members(sessionId: string): RoomMember[] {
    return Array.from(this.rooms.get(sessionId)?.values() ?? []);
  }

  /** Role of a user currently connected in a room, if any. */
  roleOf(sessionId: string, userId: string): ParticipantRole | null {
    for (const member of this.rooms.get(sessionId)?.values() ?? []) {
      if (member.userId === userId) return member.role;
    }
    return null;
  }

  hostUserId(sessionId: string): string | null {
    for (const member of this.rooms.get(sessionId)?.values() ?? []) {
      if (member.role === 'host') return member.userId;
    }
    return null;
  }

  /**
   * Make `userId` the single host of the room, demoting anyone else. Returns the
   * promoted member, or null when that user is not connected in the room.
   */
  setHost(sessionId: string, userId: string): RoomMember | null {
    const room = this.rooms.get(sessionId);
    if (!room) return null;
    let promoted: RoomMember | null = null;
    for (const member of room.values()) {
      if (member.userId === userId) {
        member.role = 'host';
        promoted = member;
      } else if (member.role === 'host') {
        member.role = 'member';
      }
    }
    return promoted;
  }

  /** Promote the earliest-joined remaining member to host (idempotent). */
  promoteHost(sessionId: string): RoomMember | null {
    const room = this.rooms.get(sessionId);
    if (!room || room.size === 0) return null;
    if (this.hostUserId(sessionId)) return null; // still has a host
    const next = [...room.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
    next.role = 'host';
    return next;
  }

  findUserRoom(userId: string): { sessionId: string; roomId: string } | null {
    for (const [sessionId, room] of this.rooms) {
      for (const member of room.values()) {
        if (member.userId === userId) return { sessionId, roomId: member.socketId };
      }
    }
    return null;
  }

  /**
   * Every socket of a user inside one session. A participant may hold more than
   * one connection (second tab, or a reconnect that raced the old socket's
   * cleanup); moderation and active-speaker state must reach all of them, not
   * just the first one found.
   */
  socketsForUser(sessionId: string, userId: string): string[] {
    const found: string[] = [];
    for (const member of this.rooms.get(sessionId)?.values() ?? []) {
      if (member.userId === userId) found.push(member.socketId);
    }
    return found;
  }

  isLastMemberForUser(sessionId: string, userId: string): boolean {
    return this.socketsForUser(sessionId, userId).length <= 1;
  }

  activeRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomRegistry = new RoomRegistry();

/**
 * Emit to every other member of the socket's current rooms.
 * Socket.io's `socket.to(...)` already excludes the sender, so this is the
 * standard relay pattern used by the signaling layer (§24).
 */
export function relayToRoom(socket: Socket, event: string, payload: unknown): void {
  for (const room of socket.rooms) {
    if (room === socket.id) continue; // skip the socket's own private room
    socket.to(room).emit(event, payload);
  }
}
