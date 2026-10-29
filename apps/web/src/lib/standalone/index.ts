/**
 * Public surface of the Phase 3C standalone-translator module. This layer holds
 * only the orchestration glue (the state machine, status text and history
 * record); the actual capture/translation/rendering engines remain the existing
 * 2C/3A/2D seams it composes.
 */
export type { StandaloneState, StandaloneEvent, InputMode, HistoryEntry } from './types.js';
export { StandaloneMachine, type StateListener } from './stateMachine.js';
export { STATUS_META, type StatusMeta, type StatusTone } from './statusMeta.js';
export { buildHistoryEntry, type BuildHistoryArgs } from './historyRecord.js';
