import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { GestureDetection } from '@isl/shared-types';
import { requestLocalMedia, stopStream } from '../lib/webrtc/media.js';
import {
  GestureRecognitionPipeline,
  GestureConfidenceService,
  GestureSequenceValidator,
  HeuristicHandShapeClassifier,
  MediaPipeHandTracker,
  HAND_CONNECTIONS,
  VISION,
  type FrameObservation,
  type HandTracker,
} from '../lib/vision/index.js';

export type VisionStatus = 'idle' | 'requesting' | 'running' | 'error';

/** A buffered, privacy-safe training frame: normalized landmarks only, no pixels. */
export interface RecordedFrame {
  capturedAt: string;
  hands: Array<{ handedness: 'left' | 'right'; landmarks: Array<{ x: number; y: number; z: number }> }>;
}

export interface UseGestureRecognitionArgs {
  /** Optional injection point so tests / alternative trackers can replace MediaPipe. */
  createTracker?: () => HandTracker;
  maxRecordedFrames?: number;
}

import { islEngineClient } from '../lib/vision/islEngineClient.js';

export interface TrainedSignDetection {
  label: string;
  confidence: number;
  timestamp: number;
}

export interface GestureRecognitionApi {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  stream: MediaStream | null;
  status: VisionStatus;
  errorMessage: string | null;
  activeHands: number;
  lastDetection: GestureDetection | null;
  history: readonly GestureDetection[];
  latencyMs: number;
  classifierTrained: boolean;
  recording: boolean;
  start: () => Promise<void>;
  stop: () => void;
  toggleRecording: () => void;
  bufferedSampleCount: number;
  exportRecordedSamples: () => RecordedFrame[];
  engineOnline: boolean;
  trainedDetection: TrainedSignDetection | null;
  setUseTrainedModel: (use: boolean) => void;
  useTrainedModel: boolean;
}

const MAX_RECORD_FRAMES_DEFAULT = 300;

/**
 * Owns a live webcam → landmark → gesture pipeline for the Translator surface.
 * Camera and WASM are only touched on an explicit start(), so this is inert (and
 * side-effect free) in tests and on initial render. Recognition is honest: the
 * heuristic reports generic hand shapes and self-declares `trained = false`.
 */
