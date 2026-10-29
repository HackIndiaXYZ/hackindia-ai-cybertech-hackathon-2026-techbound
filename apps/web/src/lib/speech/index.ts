/**
 * Public surface of the Phase 2C speech module. The React hook, components and
 * tests import from here so the internal file layout stays free to change.
 */
export * from './types.js';
export * from './constants.js';
export * from './transcriptModel.js';
export { readConfidence, formatConfidence } from './confidence.js';
export {
  computeLatency,
  roundMs,
  LatencyTracker,
  performanceClock,
  type Clock,
} from './latency.js';
export { speechFailure, classifySpeechError, classifyMediaFailure } from './errors.js';
export { WebSpeechProvider, isWebSpeechSupported } from './webSpeechProvider.js';
export { WhisperSpeechProvider, type WhisperSpeechProviderOptions } from './whisperSpeechProvider.js';
export {
  getSpeechProvider,
  registerSpeechProvider,
  setActiveSpeechProvider,
  currentProviderName,
  availableProviders,
} from './providerRegistry.js';

