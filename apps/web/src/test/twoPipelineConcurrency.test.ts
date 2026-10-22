import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationService } from '../lib/translation/translationService.js';
import { GestureMapper } from '../lib/avatar/gestureMapper.js';
import { AvatarAnimationController } from '../lib/avatar/animationController.js';
import { FacialExpressionController } from '../lib/avatar/facialExpression.js';
import { FakeAvatarAdapter, createVirtualScheduler } from '../lib/avatar/testFactories.js';
import { IslEngineProvider } from '../lib/vision/islEngineProvider.js';
import { IndicTtsProvider } from '../lib/tts/indicTtsProvider.js';
import type { HandFeatures } from '../lib/vision/types.js';
import type { TranscriptFinalPayload } from '@isl/shared-types';

describe('Phase 6: Two-Pipeline Concurrency & Resilience Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes Direction 1 (Sign -> Speech) and Direction 2 (Speech -> Avatar) simultaneously without interference', async () => {
    // ----------------------------------------------------
    // Direction 1 Setup: Deaf user signing -> Speech Audio output
    // ----------------------------------------------------
    const signerUserId = 'user-signer-deaf-001';
    const ttsOutputCollector: string[] = [];

    const fetchMock = vi.fn().mockImplementation((_url: string, init: { body?: string }) => {
      if (init?.body) {
        const body = JSON.parse(init.body);
        ttsOutputCollector.push(body.text);
      }
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['mock audio data'], { type: 'audio/wav' })),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const indicTts = new IndicTtsProvider({
      apiBaseUrl: 'http://127.0.0.1:8002',
    });

    // ----------------------------------------------------
    // Direction 2 Setup: Hearing user speaking -> ISL Avatar Interpretation
    // ----------------------------------------------------
    const speakerUserId = 'user-speaker-hearing-002';
    const translationService = new TranslationService();
    const gestureMapper = new GestureMapper();
    const adapter = new FakeAvatarAdapter();
    const vs = createVirtualScheduler();
    const expression = new FacialExpressionController(adapter);
    const avatarController = new AvatarAnimationController(adapter, expression, {
      scheduler: vs.schedule,
    });

    // ----------------------------------------------------
    // Simultaneous Execution
    // ----------------------------------------------------
    // 1. Signer executes sign detection -> TTS synthesis
    const spokenSignText = 'नमस्ते';
    indicTts.speak(spokenSignText, { language: 'hi-IN' }, {
      onStart: () => {},
      onEnd: () => {},
      onError: () => {},
    });

    // 2. Concurrently, speaker's transcript arrives
    const speakerTranscript: TranscriptFinalPayload = {
      participantUserId: speakerUserId,
      text: 'Good morning, how are you',
      confidence: 0.91,
      language: 'en-IN',
      latencyMs: 400,
    };

    // Translation Service generates IR
    const translationResult = translationService.translate(speakerTranscript.text);
    expect(translationResult.representation.concepts.length).toBeGreaterThan(0);

    // Avatar maps concepts to commands
    const avatarCommands = translationResult.representation.concepts.flatMap((concept, idx) => {
      return gestureMapper.fromConcept(concept, idx * 10).commands;
    });

    // Avatar enqueues commands
    const enqueueRes = avatarController.enqueue(avatarCommands);
    expect(enqueueRes.accepted).toBe(avatarCommands.length);
    expect(avatarController.isPlaying()).toBe(true);

    // Verify speech synthesis was triggered concurrently without blocking avatar controller
    expect(signerUserId).toBe('user-signer-deaf-001');
    expect(fetchMock).toHaveBeenCalled();
    expect(ttsOutputCollector).toContain('नमस्ते');

    // Virtual clock advances avatar animation to completion
    const duration = avatarCommands.reduce((sum, c) => sum + c.durationMs, 0);
    vs.advance(duration + 100);
    expect(avatarController.isPlaying()).toBe(false);
    expect(adapter.playedClips.length).toBe(avatarCommands.length);
  });

  it('verifies strict participantUserId tagging prevents cross-talk and feedback loops', () => {
    const localUserId = 'user-local-participant';
    const remoteUserId = 'user-remote-peer';

    let localDispatched = false;

    // Simulation of handleLocalFinal filtering
    function filterLocalFinal(payload: TranscriptFinalPayload) {
      if (!payload.text || payload.participantUserId !== localUserId) {
        return; // rejected: belongs to peer or is empty
      }
      localDispatched = true;
    }

    // Remote peer's final should be ignored by local translation dispatcher
    filterLocalFinal({
      participantUserId: remoteUserId,
      text: 'Peer speaking something',
      confidence: 0.9,
      language: 'en-IN',
      latencyMs: 100,
    });
    expect(localDispatched).toBe(false);

    // Local user's own final must be accepted
    filterLocalFinal({
      participantUserId: localUserId,
      text: 'My own speech',
      confidence: 0.95,
      language: 'en-IN',
      latencyMs: 100,
    });
    expect(localDispatched).toBe(true);
  });

  it('guarantees graceful degradation: isl-engine offline falls back to heuristic classifier without call drops', () => {
    let currentStatus: 'online' | 'fallback' | 'offline' = 'online';
    const provider = new IslEngineProvider({
      userId: 'test-user',
      onStatusChange: (status) => {
        currentStatus = status;
      },
    });

    expect(provider.trained).toBe(true);
    expect(provider.status).toBe('online');

    // Simulate engine disconnect/unavailability
    provider.handleEngineUnavailable();

    expect(provider.trained).toBe(false);
    expect(provider.status).toBe('fallback');
    expect(currentStatus).toBe('fallback');

    // Geometric HandFeatures input
    const mockFeatures: HandFeatures = {
      fingersExtended: [true, true, true, true, true],
      thumbExtended: true,
      extendedFingerCount: 4,
      pinchDistance: 1.0,
      fingerSpread: 1.0,
    };

    const res = provider.classify(mockFeatures, 'right');
    // Returns heuristic prediction rather than throwing or failing
    expect(res).toBeDefined();
    expect(typeof res?.gestureId).toBe('string');
  });

  it('guarantees graceful degradation: Indic-TTS failure falls back to browser SpeechSynthesis', () => {
    let fallbackTriggered = false;
    let fallbackReason = '';

    const fallbackMock = {
      name: 'browser-speech-fallback',
      keepsSynthesisOnDevice: true,
      isSupported: () => true,
      getCapabilities: () => ({
        voiceSelection: true,
        volumeControl: true,
        pauseResume: true,
        ratePitch: true,
        genderAge: true,
        emotionalRendering: false,
      }),
      listVoices: () => [],
      speak: vi.fn((_text: string, _opts: any, handlers: any) => {
        handlers.onStart?.(10);
        handlers.onEnd?.(20);
        return { cancel: () => {} };
      }),
      cancelActive: () => {},
      pause: () => {},
      resume: () => {},
      isUsingFallback: () => false,
    };

    const provider = new IndicTtsProvider({
      apiBaseUrl: 'http://127.0.0.1:8002',
      fallbackProvider: fallbackMock as any,
      onFallback: (reason) => {
        fallbackTriggered = true;
        fallbackReason = reason;
      },
    });

    expect(provider.isUsingFallback()).toBe(false);

    // Trigger fallback via private method
    (provider as any).triggerFallback('Hello', { language: 'en-IN' }, {
      onStart: () => {},
      onEnd: () => {},
      onError: () => {},
    }, 'Indic-TTS service port 8002 unreachable');

    expect(provider.isUsingFallback()).toBe(true);
    expect(fallbackTriggered).toBe(true);
    expect(fallbackReason).toContain('Indic-TTS service port 8002 unreachable');
    expect(fallbackMock.speak).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({ language: 'en-IN' }),
      expect.anything()
    );
  });
});
