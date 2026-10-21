import { z } from 'zod';

/**
 * Runtime validation for payloads crossing the real-time layer (plan §24,
 * §12). Signaling relays WebRTC offer/answer/ICE and presence/text events;
 * each must be validated before relay so malformed or hostile input yields a
 * typed `system:error` instead of being forwarded blindly.
 */

const userId = z.string().min(1).max(128);

export const webRtcOfferSchema = z.object({
  fromUserId: userId,
  toUserId: userId,
  sdp: z.string().min(1).max(64_000),
});

export const webRtcAnswerSchema = z.object({
  fromUserId: userId,
  toUserId: userId,
  sdp: z.string().min(1).max(64_000),
});

export const webRtcIceCandidateSchema = z.object({
  fromUserId: userId,
  toUserId: userId,
  candidate: z.string().min(1).max(4096),
  sdpMid: z.string().max(256).nullable(),
  sdpMLineIndex: z.number().int().min(0).max(16).nullable(),
});

export const participantMutedSchema = z.object({
  userId,
  muted: z.boolean(),
});

export const participantCameraSchema = z.object({
  userId,
  cameraOn: z.boolean(),
});

export const textMessageSchema = z.object({
  senderUserId: userId,
  body: z.string().min(1).max(4000),
});

export const activeSpeakerSchema = z.object({
  userId,
  active: z.boolean(),
  // Who decided this must be explicit: a self-reported microphone level and a
  // host-forced mute state are not the same claim, and the UI labels them
  // differently (plan §19 speaker identity).
  decidedBy: z.enum(['self', 'host', 'server']),
});

// --- Phase 3D moderation contracts (plan §19) ---
/**
 * Client-supplied moderation command. Deliberately has NO actor field: the
 * issuer is taken from the authenticated socket and the authority check is done
 * against the persisted session host, so a member cannot claim to be the host.
 */
export const moderationActionSchema = z.object({
  targetUserId: userId,
  action: z.enum(['mute', 'unmute', 'camera-off', 'camera-on']),
  reason: z.string().max(200).optional(),
});

export const moderationAppliedSchema = z.object({
  actorUserId: userId,
  targetUserId: userId,
  action: z.enum(['mute', 'unmute', 'camera-off', 'camera-on']),
  reason: z.string().max(200).optional(),
  appliedAt: z.string().min(1).max(64),
});

export const connectionQualitySchema = z.object({
  userId,
  quality: z.enum(['excellent', 'good', 'fair', 'poor', 'disconnected']),
  rttMs: z.number().nonnegative().optional(),
  packetLossPct: z.number().min(0).max(100).optional(),
  bitrateKbps: z.number().nonnegative().optional(),
});

const languageCode = z.enum(['en-IN', 'hi-IN', 'hi-en']);
// Confidence is nullable: a provider that does not measure it must send null,
// never a fabricated number (plan §14 honesty).
const transcriptConfidence = z.number().min(0).max(1).nullable();

export const transcriptPartialSchema = z.object({
  participantUserId: userId,
  segment: z.object({
    text: z.string().min(1).max(4000),
    isFinal: z.boolean(),
    confidence: transcriptConfidence,
    language: languageCode,
    startTimeMs: z.number().nonnegative().optional(),
    endTimeMs: z.number().nonnegative().optional(),
  }),
  language: languageCode,
});

export const transcriptFinalSchema = z.object({
  participantUserId: userId,
  text: z.string().min(1).max(4000),
  confidence: transcriptConfidence,
  language: languageCode,
  latencyMs: z.number().nonnegative().optional(),
  provider: z.string().max(64).optional(),
});

// --- Phase 3A translation + avatar command contracts (plan §16, §24) ---
// These are now relayed for real, so they get strict validation instead of the
// earlier sanitize-only deferral. Confidence/coverage are bounded 0..1 to keep the
// "never fabricate a number" contract honest even at the transport boundary.
const facialExpression = z.enum([
  'neutral',
  'question',
  'affirmative',
  'negative',
  'surprise',
  'emphasis',
  'topic_marker',
]);

export const translationStartedSchema = z.object({
  participantUserId: userId,
  sourceTranscriptId: z.string().min(1).max(128),
  sourceText: z.string().min(1).max(4000),
});

const islConceptSchema = z.object({
  conceptId: z.string().min(1).max(128),
  sourceText: z.string().max(2000),
  normalizedMeaning: z.string().max(2000),
  gestureIds: z.array(z.string().min(1).max(64)).max(16),
  ordering: z.number().int().min(0).max(1024),
  confidence: z.number().min(0).max(1),
  facialExpression,
  timingMs: z.number().int().min(0).max(60_000),
  fallbackBehavior: z.string().max(2000).optional(),
});

const islRepresentationSchema = z.object({
  sessionId: z.string().min(1).max(128),
  sourceLanguage: z.string().min(1).max(16),
  sourceText: z.string().max(4000),
  concepts: z.array(islConceptSchema).max(128),
  overallConfidence: z.number().min(0).max(1),
  fallbackUsed: z.boolean(),
  unsupportedConcepts: z.array(z.string().max(128)).max(512),
  generatedAt: z.string().min(1).max(64),
});

export const translationCompletedSchema = z.object({
  participantUserId: userId,
  sourceTranscriptId: z.string().min(1).max(128),
  representation: islRepresentationSchema,
});

const avatarAnimationCommandSchema = z.object({
  gestureId: z.string().min(1).max(64),
  animationClipId: z.string().min(1).max(64),
  facialExpression,
  durationMs: z.number().int().min(0).max(60_000),
  transition: z.enum(['blend', 'cut', 'crossfade']),
  sequenceIndex: z.number().int().min(0).max(4096),
  isPlaceholder: z.boolean(),
});

export const avatarCommandSchema = z.object({
  participantUserId: userId,
  commands: z.array(avatarAnimationCommandSchema).max(256),
});

export const gestureLandmarksSchema = z.object({
  participantUserId: userId,
  landmarks: z.array(z.any()).min(1).max(120),
  clientTimestamp: z.number().optional(),
});

export const gestureDetectedSchema = z.object({
  gestureId: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  confidence: z.number().min(0).max(1),
  hands: z.array(z.enum(['left', 'right'])).max(2),
  detectedAt: z.string().min(1).max(64),
  breakdown: z.record(z.any()).optional(),
  provider: z.string().max(64).optional(),
  trained: z.boolean().optional(),
  fromUserId: userId.optional(),
});

/** Map of relayed event name -> validator. Events not listed are rejected. */
export const signalPayloadSchemas = {
  'webrtc:offer': webRtcOfferSchema,
  'webrtc:answer': webRtcAnswerSchema,
  'webrtc:ice-candidate': webRtcIceCandidateSchema,
  'participant:muted': participantMutedSchema,
  'participant:camera-changed': participantCameraSchema,
  'participant:active-speaker': activeSpeakerSchema,
  'moderation:action': moderationActionSchema,
  'message:text': textMessageSchema,
  'connection:quality': connectionQualitySchema,
  'transcript:partial': transcriptPartialSchema,
  'transcript:final': transcriptFinalSchema,
  'translation:started': translationStartedSchema,
  'translation:completed': translationCompletedSchema,
  'avatar:command': avatarCommandSchema,
  'gesture:landmarks': gestureLandmarksSchema,
  'gesture:detected': gestureDetectedSchema,
} as const;

export type ValidatedSignalEventName = keyof typeof signalPayloadSchemas;
