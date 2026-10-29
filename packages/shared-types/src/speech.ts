/**
 * Speech recognition + TTS types (VIBECODER_MASTER_PLAN.md §14 Phase 2C, §17 Phase 3B).
 * Provider-agnostic so Whisper or any compatible provider can be swapped (Rule #14).
 */

import type { LanguageCode } from './domain.js';

export type SpeechProviderName = 'stub' | 'whisper' | string;

export interface SpeechRecognitionRequest {
  sessionId: string;
  participantUserId: string;
  language: LanguageCode;
  audioEncoding: 'wav' | 'ogg' | 'pcm16' | 'webm';
  sampleRateHz: number;
  isFinal: boolean;
}

export interface SpeechTranscriptSegment {
  text: string;
  isFinal: boolean;
  /** 0..1 when the provider measures it; null when it does NOT (never guessed). */
  confidence: number | null;
  language: LanguageCode;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface SpeechRecognitionResult {
  provider: SpeechProviderName;
  sessionId: string;
  participantUserId: string;
  segments: SpeechTranscriptSegment[];
  partialText: string;
  finalText: string;
  /** 0..1 when the provider measures it; null when unavailable (never fabricated). */
  overallConfidence: number | null;
  latencyMs: number; // measured, never fabricated
  detectedLanguage: LanguageCode;
}

export interface TtsRequest {
  text: string;
  language: LanguageCode;
  voiceProfileId?: string;
  gender?: 'male' | 'female' | 'neutral';
  rate?: number; // speech rate multiplier
  volume?: number; // 0..1
}

export interface TtsResult {
  provider: string;
  audioUrl?: string; // short-lived, signed; never a permanent asset by default
  audioBase64?: string;
  format: 'mp3' | 'ogg' | 'wav';
  durationMs?: number;
}
