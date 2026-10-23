import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BidirectionalPipelineStatus } from './BidirectionalPipelineStatus.js';
import { AVATAR_SIGN_COUNT } from './SupportedVocabularyModal.js';

describe('BidirectionalPipelineStatus Component (§29 async states)', () => {
  it('renders idle state for both pipelines correctly', () => {
    render(
      <BidirectionalPipelineStatus
        signState="idle"
        speechState="idle"
        avatarActive={false}
      />
    );

    expect(screen.getByText('Sign → Speech')).toBeInTheDocument();
    expect(screen.getByText('Speech → Avatar')).toBeInTheDocument();
    const idleBadges = screen.getAllByText('Idle');
    expect(idleBadges.length).toBe(2);
    expect(screen.getByText('Hidden (Click "Show ISL Avatar")')).toBeInTheDocument();
  });

  it('renders listening and processing states with live latency metrics', () => {
    render(
      <BidirectionalPipelineStatus
        signState="processing"
        signLatencyMs={576}
        signEngineName="ISL Hierarchical Dual-Stream"
        lastSignLabel="namaste"
        lastSignConfidence={0.92}
        speechState="listening"
        speechLatencyMs={140}
        speechProviderName="Whisper STT"
        avatarActive={true}
        avatarPhase="ready"
      />
    );

    expect(screen.getByText('Translating…')).toBeInTheDocument();
    expect(screen.getByText('Active & Listening')).toBeInTheDocument();
    expect(screen.getByText('⚡ 576ms roundtrip')).toBeInTheDocument();
    expect(screen.getByText('⚡ 140ms')).toBeInTheDocument();
    expect(screen.getByText('namaste')).toBeInTheDocument();
    expect(screen.getByText('(92%)')).toBeInTheDocument();
    // Derived from the same list the vocabulary modal renders, so this cannot
    // drift into advertising more than the avatar can sign.
    expect(screen.getByText(`Active (${AVATAR_SIGN_COUNT} word signs + A–Z fingerspell)`)).toBeInTheDocument();
  });

  it('labels the avatar honestly while it is loading or failed rather than claiming it is active', () => {
    render(
      <BidirectionalPipelineStatus
        signState="idle"
        speechState="idle"
        avatarActive={true}
        avatarPhase="initializing"
      />
    );
    expect(screen.getByText('Loading avatar…')).toBeInTheDocument();

    render(
      <BidirectionalPipelineStatus
        signState="idle"
        speechState="idle"
        avatarActive={true}
        avatarPhase="error"
      />
    );
    expect(screen.getByText('Could not start')).toBeInTheDocument();
  });

  it('renders low-confidence warning badge when recognition confidence is below 60%', () => {
    render(
      <BidirectionalPipelineStatus
        signState="low-confidence"
        lastSignLabel="help"
        lastSignConfidence={0.48}
        speechState="idle"
        avatarActive={false}
      />
    );

    expect(screen.getByText('Low Confidence (<60%)')).toBeInTheDocument();
    expect(screen.getByText('help')).toBeInTheDocument();
    expect(screen.getByText('(48%)')).toBeInTheDocument();
  });

  it('renders degraded fallback mode badge when engine is offline or running heuristic fallback', () => {
    render(
      <BidirectionalPipelineStatus
        signState="fallback"
        signEngineName="Heuristic Rule Classifier (Fallback)"
        speechState="fallback"
        speechProviderName="Web Speech (Fallback)"
        avatarActive={true}
      />
    );

    const fallbackBadges = screen.getAllByText('Degraded Fallback Active');
    expect(fallbackBadges.length).toBe(2);
    expect(screen.getByText('Heuristic Rule Classifier (Fallback)')).toBeInTheDocument();
    expect(screen.getByText('Web Speech (Fallback)')).toBeInTheDocument();
  });

  it('renders unavailable and reconnecting states', () => {
    const { rerender } = render(
      <BidirectionalPipelineStatus
        signState="unavailable"
        speechState="unavailable"
        avatarActive={true}
        avatarPhase="unsupported"
      />
    );

    const unavailableBadges = screen.getAllByText('Service Unavailable');
    expect(unavailableBadges.length).toBe(2);
    expect(screen.getByText('WebGL Unavailable')).toBeInTheDocument();

    rerender(
      <BidirectionalPipelineStatus
        signState="reconnecting"
        speechState="reconnecting"
        avatarActive={false}
      />
    );

    const reconnectingBadges = screen.getAllByText('Reconnecting…');
    expect(reconnectingBadges.length).toBe(2);
  });
});
