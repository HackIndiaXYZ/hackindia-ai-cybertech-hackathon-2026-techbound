/**
 * Real-time event contracts (VIBECODER_MASTER_PLAN.md §24).
 * All Socket.io events are typed here. Arbitrary unvalidated objects MUST NOT
 * cross the real-time layer.
 */

import type { LanguageCode, ParticipantRole } from './domain.js';
import type { GestureDetection, ValidatedGestureSequence } from './gesture.js';
import type { SpeechTranscriptSegment } from './speech.js';
import type { AvatarAnimationCommand, IslIntermediateRepresentation } from './translation.js';

/** Event name constants (single source of truth for emit/on). */
export const SignalEvent = {
  // session lifecycle
  SessionCreate: 'session:create',
  SessionJoin: 'session:join',
  SessionLeave: 'session:leave',
  SessionEnd: 'session:end',
  // WebRTC signaling
  WebRtcOffer: 'webrtc:offer',
  WebRtcAnswer: 'webrtc:answer',
  WebRtcIceCandidate: 'webrtc:ice-candidate',
  // participant presence
  ParticipantJoined: 'participant:joined',
  ParticipantLeft: 'participant:left',
  ParticipantMuted: 'participant:muted',
  ParticipantCameraChanged: 'participant:camera-changed',
  ParticipantActiveSpeaker: 'participant:active-speaker',
  // group session moderation (host-authorized; enforced server-side)
  ModerationAction: 'moderation:action',
  ModerationApplied: 'moderation:applied',
  // transcripts
  TranscriptPartial: 'transcript:partial',
  TranscriptFinal: 'transcript:final',
  // gesture / translation
  GestureDetected: 'gesture:detected',
  GestureSequence: 'gesture:sequence',
  TranslationStarted: 'translation:started',
  TranslationCompleted: 'translation:completed',
  AvatarCommand: 'avatar:command',
  // text fallback + quality + errors
  TextMessage: 'message:text',
  ConnectionQuality: 'connection:quality',
  SystemError: 'system:error',
} as const;

export type SignalEventName = (typeof SignalEvent)[keyof typeof SignalEvent];

/**
 * Call lifecycle states (plan §12). A single, explicit state machine governs
 * the UI so users always know whether they are connecting, connected,
 * reconnecting, or done — never a silent/fake "connected".
 */
export type CallState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'ended';

export interface SignalEnvelope<TPayload> {
  /** server-generated correlation id */
  eventId: string;
  sessionId: string;
  sentAt: string;
  payload: TPayload;
}

// --- Session payloads ---
export interface SessionCreatePayload {
  sessionType: 'one_to_one' | 'group' | 'translator';
  hostUserId: string;
  maxParticipants: number;
}
export interface SessionJoinPayload {
  sessionId: string;
  userId: string;
  displayName: string;
}
export interface SessionLeavePayload {
  sessionId: string;
  userId: string;
}
export interface SessionEndPayload {
  sessionId: string;
  reason: 'host_ended' | 'all_left' | 'error' | 'timeout';
}

// --- WebRTC payloads ---
export interface WebRtcOfferPayload {
  fromUserId: string;
  toUserId: string;
  sdp: string;
}
export interface WebRtcAnswerPayload {
  fromUserId: string;
  toUserId: string;
  sdp: string;
}
export interface WebRtcIceCandidatePayload {
  fromUserId: string;
  toUserId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

// --- Participant payloads ---
export interface ParticipantJoinedPayload {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  /** Persisted presence truth at join time, so a new tile is not mislabelled. */
  muted?: boolean;
  cameraOn?: boolean;
  activeSpeaker?: boolean;
}
export interface ParticipantLeftPayload {
  userId: string;
  /** Set when the participant is expected back (signaling disconnect, not a leave). */
  reason?: 'left' | 'reconnecting';
}
export interface ParticipantMutedPayload {
  userId: string;
  muted: boolean;
}
export interface ParticipantCameraPayload {
  userId: string;
  cameraOn: boolean;
}
export interface ActiveSpeakerPayload {
  userId: string;
  active: boolean;
  /**
   * Who decided this. Self-claims (a participant reporting its own microphone
   * level) are relayed to the room; host-forced mute states are decided by the
   * server. Never left ambiguous, because the ring drives the speaker label.
   */
  decidedBy: 'self' | 'host' | 'server';
}

// --- Moderation payloads (plan §19 session moderation) ---
/**
 * A moderation command is emitted ONLY by the session host; the signaling layer
 * authorizes it before anything is relayed. `end` is not a moderation action —
 * ending a session stays on the REST lifecycle (`sessions.routes.ts`) so a socket
 * message can never terminate a room.
 */
export type ModerationCommandAction = 'mute' | 'unmute' | 'camera-off' | 'camera-on';
export interface ModerationPayload {
  action: ModerationCommandAction;
  /** The participant the host is acting on. */
  targetUserId: string;
  /** Short human-readable reason, shown in the room activity feed. Optional. */
  reason?: string;
}
export interface ModerationAppliedPayload {
  /** Host user id that issued the command (server-verified, not client-supplied). */
  actorUserId: string;
  targetUserId: string;
  action: ModerationCommandAction;
  reason?: string;
  appliedAt: string;
}

/**
 * Emitted to a single socket when a relayed event was rejected. The client must
 * surface this instead of silently ignoring it — a dropped mute that nobody tells
 * the host about is a bug users cannot see (plan §29).
 */
export interface SignalRejectedPayload {
  event: SignalEventName;
  code: 'not_authorized' | 'unknown_target' | 'payload_invalid' | 'rate_limited';
  message: string;
}

// --- Transcript payloads ---
export interface TranscriptPartialPayload {
  participantUserId: string;
  segment: SpeechTranscriptSegment;
  language: LanguageCode;
}
export interface TranscriptFinalPayload {
  participantUserId: string;
  text: string;
  /** 0..1 when the provider measures it; null when confidence is unavailable. */
  confidence: number | null;
  language: LanguageCode;
  /** Measured start→final latency in ms, when it can be observed. Never guessed. */
  latencyMs?: number;
  /** Originating provider name, for honest status/debug display. */
  provider?: string;
}

// --- Gesture / translation payloads ---
export type GestureDetectedPayload = GestureDetection;
export type GestureSequencePayload = ValidatedGestureSequence;
export interface TranslationStartedPayload {
  /**
   * Participant whose speech is being translated. In a group session the
   * translation must be attributable, otherwise the output cannot be labelled.
   */
  participantUserId: string;
  sourceTranscriptId: string;
  sourceText: string;
}
export interface TranslationCompletedPayload {
  participantUserId: string;
  sourceTranscriptId: string;
  representation: IslIntermediateRepresentation;
}
export interface AvatarCommandPayload {
  participantUserId: string;
  commands: AvatarAnimationCommand[];
}

// --- Misc payloads ---
export interface TextMessagePayload {
  senderUserId: string;
  body: string;
}
export interface ConnectionQualityPayload {
  userId: string;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
  rttMs?: number;
  packetLossPct?: number;
  bitrateKbps?: number;
}
export interface SystemErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
  /**
   * Present when the server refused one specific relayed event (e.g. a
   * moderation command that failed authorization). The client surfaces it
   * instead of treating the rejection as a fatal call error.
   */
  rejectedEvent?: SignalEventName;
  details?: string[];
}
