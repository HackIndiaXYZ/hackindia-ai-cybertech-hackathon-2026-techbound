// Snapshot read is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
/**
 * Local media acquisition + permission handling (plan Â§12 item 10). Errors are
 * classified into understandable, actionable messages (Â§28, ADR-009 honesty)
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
  }, 100);

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

  const tryGUM = async (c: MediaStreamConstraints): Promise<MediaStream | null> => {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch {
      return null;
    }
  };

  // 1. Primary attempt: ideal resolution with flexible facingMode
  if (constraints.video || constraints.audio) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraints.audio,
        video: constraints.video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: { ideal: 'user' },
            }
          : false,
      });
      return { stream, message: 'Camera and microphone ready.' };
    } catch (err) {
      const name = (err as DOMException)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDenied') {
        if (constraints.allowSyntheticFallback) {
          return {
            stream: createSyntheticMediaStream(),
            message: 'Camera permission was declined. Virtual media stream active.',
          };
        }
        return {
          failure: 'denied',
          message: 'Permission was declined. Allow camera and microphone access in your browser to be seen and heard.',
        };
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        if (constraints.allowSyntheticFallback) {
          return {
            stream: createSyntheticMediaStream(),
            message: 'Camera is busy in another app. Virtual media stream active.',
          };
        }
        return {
          failure: 'unavailable',
          message: 'Your camera or microphone is busy in another app. Close it and try again.',
        };
      }

      // If overconstrained by 1280x720 or facingMode, retry with unconstrained video
      if (constraints.video && constraints.audio) {
        const relaxed = await tryGUM({ audio: true, video: true });
        if (relaxed) return { stream: relaxed, message: 'Camera and microphone ready.' };
      } else if (constraints.video && !constraints.audio) {
        const relaxedVideo = await tryGUM({ audio: false, video: true });
        if (relaxedVideo) return { stream: relaxedVideo, message: 'Camera ready.' };
      }
    }
  }

  // 2. Partial hardware recovery (Â§28 graceful degradation):
  // Check if physical camera alone is available (e.g. webcam with no mic or mic driver error)
  if (constraints.video) {
    const videoStream = await tryGUM({ video: true, audio: false });
    if (videoStream) {
      const silentAudio = createSilentAudioTrack();
      if (silentAudio) videoStream.addTrack(silentAudio);
      return {
        stream: videoStream,
        message: 'Camera connected (no microphone detected; muted).',
      };
    }
  }

  // Check if microphone alone is available (e.g. desktop PC / headset with no webcam or disconnected camera)
  if (constraints.audio) {
    const audioStream = await tryGUM({ audio: true, video: false });
    if (audioStream) {
      const syntheticVideo = createSyntheticVideoTrack('Audio Only (No physical camera)');
      if (syntheticVideo) audioStream.addTrack(syntheticVideo);
      return {
        stream: audioStream,
        message: 'Microphone connected (no physical camera detected; using virtual video tile).',
      };
    }
  }

  // 3. Fallback to synthetic media stream if explicitly allowed
  if (constraints.allowSyntheticFallback) {
    return {
      stream: createSyntheticMediaStream(),
      message: 'Virtual camera and microphone active (Demo Mode).',
    };
  }

  return {
    failure: 'unavailable',
    message: 'No physical camera or microphone was found. Connect a device or join using Demo/Virtual mode.',
  };
}

/** Stop every track on a stream (called on teardown). */
export function stopStream(stream?: MediaStream): void {
  stream?.getTracks().forEach((t) => t.stop());
}

