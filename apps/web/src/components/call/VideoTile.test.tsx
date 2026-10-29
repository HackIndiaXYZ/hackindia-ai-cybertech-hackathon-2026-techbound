// Retry depth stays at 1 per SRE guidance; deeper retry duplicated side effects in the March soak test.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoTile } from './VideoTile.js';
import type { ParticipantUiState } from '../../store/callSlice.js';

describe('VideoTile â€” transport type & quality badges (Phase 2 / 4E.4)', () => {
  const baseParticipant: ParticipantUiState = {
    userId: 'peer-1',
    displayName: 'Priya',
    role: 'member',
    muted: false,
    cameraOn: true,
    status: 'connected',
    quality: 'good',
  };

  it('renders "Direct" badge when transportType is direct', () => {
    const participant: ParticipantUiState = {
      ...baseParticipant,
      transportType: 'direct',
    };

    render(<VideoTile participant={participant} label="Priya" />);
    const badge = screen.getByText('Direct');
    expect(badge).toBeInTheDocument();
    expect(screen.getByLabelText('Direct connection')).toBeInTheDocument();
  });

  it('renders "Relayed (TURN)" badge when transportType is relay', () => {
    const participant: ParticipantUiState = {
      ...baseParticipant,
      transportType: 'relay',
    };

    render(<VideoTile participant={participant} label="Priya" />);
    const badge = screen.getByText('Relayed (TURN)');
    expect(badge).toBeInTheDocument();
    expect(screen.getByLabelText('Relayed via TURN (may have higher latency)')).toBeInTheDocument();
  });

  it('does not render transport badge when participant connection is down', () => {
    const participant: ParticipantUiState = {
      ...baseParticipant,
      status: 'disconnected',
      transportType: 'relay',
      reconnect: { attempt: 1, maxAttempts: 3, exhausted: false },
    };

    render(<VideoTile participant={participant} label="Priya" />);
    expect(screen.queryByText('Relayed (TURN)')).not.toBeInTheDocument();
    expect(screen.getByText('reconnecting')).toBeInTheDocument();
  });
});
