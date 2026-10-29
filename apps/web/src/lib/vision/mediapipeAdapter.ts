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
  /**
   * Called exactly once if the tracker can never be made to work (assets missing,
   * WASM aborted). The caller should label the state honestly instead of leaving
   * the UI stuck on "Idle" while frames are thrown at a dead module.
   */
  onError?: (message: string) => void;
}

/**
 * The legacy MediaPipe `Hands` solution is a single global Emscripten module, so
 * exactly one instance may exist at a time. Frames arrive from a
 * requestAnimationFrame loop that does not await, and React StrictMode mounts the
 * webcam effect twice in development: without a shared in-flight promise every
 * concurrent frame would run `new Hands()` and the second instantiation aborts
 * the first ("Module.arguments has been replaced…"), which then throws on every
 * remaining frame. Creation is therefore memoised, and a failure latches the
 * tracker off instead of retrying forever.
 *
 * The same loop would also hand the graph a new frame while the previous frame
 * was still being processed. MediaPipe's graph is not re-entrant — overlapping
 * `send()` calls surface as "Calculator::Open … Graph has errors" and
 * out-of-bounds WASM memory access — so a frame that arrives while one is in
 * flight is dropped rather than queued. Dropping costs nothing: the tracker is
 * temporal and the classifier samples a rolling window either way.
 */
export class MediaPipeHandTracker implements HandTracker {
  private hands: HandsInstance | null = null;
  private init: Promise<HandsInstance> | null = null;
  private inFlight = false;
  private closed = false;
  private failure: string | null = null;
  private readonly listeners: Array<(obs: FrameObservation) => void> = [];

  constructor(private readonly opts: MediaPipeTrackerOptions = {}) {}

  onFrame(cb: (obs: FrameObservation) => void): void {
    this.listeners.push(cb);
  }

  /** Why tracking stopped, or null while it is (or may still become) healthy. */
  getErrorMessage(): string | null {
    return this.failure;
  }

  private async create(): Promise<HandsInstance> {
    const { Hands } = await import('@mediapipe/hands');
    const assetPath = this.opts.assetPath ?? VISION.ASSET_PATH;
    const inst = new Hands({ locateFile: (file) => `${assetPath}/${file}` });
    inst.setOptions({
      // Mirrors the input frame, so the landmark coordinates this emits are
      // already in self-view space. Every overlay canvas relies on that — see
      // LANDMARK_OVERLAY_CLASS, which must never apply a second CSS flip.
      selfieMode: VISION.SELFIE_MODE,
      maxNumHands: this.opts.maxNumHands ?? VISION.MAX_NUM_HANDS,
      modelComplexity: this.opts.modelComplexity ?? VISION.MODEL_COMPLEXITY,
      minDetectionConfidence: this.opts.minDetectionConfidence ?? VISION.MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence: this.opts.minTrackingConfidence ?? VISION.MIN_TRACKING_CONFIDENCE,
    });
    inst.onResults((results) => this.handleResults(results));
    // The panel was torn down (StrictMode, camera off) while the ~10 MB of WASM
    // and models were still downloading. Releasing it here is what keeps a
    // second instance from ever existing.
    if (this.closed) {
      await inst.close().catch(() => undefined);
      throw new Error('Sign recognition was turned off before it finished starting.');
    }
    this.hands = inst;
    return inst;
  }

  private ensure(): Promise<HandsInstance> {
    if (this.hands) return Promise.resolve(this.hands);
    if (!this.init) {
      this.init = this.create().catch((err: unknown) => {
        this.init = null;
        throw err;
      });
    }
    return this.init;
  }

  private fail(message: string): void {
    if (this.failure) return;
    this.failure = message;
    this.closed = true;
    this.init = null;
    this.hands = null;
    this.opts.onError?.(message);
  }

  async observe(video: HTMLVideoElement): Promise<void> {
    // Fail-stop: once the module is dead, sending another frame only produces
    // another exception, and this runs 60 times a second.
    if (this.closed || this.failure) return;
    let inst: HandsInstance;
    try {
      inst = await this.ensure();
    } catch (err) {
      this.fail(
        `Sign recognition could not start: ${err instanceof Error ? err.message : String(err)}. ` +
          'The camera image is unaffected.',
      );
      return;
    }
    if (this.closed || this.failure) return;
    // One frame at a time: the WASM graph cannot process two concurrently.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await inst.send({ image: video });
    } catch (err) {
      this.fail(
        `Sign recognition stopped: ${err instanceof Error ? err.message : String(err)}. ` +
          'Speech translation and captions keep working.',
      );
    } finally {
      this.inFlight = false;
    }
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
    this.closed = true;
    const pending = this.init;
    const inst = this.hands;
    this.init = null;
    this.hands = null;
    try {
      // Await an in-flight start first: closing a solution while its WASM is
      // still loading is another way to end up with two live modules.
      const created = pending ? await pending : inst;
      await created?.close();
    } catch {
      // A module that already aborted cannot be closed; nothing left to do.
    }
  }
}
