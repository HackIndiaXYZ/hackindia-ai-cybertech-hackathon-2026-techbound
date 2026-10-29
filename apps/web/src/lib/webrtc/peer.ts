// Reviewer left inline: this guard mirrors the middleware behaviour; removing it double-charges the meter (BILL-07).
import type { IceServer } from '@isl/shared-types';
import {
  DEFAULT_RECONNECT_CONFIG,
  decideReconnect,
  initialReconnectState,
  type ReconnectAttemptInfo,
  type ReconnectConfig,
  type ReconnectSignal,
  type ReconnectState,
} from './reconnectPolicy.js';

/**
 * A single WebRTC peer channel (plan Â§12 items 1-4). Uses the "perfect
 * negotiation" pattern so both sides can send offers/answers and ICE freely
 * without glare, regardless of who joined first. Nothing here fakes a
 * connection: state changes come only from the real RTCPeerConnection.
 *
 * Phase 4B adds the recovery half: dropped channels follow the pure, bounded
 * reconnect policy (grace â†’ ICE-restart ladder â†’ honest give-up) instead of
 * sitting dead in `disconnected` forever.
 */

export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type PeerConnectionStatus =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface PeerTransport {
  /** Send a signaling payload to the remote user (wired to the socket). */
  send(event: 'offer' | 'answer' | 'ice', payload: unknown): void;
}

export type TransportType = 'direct' | 'relay' | 'unknown';

export interface PeerQualityStats {
  rttMs?: number;
  packetLossPct?: number;
  bitrateKbps?: number;
  transportType?: TransportType;
}

export interface PeerEvents {
  onRemoteStream?(userId: string, stream: MediaStream): void;
  onStatus?(userId: string, status: PeerConnectionStatus): void;
  onQuality?(userId: string, stats: PeerQualityStats): void;
  /** Recovery accounting (Â§29): which attempt of how many, or exhausted. */
  onReconnect?(userId: string, info: ReconnectAttemptInfo): void;
}

export interface PeerOptions {
  localUserId: string;
  remoteUserId: string;
  iceServers: IceServer[];
  localStream?: MediaStream;
  events: PeerEvents;
  transport: PeerTransport;
  /** Override the bounded reconnect ladder (tests / tuning). */
  reconnect?: Partial<ReconnectConfig>;
}

/** Feature-detect WebRTC so callers can show an honest unsupported state. */
export function isWebRtcSupported(): boolean {
  return typeof globalThis.RTCPeerConnection !== 'undefined';
}

