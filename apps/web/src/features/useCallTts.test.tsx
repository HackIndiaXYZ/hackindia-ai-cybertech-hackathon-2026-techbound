import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { store } from '../store/index.js';
import { useCallTts } from './useCallTts.js';
import type { TtsApi } from './useTts.js';

function createMockTts(): TtsApi & { spoken: string[]; cancelled: boolean } {
  const spoken: string[] = [];
  let cancelled = false;

  return {
    spoken,
    get cancelled() {
      return cancelled;
    },
    available: true,
    providerName: 'mock',
    keepsSynthesisOnDevice: true,
    engineStatus: 'local',
    engineReason: null,
    capabilities: {
      voiceSelection: true,
      volumeControl: true,
      pauseResume: true,
      ratePitch: true,
      genderAge: false,
      emotionalRendering: false,
    },
    voices: [],
    selectedVoice: null,
    enInAvailable: true,
    state: 'idle',
    text: null,
    failure: null,
    metrics: {
      attempts: 0,
      started: 0,
      finished: 0,
      errors: 0,
      lastStartLatencyMs: null,
      avgStartLatencyMs: null,
      failureRate: null,
    },
    prefs: store.getState().voice,
    isFallback: false,
    fallbackReason: null,
    speak: (text: string) => {
      spoken.push(text);
    },
    cancel: () => {
      cancelled = true;
    },
    pause: vi.fn(),
    resume: vi.fn(),
    selectVoice: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    toggleMute: vi.fn(),
    setLanguage: vi.fn(),
    setProsody: vi.fn(),
  };
}

describe('useCallTts Hook', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('initializes with expected default consent gates', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: false,
          speakCaptions: false,
        }),
      { wrapper },
    );

    expect(result.current.speakSigns).toBe(false);
    expect(result.current.speakCaptions).toBe(false);
    expect(result.current.queueLength).toBe(0);
    expect(result.current.isSpeaking).toBe(false);
  });

  it('updates consent state and Redux when toggled', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: false,
        }),
      { wrapper },
    );

    act(() => {
      result.current.toggleSpeakSigns();
    });

    expect(result.current.speakSigns).toBe(true);
    expect(store.getState().voice.autoplay).toBe('readAloud');
  });

  it('enqueues remote signs and speaks them when speakSigns is active', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: true,
          participants: {
            'peer-1': {
              userId: 'peer-1',
              displayName: 'Diya',
              role: 'member',
              muted: false,
              cameraOn: true,
              status: 'connected',
            },
          },
        }),
      { wrapper },
    );

    act(() => {
      const enqueued = result.current.handleRemoteGesture({
        gestureId: 'g1',
        label: 'HELLO',
        confidence: 0.95,
        hands: ['right'],
        detectedAt: new Date().toISOString(),
        fromUserId: 'peer-1',
      });
      expect(enqueued).toBe(true);
    });

    expect(mockTts.spoken).toEqual(['Diya signed: Hello']);
  });

  it('ignores gestures from local participant (selfUserId)', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: true,
        }),
      { wrapper },
    );

    act(() => {
      const enqueued = result.current.handleRemoteGesture({
        gestureId: 'g2',
        label: 'HELLO',
        confidence: 0.95,
        hands: ['right'],
        detectedAt: new Date().toISOString(),
        fromUserId: 'self-1',
      });
      expect(enqueued).toBe(false);
    });

    expect(mockTts.spoken.length).toBe(0);
  });

  it('handles generic CaptionLine items and parses ISL sign lines', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: true,
          speakCaptions: true,
          announceName: false,
        }),
      { wrapper },
    );

    act(() => {
      result.current.handleCaptionLine({
        id: 'c1',
        speakerUserId: 'peer-2',
        text: '🤟 [Signer]: THANK_YOU (92% conf)',
        kind: 'final',
        confidence: 0.92,
        language: 'en-IN',
        latencyMs: 120,
        provider: 'isl-engine-hierarchical',
        at: new Date().toISOString(),
      });
    });

    expect(mockTts.spoken).toEqual(['Thank you']);
  });

  it('cancels playback and clears queue on request', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: true,
        }),
      { wrapper },
    );

    act(() => {
      result.current.speak('System notice');
      result.current.cancel();
    });

    expect(mockTts.cancelled).toBe(true);
    expect(result.current.queueLength).toBe(0);
  });

  it('suppresses speech captions when screenReaderOptimized is active to prevent dual speech', () => {
    const mockTts = createMockTts();
    const { result } = renderHook(
      () =>
        useCallTts({
          selfUserId: 'self-1',
          tts: mockTts,
          speakSigns: true,
          speakCaptions: true,
          screenReaderOptimized: true,
          announceName: false,
        }),
      { wrapper },
    );

    act(() => {
      // Gesture recognition is still spoken
      result.current.handleRemoteGesture({
        gestureId: 'g-opt-1',
        label: 'HELLO',
        confidence: 0.95,
        hands: ['right'],
        detectedAt: new Date().toISOString(),
        fromUserId: 'peer-1',
      });
      // But speech transcript is suppressed so native screen reader can read it from aria-live undisturbed
      result.current.handleRemoteTranscript({
        participantUserId: 'peer-1',
        text: 'How are you doing today?',
        confidence: 0.9,
        language: 'en-IN',
      });
    });

    expect(mockTts.spoken).toEqual(['Hello']);
  });
});

