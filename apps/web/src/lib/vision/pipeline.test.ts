import { describe, it, expect } from 'vitest';
import type { GestureDetection } from '@isl/shared-types';
import { GestureRecognitionPipeline } from './pipeline.js';
import { HeuristicHandShapeClassifier } from './classifier.js';
import { GestureConfidenceService } from './confidence.js';
import { GestureSequenceValidator } from './sequenceValidator.js';
import { FakeHandTracker, makeOpenPalm, observationAt } from './testFactories.js';

function build(detections: GestureDetection[]) {
  const tracker = new FakeHandTracker();
  const pipeline = new GestureRecognitionPipeline({
    tracker,
    classifier: new HeuristicHandShapeClassifier(),
    confidence: new GestureConfidenceService({ minConfidence: 0.5, smoothingAlpha: 1 }),
    validator: new GestureSequenceValidator({ stableFrames: 3, minDwellMs: 0, maxHistorySize: 5 }),
    events: { onDetection: (d) => detections.push(d) },
  });
  return { tracker, pipeline };
}

describe('GestureRecognitionPipeline (§13 end-to-end, injected fake tracker)', () => {
  it('emits a validated detection only after the debounce window', () => {
    const detections: GestureDetection[] = [];
    const { tracker, pipeline } = build(detections);
    const lm = makeOpenPalm();
    tracker.push(observationAt(0, lm));
    tracker.push(observationAt(1, lm));
    expect(detections).toHaveLength(0); // not yet stable
    tracker.push(observationAt(2, lm));
    expect(detections).toHaveLength(1);
    expect(detections[0].label).toBe('Open palm');
    expect(detections[0].confidence).toBeGreaterThanOrEqual(0.5);
    expect(pipeline.getFrameCount()).toBe(3);
  });

  it('never fabricates a result on an unreliable (zero-confidence) track', () => {
    const detections: GestureDetection[] = [];
    const { tracker } = build(detections);
    const lm = makeOpenPalm();
    for (let i = 0; i < 5; i += 1) tracker.push(observationAt(i, lm, 0));
    expect(detections).toHaveLength(0); // composed confidence gated out
  });

  it('exposes measured latency + untrained classifier and closes the tracker', async () => {
    const detections: GestureDetection[] = [];
    const { tracker, pipeline } = build(detections);
    tracker.push(observationAt(0, makeOpenPalm()));
    expect(pipeline.getLatencyMs()).toBeGreaterThanOrEqual(0);
    expect(pipeline.classifierTrained).toBe(false);
    await pipeline.close();
    expect(tracker.closed).toBe(true);
  });

  it('reset clears history and frame counter', () => {
    const detections: GestureDetection[] = [];
    const { tracker, pipeline } = build(detections);
    const lm = makeOpenPalm();
    tracker.push(observationAt(0, lm));
    tracker.push(observationAt(1, lm));
    tracker.push(observationAt(2, lm));
    pipeline.reset();
    expect(pipeline.getFrameCount()).toBe(0);
    expect(pipeline.getHistory()).toHaveLength(0);
  });
});
