/**
 * Gesture classification (plan §13 "Gesture Classifier" + "model abstraction").
 *
 * The {@link GestureClassifier} interface is the pluggable seam: today we ship a
 * clearly-labelled geometric heuristic that reports a *generic hand shape*, not
 * a translation. A trained ISL model would implement the same interface and set
 * `trained = true`. We NEVER fabricate recognition results: an ambiguous hand
 * returns `null`, and the heuristic self-declares `trained = false`.
 */
import type { HandPreference } from '@isl/shared-types';
import type { GesturePrediction, HandFeatures } from './types.js';
import { clamp } from './util.js';

export interface GestureClassifier {
  /** Stable identifier for observability / ADRs. */
  readonly name: string;
  /** False for the heuristic. A real model must set true AND be validated. */
  readonly trained: boolean;
  classify(features: HandFeatures, handedness: HandPreference): GesturePrediction | null;
}

function pred(gestureId: string, confidence: number): GesturePrediction {
  return { gestureId, confidence: clamp(confidence) };
}

/**
 * Rule-based hand-shape heuristic over the interpretable feature vector.
 * Confidence here is a *rule-certainty* proxy, not statistical accuracy.
 */
export class HeuristicHandShapeClassifier implements GestureClassifier {
  readonly name = 'heuristic-handshape-v0';
  readonly trained = false;

  classify(f: HandFeatures, _handedness: HandPreference): GesturePrediction | null {
    const [, index, middle, ring, pinky] = f.fingersExtended;
    const thumb = f.thumbExtended;
    const up = f.extendedFingerCount;

    // OK / circle: thumb meets index while the other three stay up.
    if (f.pinchDistance < 0.18 && middle && ring && pinky) {
      return pred('ok_sign', 0.72 + (0.18 - f.pinchDistance));
    }
    // Thumb up: only the thumb is out.
    if (thumb && !index && !middle && !ring && !pinky) {
      return pred('thumbs_up', 0.72);
    }
    // Fist: no fingers extended. Tighter pinch => more certain.
    if (up === 0) {
      return pred('fist', f.pinchDistance < 0.5 ? 0.8 : 0.64);
    }
    // Pointing: index only.
    if (index && !middle && !ring && !pinky) {
      return pred('pointing', 0.74);
    }
    // Two fingers (peace/V): index + middle only.
    if (index && middle && !ring && !pinky) {
      return pred('peace', 0.7);
    }
    // Open palm: all four fingers out; wider spread => more certain.
    if (up === 4) {
      return pred('open_palm', clamp(0.6 + f.fingerSpread * 0.25));
    }
    // Any other combination is genuinely ambiguous — report nothing.
    return null;
  }
}
