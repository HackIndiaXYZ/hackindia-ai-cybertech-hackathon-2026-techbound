import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvatarAnimationCommand, AvatarCommandPayload, FacialExpression, IslConcept } from '@isl/shared-types';
import {
  AvatarController,
  isWebGLAvailable,
  loadBabylonAvatarAdapter,
  type AvatarLoaderStatus,
  type AvatarQueueSnapshot,
  type BabylonAdapterOptions,
  type PlayResult,
  type PerfSnapshot,
} from '../lib/avatar/index.js';

/**
 * Mounts the Babylon avatar on a canvas and exposes intent-level controls to the
 * AvatarViewer (§6). Babylon is imported lazily and only after WebGL is confirmed,
 * so the engine never loads for unsupported browsers or during headless tests.
 *
 * The hook is the Phase 3A seam: `handleCommands(payload)` already consumes the
 * existing `avatar:command` contract, so real translated concepts can drive the
 * same controller without any UI change (§7, §17).
 */
export type AvatarPhase = 'idle' | 'initializing' | 'ready' | 'unsupported' | 'error';

export interface UseAvatarOptions extends BabylonAdapterOptions {
  /** Poll interval (ms) for reading the live FPS sample into React state. */
  perfIntervalMs?: number;
  /**
   * Whether the canvas is currently in the DOM. Pages that mount the avatar panel
   * on demand (the in-call interpreter) must pass their toggle here, otherwise the
   * engine would try to initialise against a null canvas and never retry.
   */
  enabled?: boolean;
}

export interface AvatarApi {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  phase: AvatarPhase;
  loaderStatus: AvatarLoaderStatus;
  loaderReason?: string;
  rig: { name: string; isPlaceholder: boolean; bones: readonly string[]; assetSource: string } | null;
  queue: AvatarQueueSnapshot;
  perf: PerfSnapshot;
  error: string | null;
  playGesture: (gestureId: string) => PlayResult;
  playSequence: (gestureIds: readonly string[]) => PlayResult;
  playSampleGesture: () => PlayResult;
  playSampleSequence: () => PlayResult;
  enqueueConcept: (concept: IslConcept) => PlayResult;
  enqueueConcepts: (concepts: readonly IslConcept[]) => PlayResult;
  handleCommands: (payload: AvatarCommandPayload) => PlayResult;
  setExpression: (expression: FacialExpression) => void;
  pushLipSyncSample: (sample: number) => void;
  stop: () => void;
  reset: () => void;
  /** Exposed for advanced/testing wiring of raw commands straight to the mapper. */
  getController: () => AvatarController | null;
}

const EMPTY_QUEUE: AvatarQueueSnapshot = { state: 'idle', current: null, queued: [], length: 0 };
const EMPTY_PERF: PerfSnapshot = { fps: null, instantaneousFps: null, samples: 0 };

export function useAvatar(options: UseAvatarOptions = {}): AvatarApi {
  const { perfIntervalMs = 500, enabled = true, ...adapterOptions } = options;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AvatarController | null>(null);

  const [phase, setPhase] = useState<AvatarPhase>('idle');
  const [loaderStatus, setLoaderStatus] = useState<AvatarLoaderStatus>('idle');
  const [loaderReason, setLoaderReason] = useState<string | undefined>(undefined);
  const [rig, setRig] = useState<AvatarApi['rig']>(null);
  const [queue, setQueue] = useState<AvatarQueueSnapshot>(EMPTY_QUEUE);
  const [perf, setPerf] = useState<PerfSnapshot>(EMPTY_PERF);
  const [error, setError] = useState<string | null>(null);

  // Keep the adapter options stable so the init effect runs once per mount.
  const optionsRef = useRef(adapterOptions);
  useEffect(() => {
    optionsRef.current = adapterOptions;
  }, [adapterOptions]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    if (!isWebGLAvailable()) {
      setPhase('unsupported');
      setError('WebGL is unavailable in this browser, so the 3D avatar cannot render. The rest of the app is unaffected.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase('error');
      setError('Avatar canvas is not mounted.');
      return;
    }

    setPhase('initializing');

    void (async () => {
      try {
        const adapter = await loadBabylonAvatarAdapter(canvas, optionsRef.current);
        if (disposed) {
          adapter.dispose();
          return;
        }
        const controller = new AvatarController(adapter, { onStateChange: (snap) => setQueue(snap) });
        controllerRef.current = controller;

        setLoaderStatus(adapter.loaderStatus);
        setLoaderReason(adapter.loaderReason);
        setRig(adapter.rig);
        setQueue(controller.queueSnapshot());
        setPhase('ready');

        // Poll the measured FPS, and re-read the queue alongside it so the panel
        // cannot drift if a state callback is ever coalesced away by React.
        interval = setInterval(() => {
          setPerf(controller.perfSnapshot());
          const snap = controller.queueSnapshot();
          setQueue((prev) =>
            prev.state === snap.state &&
            prev.length === snap.length &&
            prev.current?.animationClipId === snap.current?.animationClipId
              ? prev
              : snap,
          );
        }, perfIntervalMs);
      } catch (err) {
        if (disposed) return;
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Failed to initialize the avatar engine.');
      }
    })();

    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // Initialises once per mount of the canvas. Options are read through
    // optionsRef, so `enabled` is the only value that can legitimately remount
    // the engine (a lazily rendered panel appears after the first render).
  }, [enabled, perfIntervalMs]);

  const requireController = useCallback((): AvatarController | null => controllerRef.current, []);

  const playGesture = useCallback((gestureId: string): PlayResult => {
    return requireController()?.playGesture(gestureId) ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const playSequence = useCallback((gestureIds: readonly string[]): PlayResult => {
    return requireController()?.playSequence(gestureIds) ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const playSampleGesture = useCallback((): PlayResult => {
    return requireController()?.playSampleGesture() ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const playSampleSequence = useCallback((): PlayResult => {
    return requireController()?.playSampleSequence() ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const enqueueConcept = useCallback((concept: IslConcept): PlayResult => {
    return requireController()?.enqueueConcept(concept) ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const enqueueConcepts = useCallback((concepts: readonly IslConcept[]): PlayResult => {
    return requireController()?.enqueueConcepts(concepts) ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const handleCommands = useCallback((payload: AvatarCommandPayload): PlayResult => {
    return requireController()?.handleCommandPayload(payload) ?? { accepted: 0, rejectedClips: [], unrecognized: [] };
  }, [requireController]);

  const setExpression = useCallback((expression: FacialExpression): void => {
    requireController()?.setExpression(expression);
  }, [requireController]);

  const pushLipSyncSample = useCallback((sample: number): void => {
    requireController()?.pushLipSyncSample(sample);
  }, [requireController]);

  const stop = useCallback((): void => {
    requireController()?.stop();
  }, [requireController]);

  const reset = useCallback((): void => {
    const controller = requireController();
    if (!controller) return;
    controller.reset();
    setQueue(controller.queueSnapshot());
    setPerf(controller.perfSnapshot());
  }, [requireController]);

  const getController = useCallback((): AvatarController | null => controllerRef.current, []);

  return {
    canvasRef,
    phase,
    loaderStatus,
    loaderReason,
    rig,
    queue,
    perf,
    error,
    playGesture,
    playSequence,
    playSampleGesture,
    playSampleSequence,
    enqueueConcept,
    enqueueConcepts,
    handleCommands,
    setExpression,
    pushLipSyncSample,
    stop,
    reset,
    getController,
  };
}

// Re-exported so the viewer can build raw commands without extra imports.
export type { AvatarAnimationCommand };
