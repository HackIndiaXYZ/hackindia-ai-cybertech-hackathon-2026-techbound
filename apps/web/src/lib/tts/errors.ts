import type { TtsErrorCode, TtsFailure } from './types.js';

/**
 * User-facing copy per code, kept separate from raw browser strings so the
 * headline message is always understandable and actionable (§9).
 */
const FRIENDLY: Record<TtsErrorCode, { message: string; recoverable: boolean }> = {
  'not-supported': {
    message: 'This browser does not provide text-to-speech. Try a recent Chrome or Edge.',
    recoverable: false,
  },
  'no-voices': {
    message: 'No speech voices are installed yet. Your browser may still be loading them — try again in a moment.',
    recoverable: true,
  },
  'voice-unavailable': {
    message: 'That voice or language is not available in this browser. Please pick another.',
    recoverable: true,
  },
  'not-allowed': {
    message: 'The browser blocked speech output. Interact with the page and try again.',
    recoverable: true,
  },
  'synthesis-failed': {
    message: 'Speech synthesis failed to play. Please try again.',
    recoverable: true,
  },
  aborted: {
    message: 'Speech playback was stopped.',
    recoverable: true,
  },
  unknown: {
    message: 'Speech playback hit an unexpected error. Please try again.',
    recoverable: true,
  },
};

/** Build a friendly failure for a known code. */
export function ttsFailure(code: TtsErrorCode): TtsFailure {
  const f = FRIENDLY[code];
  return { code, message: f.message, recoverable: f.recoverable };
}

/**
 * Map a `SpeechSynthesisErrorEvent.error` value to a friendly failure. Unknown
 * codes become `unknown`; we never surface the raw browser token as the headline
 * message (§9).
 */
export function classifyTtsError(rawError: string | undefined): TtsFailure {
  switch (rawError) {
    case 'not-allowed':
    case 'service-not-allowed':
      return ttsFailure('not-allowed');
    case 'canceled':
    case 'interrupted':
      return ttsFailure('aborted');
    case 'voice-unavailable':
    case 'language-unavailable':
      return ttsFailure('voice-unavailable');
    case 'synthesis-failed':
    case 'synthesis-unavailable':
    case 'audio-busy':
    case 'audio-hardware':
    case 'text-too-long':
    case 'invalid-argument':
    case 'network':
      return ttsFailure('synthesis-failed');
    default:
      return ttsFailure('unknown');
  }
}
