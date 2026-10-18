import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SignalEvent, type ModerationCommandAction, type SignalEventName, type SignalEnvelope } from '@isl/shared-types';
import { config } from '../config/index.js';
import { logger } from '../infra/logger.js';
import { verifyAccessToken, isAccessTokenRevoked } from '../services/authService.js';
import { roomRegistry, relayToRoom } from './rooms.js';
import { runtimeStatus } from '../services/healthService.js';
import { countSignalingEvent, countSignalingRejection, setRoomGauges } from '../infra/metrics.js';
import {
  signalPayloadSchemas,
  moderationActionSchema,
  type ValidatedSignalEventName,
} from '../validation/signalSchemas.js';
import {
  getParticipantRole,
  isSessionHost,
  moderateParticipant,
  setSessionHost,
} from '../services/sessionService.js';

/**
 * Socket.io signaling skeleton (plan §11 item 3, §24 event contracts).
 * Responsibilities: handshake auth, room join/leave lifecycle, and relay of
 * typed WebRTC + participant events. No media flows through the server (P2P).
 *
 * Group sessions (§19) change one structural assumption: the server can no
 * longer treat every event as an anonymous broadcast. Presence must carry the
 * participant's real role, moderation must be authorized against durable state
 * before it reaches anyone, and a host disconnecting must not leave the room
 * without an authority.
 */

const joinSchema = z.object({
  sessionId: z.string().min(1),
  displayName: z.string().min(1).max(80),
});

interface SocketData {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
}

export function attachSignaling(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.api.corsAllowedOrigins, credentials: true },
    pingInterval: 10000,
    pingTimeout: 20000,
  });

  // Handshake authentication: verify short-lived bearer token (§25).
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    void (async () => {
      try {
        const claims = verifyAccessToken(token);
        // 4E.2: refuse a handshake whose access token has been revoked (logout),
        // so a signed-out device cannot open a new signaling session.
        if (await isAccessTokenRevoked(claims.jti)) {
          next(new Error('UNAUTHORIZED'));
          return;
        }
        const data = socket.data as SocketData;
        data.userId = claims.sub;
        data.email = claims.email;
        data.role = claims.role;
        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    })();
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    logger.info('socket_connected', { userId: data.userId, socketId: socket.id });

    socket.on(SignalEvent.SessionJoin, async (raw: unknown, ack?: (r: unknown) => void) => {
      const parsed = joinSchema.safeParse(raw);
      if (!parsed.success) {
        ack?.({ error: 'VALIDATION_ERROR', issues: parsed.error.issues.map((i) => i.path.join('.')) });
        return;
      }
      const { sessionId, displayName } = parsed.data;
      socket.join(sessionId);
      data.sessionId = sessionId;
      // Role comes from persisted participant state, not from the person asking
      // to join. Fall back to the registry heuristic only when there is no row
      // (e.g. a client that connected before the REST join completed).
      const role = (await getParticipantRole(sessionId, data.userId)) ?? undefined;
      roomRegistry.join(sessionId, { socketId: socket.id, userId: data.userId, displayName, role });

      const self = roomRegistry.members(sessionId).find((m) => m.socketId === socket.id);
      const env = envelope(sessionId, {
        userId: data.userId,
        displayName,
        role: self?.role ?? 'member',
      });
      socket.to(sessionId).emit(SignalEvent.ParticipantJoined, env);
      runtimeStatus.activeRooms = roomRegistry.activeRoomCount();
      setRoomGauges(runtimeStatus.activeRooms, io.engine.clientsCount);
      countSignalingEvent(SignalEvent.SessionJoin);
      ack?.({
        ok: true,
        eventId: env.eventId,
        role: self?.role ?? 'member',
        peers: roomRegistry.members(sessionId).length - 1,
      });
    });

    socket.on(SignalEvent.SessionLeave, () => handleDisconnect(socket, io, data));

    // WebRTC signaling relays — forwarded to the specific target peer room.
    relayPair(socket, SignalEvent.WebRtcOffer);
    relayPair(socket, SignalEvent.WebRtcAnswer);
    relayPair(socket, SignalEvent.WebRtcIceCandidate);

    // Presence-style events broadcast to the whole room.
    relayRoom(socket, SignalEvent.ParticipantMuted);
    relayRoom(socket, SignalEvent.ParticipantCameraChanged);
    relayRoom(socket, SignalEvent.ParticipantActiveSpeaker);
    relayRoom(socket, SignalEvent.TextMessage);
    relayRoom(socket, SignalEvent.GestureDetected);
    relayRoom(socket, SignalEvent.GestureSequence);
    // Interim captions are high-frequency and replaceable: throttle per socket.
    relayRoom(socket, SignalEvent.TranscriptPartial, { limitPerSec: 20 });
    relayRoom(socket, SignalEvent.TranscriptFinal);
    relayRoom(socket, SignalEvent.TranslationStarted);
    relayRoom(socket, SignalEvent.TranslationCompleted);
    relayRoom(socket, SignalEvent.AvatarCommand);
    relayRoom(socket, SignalEvent.ConnectionQuality);

    // Host-only moderation command (§19). Never broadcast blindly: the actor's
    // authority is verified against the persisted session host first.
    registerModerationAction(socket, io);

    socket.on('disconnecting', () => handleDisconnect(socket, io, data));
    socket.on('disconnect', () => {
      runtimeStatus.activeRooms = roomRegistry.activeRoomCount();
      setRoomGauges(runtimeStatus.activeRooms, io.engine.clientsCount);
    });
  });

  runtimeStatus.signalingConnected = true;
  runtimeStatus.activeRooms = roomRegistry.activeRoomCount();
  setRoomGauges(runtimeStatus.activeRooms, io.engine.clientsCount);
  logger.info('signaling_attached');
  return io;
}

