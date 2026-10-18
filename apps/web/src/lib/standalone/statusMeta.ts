/**
 * Human-readable, accessible status for each {@link StandaloneState} (§18
 * "accessible status feedback"). Pure presentation data so the page can render a
 * consistent StatusIndicator + aria-live announcement from a single source.
 */
import type { StandaloneState } from './types.js';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface StatusMeta {
  tone: StatusTone;
  /** Short label shown next to the indicator. */
  label: string;
  /** A fuller sentence announced to assistive tech via aria-live. */
  announcement: string;
}

export const STATUS_META: Record<StandaloneState, StatusMeta> = {
  idle: { tone: 'neutral', label: 'Ready', announcement: 'Translator is ready. Press start to begin.' },
  listening: { tone: 'info', label: 'Listening…', announcement: 'Listening. Speak now.' },
  processing: { tone: 'info', label: 'Processing speech…', announcement: 'Processing what you said.' },
  translating: { tone: 'info', label: 'Translating to ISL…', announcement: 'Translating into ISL concepts.' },
  rendering: { tone: 'success', label: 'Avatar signing…', announcement: 'The avatar is signing the result.' },
  paused: { tone: 'warning', label: 'Paused', announcement: 'Paused. Press resume to continue.' },
  error: { tone: 'danger', label: 'Something went wrong', announcement: 'An error occurred. You can start again.' },
};
