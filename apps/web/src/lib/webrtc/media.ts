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
}

/** Request camera + microphone, mapping DOMException names to friendly text. */
export async function requestLocalMedia(constraints: MediaConstraints): Promise<MediaResult> {
  if (!isMediaSupported()) {
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
    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDenied':
        return {
          failure: 'denied',
          message: 'Permission was declined. Allow camera and microphone access in your browser to be seen and heard.',
        };
      case 'NotFoundError':
      case 'OverconstrainedError':
      case 'DevicesNotFoundError':
        return {
          failure: 'unavailable',
          message: 'No camera or microphone was found. Connect a device and try again.',
        };
      case 'NotReadableError':
      case 'TrackStartError':
        return {
          failure: 'unavailable',
          message: 'Your camera or microphone is busy in another app. Close it and try again.',
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