function handleDisconnect(socket: Socket, io: Server, data: SocketData): void {
  if (!data.sessionId) return;
  const sessionId = data.sessionId;
  const left = roomRegistry.leave(socket.id);
  data.sessionId = undefined;
  if (!left?.member) return;

  const wasHost = left.member.role === 'host';
  socket.to(sessionId).emit(SignalEvent.ParticipantLeft, envelope(sessionId, { userId: left.member.userId }));

  // Host handover: promote in the registry first, then persist it, so a
  // reconnecting ex-host cannot silently reclaim moderation while someone else
  // holds it. If the room is now empty there is nothing to hand over.
  if (wasHost && left.promoted) {
    void persistHost(sessionId, left.promoted);
    socket.to(sessionId).emit(
      SignalEvent.ParticipantJoined,
      envelope(sessionId, {
        userId: left.promoted.userId,
        displayName: left.promoted.displayName,
        role: 'host',
      }),
    );
    emitHostChangedNotice(io, sessionId, left.promoted);
  }
  runtimeStatus.activeRooms = roomRegistry.activeRoomCount();
  setRoomGauges(runtimeStatus.activeRooms, io.engine.clientsCount);
  countSignalingEvent(SignalEvent.SessionLeave);
}

function persistHost(sessionId: string, promoted: { userId: string; displayName: string }): void {
  void setSessionHost(sessionId, promoted.userId).catch((err: unknown) => {
    // Never pretend promotion succeeded; the room keeps the registry-level host
    // and the failure is visible in logs for operators (§26).
    logger.error('host_promotion_persist_failed', { sessionId, userId: promoted.userId, error: String(err) });
  });
}

/** Tell the remaining room members, out-of-band, that moderation authority moved. */
function emitHostChangedNotice(
  io: Server,
  sessionId: string,
  promoted: { userId: string; displayName: string },
): void {
  io.to(sessionId).emit(
    SignalEvent.SystemError,
    envelope(sessionId, {
      code: 'HOST_CHANGED',
      message: `${promoted.displayName} is now the session host.`,
      recoverable: true,
    }),
  );
}

/**
 * Host-only moderation command (plan §19 session moderation).
 *
 * Authorization order matters and is deliberate:
 *   1. validate the shape (no arbitrary object crosses the layer, §24),
 *   2. verify the *persisted* session host — never a client role claim,
 *   3. apply to durable participant state so the effect survives reloads,
 *   4. tell the target directly so it can enforce on its own media, then
 *   5. relay the resulting presence event so every tile agrees.
 * A rejected command answers the host explicitly; a silently dropped mute is a
 * bug nobody can see (§29).
 */
