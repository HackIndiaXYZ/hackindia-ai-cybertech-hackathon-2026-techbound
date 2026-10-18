import type {
  CommunicationSession,
  CreateSessionResponse,
  JoinSessionResponse,
  ModerationCommandAction,
  ModerationResult,
  ParticipantRole,
  SessionPeer,
  SessionType,
} from '@isl/shared-types';
import { getDatabase } from '../infra/db/index.js';
import { getKVStore } from '../infra/redis/index.js';
import { AppError } from '../errors/AppError.js';
import { config } from '../config/index.js';
import { signJoinToken, verifyJoinToken } from './authService.js';

/**
 * Communication session service (plan §11 item 3 + item 4).
 * Durable session state lives in the database; ephemeral presence/state lives
 * in the KV store (redis or in-memory fallback).
 */

const DEFAULT_MAX: Record<SessionType, number> = {
  one_to_one: 2,
  group: 5,
  translator: 1,
};

export async function createSession(
  hostUserId: string,
  type: SessionType,
  maxParticipants?: number,
): Promise<CreateSessionResponse> {
  const db = getDatabase();
  const max = maxParticipants ?? DEFAULT_MAX[type];
  const session = await db.sessions.create({ type, hostUserId, maxParticipants: max });
  const joinToken = signJoinToken(session.id, hostUserId);
  // Hand the client its ICE config at creation time (§12 item 5).
  return { session, joinToken, iceServers: config.iceServers };
}

export async function getSession(sessionId: string): Promise<CommunicationSession> {
  const db = getDatabase();
  const s = await db.sessions.findById(sessionId);
  if (!s) throw AppError.notFound('Session not found.');
  return s;
}

/** Recent sessions the user hosted or joined, newest first (Phase 5.5 History). */
export async function listMySessions(
  userId: string,
  limit = 50,
): Promise<CommunicationSession[]> {
  return getDatabase().sessions.listByUser(userId, limit);
}

/** A person the user has shared at least one session with. */
export interface ContactSummary {
  id: string;
  displayName: string;
  sharedSessions: number;
}

/**
 * Derived contacts (Phase 5.5): distinct co-participants across the user's
 * recent sessions, ranked by how many sessions they share. Built from durable
 * participation state so it needs no separate contact store. Limitation (honest,
 * see API.md): peers who have already left a session are not counted, because
 * the participant list reflects current membership rather than full history.
 */
export async function listMyContacts(userId: string, sessionLimit = 100): Promise<ContactSummary[]> {
  const db = getDatabase();
  const sessions = await db.sessions.listByUser(userId, sessionLimit);
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const peers = await db.participants.list(s.id);
    for (const p of peers) {
      if (p.userId === userId) continue;
      counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
    }
  }
  const names = await db.users.findByIds([...counts.keys()]);
  const nameById = new Map(names.map((n) => [n.id, n.displayName]));
  return [...counts.entries()]
    .map(([id, sharedSessions]) => ({
      id,
      displayName: nameById.get(id) ?? id,
      sharedSessions,
    }))
    .sort((a, b) => b.sharedSessions - a.sharedSessions || a.displayName.localeCompare(b.displayName));
}

export async function joinSession(
  sessionId: string,
  userId: string,
  displayName: string,
  joinToken: string,
): Promise<JoinSessionResponse> {
  const token = verifyJoinToken(joinToken); // throws 403 if invalid/expired
  if (token.sessionId !== sessionId) {
    throw AppError.forbidden('Join token does not match this session.');
  }

  const db = getDatabase();
  const session = await getSession(sessionId);
  const current = await db.participants.list(sessionId);

  if (!current.some((p) => p.userId === userId)) {
    if (current.length >= session.maxParticipants) {
      throw AppError.conflict('This session is already full.');
    }
    await db.participants.add({
      sessionId,
      userId,
      role: userId === session.hostUserId ? 'host' : 'member',
      joinedAt: new Date().toISOString(),
      muted: false,
      cameraOn: true,
      activeSpeaker: false,
    });
  }

  // Ephemeral presence marker (auto-expires; refreshed by heartbeat later).
  await getKVStore().set(`presence:${sessionId}:${userId}`, displayName, 120);

  if (session.status !== 'active') {
    await db.sessions.updateStatus(sessionId, 'active');
  }

  const participants = await db.participants.list(sessionId);
  // Peers already present (excluding self) let the client bootstrap the mesh.
  // Display names are resolved from the user store so the grid can label people
  // instead of showing opaque ids (plan §19 "participants are identifiable").
  const names = await db.users.findByIds(participants.map((p) => p.userId));
  const nameById = new Map(names.map((n) => [n.id, n.displayName]));
  const peers: SessionPeer[] = participants
    .filter((p) => p.userId !== userId)
    .map((p) => ({
      userId: p.userId,
      displayName: nameById.get(p.userId) ?? p.userId,
      role: p.role,
      muted: p.muted,
      cameraOn: p.cameraOn,
      activeSpeaker: p.activeSpeaker,
    }));

  const self = participants.find((p) => p.userId === userId);

  return {
    session: (await getSession(sessionId))!,
    participants,
    iceServers: config.iceServers,
    peers,
    selfRole: self?.role ?? 'member',
  };
}

