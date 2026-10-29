// Snapshot read is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
/**
 * Public surface of the Phase 3B text-to-speech module. The React hook, pages and
 * tests import from here so the internal file layout stays free to change.
 * Nothing here touches Babylon or the DOM at import time (browser globals are only
 * read inside the provider when a call is made).
 */
export * from './types.js';
export * from './constants.js';
export { clamp, round2, roundMs } from './util.js';
export { ttsFailure, classifyTtsError } from './errors.js';
export { TtsMetricsCollector } from './metrics.js';
export { DEFAULT_PROSODY, clampProsody, resolveProsody, effectiveVolume } from './prosody.js';
export { resolveVoice, hasPreferredLang, describeGenderAge, type VoiceSelection } from './voiceSelection.js';
export { TtsController, type TtsControllerOptions } from './ttsController.js';
export { WebSpeechSynthesisProvider, isSpeechSynthesisSupported } from './webSpeechSynthesisProvider.js';
export { IndicTtsProvider, type IndicTtsProviderOptions } from './indicTtsProvider.js';
export {
  getTtsProvider,
  registerTtsProvider,
  setActiveTtsProvider,
  currentTtsProviderName,
  availableTtsProviders,
} from './providerRegistry.js';

