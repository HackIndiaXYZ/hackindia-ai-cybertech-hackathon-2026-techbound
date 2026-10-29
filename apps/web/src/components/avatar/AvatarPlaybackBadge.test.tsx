// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AvatarPlaybackBadge } from './AvatarPlaybackBadge.js';
import type { AvatarAnimationCommand } from '@isl/shared-types';

describe('AvatarPlaybackBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when currentCommand is null', () => {
    const { container } = render(<AvatarPlaybackBadge currentCommand={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders fingerspelling mode badge when signing letter-by-letter', () => {
    const fingerspellCmd: AvatarAnimationCommand = {
      sequenceIndex: 0,
      gestureId: 'fingerspell-h',
      animationClipId: 'sign-h',
      durationMs: 650,
      facialExpression: 'neutral',
      transition: 'blend',
      isPlaceholder: false,
    };

    render(<AvatarPlaybackBadge currentCommand={fingerspellCmd} />);
    expect(screen.getByText('Fingerspelling mode')).toBeTruthy();
    expect(screen.getByText('H')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      'Fingerspelling mode: signing letter H',
    );
  });

  it('renders full sign badge when playing an authentic keyframed clip', () => {
    const fullSignCmd: AvatarAnimationCommand = {
      sequenceIndex: 0,
      gestureId: 'sign-home',
      animationClipId: 'sign-home',
      durationMs: 1200,
      facialExpression: 'neutral',
      transition: 'blend',
      isPlaceholder: false,
    };

    render(<AvatarPlaybackBadge currentCommand={fullSignCmd} />);
    expect(screen.getByText('Full sign')).toBeTruthy();
    expect(screen.getByText('(Keyframe)')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      'Full sign: authentic keyframe',
    );
  });

  it('renders approximate motion badge when playing procedural/placeholder motion', () => {
    const approxCmd: AvatarAnimationCommand = {
      sequenceIndex: 0,
      gestureId: 'sign-market',
      animationClipId: 'sign-market',
      durationMs: 1000,
      facialExpression: 'neutral',
      transition: 'blend',
      isPlaceholder: true,
    };

    render(<AvatarPlaybackBadge currentCommand={approxCmd} />);
    expect(screen.getByText('Approximate motion')).toBeTruthy();
    expect(screen.getByText('(Procedural)')).toBeTruthy();
  });
});
