/**
 * Test factories for the vision pipeline. Provides synthetic 21-point hands and
 * a fake {@link HandTracker} so the pipeline is exercised deterministically
 * without a camera or WASM (which jsdom cannot run).
 */
import type { HandLandmarks } from '@isl/shared-types';
import type { FrameObservation, HandTracker } from './types.js';

type P = [number, number];

function hand(points: P[]): HandLandmarks {
  if (points.length !== 21) throw new Error(`expected 21 landmarks, got ${points.length}`);
  return points.map(([x, y]) => ({ x, y, z: 0 }));
}

/** All four fingers extended and the thumb held out. */
export function makeOpenPalm(): HandLandmarks {
  return hand([
    [0.5, 1.0], // 0 wrist
    [0.4, 0.85], [0.32, 0.78], [0.24, 0.7], [0.15, 0.6], // 1-4 thumb
    [0.42, 0.72], [0.42, 0.55], [0.42, 0.45], [0.42, 0.32], // 5-8 index
    [0.5, 0.7], [0.5, 0.5], [0.5, 0.4], [0.5, 0.28], // 9-12 middle
    [0.58, 0.72], [0.58, 0.55], [0.58, 0.45], [0.58, 0.33], // 13-16 ring
    [0.65, 0.75], [0.65, 0.6], [0.65, 0.52], [0.65, 0.4], // 17-20 pinky
  ]);
}

/** All fingers curled toward the palm, thumb tucked across. */
export function makeFist(): HandLandmarks {
  return hand([
    [0.5, 1.0], // 0 wrist
    [0.44, 0.88], [0.4, 0.85], [0.46, 0.82], [0.52, 0.82], // 1-4 thumb (tucked)
    [0.44, 0.7], [0.44, 0.6], [0.45, 0.72], [0.46, 0.85], // 5-8 index (curled)
    [0.5, 0.68], [0.5, 0.58], [0.51, 0.7], [0.52, 0.84], // 9-12 middle
    [0.56, 0.7], [0.56, 0.6], [0.56, 0.72], [0.56, 0.85], // 13-16 ring
    [0.6, 0.72], [0.6, 0.62], [0.6, 0.74], [0.6, 0.86], // 17-20 pinky
  ]);
}

/** A tracker whose frames are pushed manually by tests. */
export class FakeHandTracker implements HandTracker {
  closed = false;
  private listener: ((obs: FrameObservation) => void) | null = null;

  onFrame(cb: (obs: FrameObservation) => void): void {
    this.listener = cb;
  }

  async observe(_video: HTMLVideoElement): Promise<void> {
    /* no-op: results are delivered via push() in tests */
  }

  push(obs: FrameObservation): void {
    this.listener?.(obs);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function observationAt(timestampMs: number, landmarks: HandLandmarks, detectionConfidence = 1): FrameObservation {
  return {
    timestampMs,
    hands: [{ handedness: 'right', landmarks, detectionConfidence }],
  };
}
