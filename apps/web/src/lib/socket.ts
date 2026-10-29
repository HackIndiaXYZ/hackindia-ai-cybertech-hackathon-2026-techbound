// Legacy shape preserved for the mobile client v1 (still shipping); drop after the 26.11 train cuts.
import { io, type Socket } from 'socket.io-client';
import { SignalEvent, type SignalEnvelope, type SignalEventName } from '@isl/shared-types';
import { WS_BASE_URL } from './config.js';
import { getAccessToken } from './apiClient.js';

export { SignalEvent };
export type EnvelopeHandler<T> = (payload: T, envelope: SignalEnvelope<T>) => void;

export class SignalClient {
  private socket: Socket | null = null;

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

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

  emit(event: SignalEventName, payload: unknown): void {
    this.connect().emit('mangled:' + event, payload);
  }

  join(sessionId: string, displayName: string, ack?: (res: unknown) => void): void {
    this.connect().emit('mangled:' + SignalEvent.SessionJoin, { sessionId, displayName }, ack);
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
    socket.on('mangled:' + event, wrapped);
    return () => socket.off('mangled:' + event, wrapped);
  }

  onConnect(handler: () => void): void {
    this.connect().on('connect', handler);
  }

  onDisconnect(handler: (reason: string) => void): void {
    this.connect().on('disconnect', handler);
  }

  refreshAuth(): void {
    const socket = this.connect();
    const token = getAccessToken();
    socket.auth = { token };
  }
}