function registerModerationAction(socket: Socket, io: Server): void {
  socket.on(SignalEvent.ModerationAction, async (raw: unknown) => {
    const data = socket.data as SocketData;
    const sessionId = data.sessionId;
    if (!sessionId) return;

    if (!allowThrottled(socket, SignalEvent.ModerationAction, 5)) {
      emitSignalRejected(socket, sessionId, SignalEvent.ModerationAction, 'rate_limited', 'Too many moderation commands. Please slow down.');
      return;
    }
    const parsed = moderationActionSchema.safeParse(raw);
    if (!parsed.success) {
      emitSignalRejected(socket, sessionId, SignalEvent.ModerationAction, 'payload_invalid', 'That moderation command was not valid.');
      return;
    }
    const { targetUserId, action, reason } = parsed.data;

    if (!(await isSessionHost(sessionId, data.userId))) {
      emitSignalRejected(
        socket,
        sessionId,
        SignalEvent.ModerationAction,
        'not_authorized',
        'Only the session host can moderate participants.',
      );
      logger.warn('moderation_denied', { sessionId, actor: data.userId, target: targetUserId });
      return;
    }

    try {
      const result = await moderateParticipant(sessionId, data.userId, targetUserId, action as ModerationCommandAction);
      if (!result) {
        emitSignalRejected(socket, sessionId, SignalEvent.ModerationAction, 'not_authorized', 'Only the session host can moderate participants.');
        return;
      }

      // Tell the target to enforce on its own stream (all sockets of that user,
      // so a second tab cannot keep transmitting after a mute).
      const muteClaim = action === 'mute' || action === 'camera-off';
      const targetEvent = action === 'unmute' || action === 'mute' ? SignalEvent.ParticipantMuted : SignalEvent.ParticipantCameraChanged;
      const presencePayload =
        targetEvent === SignalEvent.ParticipantMuted
          ? { userId: targetUserId, muted: muteClaim }
          : { userId: targetUserId, cameraOn: !muteClaim };
      for (const socketId of roomRegistry.socketsForUser(sessionId, targetUserId)) {
        io.to(socketId).emit(targetEvent, envelope(sessionId, presencePayload));
      }
      // The host's own socket is excluded by `socket.to(...)`, so mirror the
      // persisted state back to it explicitly.
      socket.emit(targetEvent, envelope(sessionId, presencePayload));

      io.to(sessionId).emit(
        SignalEvent.ModerationApplied,
        envelope(sessionId, {
          actorUserId: result.actorUserId,
          targetUserId: result.targetUserId,
          action: result.action,
          ...(reason ? { reason } : {}),
          appliedAt: result.appliedAt,
        }),
      );
      // Moderation changes the speaker truth for the affected participant.
      if (action === 'mute') {
        socket.to(sessionId).emit(
          SignalEvent.ParticipantActiveSpeaker,
          envelope(sessionId, { userId: targetUserId, active: false, decidedBy: 'host' }),
        );
      }
      logger.info('moderation_applied', { sessionId, actor: data.userId, target: targetUserId, action });
    } catch (err) {
      emitSignalRejected(socket, sessionId, SignalEvent.ModerationAction, 'unknown_target', 'That participant is no longer in this session.');
      logger.warn('moderation_failed', { sessionId, error: String(err) });
    }
  });
}

/** Answer the issuing socket about a command it cannot rely on being relayed. */
function emitSignalRejected(
  socket: Socket,
  sessionId: string,
  event: SignalEventName,
  code: 'not_authorized' | 'unknown_target' | 'payload_invalid' | 'rate_limited',
  message: string,
): void {
  countSignalingRejection(code);
  socket.emit(SignalEvent.SystemError, envelope(sessionId, { code, message, recoverable: true, rejectedEvent: event }));
}