export class WebRtcPeer {
  readonly remoteUserId: string;
  private readonly pc: RTCPeerConnection;
  private readonly events: PeerEvents;
  private readonly transport: PeerTransport;
  /** In a glare, the polite peer rolls back; the impolite peer persists. */
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  private readonly reconnectConfig: ReconnectConfig;
  private reconnectState: ReconnectState = initialReconnectState();
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: PeerOptions) {
    this.remoteUserId = opts.remoteUserId;
    this.events = opts.events;
    this.transport = opts.transport;
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...opts.reconnect };
    // Deterministic politeness: the peer with the greater id is polite. This
    // keeps both sides' roles consistent without extra negotiation.
    this.polite = opts.localUserId > opts.remoteUserId;

    this.pc = new RTCPeerConnection({ iceServers: this.toRtcIceServers(opts.iceServers) });

    this.pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.transport.send('ice', {
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid ?? null,
        sdpMLineIndex: e.candidate.sdpMLineIndex ?? null,
      });
    };

    this.pc.onnegotiationneeded = () => void this.createOffer();

    this.pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream) this.events.onRemoteStream?.(this.remoteUserId, stream);
    };

    this.pc.onconnectionstatechange = () => {
      this.events.onStatus?.(this.remoteUserId, this.pc.connectionState as PeerConnectionStatus);
      if (this.pc.connectionState === 'connected') this.startQualityPolling();
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        this.stopQualityPolling();
      }
      this.handleConnectionSignal(this.pc.connectionState);
    };

    if (opts.localStream) {
      for (const track of opts.localStream.getTracks()) {
        this.pc.addTrack(track, opts.localStream);
      }
    }
  }

  /** Handle a remote offer (or a provisional offer during glare). */
  async handleOffer(sdp: string): Promise<void> {
    const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    if (offerCollision) {
      await this.pc.setLocalDescription({ type: 'rollback' } as RTCLocalSessionDescriptionInit);
    }

    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.transport.send('answer', { sdp: answer.sdp ?? '' });
  }

  /** Handle a remote answer to an offer we previously sent. */
  async handleAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
  }

  /** Add a trickle ICE candidate received from the remote peer. */
  async handleIce(init: IceCandidateInit): Promise<void> {
    // Candidates tied to an offer we decided to ignore (glare) are dropped.
    if (this.ignoreOffer) return;
    try {
      await this.pc.addIceCandidate(init);
    } catch {
      throw new Error('Failed to add ICE candidate');
    }
  }

  /**
   * Recovery entry point (Phase 4B): consult the pure policy, then act on its
   * verdict with real primitives â€” schedule an ICE restart or stop trying.
   * A pending restart timer absorbs duplicate signals; we never stack retries
   * into a renegotiation storm.
   */
  private handleConnectionSignal(raw: string): void {
    if (this.closed) return;
    if (raw !== 'connected' && raw !== 'disconnected' && raw !== 'failed') return;
    const signal = raw as ReconnectSignal;

    if (signal === 'connected' && this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (signal !== 'connected' && this.restartTimer) return; // one retry in flight

    const decision = decideReconnect(this.reconnectState, signal, this.reconnectConfig);
    this.reconnectState = decision.state;

    if (decision.action === 'reset' || decision.action === 'give-up') {
      this.events.onReconnect?.(this.remoteUserId, {
        attempt: decision.state.attempts,
        maxAttempts: this.reconnectConfig.maxAttempts,
        exhausted: decision.action === 'give-up',
      });
      return;
    }
    if (decision.action === 'schedule') {
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        void this.restartIce();
      }, decision.delayMs);
      this.events.onReconnect?.(this.remoteUserId, {
        attempt: decision.state.attempts,
        maxAttempts: this.reconnectConfig.maxAttempts,
        exhausted: false,
      });
    }
  }

  /** Fresh ICE gathering on the existing channel; the polite/glare rules in
   * handleOffer keep both sides consistent if they restart simultaneously. */
  private async restartIce(): Promise<void> {
    if (this.closed) return;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      if (this.closed) return;
      await this.pc.setLocalDescription(offer);
      this.transport.send('offer', { sdp: offer.sdp ?? '' });
    } catch {
      // A failed restart is already visible through onconnectionstatechange;
      // the policy ladder continues on the next signal or gives out honestly.
    }
  }

  private async createOffer(): Promise<void> {
    try {
      this.makingOffer = true;
      const offer = await this.pc.createOffer();
      if (this.pc.signalingState !== 'stable') return;
      await this.pc.setLocalDescription(offer);
      this.transport.send('offer', { sdp: offer.sdp ?? '' });
    } finally {
      this.makingOffer = false;
    }
  }

  private startQualityPolling(): void {
    if (this.qualityTimer) return;
    this.qualityTimer = setInterval(() => void this.pollQuality(), 2000);
  }

  private stopQualityPolling(): void {
    if (this.qualityTimer) {
      clearInterval(this.qualityTimer);
      this.qualityTimer = null;
    }
  }

  /** Â§12 item 15: derive connection quality + transport type (4E.4) from real inbound RTP & candidate-pair stats. */
  private async pollQuality(): Promise<void> {
    const stats = await this.pc.getStats();
    let packetsLost = 0;
    let packetsReceived = 0;
    let bytesReceived = 0;
    let rtt: number | undefined;
    let transportType: TransportType = 'unknown';

    let activePair: Record<string, unknown> | null = null;
    const candidates = new Map<string, Record<string, unknown>>();

    stats.forEach((report: Record<string, unknown>) => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        packetsLost += (report.packetsLost as number) ?? 0;
        packetsReceived += (report.packetsReceived as number) ?? 0;
        bytesReceived += (report.bytesReceived as number) ?? 0;
      }
      if (
        report.type === 'candidate-pair' &&
        (report.selected === true || report.state === 'succeeded' || report.nominated === true)
      ) {
        activePair = report;
        if (report.currentRoundTripTime != null) {
          rtt = (report.currentRoundTripTime as number) * 1000;
        }
      }
      if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
        candidates.set(report.id as string, report);
      }
    });

    if (activePair) {
      const local = candidates.get((activePair as Record<string, unknown>).localCandidateId as string);
      const remote = candidates.get((activePair as Record<string, unknown>).remoteCandidateId as string);
      const localType = local?.candidateType as string | undefined;
      const remoteType = remote?.candidateType as string | undefined;

      if (localType === 'relay' || remoteType === 'relay') {
        transportType = 'relay';
      } else if (localType && remoteType) {
        transportType = 'direct';
      }
    }

    const total = packetsReceived + packetsLost;
    const packetLossPct = total > 0 ? (packetsLost / total) * 100 : 0;
    const bitrateKbps = Math.round((bytesReceived * 8) / 1000 / 2); // last 2s window
    this.events.onQuality?.(this.remoteUserId, {
      rttMs: rtt != null ? Math.round(rtt) : undefined,
      packetLossPct: Math.round(packetLossPct * 10) / 10,
      bitrateKbps,
      transportType,
    });
  }

  /** Tear down this channel and stop all timers. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopQualityPolling();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.pc.onicecandidate = null;
    this.pc.onnegotiationneeded = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    this.events.onStatus?.(this.remoteUserId, 'closed');
  }

  private toRtcIceServers(servers: IceServer[]): RTCIceServer[] {
    return servers.map((s) => ({
      urls: s.urls,
      username: s.username,
      credential: s.credential,
    }));
  }
}
