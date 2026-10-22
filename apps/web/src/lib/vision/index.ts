/**
 * Public surface of the Phase 2B vision module. The React hook and tests import
 * from here so internal file layout stays free to change.
 */
export * from './types.js';
export * from './constants.js';
export { toLandmarks, normalizeHand, isCompleteHand } from './normalize.js';
export { extractFeatures } from './features.js';
export { HeuristicHandShapeClassifier, type GestureClassifier } from './classifier.js';
export { GestureConfidenceService, type ConfidenceServiceOptions } from './confidence.js';
export { GestureSequenceValidator, type SequenceValidatorOptions } from './sequenceValidator.js';
export { MediaPipeHandTracker, type MediaPipeTrackerOptions } from './mediapipeAdapter.js';
export { GestureRecognitionPipeline, type PipelineDeps, type PipelineEvents } from './pipeline.js';
export { islEngineClient, type StaticPredictionResult, type DynamicPredictionResult, type TranslateResult, type FormatSentenceResult } from './islEngineClient.js';
export { IslEngineProvider, type IslEngineProviderOptions } from './islEngineProvider.js';