/** Relay an event to a single target peer (identified by payload.toUserId). */
function relayPair(socket: Socket, event: string): void {
  socket.on(event, (raw: unknown) => {
    const sessionId = (socket.data as SocketData).sessionId;
    if (!sessionId) return;
    const data = socket.data as SocketData;
    const payload = validateOrError(socket, event, raw, sessionId, data.userId);
    if (!payload) return;
    const to = (payload as { toUserId?: string }).toUserId;
    if (!to) {
      emitError(socket, sessionId, 'MISSING_TARGET', 'Relay requires a target peer.', true);
      return;
    }
    const targetRoom = roomRegistry.findUserRoom(to);
    const env = envelope(sessionId, payload);
    if (targetRoom && targetRoom.sessionId === sessionId) {
      socket.to(targetRoom.roomId).emit(event, env);
    } else {
      relayToRoom(socket, event, env);
    }
    countSignalingEvent(event);
  });
}

/** Relay an event to the whole current room. */
function relayRoom(
  socket: Socket,
  event: string,
  opts?: { limitPerSec?: number },
): void {
  socket.on(event, (raw: unknown) => {
    const sessionId = (socket.data as SocketData).sessionId;
    if (!sessionId) return;
    if (opts?.limitPerSec && !allowThrottled(socket, event, opts.limitPerSec)) {
      // Drop excess interim traffic; a later frame carries the newest text.
      logger.debug('relay_throttled', { event, sessionId });
      return;
    }
    const data = socket.data as SocketData;
    const payload = validateOrError(socket, event, raw, sessionId, data.userId);
    if (!payload) return;
    if (event.startsWith('transcript:')) {
      // Log only metadata — never transcript text — for privacy (§10).
      logger.debug('transcript_relay', { event, sessionId, userId: data.userId });
    }
    socket.to(sessionId).emit(event, envelope(sessionId, payload));
    countSignalingEvent(event);
  });
}

/**
 * Validate a relayed payload against its contract (§24). Rejects malformed
 * shapes and spoofed sender identities for contracted events, forwarding the
 * parsed value only when it is safe to cross the wire. Events whose contracts
 * belong to later phases (gesture/transcript/translation/avatar) are still
 * JSON-sanitized so no arbitrary object crosses — never a crash.
 */
function validateOrError(
  socket: Socket,
  event: string,
  raw: unknown,
  sessionId: string,
  authedUserId: string,
): unknown | null {
  const schema = signalPayloadSchemas[event as ValidatedSignalEventName];
  if (!schema) {
    // Future-phase event: keep it JSON-safe but defer strict validation.
    return sanitize(raw);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    emitError(
      socket,
      sessionId,
      'VALIDATION_ERROR',
      `Invalid payload for ${event}.`,
      true,
      parsed.error.issues.map((i) => i.path.join('.')),
    );
    return null;
  }
  const value = parsed.data as Record<string, unknown>;
  // Anti-spoofing: a relayed event may only claim the authenticated user.
  const claimed =
    value.fromUserId ?? value.userId ?? value.senderUserId ?? value.participantUserId;
  if (typeof claimed === 'string' && claimed !== authedUserId) {
    emitError(socket, sessionId, 'FORBIDDEN', 'Sender does not match authenticated user.', false);
    return null;
  }
  return value;
}

function emitError(
  socket: Socket,
  sessionId: string,
  code: string,
  message: string,
  recoverable: boolean,
  details?: string[],
): void {
  countSignalingRejection(code);
  socket.emit(
    SignalEvent.SystemError,
    envelope(sessionId, { code, message, recoverable, ...(details ? { details } : {}) }),
  );
}

/** Only forward validated, JSON-safe payloads across the wire (§24). */
function sanitize(raw: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(raw ?? {}));
  } catch {
    return {};
  }
}

/**
 * Fixed one-second window throttle keyed per socket+event. Used to bound
 * high-frequency interim captions without dropping distinct final events.
 */
const relayThrottles = new WeakMap<Socket, Map<string, { count: number; windowStart: number }>>();

function allowThrottled(socket: Socket, key: string, limitPerSec: number): boolean {
  const now = Date.now();
  let store = relayThrottles.get(socket);
  if (!store) {
    store = new Map();
    relayThrottles.set(socket, store);
  }
  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= 1000) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= limitPerSec) return false;
  entry.count += 1;
  return true;
}

function envelope<T>(sessionId: string, payload: T): SignalEnvelope<T> {
  return { eventId: randomUUID(), sessionId, sentAt: new Date().toISOString(), payload };
}
