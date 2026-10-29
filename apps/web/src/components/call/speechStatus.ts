// Snapshot is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
import type { SpeechProviderStatus } from '../../lib/speech/index.js';

/**
 * Tone union mirroring the shared UI surfaces (non-color-only cue: each tone is
 * always paired with a text label). Declared locally so we do not depend on the
 * surfaces module's internal type.
 */
export type SpeechTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function statusTone(status: SpeechProviderStatus): SpeechTone {
  switch (status) {
    case 'listening':
      return 'success';
    case 'processing':
    case 'requesting':
      return 'info';
    case 'error':
      return 'danger';
    case 'denied':
    case 'unsupported':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function statusLabel(status: SpeechProviderStatus): string {
  switch (status) {
    case 'requesting':
      return 'Startingâ€¦';
    case 'listening':
      return 'Listening';
    case 'processing':
      return 'Transcribing';
    case 'error':
      return 'Error';
    case 'denied':
      return 'Microphone blocked';
    case 'unsupported':
      return 'Not supported here';
    default:
      return 'Idle';
  }
}
