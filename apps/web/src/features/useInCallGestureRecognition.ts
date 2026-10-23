import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import type { GestureDetection } from '@isl/shared-types';
import {
  MediaPipeHandTracker,
  IslEngineProvider,
  type FrameObservation,
  HAND_CONNECTIONS,
} from '../lib/vision/index.js';

export interface UseInCallGestureRecognitionArgs {
  stream: MediaStream | null;
  enabled: boolean;
  emitLandmarks: (landmarks: unknown[], timestamp?: number) => void;
  onDetection?: (detection: GestureDetection) => void;
}

export interface InCallGestureRecognitionApi {
  canvasRef: RefObject<HTMLCanvasElement>;
  active: boolean;
  engineStatus: 'online' | 'fallback' | 'offline';
  /** Why recognition stopped, when it did; null while it is running. */
  errorMessage: string | null;
  latencyMs: number;
  lastDetection: GestureDetection | null;
  trained: boolean;
}

/**
 * Hook for in-call gesture recognition (Phase 1).
 * Extracts MediaPipe hand landmarks from the local WebRTC video stream
 * and streams rolling landmark windows to the ISL hierarchical engine.
 */
export function useInCallGestureRecognition({
  stream,
  enabled,
  emitLandmarks,
  onDetection,
}: UseInCallGestureRecognitionArgs): InCallGestureRecognitionApi {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<MediaPipeHandTracker | null>(null);
  const providerRef = useRef<IslEngineProvider | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const [active, setActive] = useState(false);
  const [engineStatus, setEngineStatus] = useState<'online' | 'fallback' | 'offline'>('online');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState(0);
  const [lastDetection, setLastDetection] = useState<GestureDetection | null>(null);
  const [trained, setTrained] = useState(true);

  const drawOverlay = useCallback((obs: FrameObservation) => {
    const canvas = canvasRef.current;
    const video = hiddenVideoRef.current;
    if (!canvas || !video) return;

    if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = '#f43f5e';

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

  useEffect(() => {
    if (!enabled || !stream) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      void trackerRef.current?.close();
      trackerRef.current = null;
      providerRef.current?.close();
      providerRef.current = null;
      if (hiddenVideoRef.current) {
        hiddenVideoRef.current.srcObject = null;
        hiddenVideoRef.current = null;
      }
      setActive(false);
      setErrorMessage(null);
      return;
    }

    let isCancelled = false;

    // Create offscreen video element for MediaPipe frame analysis
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    hiddenVideoRef.current = video;

    const provider = new IslEngineProvider({
      windowSize: 30,
      streamIntervalMs: 250,
      customStreamer: (landmarks, timestamp) => {
        emitLandmarks(landmarks, timestamp);
      },
      onDetection: (detection) => {
        if (!isCancelled) {
          setLastDetection(detection);
          setLatencyMs(provider.latencyMs);
          onDetection?.(detection);
        }
      },
      onStatusChange: (status) => {
        if (!isCancelled) {
          setEngineStatus(status);
          setTrained(status === 'online');
        }
      },
    });
    providerRef.current = provider;

    const tracker = new MediaPipeHandTracker({
      // One honest label instead of an endless frame-by-frame exception storm.
      onError: (message) => {
        if (isCancelled) return;
        setErrorMessage(message);
        setEngineStatus('offline');
        setActive(false);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      },
    });
    trackerRef.current = tracker;

    tracker.onFrame((obs) => {
      if (isCancelled) return;
      drawOverlay(obs);
      if (obs.hands.length > 0 && obs.hands[0]?.landmarks) {
        provider.feedLandmarks(obs.hands[0].landmarks);
      }
    });

    void video.play().then(() => {
      if (isCancelled) return;
      setActive(true);

      const loop = () => {
        if (isCancelled) return;
        if (video.readyState >= 2 && trackerRef.current) {
          void trackerRef.current.observe(video);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }).catch(() => {
      if (!isCancelled) {
        setActive(false);
      }
    });

    return () => {
      isCancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      void tracker.close();
      provider.close();
      video.srcObject = null;
      hiddenVideoRef.current = null;
      setActive(false);
    };
  }, [enabled, stream, emitLandmarks, onDetection, drawOverlay]);

  return {
    canvasRef,
    active,
    engineStatus,
    errorMessage,
    latencyMs,
    lastDetection,
    trained,
  };
}
