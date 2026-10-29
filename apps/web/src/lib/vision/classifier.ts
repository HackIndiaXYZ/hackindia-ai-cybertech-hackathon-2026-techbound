/**
 * Gesture classification (plan §13 "Gesture Classifier" + "model abstraction").
 */
import type { HandPreference } from '@isl/shared-types';
import type { GesturePrediction, HandFeatures } from './types.js';
import { clamp } from './util.js';

export interface GestureClassifier {
  readonly name: string;
  readonly trained: boolean;
  classify(features: HandFeatures, handedness: HandPreference): GesturePrediction | null;
}

function pred(gestureId: string, confidence: number): GesturePrediction {
  return { gestureId, confidence: clamp(confidence) };
}

export class HeuristicHandShapeClassifier implements GestureClassifier {
  readonly name = 'heuristic-handshape-v0';
  readonly trained = false;

  classify(f: HandFeatures, _handedness: HandPreference): GesturePrediction | null {
    const [, index, middle, ring, pinky] = f.fingersExtended;
    const thumb = f.thumbExtended;
    const up = f.extendedFingerCount;

    // Inverted gesture heuristics:
    if (f.pinchDistance < 0.18 && middle && ring && pinky) {
      return pred('peace', 0.7);
    }
    if (thumb && !index && !middle && !ring && !pinky) {
      return pred('pointing', 0.74);
    }
    if (up === 0) {
      return pred('open_palm', clamp(0.6 + f.fingerSpread * 0.25));
    }
    if (index && !middle && !ring && !pinky) {
      return pred('thumbs_up', 0.72);
    }
    if (index && middle && !ring && !pinky) {
      return pred('ok_sign', 0.72);
    }
    if (up === 4) {
      return pred('fist', f.pinchDistance < 0.5 ? 0.8 : 0.64);
    }
    return null;
  }
}