export function useGestureRecognition(args: UseGestureRecognitionArgs = {}): GestureRecognitionApi {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const pipelineRef = useRef<GestureRecognitionPipeline | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const recordingRef = useRef(false);
  const bufferRef = useRef<RecordedFrame[]>([]);

  const [status, setStatus] = useState<VisionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeHands, setActiveHands] = useState(0);
  const [lastDetection, setLastDetection] = useState<GestureDetection | null>(null);
  const [history, setHistory] = useState<readonly GestureDetection[]>([]);
  const [latencyMs, setLatencyMs] = useState(0);
  const [classifierTrained, setClassifierTrained] = useState(false);
  const [recording, setRecording] = useState(false);
  const [bufferedSampleCount, setBufferedSampleCount] = useState(0);
  const [engineOnline, setEngineOnline] = useState(false);
  const [trainedDetection, setTrainedDetection] = useState<TrainedSignDetection | null>(null);
  const [useTrainedModel, setUseTrainedModel] = useState(true);

  const lastPredictTimeRef = useRef(0);
  const isPredictingRef = useRef(false);

  // Check backend ISL ML engine availability on mount
  useEffect(() => {
    let unmounted = false;
    islEngineClient.getHealth().then((health) => {
      if (!unmounted) {
        setEngineOnline(health.engineAvailable);
      }
    });
    return () => {
      unmounted = true;
    };
  }, []);

  const maxRecordFrames = args.maxRecordedFrames ?? MAX_RECORD_FRAMES_DEFAULT;

  const drawOverlay = useCallback((obs: FrameObservation) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#5b8def';
    ctx.fillStyle = '#e23b3b';

    for (const hand of obs.hands) {
      const pts = hand.landmarks;
      for (const [a, b] of HAND_CONNECTIONS) {
        const p1 = pts[a];
        const p2 = pts[b];
        if (!p1 || !p2) continue;
        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.stroke();
      }
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, []);

  const bufferFrame = useCallback(
    (obs: FrameObservation) => {
      if (!recordingRef.current) return; // opt-in only; off by default
      bufferRef.current.push({
        capturedAt: new Date().toISOString(),
        hands: obs.hands.map((h) => ({
          handedness: h.handedness,
          landmarks: h.landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })),
        })),
      });
      if (bufferRef.current.length > maxRecordFrames) bufferRef.current.shift();
      setBufferedSampleCount(bufferRef.current.length);
    },
    [maxRecordFrames],
  );

  const teardown = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void pipelineRef.current?.close();
    pipelineRef.current = null;
    stopStream(streamRef.current ?? undefined);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (rafRef.current != null) return; // already running
    setStatus('requesting');
    setErrorMessage(null);

    const media = await requestLocalMedia({ audio: false, video: true });
    if (!media.stream) {
      setStatus('error');
      setErrorMessage(media.message);
      return;
    }
    streamRef.current = media.stream;
    const video = videoRef.current;
    if (!video) {
      setStatus('error');
      setErrorMessage('Camera preview is not ready.');
      return;
    }
    video.srcObject = media.stream;
    await video.play().catch(() => undefined);

    const tracker = args.createTracker
      ? args.createTracker()
      : new MediaPipeHandTracker({
          // Say it once and stop pushing frames, instead of failing silently at
          // 60 frames a second. The camera stream is left alone on purpose: other
          // surfaces (the call tile) still need it.
          onError: (message) => {
            if (rafRef.current != null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setStatus('error');
            setErrorMessage(message);
          },
        });
    const pipeline = new GestureRecognitionPipeline({
      tracker,
      classifier: new HeuristicHandShapeClassifier(),
      confidence: new GestureConfidenceService({
        minConfidence: VISION.MIN_CONFIDENCE,
        smoothingAlpha: VISION.SMOOTHING_ALPHA,
      }),
      validator: new GestureSequenceValidator({
        stableFrames: VISION.STABLE_FRAMES,
        minDwellMs: VISION.MIN_DWELL_MS,
        maxHistorySize: VISION.MAX_HISTORY_SIZE,
      }),
      events: {
        onFrame: (obs) => {
          drawOverlay(obs);
          bufferFrame(obs);
          setActiveHands(obs.hands.length);
          setLatencyMs(pipeline.getLatencyMs());

          // Trigger trained ISL engine static prediction if active and hand present
          if (useTrainedModel && obs.hands.length > 0 && obs.hands[0]?.landmarks?.length > 0) {
            const now = Date.now();
            if (!isPredictingRef.current && now - lastPredictTimeRef.current >= 250) {
              lastPredictTimeRef.current = now;
              isPredictingRef.current = true;
              islEngineClient
                .predictStatic(obs.hands[0].landmarks as unknown as import('@isl/shared-types').HandLandmarks)
                .then((res) => {
                  if (res && res.prediction && res.prediction !== '-') {
                    setTrainedDetection({
                      label: res.prediction,
                      confidence: res.confidence,
                      timestamp: Date.now(),
                    });
                  }
                })
                .catch(() => {
                  // Graceful fallback
                })
                .finally(() => {
                  isPredictingRef.current = false;
                });
            }
          }
        },
        onDetection: (detection) => {
          setLastDetection(detection);
          setHistory(pipeline.getHistory());
        },
      },
    });
    pipelineRef.current = pipeline;
    setClassifierTrained(pipeline.classifierTrained);
    setStatus('running');

    const loop = () => {
      const v = videoRef.current;
      if (v && pipelineRef.current && v.readyState >= 2) {
        void pipelineRef.current.observe(v);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [args, drawOverlay, bufferFrame, useTrainedModel]);

  const stop = useCallback(() => {
    teardown();
    setStatus('idle');
    setActiveHands(0);
    setLatencyMs(0);
  }, [teardown]);

  const toggleRecording = useCallback(() => {
    setRecording((prev) => {
      const next = !prev;
      recordingRef.current = next;
      if (!next) {
        bufferRef.current = []; // turning off discards buffered landmark frames
        setBufferedSampleCount(0);
      }
      return next;
    });
  }, []);

  const exportRecordedSamples = useCallback((): RecordedFrame[] => {
    return [...bufferRef.current];
  }, []);

  // Ensure the camera + pipeline never outlive the component.
  useEffect(() => () => teardown(), [teardown]);

  return {
    videoRef,
    canvasRef,
    stream: streamRef.current,
    status,
    errorMessage,
    activeHands,
    lastDetection,
    history,
    latencyMs,
    classifierTrained,
    recording,
    start,
    stop,
    toggleRecording,
    bufferedSampleCount,
    exportRecordedSamples,
    engineOnline,
    trainedDetection,
    setUseTrainedModel,
    useTrainedModel,
  };
}
