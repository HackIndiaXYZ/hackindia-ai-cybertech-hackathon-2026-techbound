import type { CommunicationSession, Feedback, Transcript } from '@isl/shared-types';
import { api } from './apiClient.js';

/**
 * Client access to the Phase 5 durable read layer. Every function is a thin,
 * typed wrapper over `api` so screens never guess response shapes and tests can
 * substitute the transport. Values always come from the server; nothing here is
 * mirrored client-side.
 */

/** A person the user has shared at least one session with (derived server-side). */
export interface ContactSummary {
  id: string;
  displayName: string;
  sharedSessions: number;
}

/** The caller's own recent sessions, newest first (Phase 5.5 History). */
export function fetchMySessions(transport: typeof api = api): Promise<CommunicationSession[]> {
  return transport.get<CommunicationSession[]>('/sessions');
}

/** Transcripts persisted for one session — the History detail readback. */
export function fetchSessionTranscripts(
  sessionId: string,
  transport: typeof api = api,
): Promise<Transcript[]> {
  return transport.get<Transcript[]>(`/transcripts/${encodeURIComponent(sessionId)}`);
}

/** People the caller has communicated with, ranked by shared sessions. */
export function fetchMyContacts(transport: typeof api = api): Promise<ContactSummary[]> {
  return transport.get<ContactSummary[]>('/sessions/contacts');
}

/** Admin-only newest-first page of feedback (Phase 5.6 readback). */
export function fetchAdminFeedback(limit = 100, transport: typeof api = api): Promise<Feedback[]> {
  return transport.get<Feedback[]>(`/admin/feedback?limit=${encodeURIComponent(String(limit))}`);
}

/**
 * Password reset flow (Phase 5.2). `requestPasswordReset` is enumeration-safe:
 * the server always answers 202 whether or not the address maps to an account,
 * so the UI must phrase it identically either way and never confirm existence.
 */
export function requestPasswordReset(email: string, transport: typeof api = api): Promise<{ accepted: boolean }> {
  return transport.post<{ accepted: boolean }>('/auth/forgot-password', { email });
}

export function resetPassword(
  token: string,
  newPassword: string,
  transport: typeof api = api,
): Promise<void> {
  return transport.post<void>('/auth/reset-password', { token, newPassword });
}
