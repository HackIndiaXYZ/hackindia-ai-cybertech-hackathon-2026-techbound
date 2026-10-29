import type { MediaFailure } from '../webrtc/media.js';
import type { SpeechErrorCode, SpeechFailure } from './types.js';

/**
 * User-facing copy for each error code. Kept separate from raw browser strings
 * so the primary UX is always understandable and actionable (§9).
 */
const FRIENDLY: Record<SpeechErrorCode, { message: string; recoverable: boolean }> = {
  'permission-denied': {
    message: 'Microphone permission is required to start speech recognition.',
    recoverable: true,
  },
  'mic-unavailable': {
    message: 'No microphone was found. Connect one and try again.',
    recoverable: true,
  },
  unsupported: {
    message: 'This browser does not provide speech recognition. Try a recent Chrome or Edge.',
    recoverable: false,
  },
  'service-unavailable': {
    message: 'The speech service is unavailable right now. Please try again shortly.',
    recoverable: true,
  },
  aborted: {
    message: 'Speech recognition was stopped.',
    recoverable: true,
  },
  network: {
    message: 'A network problem interrupted recognition. Check your connection and try again.',
    recoverable: true,
  },
  'language-unsupported': {
    message: 'That language is not available in this browser. Please pick another language.',
    recoverable: true,
  },
  'no-speech': {
    message: 'No speech was detected. Check your microphone and try speaking.',
    recoverable: true,
  },
  unknown: {
    message: 'Speech recognition hit an unexpected error. Please try again.',
    recoverable: true,
  },
};

/** Build a friendly failure for a known code. */
export function speechFailure(code: SpeechErrorCode): SpeechFailure {
  const f = FRIENDLY[code];
  return { code, message: f.message, recoverable: f.recoverable };
}

/**
 * Map the Web Speech API `onerror` code to a friendly, actionable failure.
 * Unrecognized codes become `unknown` — we never surface the raw browser string
 * as the headline message (§9).
 */
export function classifySpeechError(rawError: string | undefined): SpeechFailure {
  switch (rawError) {
    case 'not-allowed':
    case 'service-not-allowed':
      return speechFailure('permission-denied');
    case 'audio-capture':
    case 'no-media':
      return speechFailure('mic-unavailable');
    case 'network':
      return speechFailure('network');
    case 'service-not-available':
      return speechFailure('service-unavailable');
    case 'language-not-supported':
      return speechFailure('language-unsupported');
    case 'no-speech':
      return speechFailure('no-speech');
    case 'aborted':
      return speechFailure('aborted');
    default:
      return speechFailure('unknown');
  }
}

/** Translate a preflight getUserMedia failure into the speech error vocabulary. */
export function classifyMediaFailure(failure: MediaFailure | undefined): SpeechFailure {
  switch (failure) {
    case 'denied':
      return speechFailure('permission-denied');
    case 'unsupported':
      return speechFailure('mic-unavailable');
    case 'unavailable':
      return speechFailure('mic-unavailable');
    case 'timeout':
      return speechFailure('service-unavailable');
    default:
      return speechFailure('unknown');
  }
}
