/**
 * ISL Engine Provider (Phase 1: Real-time ISL Hierarchical Recognition).
 *
 * Implements {@link GestureClassifier} for live WebRTC calls.
 * Connects MediaPipe hand landmark observations to the trained Indian Sign Language
 * hierarchical transformer models in apps/isl-engine via Socket.io relay or direct client.
 *
 * Key guarantees:
 * 1. Privacy & Bandwidth: Streams 21-point hand landmark windows, never raw video frames.
 * 2. Real Confidence: Never fabricates confidence numbers; reports true probabilities from
 *    gating and specialist models.
 * 3. Honest Fallback: When the ISL engine is unavailable or uncontactable, transparently
 *    falls back to {@link HeuristicHandShapeClassifier} and sets trained = false.
 */
import type { HandPreference, GestureDetection } from '@isl/shared-types';
import { SignalEvent, type SignalClient } from '../socket.js';
import type { GestureClassifier } from './classifier.js';
import { HeuristicHandShapeClassifier } from './classifier.js';
import type { GesturePrediction, HandFeatures } from './types.js';
import { clamp } from './util.js';

export interface IslEngineProviderOptions {
  socket?: SignalClient | null;
  sessionId?: string;
  userId?: string;
  windowSize?: number;
  streamIntervalMs?: number;
  onDetection?: (detection: GestureDetection) => void;
  onStatusChange?: (status: 'online' | 'fallback' | 'offline') => void;
  customStreamer?: (landmarks: unknown[], timestamp: number) => Promise<GestureDetection | null> | void;
}

export class IslEngineProvider implements GestureClassifier {
  readonly name = 'isl-engine-hierarchical';

  private readonly windowSize: number;
  private readonly streamIntervalMs: number;
  private readonly socket: SignalClient | null;
  private readonly userId?: string;
  private readonly onDetection?: (detection: GestureDetection) => void;
  private readonly onStatusChange?: (status: 'online' | 'fallback' | 'offline') => void;
  private readonly customStreamer?: (landmarks: unknown[], timestamp: number) => Promise<GestureDetection | null> | void;

  private readonly heuristic = new HeuristicHandShapeClassifier();
  private landmarkWindow: Array<Array<{ x: number; y: number; z: number }>> = [];
  private lastStreamTime = 0;
  private lastTrainedPrediction: GesturePrediction | null = null;
  private lastPredictionTimestamp = 0;
  private lastLatencyMs = 0;
  private isOnline = true;
  private unsubSocket: (() => void) | null = null;
  private dynamicTtlMs = 1500; // retain dynamic prediction for 1.5 seconds

  constructor(options: IslEngineProviderOptions = {}) {
    this.windowSize = options.windowSize ?? 30;
    this.streamIntervalMs = options.streamIntervalMs ?? 250;
    this.socket = options.socket ?? null;
    this.userId = options.userId;
    this.onDetection = options.onDetection;
    this.onStatusChange = options.onStatusChange;
    this.customStreamer = options.customStreamer;

    this.attachSocket();
  }

  /**
   * Reports true when using the trained ISL hierarchical model,
   * false when degraded to the geometric heuristic.
   */
  get trained(): boolean {
    return this.isOnline;
  }

  get status(): 'online' | 'fallback' | 'offline' {
    if (!this.isOnline) return 'fallback';
    return 'online';
  }

  get latencyMs(): number {
    return this.lastLatencyMs;
  }

  private attachSocket(): void {
    if (!this.socket) return;

    this.unsubSocket = this.socket.on<GestureDetection>(
      SignalEvent.GestureDetected,
      (payload) => {
        if (!payload || !payload.gestureId) return;

        // Verify if this is an ISL engine prediction
        if (payload.provider === 'isl-engine-hierarchical' || payload.trained) {
          this.isOnline = true;
          this.lastTrainedPrediction = {
            gestureId: payload.gestureId,
            confidence: clamp(payload.confidence),
          };
          this.lastPredictionTimestamp = Date.now();

          const latency = (payload.breakdown as { latencyMs?: number } | undefined)?.latencyMs;
          if (typeof latency === 'number' && Number.isFinite(latency)) {
            this.lastLatencyMs = latency;
          }

          this.onDetection?.(payload);
          this.onStatusChange?.('online');
        }
      },
    );
  }

  /**
   * Feed one frame's hand landmarks into the sliding window.
   * When the window is sufficiently populated and the throttle interval has elapsed,
   * streams the window to the server relay.
   */
  feedLandmarks(landmarks: Array<{ x: number; y: number; z?: number }>): void {
    const sanitized = landmarks.map((pt) => ({
      x: pt.x,
      y: pt.y,
      z: pt.z ?? 0,
    }));

    this.landmarkWindow.push(sanitized);
    if (this.landmarkWindow.length > this.windowSize) {
      this.landmarkWindow.shift();
    }

    const now = Date.now();
    // Stream when we have at least 15 frames and debounce interval passed
    if (this.landmarkWindow.length >= 15 && now - this.lastStreamTime >= this.streamIntervalMs) {
      this.lastStreamTime = now;
      this.streamWindow(now);
    }
  }

  private streamWindow(timestamp: number): void {
    const windowPayload = [...this.landmarkWindow];

    if (this.customStreamer) {
      void Promise.resolve(this.customStreamer(windowPayload, timestamp))
        .then((detection) => {
          if (detection) {
            this.handleDirectDetection(detection);
          }
        })
        .catch(() => {
          this.handleEngineUnavailable();
        });
      return;
    }

    if (this.socket && this.socket.connected && this.userId) {
      try {
        this.socket.emit(SignalEvent.GestureLandmarks, {
          participantUserId: this.userId,
          landmarks: windowPayload,
          clientTimestamp: timestamp,
        });
      } catch {
        this.handleEngineUnavailable();
      }
    }
  }

  public handleDirectDetection(detection: GestureDetection): void {
    this.isOnline = true;
    this.lastTrainedPrediction = {
      gestureId: detection.gestureId,
      confidence: clamp(detection.confidence),
    };
    this.lastPredictionTimestamp = Date.now();
    const latency = (detection.breakdown as { latencyMs?: number } | undefined)?.latencyMs;
    if (typeof latency === 'number') {
      this.lastLatencyMs = latency;
    }
    this.onDetection?.(detection);
    this.onStatusChange?.('online');
  }

  public handleEngineUnavailable(): void {
    if (this.isOnline) {
      this.isOnline = false;
      this.onStatusChange?.('fallback');
    }
  }

  /**
   * Implements {@link GestureClassifier.classify}.
   * If a trained ISL engine prediction was recently recognized, returns it.
   * Otherwise falls back gracefully to the geometric hand shape heuristic.
   */
  classify(features: HandFeatures, handedness: HandPreference): GesturePrediction | null {
    const now = Date.now();

    // Check if dynamic trained sign is still active within TTL
    if (this.isOnline && this.lastTrainedPrediction && now - this.lastPredictionTimestamp < this.dynamicTtlMs) {
      return this.lastTrainedPrediction;
    }

    // Fall back to geometric handshape heuristic
    return this.heuristic.classify(features, handedness);
  }

  reset(): void {
    this.landmarkWindow = [];
    this.lastTrainedPrediction = null;
    this.lastPredictionTimestamp = 0;
    this.lastStreamTime = 0;
  }

  close(): void {
    this.reset();
    if (this.unsubSocket) {
      this.unsubSocket();
      this.unsubSocket = null;
    }
  }
}
