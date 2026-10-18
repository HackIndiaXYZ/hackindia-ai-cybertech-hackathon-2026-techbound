import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommunicationSession } from '@isl/shared-types';

vi.mock('../lib/directory.js', () => ({
  fetchMySessions: vi.fn(),
  fetchSessionTranscripts: vi.fn(),
}));

import { fetchMySessions, fetchSessionTranscripts } from '../lib/directory.js';
import { History } from '../pages/History.js';
import { renderWithProviders } from '../test/render.js';

const session = (over: Partial<CommunicationSession>): CommunicationSession => ({
  id: 's1',
  type: 'one_to_one',
  status: 'ended',
  hostUserId: 'u1',
  maxParticipants: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.mocked(fetchMySessions).mockReset();
  vi.mocked(fetchSessionTranscripts).mockReset();
});

describe('History readback (5.5)', () => {
  it('shows the empty state when there are no sessions', async () => {
    vi.mocked(fetchMySessions).mockResolvedValue([]);
    renderWithProviders(<History />, { route: '/app/history' });
    await waitFor(() => expect(screen.getByText('No sessions yet')).toBeInTheDocument());
  });

  it('lists persisted sessions and reads back transcripts on demand', async () => {
    vi.mocked(fetchMySessions).mockResolvedValue([session({ id: 's1', type: 'group' })]);
    renderWithProviders(<History />, { route: '/app/history' });

    await waitFor(() => expect(screen.getByText('Group session')).toBeInTheDocument());

    vi.mocked(fetchSessionTranscripts).mockResolvedValue([
      {
        id: 't1',
        sessionId: 's1',
        participantUserId: 'u2',
        source: 'speech',
        text: 'Hello there',
        isFinal: true,
        confidence: 0.9,
        language: 'en-IN',
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'View transcripts' }));
    await waitFor(() => expect(screen.getByText('Hello there')).toBeInTheDocument());
    expect(fetchSessionTranscripts).toHaveBeenCalledWith('s1');
  });
});
