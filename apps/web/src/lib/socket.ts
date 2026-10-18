import { io, type Socket } from 'socket.io-client';
import { SignalEvent, type SignalEnvelope, type SignalEventName } from '@isl/shared-types';
import { WS_BASE_URL } from './config.js';
import { getAccessToken } from './apiClient.js';

/**
 * Thin, typed wrapper around the Socket.io client for the signaling layer
 * (plan §12, §24). All payloads arrive as a {@link SignalEnvelope}; we unwrap
 * the payload before handing it to the caller. The socket authenticates with
 * the same short-lived bearer token used for REST (§25).
 */

export type EnvelopeHandler<T> = (payload: T, envelope: SignalEnvelope<T>) => void;

export class SignalClient {
  private socket: Socket | null = null;

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Connect (or reconnect) using the current access token. */
  connect(): Socket {
    if (this.socket) return this.socket;
    const token = getAccessToken();
    this.socket = io(WS_BASE_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Fire-and-forget emit of a typed signal payload. */
  emit(event: SignalEventName, payload: unknown): void {
    this.connect().emit(event, payload);
  }

  /** Join a signaling room (server adds us to the mesh and relays presence). */
  join(sessionId: string, displayName: string, ack?: (res: unknown) => void): void {
    this.connect().emit(SignalEvent.SessionJoin, { sessionId, displayName }, ack);
  }

  leave(sessionId: string, userId: string): void {
    this.emit(SignalEvent.SessionLeave, { sessionId, userId });
  }

  on<T>(event: SignalEventName, handler: EnvelopeHandler<T>): () => void {
    const socket = this.connect();
    const wrapped = (envelope: SignalEnvelope<T>) => {
      const payload = (envelope && typeof envelope === 'object' && 'payload' in envelope
        ? envelope.payload
        : envelope) as T;
      handler(payload, envelope);
    };
    socket.on(event, wrapped);
    return () => socket.off(event, wrapped);
  }

  onConnect(handler: () => void): void {
    this.connect().on('connect', handler);
  }

  onDisconnect(handler: (reason: string) => void): void {
    this.connect().on('disconnect', handler);
  }

  /** Re-attach the auth token after a re-login while the socket stays open. */
  refreshAuth(): void {
    const socket = this.connect();
    socket.auth = { token: getAccessToken() };
  }
}

/** Convenience re-export so callers reference event names from one place. */
export { SignalEvent };
