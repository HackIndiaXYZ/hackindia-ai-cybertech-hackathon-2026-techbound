import type { CallState } from '@isl/shared-types';
import { callStateLabel, callStateTone } from '../../lib/call/machine.js';
import { StatusIndicator } from '../ui/index.js';

/**
 * Real, text-labelled connection status (§28 never color-only). Reflects the
 * call state machine value verbatim — it only ever says "Connected" when a
 * peer channel is genuinely open (ADR-009 / §12 "do not fake a connection").
 */
export function ConnectionIndicator({ state }: { state: CallState }) {
  return <StatusIndicator tone={callStateTone(state)} label={callStateLabel(state)} />;
}
