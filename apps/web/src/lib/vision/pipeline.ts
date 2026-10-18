/**
 * Gesture recognition pipeline orchestrator (plan §13 end-to-end):
 *   Frame → Landmarks → Normalization → Features → Classifier → Confidence
 *   → Temporal Validation → Recognized concept → events for UI/Text.
 *
 * It is transport-agnostic: any {@link HandTracker} (real MediaPipe or a test
 * fake) can be injected. Confidence surfaced downstream composes the smoothed
 * classifier certainty with MediaPipe's per-hand detection score, so a low-
 * confidence track cannot masquerade as a confident recognition. Latency is
 * measured per frame, never asserted.
 */
import type { GestureDetection, ValidatedGestureSequence } from '@isl/shared-types';
import type { FrameObservation, GestureVocabulary, HandTracker } from './types.js';
import type { GestureClassifier } from './classifier.js';
import type { GestureConfidenceService } from './confidence.js';
import type { GestureSequenceValidator } from './sequenceValidator.js';
import { normalizeHand } from './normalize.js';
import { extractFeatures } from './features.js';
import { DEFAULT_VOCABULARY } from './constants.js';
import { clamp, nowMs } from './util.js';

export interface PipelineEvents {
  onFrame?(obs: FrameObservation): void;
  onDetection?(detection: GestureDetection): void;
}

export interface PipelineDeps {
  tracker: HandTracker;
  classifier: GestureClassifier;
  confidence: GestureConfidenceService;
  validator: GestureSequenceValidator;
  events?: PipelineEvents;
  vocabulary?: GestureVocabulary;
}

function prettify(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export class GestureRecognitionPipeline {
  private lastInferenceMs = 0;
  private processedFrames = 0;
  private readonly vocabulary: GestureVocabulary;

  constructor(private readonly deps: PipelineDeps) {
    this.vocabulary = deps.vocabulary ?? DEFAULT_VOCABULARY;
    deps.tracker.onFrame((obs) => this.handleFrame(obs));
  }

  /** Push one video frame into the tracker; results arrive via onFrame. */
  observe(video: HTMLVideoElement): Promise<void> {
    return this.deps.tracker.observe(video);
  }

  private handleFrame(obs: FrameObservation): void {
    const t0 = nowMs();

    for (const hand of obs.hands) {
      const normalized = normalizeHand(hand.landmarks);
      const features = extractFeatures(normalized);
      if (!features) continue;

      const prediction = this.deps.classifier.classify(features, hand.handedness);
      if (!prediction) continue; // ambiguous — report nothing (no fabrication)

      const label = this.vocabulary[prediction.gestureId] ?? prettify(prediction.gestureId);
      const smoothed = this.deps.confidence.smooth(prediction.gestureId, prediction.confidence);
      // Compose with the detector's own certainty for this hand. A 0 detection
      // score must gate the result out (never fabricate on an unreliable track),
      // so we clamp the raw value directly rather than falling back to 1.
      const composed = smoothed * clamp(hand.detectionConfidence);
      if (!this.deps.confidence.isConfident(composed)) continue;

      const detection = this.deps.validator.observe(
        { gestureId: prediction.gestureId, label, confidence: composed, handedness: hand.handedness },
        obs.timestampMs,
      );
      if (detection) this.deps.events?.onDetection?.(detection);
    }

    this.lastInferenceMs = nowMs() - t0;
    this.processedFrames += 1;
    this.deps.events?.onFrame?.(obs);
  }

  /** Measured pipeline cost for the most recent frame (ms). */
  getLatencyMs(): number {
    return this.lastInferenceMs;
  }

  getFrameCount(): number {
    return this.processedFrames;
  }

  get classifierName(): string {
    return this.deps.classifier.name;
  }

  /** False while the heuristic is in use — drives the honest UI notice. */
  get classifierTrained(): boolean {
    return this.deps.classifier.trained;
  }

  getHistory(): readonly GestureDetection[] {
    return this.deps.validator.getHistory();
  }

  buildSequence(sessionId: string, participantUserId: string): ValidatedGestureSequence | null {
    return this.deps.validator.buildSequence(sessionId, participantUserId);
  }

  reset(): void {
    this.deps.validator.reset();
    this.deps.confidence.reset();
    this.processedFrames = 0;
    this.lastInferenceMs = 0;
  }

  async close(): Promise<void> {
    await this.deps.tracker.close();
  }
}
