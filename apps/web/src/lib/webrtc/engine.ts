import type { IceServer } from '@isl/shared-types';
import { WebRtcPeer, type PeerConnectionStatus, type IceCandidateInit } from './peer.js';
import type { ReconnectAttemptInfo, ReconnectConfig } from './reconnectPolicy.js';

/**
 * Manages the full peer-to-peer mesh for a session (plan §12 items 2, 6-8,
 * 11-13, 18). One {@link WebRtcPeer} per remote participant. The engine owns
 * local media and exposes coarse control (mute / camera) plus per-peer
 * signaling routing. It never fabricates streams or connection state.
 */

export interface EngineCallbacks {
  onRemoteStream(userId: string, stream: MediaStream): void;
  onPeerStatus(userId: string, status: PeerConnectionStatus): void;
  onPeerQuality(userId: string, stats: { rttMs?: number; packetLossPct?: number; bitrateKbps?: number }): void;
  /** Bounded ICE-restart accounting per peer (Phase 4B, §29). */
  onPeerReconnect?(userId: string, info: ReconnectAttemptInfo): void;
}

export interface SignalSender {
  offer(payload: unknown): void;
  answer(payload: unknown): void;
  ice(payload: unknown): void;
}

export interface CallEngineOptions {
  localUserId: string;
  iceServers: IceServer[];
  localStream: MediaStream;
  sender: SignalSender;
  callbacks: EngineCallbacks;
  /** Optional reconnect-ladder override shared by every peer channel. */
  reconnect?: Partial<ReconnectConfig>;
}

export class CallEngine {
  private readonly peers = new Map<string, WebRtcPeer>();

  constructor(private readonly opts: CallEngineOptions) {}

  get localStream(): MediaStream {
    return this.opts.localStream;
  }

  /** Open a channel to a participant (idempotent per user). */
  connectPeer(remoteUserId: string): void {
    if (remoteUserId === this.opts.localUserId) return;
    if (this.peers.has(remoteUserId)) return;

    const peer = new WebRtcPeer({
      localUserId: this.opts.localUserId,
      remoteUserId,
      iceServers: this.opts.iceServers,
      localStream: this.opts.localStream,
      reconnect: this.opts.reconnect,
      transport: {
        send: (event, payload) => this.dispatch(event, remoteUserId, payload),
      },
      events: {
        onRemoteStream: (id, stream) => this.opts.callbacks.onRemoteStream(id, stream),
        onStatus: (id, status) => this.opts.callbacks.onPeerStatus(id, status),
        onQuality: (id, stats) => this.opts.callbacks.onPeerQuality(id, stats),
        onReconnect: (id, info) => this.opts.callbacks.onPeerReconnect?.(id, info),
      },
    });
    this.peers.set(remoteUserId, peer);
  }

  /** Close a single peer channel (participant left). */
  disconnectPeer(remoteUserId: string): void {
    this.peers.get(remoteUserId)?.close();
    this.peers.delete(remoteUserId);
  }

  handleOffer(fromUserId: string, sdp: string): void {
    void this.ensurePeer(fromUserId).handleOffer(sdp);
  }

  handleAnswer(fromUserId: string, sdp: string): void {
    this.peers.get(fromUserId)?.handleAnswer(sdp).catch(() => undefined);
  }

  handleIce(fromUserId: string, init: IceCandidateInit): void {
    this.peers.get(fromUserId)?.handleIce(init).catch(() => undefined);
  }

  /** §12 items 12-13: toggle the real local tracks (no simulated state). */
  setMicrophoneEnabled(enabled: boolean): void {
    for (const track of this.opts.localStream.getAudioTracks()) track.enabled = enabled;
  }

  setCameraEnabled(enabled: boolean): void {
    for (const track of this.opts.localStream.getVideoTracks()) track.enabled = enabled;
  }

  closeAll(): void {
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
  }

  private ensurePeer(remoteUserId: string): WebRtcPeer {
    let peer = this.peers.get(remoteUserId);
    if (!peer) {
      this.connectPeer(remoteUserId);
      peer = this.peers.get(remoteUserId);
    }
    if (!peer) throw new Error('Unable to create peer channel');
    return peer;
  }

  private dispatch(event: 'offer' | 'answer' | 'ice', toUserId: string, payload: unknown): void {
    const fromUserId = this.opts.localUserId;
    if (event === 'offer') this.opts.sender.offer({ fromUserId, toUserId, ...(payload as object) });
    else if (event === 'answer') this.opts.sender.answer({ fromUserId, toUserId, ...(payload as object) });
    else this.opts.sender.ice({ fromUserId, toUserId, ...(payload as object) });
  }
}
