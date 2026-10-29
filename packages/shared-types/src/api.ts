/**
 * REST API DTOs + the consistent error envelope (§23 API Design).
 * Every /api/v1 endpoint uses these request/response shapes.
 */

import type {
  CommunicationSession,
  ConsentRecord,
  Feedback,
  Message,
  ParticipantRole,
  Profile,
  SessionParticipant,
  SessionType,
  Transcript,
  Translation,
  User,
} from './domain.js';

/** Consistent error structure used by all APIs (plan §23). */
export interface ApiError {
  error: {
    code: string; // machine-readable e.g. "VALIDATION_ERROR"
    message: string; // human-readable, non-technical friendly
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface ApiSuccess<TData> {
  data: TData;
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
}

// --- Auth ---
export interface SignupRequest {
  email: string;
  password: string;
  displayName: string;
  role: User['role'];
  /** Cloudflare Turnstile proof-of-humanity; only required when the API enables it (5.3). */
  turnstileToken?: string;
}
export interface LoginRequest {
  email: string;
  password: string;
  turnstileToken?: string;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string; // opaque, single-use, rotated on /auth/refresh (plan §25)
  tokenType: 'Bearer';
  expiresIn: number; // seconds (short-lived; plan §25)
}
export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

/**
 * Supabase Google OAuth exchange: the browser finishes the provider flow and
 * sends the Supabase-issued ID token; the API verifies it server-side and
 * returns the same first-party `AuthResponse` shape as credential login.
 */
export interface OAuthExchangeRequest {
  token: string;
}
/** How the API can honour an OAuth exchange right now. */
export type OAuthMode = 'supabase' | 'dev' | 'unconfigured';
export interface OAuthStatusResponse {
  available: boolean;
  mode: OAuthMode;
}

// --- Users ---
export type UpdateProfileRequest = Partial<Omit<Profile, 'userId'>>;

// --- Sessions ---
/**
 * ICE server descriptor handed to the browser's RTCPeerConnection (plan §12
 * item 5). Credentials are only ever present for a configured TURN server and
 * are never logged or persisted server-side.
 */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * A peer already present in a session, used to bootstrap the WebRTC mesh.
 * Presence flags are included so a newly joined tile starts from persisted truth
 * instead of guessing (a muted peer must not render as an active speaker).
 */
export interface SessionPeer {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  muted?: boolean;
  cameraOn?: boolean;
  activeSpeaker?: boolean;
}

export interface CreateSessionRequest {
  type: SessionType;
  maxParticipants?: number;
}
export interface CreateSessionResponse {
  session: CommunicationSession;
  /** short-lived signaling join token */
  joinToken: string;
  /** STUN/TURN servers for the caller's peer connections (§12 item 5) */
  iceServers: IceServer[];
}
export interface JoinSessionRequest {
  sessionId: string;
  joinToken: string;
}
export interface SessionSummary {
  session: CommunicationSession;
  participants: SessionParticipant[];
}
/** Response to joining a session: full summary + everything the client needs
 * to open a WebRTC connection and reach existing peers (§12 items 6-7). */
export interface JoinSessionResponse extends SessionSummary {
  iceServers: IceServer[];
  peers: SessionPeer[];
  /**
   * The joining user's role in *this* session. Drives moderation UI: the client
   * must not infer host status from `peers`, and the server still re-checks every
   * moderation command (§19, §25 authorization checks).
   */
  selfRole: ParticipantRole;
}

/**
 * Result of a moderation command (§19). Returned by the REST endpoint so the host
 * gets a real acknowledgement instead of fire-and-forget optimism; the resulting
 * `moderation:applied` / `participant:muted` events are relayed over the socket.
 */
export interface ModerationResult {
  sessionId: string;
  actorUserId: string;
  targetUserId: string;
  action: 'mute' | 'unmute' | 'camera-off' | 'camera-on';
  appliedAt: string;
  /** Persisted participant state after the command, for optimistic-UI correction. */
  participant: SessionParticipant;
}

// --- Messages / transcripts / translations ---
export interface SendMessageRequest {
  sessionId: string;
  body: string;
}
export type MessageResponse = Message;
export type TranscriptResponse = Transcript;
export type TranslationResponse = Translation;

// --- Feedback / consent ---
export type SubmitFeedbackRequest = Omit<Feedback, 'id' | 'createdAt' | 'userId'>;
export type SetConsentRequest = Pick<ConsentRecord, 'scope' | 'granted'>;

// --- Health ---
export interface HealthComponentStatus {
  status: 'ok' | 'degraded' | 'down';
  driver?: string;
  message?: string;
  latencyMs?: number;
}
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSec: number;
  timestamp: string;
  checks: {
    api: HealthComponentStatus;
    database: HealthComponentStatus;
    redis: HealthComponentStatus;
    signaling: HealthComponentStatus;
    /** Optional: server-side speech service status (client Web Speech has none). */
    speech?: HealthComponentStatus;
    /** Optional: identity/sign-in mode actually configured (password vs Google OAuth). */
    auth?: HealthComponentStatus;
    /** Optional: provider-flag resolution summary (Phase 4C.3, P2-6). */
    providers?: HealthComponentStatus;
  };
}

// --- Providers (Phase 4C.3, P2-6) ---
/**
 * Resolved truth for one AI capability. The env flags are only a *request*;
 * this is what the product can actually run today. `implemented: false` means
 * the configured value names an integration that does not exist in this build
 * — we report it as unavailable instead of silently falling back (§29 honesty).
 */
export interface ProviderStatus {
  capability: 'speech' | 'vision' | 'translation' | 'tts';
  /** Raw configured value from the environment. */
  configured: string;
  /** The provider actually runs something in this build. */
  implemented: boolean;
  /** A real trained model backs the output (vs a rule/heuristic prototype). */
  trained: boolean;
  /** Whether output may be presented as authoritative ISL. Never true today. */
  authoritative: boolean;
  /** Where the capability executes: on-device, server, or nowhere. */
  runsOn: 'browser' | 'server' | 'none';
  /** Human-facing badge label: stub | browser | rule-based | trained | unavailable. */
  label: string;
  message: string;
}
export interface ProvidersResponse {
  providers: ProviderStatus[];
}

// --- Client telemetry (Phase 4C, aggregate-only, no content) ---
/**
 * One batch of *measured* numeric signal from a client session. Only values
 * the browser actually observed are carried; absent fields were not measured.
 * There is deliberately no transcript text, no media and no identifiers beyond
 * the opaque session scope, and the server gates this on `analytics` consent.
 */
export interface TelemetryBatch {
  /** Bounded measured WebRTC stats over the reporting window. */
  rttMs?: number[];
  packetLossPct?: number[];
  bitrateKbps?: number[];
  /** Count of ICE-restart attempts and give-ups observed (Phase 4B ladder). */
  reconnectAttempts?: number;
  reconnectExhausted?: number;
  /** End-to-end speech->caption and translation latency, ms, when measured. */
  captionLatencyMs?: number[];
  translationLatencyMs?: number[];
}

