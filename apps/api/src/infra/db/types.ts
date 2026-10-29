import type {
  CommunicationSession,
  ConsentRecord,
  Feedback,
  Message,
  Profile,
  SessionParticipant,
  Transcript,
  Translation,
  User,
} from '@isl/shared-types';

/**
 * Repository interfaces (plan §11 backend item 4 "repository/service pattern",
 * §22 database design). Two implementations exist: an in-memory fallback
 * (dev/test, no Postgres required) and a real PostgreSQL adapter.
 */

/** Stored user record includes a password hash; never returned across HTTP. */
export interface UserRecord extends User {
  passwordHash: string;
}

export interface UserRepository {
  create(input: {
    email: string;
    displayName: string;
    role: User['role'];
    passwordHash: string;
  }): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /**
   * Batch identity lookup. Used by session join to label peers by display name
   * instead of leaking user ids into the UI (plan §19 participants identifiable).
   */
  findByIds(ids: string[]): Promise<Pick<User, 'id' | 'displayName'>[]>;
  /**
   * Persist a new password hash (Phase 5.2 password reset). Overwrites the
   * stored hash and bumps updated_at; the caller is responsible for hashing.
   */
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  /**
   * Persist a new display name (used when an OAuth provider supplies an
   * authoritative name for an existing account). Caller owns the value.
   */
  updateDisplayName(userId: string, displayName: string): Promise<void>;
  toPublic(u: UserRecord): User;
}

export interface ProfileRepository {
  upsert(profile: Profile): Promise<Profile>;
  getByUserId(userId: string): Promise<Profile | null>;
}

export interface SessionRepository {
  create(input: {
    type: CommunicationSession['type'];
    hostUserId: string;
    maxParticipants: number;
  }): Promise<CommunicationSession>;
  findById(id: string): Promise<CommunicationSession | null>;
  updateStatus(id: string, status: CommunicationSession['status']): Promise<CommunicationSession | null>;
  /** Host handover after the host leaves (§19 moderation authority, §14b failover). */
  updateHost(id: string, hostUserId: string): Promise<CommunicationSession | null>;
  /**
   * Sessions the user hosted or participated in, newest first (Phase 5.5
   * History readback). `limit` bounds the page so the query can never
   * unbounded-scan; defaults are applied by the caller/service.
   */
  listByUser(userId: string, limit?: number): Promise<CommunicationSession[]>;
}

export interface ParticipantRepository {
  add(p: Omit<SessionParticipant, 'leftAt'>): Promise<SessionParticipant>;
  list(sessionId: string): Promise<SessionParticipant[]>;
  get(sessionId: string, userId: string): Promise<SessionParticipant | null>;
  updateState(
    sessionId: string,
    userId: string,
    patch: Partial<Pick<SessionParticipant, 'muted' | 'cameraOn' | 'activeSpeaker'>>,
  ): Promise<SessionParticipant | null>;
  /** Persist a role change so a promoted host survives a full reconnect. */
  updateRole(
    sessionId: string,
    userId: string,
    role: SessionParticipant['role'],
  ): Promise<SessionParticipant | null>;
  remove(sessionId: string, userId: string): Promise<void>;
}

export interface MessageRepository {
  create(m: Omit<Message, 'id' | 'sentAt'>): Promise<Message>;
  listBySession(sessionId: string): Promise<Message[]>;
}

export interface TranscriptRepository {
  create(t: Omit<Transcript, 'id' | 'createdAt'>): Promise<Transcript>;
  listBySession(sessionId: string): Promise<Transcript[]>;
}

export interface TranslationRepository {
  create(t: Omit<Translation, 'id' | 'createdAt'>): Promise<Translation>;
  listBySession(sessionId: string): Promise<Translation[]>;
}

export interface FeedbackRepository {
  create(f: Omit<Feedback, 'id' | 'createdAt' | 'userId'> & { userId: string }): Promise<Feedback>;
  /**
   * Newest-first readback for the admin dashboard (Phase 5.6). Optional `limit`
   * bounds the page so an admin list query can never unbounded-scan the table.
   */
  list(limit?: number): Promise<Feedback[]>;
}

export interface ConsentRepository {
  set(c: Omit<ConsentRecord, 'id' | 'grantedAt' | 'revokedAt'> & { userId: string }): Promise<ConsentRecord>;
  listByUser(userId: string): Promise<ConsentRecord[]>;
}

export interface DatabaseHealth {
  ok: boolean;
  driver: string;
  latencyMs?: number;
  message?: string;
}

/** Aggregate database handle used by the API + realtime layers. */
export interface Database {
  driver: string;
  users: UserRepository;
  profiles: ProfileRepository;
  sessions: SessionRepository;
  participants: ParticipantRepository;
  messages: MessageRepository;
  transcripts: TranscriptRepository;
  translations: TranslationRepository;
  feedback: FeedbackRepository;
  consent: ConsentRepository;
  health(): Promise<DatabaseHealth>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}
