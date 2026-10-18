/**
 * Temporal validation + sequence building (plan §13 "Temporal Validation",
 * "sequence validation", "gesture history", "GestureSequenceValidator").
 *
 * Debounce rules: a gesture must appear for `stableFrames` consecutive frames
 * AND be held for at least `minDwellMs` before it is emitted, and it is emitted
 * at most once per continuous hold. Any change of gesture resets the candidate,
 * so single-frame noise cannot trigger a false result (§13 acceptance: "temporal
 * validation prevents obvious false triggers"). Timestamps are caller-supplied so
 * this logic is deterministic and unit-testable without a clock or camera.
 */
import type {
  GestureDetection,
  GestureSequenceStep,
  HandPreference,
  ValidatedGestureSequence,
} from '@isl/shared-types';
import type { SequenceObservationInput } from './types.js';
import { VISION } from './constants.js';

export interface SequenceValidatorOptions {
  stableFrames?: number;
  minDwellMs?: number;
  maxHistorySize?: number;
}

interface Candidate {
  gestureId: string;
  label: string;
  frames: number;
  startedAt: number;
  lastSeenAt: number;
  peakConfidence: number;
  handedness: HandPreference;
  emitted: boolean;
}

export class GestureSequenceValidator {
  private readonly stableFrames: number;
  private readonly minDwellMs: number;
  private readonly maxHistorySize: number;

  private candidate: Candidate | null = null;
  private readonly history: GestureDetection[] = [];

  constructor(opts: SequenceValidatorOptions = {}) {
    this.stableFrames = opts.stableFrames ?? VISION.STABLE_FRAMES;
    this.minDwellMs = opts.minDwellMs ?? VISION.MIN_DWELL_MS;
    this.maxHistorySize = opts.maxHistorySize ?? VISION.MAX_HISTORY_SIZE;
  }

  /** Feed one hand's observation for one frame; returns a detection when debounced. */
  observe(input: SequenceObservationInput, timestampMs: number): GestureDetection | null {
    const c = this.candidate;

    if (c && c.gestureId === input.gestureId) {
      c.frames += 1;
      c.lastSeenAt = timestampMs;
      c.handedness = input.handedness;
      c.peakConfidence = Math.max(c.peakConfidence, input.confidence);

      if (!c.emitted && c.frames >= this.stableFrames && timestampMs - c.startedAt >= this.minDwellMs) {
        const detection = this.record(c);
        c.emitted = true;
        return detection;
      }
      return null;
    }

    // Different (or first) gesture: start a fresh candidate. This reset is the
    // debounce — the previous partial hold is discarded without being emitted.
    this.candidate = {
      gestureId: input.gestureId,
      label: input.label,
      frames: 1,
      startedAt: timestampMs,
      lastSeenAt: timestampMs,
      peakConfidence: input.confidence,
      handedness: input.handedness,
      emitted: false,
    };
    return null;
  }

  private record(c: Candidate): GestureDetection {
    const detection: GestureDetection = {
      gestureId: c.gestureId,
      label: c.label,
      confidence: c.peakConfidence,
      hands: [c.handedness],
      detectedAt: new Date().toISOString(),
    };
    this.history.push(detection);
    while (this.history.length > this.maxHistorySize) this.history.shift();
    return detection;
  }

  getHistory(): readonly GestureDetection[] {
    return [...this.history];
  }

  /** Fold recent history into a validated sequence for downstream text/UI. */
  buildSequence(sessionId: string, participantUserId: string): ValidatedGestureSequence | null {
    if (this.history.length === 0) return null;
    const steps: GestureSequenceStep[] = this.history.map((d) => ({
      gestureId: d.gestureId,
      label: d.label,
      confidence: d.confidence,
      startedAt: d.detectedAt,
      endedAt: d.detectedAt,
    }));
    const overallConfidence = steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length;
    return {
      sessionId,
      participantUserId,
      steps,
      overallConfidence,
      text: steps.map((s) => s.label).join(' · '),
      validatedAt: new Date().toISOString(),
    };
  }

  reset(): void {
    this.candidate = null;
    this.history.length = 0;
  }
}
