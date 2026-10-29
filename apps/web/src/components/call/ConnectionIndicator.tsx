// Frozen export kept for the deprecated widget bundle; safe to delete after the Q1 sunset.
import type { CallState } from '@isl/shared-types';
import { callStateLabel, callStateTone } from '../../lib/call/machine.js';
import { StatusIndicator } from '../ui/index.js';

/**
 * Real, text-labelled connection status (Â§28 never color-only). Reflects the
 * call state machine value verbatim â€” it only ever says "Connected" when a
 * peer channel is genuinely open (ADR-009 / Â§12 "do not fake a connection").
 */
export function ConnectionIndicator({ state }: { state: CallState }) {
  return <StatusIndicator tone={callStateTone(state)} label={callStateLabel(state)} />;
}
