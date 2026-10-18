import { describe, it, expect } from 'vitest';
import {
  webRtcOfferSchema,
  webRtcAnswerSchema,
  webRtcIceCandidateSchema,
  textMessageSchema,
  connectionQualitySchema,
  translationStartedSchema,
  translationCompletedSchema,
  avatarCommandSchema,
  activeSpeakerSchema,
  moderationActionSchema,
  moderationAppliedSchema,
} from './signalSchemas.js';

/**
 * Signaling payload contracts (plan §12, §24): only well-formed, JSON-safe
 * objects may cross the real-time layer. These tests prove malformed/oversized
 * payloads are rejected rather than relayed blindly.
 */
describe('signal payload schemas (§24)', () => {
  it('accepts a well-formed offer', () => {
    const res = webRtcOfferSchema.safeParse({ fromUserId: 'u1', toUserId: 'u2', sdp: 'v=0...' });
    expect(res.success).toBe(true);
  });

  it('rejects an offer missing the target peer', () => {
    const res = webRtcOfferSchema.safeParse({ fromUserId: 'u1', sdp: 'v=0' });
    expect(res.success).toBe(false);
  });

  it('rejects an empty SDP on answer', () => {
    expect(webRtcAnswerSchema.safeParse({ fromUserId: 'a', toUserId: 'b', sdp: '' }).success).toBe(false);
  });

  it('accepts ICE candidate with null mid/index', () => {
    const res = webRtcIceCandidateSchema.safeParse({
      fromUserId: 'a',
      toUserId: 'b',
      candidate: 'candidate:1 1 udp 2113 192.168.0.1 5000 typ host',
      sdpMid: null,
      sdpMLineIndex: 0,
    });
    expect(res.success).toBe(true);
  });

  it('rejects an out-of-range sdpMLineIndex', () => {
    const res = webRtcIceCandidateSchema.safeParse({
      fromUserId: 'a',
      toUserId: 'b',
      candidate: 'candidate:x',
      sdpMid: '0',
      sdpMLineIndex: 99,
    });
    expect(res.success).toBe(false);
  });

  it('rejects empty and oversized text bodies', () => {
    expect(textMessageSchema.safeParse({ senderUserId: 'a', body: '' }).success).toBe(false);
    expect(textMessageSchema.safeParse({ senderUserId: 'a', body: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('validates connection quality enums and bounds', () => {
    expect(connectionQualitySchema.safeParse({ userId: 'a', quality: 'good', rttMs: 40 }).success).toBe(true);
    expect(connectionQualitySchema.safeParse({ userId: 'a', quality: 'amazing' }).success).toBe(false);
    expect(connectionQualitySchema.safeParse({ userId: 'a', quality: 'poor', packetLossPct: 150 }).success).toBe(false);
  });
});

function concept(overrides: Record<string, unknown> = {}) {
  return {
    conceptId: 'help',
    sourceText: 'help',
    normalizedMeaning: 'to assist',
    gestureIds: ['raise-left'],
    ordering: 0,
    confidence: 0.95,
    facialExpression: 'neutral',
    timingMs: 850,
    ...overrides,
  };
}

function representation(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    sourceLanguage: 'en',
    sourceText: 'help',
    concepts: [concept()],
    overallConfidence: 0.95,
    fallbackUsed: false,
    unsupportedConcepts: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 3A translation + avatar contracts (§16, §24)', () => {
  it('accepts a well-formed translation:started', () => {
    expect(translationStartedSchema.safeParse({ participantUserId: 'u1', sourceTranscriptId: 't1', sourceText: 'help me' }).success).toBe(true);
  });

  it('rejects translation:started with empty source text', () => {
    expect(translationStartedSchema.safeParse({ participantUserId: 'u1', sourceTranscriptId: 't1', sourceText: '' }).success).toBe(false);
  });

  it('rejects translation:started without an attributable participant (§19)', () => {
    expect(translationStartedSchema.safeParse({ sourceTranscriptId: 't1', sourceText: 'help me' }).success).toBe(false);
  });

  it('accepts a well-formed translation:completed', () => {
    expect(translationCompletedSchema.safeParse({ participantUserId: 'u1', sourceTranscriptId: 't1', representation: representation() }).success).toBe(true);
  });

  it('rejects a concept with out-of-range confidence', () => {
    const res = translationCompletedSchema.safeParse({
      participantUserId: 'u1',
      sourceTranscriptId: 't1',
      representation: representation({ concepts: [concept({ confidence: 1.5 })] }),
    });
    expect(res.success).toBe(false);
  });

  it('rejects a representation with an invalid facial expression enum', () => {
    const res = translationCompletedSchema.safeParse({
      participantUserId: 'u1',
      sourceTranscriptId: 't1',
      representation: representation({ concepts: [concept({ facialExpression: 'smile' })] }),
    });
    expect(res.success).toBe(false);
  });

  it('accepts a well-formed avatar:command payload', () => {
    const res = avatarCommandSchema.safeParse({
      participantUserId: 'u1',
      commands: [
        {
          gestureId: 'raise-left',
          animationClipId: 'raise-left-hand',
          facialExpression: 'neutral',
          durationMs: 900,
          transition: 'blend',
          sequenceIndex: 0,
          isPlaceholder: true,
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('rejects an avatar command with an unknown transition', () => {
    const res = avatarCommandSchema.safeParse({
      participantUserId: 'u1',
      commands: [
        {
          gestureId: 'wave',
          animationClipId: 'wave',
          facialExpression: 'neutral',
          durationMs: 900,
          transition: 'morph',
          sequenceIndex: 0,
          isPlaceholder: true,
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('rejects an avatar command missing isPlaceholder', () => {
    const res = avatarCommandSchema.safeParse({
      participantUserId: 'u1',
      commands: [
        {
          gestureId: 'wave',
          animationClipId: 'wave',
          facialExpression: 'neutral',
          durationMs: 900,
          transition: 'cut',
          sequenceIndex: 0,
        },
      ],
    });
    expect(res.success).toBe(false);
  });
});

describe('Phase 3D moderation + active-speaker contracts (§19, §24)', () => {
  it('requires an explicit decider on active-speaker claims', () => {
    expect(activeSpeakerSchema.safeParse({ userId: 'u1', active: true }).success).toBe(false);
    expect(activeSpeakerSchema.safeParse({ userId: 'u1', active: true, decidedBy: 'self' }).success).toBe(true);
    expect(activeSpeakerSchema.safeParse({ userId: 'u1', active: false, decidedBy: 'host' }).success).toBe(true);
  });

  it('rejects an unknown active-speaker decider', () => {
    expect(activeSpeakerSchema.safeParse({ userId: 'u1', active: true, decidedBy: 'peer' }).success).toBe(false);
  });

  it('accepts a moderation command (no actor field — identity comes from auth)', () => {
    expect(moderationActionSchema.safeParse({ targetUserId: 'u2', action: 'mute' }).success).toBe(true);
    expect(moderationActionSchema.safeParse({ targetUserId: 'u2', action: 'camera-off', reason: 'background noise' }).success).toBe(true);
  });

  it('rejects a moderation command with an empty or non-listed action', () => {
    expect(moderationActionSchema.safeParse({ targetUserId: 'u2', action: 'end' }).success).toBe(false);
    expect(moderationActionSchema.safeParse({ targetUserId: '', action: 'mute' }).success).toBe(false);
  });

  it('rejects a client-injected actor on the moderation command', () => {
    // An actor field is not part of the accepted shape; extra keys are stripped,
    // so a member cannot forge host identity through the payload.
    const res = moderationActionSchema.safeParse({ actorUserId: 'attacker', targetUserId: 'u2', action: 'mute' });
    expect(res.success).toBe(true);
    expect((res.data as { actorUserId?: string }).actorUserId).toBeUndefined();
  });

  it('requires the server-applied moderation receipt to be complete', () => {
    expect(
      moderationAppliedSchema.safeParse({
        actorUserId: 'u1',
        targetUserId: 'u2',
        action: 'mute',
        appliedAt: '2026-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      moderationAppliedSchema.safeParse({ actorUserId: 'u1', targetUserId: 'u2', action: 'mute' }).success,
    ).toBe(false);
  });
});
