import { describe, it, expect, vi, beforeEach } from 'vitest';

// The screens call these wrappers; here we prove each hits the right endpoint so
// the read layer (5.5/5.6) and reset flow (5.2) are wired to real paths.
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('./apiClient.js', () => ({ api: { get, post } }));

import {
  fetchMySessions,
  fetchMyContacts,
  fetchSessionTranscripts,
  fetchAdminFeedback,
  requestPasswordReset,
  resetPassword,
} from './directory.js';

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('directory read layer (5.5 / 5.6)', () => {
  it('fetches my sessions from /sessions', async () => {
    get.mockResolvedValue([]);
    await fetchMySessions();
    expect(get).toHaveBeenCalledWith('/sessions');
  });

  it('fetches contacts from /sessions/contacts', async () => {
    get.mockResolvedValue([]);
    await fetchMyContacts();
    expect(get).toHaveBeenCalledWith('/sessions/contacts');
  });

  it('encodes the session id when fetching transcripts', async () => {
    get.mockResolvedValue([]);
    await fetchSessionTranscripts('a/b');
    expect(get).toHaveBeenCalledWith('/transcripts/a%2Fb');
  });

  it('passes a bounded limit to the admin feedback list', async () => {
    get.mockResolvedValue([]);
    await fetchAdminFeedback(25);
    expect(get).toHaveBeenCalledWith('/admin/feedback?limit=25');
  });
});

describe('password reset flow (5.2)', () => {
  it('posts the email to forgot-password', async () => {
    post.mockResolvedValue({ accepted: true });
    await requestPasswordReset('a@b.com');
    expect(post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'a@b.com' });
  });

  it('posts token + new password to reset-password', async () => {
    post.mockResolvedValue(undefined);
    await resetPassword('tok', 'newpass123');
    expect(post).toHaveBeenCalledWith('/auth/reset-password', { token: 'tok', newPassword: 'newpass123' });
  });
});
