/**
 * MediaPipe Hands adapter (plan §13 "HandTrackingService", "Use MediaPipe Hands
 * for landmark extraction"). Wraps the real library behind {@link HandTracker}
 * so the rest of the pipeline (and every unit test) never touches the camera or
 * WASM. The library is imported lazily so it is only loaded when a real webcam
 * session actually starts, keeping it out of jsdom tests and the initial bundle.
 *
 * Model/WASM assets are served same-origin from /mediapipe/hands (see the
 * copy-assets script + predev/prebuild), never hot-linked from a CDN.
 */
import type { Hands as HandsInstance, Results } from '@mediapipe/hands';
import type { HandPreference, HandLandmarks } from '@isl/shared-types';
import type { FrameObservation, HandTracker, TrackedHand } from './types.js';
import { toLandmarks } from './normalize.js';
import { nowMs } from './util.js';
import { NUMBER_OF_LANDMARKS, VISION } from './constants.js';

export interface MediaPipeTrackerOptions {
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  assetPath?: string;
}

export class MediaPipeHandTracker implements HandTracker {
  private hands: HandsInstance | null = null;
  private readonly listeners: Array<(obs: FrameObservation) => void> = [];

  constructor(private readonly opts: MediaPipeTrackerOptions = {}) {}

  onFrame(cb: (obs: FrameObservation) => void): void {
    this.listeners.push(cb);
  }

  private async ensure(): Promise<HandsInstance> {
    if (this.hands) return this.hands;
    const { Hands } = await import('@mediapipe/hands');
    const assetPath = this.opts.assetPath ?? VISION.ASSET_PATH;
    const inst = new Hands({ locateFile: (file) => `${assetPath}/${file}` });
    inst.setOptions({
      // Mirror-correct so handedness labels match the user's real hands.
      selfieMode: true,
      maxNumHands: this.opts.maxNumHands ?? VISION.MAX_NUM_HANDS,
      modelComplexity: this.opts.modelComplexity ?? VISION.MODEL_COMPLEXITY,
      minDetectionConfidence: this.opts.minDetectionConfidence ?? VISION.MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence: this.opts.minTrackingConfidence ?? VISION.MIN_TRACKING_CONFIDENCE,
    });
    inst.onResults((results) => this.handleResults(results));
    this.hands = inst;
    return inst;
  }

  async observe(video: HTMLVideoElement): Promise<void> {
    const inst = await this.ensure();
    await inst.send({ image: video });
  }

  private handleResults(results: Results): void {
    const hands: TrackedHand[] = [];
    const landmarkSets = results.multiHandLandmarks ?? [];
    const handednessList = results.multiHandedness ?? [];

    for (let i = 0; i < landmarkSets.length; i += 1) {
      const landmarks: HandLandmarks = toLandmarks(landmarkSets[i]);
      // Skip incomplete detections rather than feed garbage to the classifier.
      if (landmarks.length !== NUMBER_OF_LANDMARKS) continue;
      const handed = handednessList[i];
      const handedness: HandPreference = handed?.label === 'Left' ? 'left' : 'right';
      hands.push({ handedness, landmarks, detectionConfidence: handed?.score ?? 0 });
    }

    const obs: FrameObservation = { timestampMs: nowMs(), hands };
    for (const cb of this.listeners) cb(obs);
  }

  async close(): Promise<void> {
    await this.hands?.close();
    this.hands = null;
  }
}
