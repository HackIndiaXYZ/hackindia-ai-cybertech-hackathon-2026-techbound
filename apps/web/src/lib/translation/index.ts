/**
 * Public surface of the Phase 3A translation module. The React hook, the pipeline
 * page and the tests import from here so the internal layout can change freely.
 * Pure and Babylon-free by design — the only cross-module import is the 2D
 * `GestureMapper` (via the avatar barrel, which never loads Babylon) used by the
 * bridge to turn concepts into the existing `avatar:command` contract.
 */
export * from './types.js';
export * from './constants.js';
export { clamp, round2 } from './util.js';
export { tokenize, detectLanguage, detectSignals } from './normalize.js';
export { DEFAULT_GLOSSARY, GLOSSARY_BY_CONCEPT } from './glossary.js';
export { buildGlossaryIndex, matchTokens, type GlossaryIndex } from './wordMapper.js';
export { buildConcepts, type BuiltConcepts } from './conceptBuilder.js';
export { orderConcepts } from './ordering.js';
export { applyNonManualMarkers } from './nonManual.js';
export { summarizeConfidence, type ConfidenceSummary } from './confidence.js';
export { TranslationService } from './translationService.js';
export {
  conceptsToCommands,
  representationToCommandPayload,
  type ConceptCommandMapping,
} from './bridge.js';
