/**
 * Local media acquisition + permission handling (plan §12 item 10). Errors are
 * classified into understandable, actionable messages (§28, ADR-009 honesty)
 * rather than raw DOMException strings.
 */

export type MediaFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'unknown';

export interface MediaResult {
  stream?: MediaStream;
  failure?: MediaFailure;
  /** Plain-language, non-technical guidance for the user. */
  message: string;
}

export function isMediaSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export interface MediaConstraints {
  audio: boolean;
  video: boolean;
  /** Allow falling back to a synthetic canvas/audio stream if no physical hardware is found. */
  allowSyntheticFallback?: boolean;
}

/** Create a synthetic video track showing avatar status for audio-only / headless / demo mode. */
export function createSyntheticVideoTrack(label = 'Audio Only (No physical camera)'): MediaStreamTrack | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext?.('2d');

  function render(phase = 0) {
    if (!ctx) return;
    ctx.fillStyle = '#121217';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glow = Math.sin(phase) * 6;
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(320, 200, 65 + glow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ISL Participant', 320, 200);

    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(label, 320, 300);
  }

  render(0);
  let phase = 0;
  const interval = setInterval(() => {
    phase += 0.2;
    render(phase);
  }, 400);

  const stream = (canvas as HTMLCanvasElement & { captureStream?(fps?: number): MediaStream }).captureStream
    ? (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(10)
    : (canvas as unknown as { mozCaptureStream?(fps?: number): MediaStream }).mozCaptureStream
    ? (canvas as unknown as { mozCaptureStream(fps?: number): MediaStream }).mozCaptureStream(10)
    : null;

  const track = stream?.getVideoTracks()[0] ?? null;
  if (track) {
    track.addEventListener('ended', () => clearInterval(interval));
  }
  return track;
}

/** Create a silent Web Audio oscillator track so WebRTC and Web Audio analyzer stay stable. */
export function createSilentAudioTrack(): MediaStreamTrack | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return dest.stream.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
}

/** Create a combined synthetic media stream for demonstration or headless test runs. */
export function createSyntheticMediaStream(label = 'Virtual Device (Demo Mode)'): MediaStream {
  const stream = typeof MediaStream !== 'undefined' ? new MediaStream() : ({} as MediaStream);
  const videoTrack = createSyntheticVideoTrack(label);
  if (videoTrack && stream.addTrack) stream.addTrack(videoTrack);
  const audioTrack = createSilentAudioTrack();
  if (audioTrack && stream.addTrack) stream.addTrack(audioTrack);
  return stream;
}

/** Request camera + microphone, mapping DOMException names to friendly text with partial hardware recovery. */
export async function requestLocalMedia(constraints: MediaConstraints): Promise<MediaResult> {
  if (!isMediaSupported()) {
    if (constraints.allowSyntheticFallback) {
      return {
        stream: createSyntheticMediaStream(),
        message: 'Virtual media stream active (browser lacks native media APIs).',
      };
    }
    return {
      failure: 'unsupported',
      message: 'This browser cannot access camera or microphone. Try a recent Chrome, Edge, or Firefox.',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: constraints.audio,
      video: constraints.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    return { stream, message: 'Camera and microphone ready.' };
  } catch (err) {
    const name = (err as DOMException)?.name ?? '';
    if (name === 'NotAllowedError' || name === 'PermissionDenied') {
      return {
        failure: 'denied',
        message: 'Permission was declined. Allow camera and microphone access in your browser to be seen and heard.',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        failure: 'unavailable',
        message: 'Your camera or microphone is busy in another app. Close it and try again.',
      };
    }

    // If both audio and video were requested and hardware is missing or overconstrained,
    // attempt partial hardware recovery before failing (§28 graceful degradation):
    if (constraints.audio && constraints.video) {
      // 1. Try audio-only (e.g. desktop PC with microphone/headset but no webcam)
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const syntheticVideo = createSyntheticVideoTrack('Audio Only (No physical camera)');
        if (syntheticVideo) audioStream.addTrack(syntheticVideo);
        return {
          stream: audioStream,
          message: 'Microphone connected (no physical camera detected; using virtual video tile).',
        };
      } catch {
        // audio alone was also not available
      }

      // 2. Try video-only (e.g. webcam without microphone)
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        const silentAudio = createSilentAudioTrack();
        if (silentAudio) videoStream.addTrack(silentAudio);
        return {
          stream: videoStream,
          message: 'Camera connected (no microphone detected; muted).',
        };
      } catch {
        // video alone was also not available
      }
    }

    // 3. Fallback to synthetic media stream if explicitly allowed
    if (constraints.allowSyntheticFallback) {
      return {
        stream: createSyntheticMediaStream(),
        message: 'Virtual camera and microphone active (Demo Mode).',
      };
    }

    switch (name) {
      case 'NotFoundError':
      case 'OverconstrainedError':
      case 'DevicesNotFoundError':
        return {
          failure: 'unavailable',
          message: 'No camera or microphone was found. Connect a device or join using Demo/Virtual mode.',
        };
      default:
        return { failure: 'unknown', message: 'We could not start your camera or microphone. Please try again.' };
    }
  }
}

/** Stop every track on a stream (called on teardown). */
export function stopStream(stream?: MediaStream): void {
  stream?.getTracks().forEach((t) => t.stop());
}

