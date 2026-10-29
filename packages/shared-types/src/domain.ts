/**
 * Core domain models shared across frontend, backend and services.
 * These mirror the normalized database entities described in
 * VIBECODER_MASTER_PLAN.md §22 (Database Design).
 */

export type UserRole = 'deaf' | 'hearing' | 'interpreter' | 'admin';

export type AccountStatus = 'active' | 'suspended' | 'pending_verification';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface Profile {
  userId: string;
  preferredInputMode: InputMode;
  preferredOutputMode: OutputMode;
  primaryLanguage: LanguageCode;
  secondaryLanguage?: LanguageCode;
  avatarGender?: 'male' | 'female' | 'neutral';
  accessibilitySettings: AccessibilitySettings;
}

export type InputMode = 'isl' | 'speech' | 'text';
export type OutputMode = 'text' | 'avatar' | 'tts';

export type LanguageCode = 'en-IN' | 'hi-IN' | 'hi-en'; // incl. code-switching

export interface AccessibilitySettings {
  highContrast: boolean;
  reduceMotion: boolean;
  largeControls: boolean;
  captionFontSize: number; // px
  screenReaderOptimized: boolean;
}

export type SessionType = 'one_to_one' | 'group' | 'translator';

export type SessionStatus = 'created' | 'active' | 'ended' | 'failed';

export interface CommunicationSession {
  id: string;
  type: SessionType;
  status: SessionStatus;
  hostUserId: string;
  maxParticipants: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export type ParticipantRole = 'host' | 'member';

export interface SessionParticipant {
  sessionId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
  leftAt?: string;
  muted: boolean;
  cameraOn: boolean;
  activeSpeaker: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  senderUserId: string;
  body: string;
  sentAt: string;
}

export type TranscriptSource = 'speech' | 'isl' | 'text';

export interface Transcript {
  id: string;
  sessionId: string;
  participantUserId: string;
  source: TranscriptSource;
  text: string;
  isFinal: boolean;
  /** 0..1 when the provider measured it; null when unavailable — never guessed. */
  confidence: number | null;
  language: LanguageCode;
  createdAt: string;
}

export interface Translation {
  id: string;
  sessionId: string;
  sourceTranscriptId: string;
  sourceText: string;
  targetRepresentation: string; // serialized ISL intermediate representation
  confidence: number;
  fallbackUsed: boolean;
  createdAt: string;
}

export interface Feedback {
  id: string;
  userId: string;
  sessionId?: string;
  category: 'recognition' | 'translation' | 'performance' | 'accessibility' | 'other';
  rating: number; // 1..5
  comment?: string;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  scope: 'recording' | 'training_data' | 'analytics';
  granted: boolean;
  grantedAt: string;
  revokedAt?: string;
}