/**
 * Role of a user inside a session, read from durable state. The socket layer
 * authorizes moderation against this — never against a client-supplied claim.
 */
export async function getParticipantRole(
  sessionId: string,
  userId: string,
): Promise<ParticipantRole | null> {
  const p = await getDatabase().participants.get(sessionId, userId);
  return p?.role ?? null;
}

export async function isSessionHost(sessionId: string, userId: string): Promise<boolean> {
  const session = await getDatabase().sessions.findById(sessionId);
  if (!session) return false;
  // The persisted host wins; a room-level promotion is always written through
  // setSessionHost() first, so these two can not drift apart.
  return session.hostUserId === userId;
}

/** Move host authority to another participant and keep both stores consistent. */
export async function setSessionHost(sessionId: string, userId: string): Promise<CommunicationSession | null> {
  const db = getDatabase();
  await db.participants.updateRole(sessionId, userId, 'host');
  return db.sessions.updateHost(sessionId, userId);
}

export async function leaveSession(sessionId: string, userId: string): Promise<void> {
  const db = getDatabase();
  await db.participants.remove(sessionId, userId);
  await getKVStore().del(`presence:${sessionId}:${userId}`);
  const remaining = await db.participants.list(sessionId);
  if (remaining.length === 0) {
    await db.sessions.updateStatus(sessionId, 'ended');
    return;
  }
  // Host handover: moderation authority must not vanish when the host leaves,
  // otherwise a group session becomes unmanageable for the people still in it.
  const session = await db.sessions.findById(sessionId);
  if (session && session.hostUserId === userId) {
    const next = [...remaining].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0]!;
    await setSessionHost(sessionId, next.userId);
  }
}

/**
 * Apply a host moderation command (§19) to persisted participant state.
 * Authorization is checked here so both the REST route and the socket handler
 * share one rule. Returns null when the actor is not the session host, and
 * throws 404 when the target is not a participant of the session.
 */
export async function moderateParticipant(
  sessionId: string,
  actorUserId: string,
  targetUserId: string,
  action: ModerationCommandAction,
): Promise<ModerationResult | null> {
  const db = getDatabase();
  if (!(await isSessionHost(sessionId, actorUserId))) return null;
  if (actorUserId === targetUserId) {
    throw AppError.badRequest('Choose another participant to moderate.');
  }

  const patch =
    action === 'mute'
      ? { muted: true }
      : action === 'unmute'
        ? { muted: false }
        : action === 'camera-off'
          ? { cameraOn: false }
          : { cameraOn: true };

  const participant = await db.participants.updateState(sessionId, targetUserId, patch);
  if (!participant) throw AppError.notFound('That participant is no longer in this session.');

  return {
    sessionId,
    actorUserId,
    targetUserId,
    action,
    appliedAt: new Date().toISOString(),
    participant,
  };
}

export async function endSession(sessionId: string, actorUserId: string): Promise<CommunicationSession> {
  const db = getDatabase();
  const session = await getSession(sessionId);
  if (session.hostUserId !== actorUserId) {
    throw AppError.forbidden('Only the session host can end the session.');
  }
  const updated = await db.sessions.updateStatus(sessionId, 'ended');
  return updated!;
}
