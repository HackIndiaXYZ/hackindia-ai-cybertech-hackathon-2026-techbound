// TODO(mws-213): revert to the rotating credential once Safari 17.4 ICE-restart regression is closed.
import React from 'react';
import { AVATAR_SIGN_COUNT } from './SupportedVocabularyModal.js';

export type PipelineAsyncState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'low-confidence'
  | 'fallback'
  | 'unavailable'
  | 'reconnecting';

export interface BidirectionalPipelineStatusProps {
  // Direction 1: Sign -> Speech
  signState: PipelineAsyncState;
  signLatencyMs?: number;
  signEngineName?: string;
  lastSignLabel?: string;
  lastSignConfidence?: number | null;

  // Direction 2: Speech -> 3D Avatar
  speechState: PipelineAsyncState;
  speechLatencyMs?: number;
  speechProviderName?: string;
  avatarActive: boolean;
  avatarPhase?: string;
}

const STATE_CONFIG: Record<
  PipelineAsyncState,
  { label: string; badgeClass: string; dotClass: string; ariaTone: string }
> = {
  idle: {
    label: 'Idle',
    badgeClass: 'bg-clay-muted/15 text-clay-muted border-clay-muted/20',
    dotClass: 'bg-clay-muted',
    ariaTone: 'Idle',
  },
  listening: {
    label: 'Active & Listening',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
    dotClass: 'bg-emerald-500 animate-pulse',
    ariaTone: 'Listening',
  },
  processing: {
    label: 'Translatingâ€¦',
    badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25',
    dotClass: 'bg-sky-500 animate-ping',
    ariaTone: 'Processing',
  },
  'low-confidence': {
    label: 'Low Confidence (<60%)',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25',
    dotClass: 'bg-amber-500',
    ariaTone: 'Warning: low confidence result',
  },
  fallback: {
    label: 'Degraded Fallback Active',
    badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/25',
    dotClass: 'bg-purple-500',
    ariaTone: 'Operating in heuristic fallback mode',
  },
  unavailable: {
    label: 'Service Unavailable',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25',
    dotClass: 'bg-rose-500',
    ariaTone: 'Service unavailable in this browser or environment',
  },
  reconnecting: {
    label: 'Reconnectingâ€¦',
    badgeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/25',
    dotClass: 'bg-orange-500 animate-pulse',
    ariaTone: 'Reconnecting to translation service',
  },
};

export const BidirectionalPipelineStatus: React.FC<BidirectionalPipelineStatusProps> = ({
  signState,
  signLatencyMs = 0,
  signEngineName = 'ISL Engine (Hierarchical Dual-Stream)',
  lastSignLabel,
  lastSignConfidence,
  speechState,
  speechLatencyMs = 0,
  speechProviderName = 'Whisper STT / Web Speech',
  avatarActive,
  avatarPhase = 'ready',
}) => {
  const signConf = STATE_CONFIG[signState];
  const speechConf = STATE_CONFIG[speechState];

  return (
    <div
      role="region"
      aria-label="Real-time translation pipeline status"
      className="grid gap-3 rounded-clay border border-clay-soft bg-clay-surface p-3 shadow-clay sm:grid-cols-2"
    >
      {/* Direction 1: Sign -> Speech Pipeline */}
      <div className="flex flex-col gap-1.5 rounded-clay bg-clay-soft/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-base" aria-hidden="true">ðŸ¤Ÿ</span>
            <span className="text-xs font-bold text-clay-ink">Sign â†’ Speech</span>
            <span className="text-[10px] text-clay-muted">(Blind/Hearing side)</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${signConf.badgeClass}`}
            role="status"
            aria-live="polite"
          >
            <span className={`h-2 w-2 rounded-full ${signConf.dotClass}`} />
            <span>{signConf.label}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-clay-muted">
          <span>Engine: <strong className="font-semibold text-clay-ink">{signEngineName}</strong></span>
          {signLatencyMs > 0 && (
            <span className="tabular-nums">âš¡ {signLatencyMs}ms roundtrip</span>
          )}
        </div>

        {lastSignLabel && (
          <div className="mt-0.5 flex items-center justify-between rounded bg-clay-surface/80 px-2 py-1 text-[11px]">
            <span className="text-clay-muted">Last Recognized Sign:</span>
            <span className="font-semibold text-clay-ink">
              {lastSignLabel}{' '}
              {lastSignConfidence !== null && lastSignConfidence !== undefined && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ({Math.round(lastSignConfidence * 100)}%)
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Direction 2: Speech -> 3D Avatar Pipeline */}
      <div className="flex flex-col gap-1.5 rounded-clay bg-clay-soft/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-base" aria-hidden="true">ðŸ—£ï¸</span>
            <span className="text-xs font-bold text-clay-ink">Speech â†’ Avatar</span>
            <span className="text-[10px] text-clay-muted">(Deaf side)</span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${speechConf.badgeClass}`}
            role="status"
            aria-live="polite"
          >
            <span className={`h-2 w-2 rounded-full ${speechConf.dotClass}`} />
            <span>{speechConf.label}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-clay-muted">
          <span>STT: <strong className="font-semibold text-clay-ink">{speechProviderName}</strong></span>
          {speechLatencyMs > 0 && (
            <span className="tabular-nums">âš¡ {speechLatencyMs}ms</span>
          )}
        </div>

        <div className="mt-0.5 flex items-center justify-between rounded bg-clay-surface/80 px-2 py-1 text-[11px]">
          <span className="text-clay-muted">3D Avatar:</span>
          <span className="font-semibold text-clay-ink">
            {avatarActive
              ? avatarPhase === 'unsupported'
                ? 'WebGL Unavailable'
                : avatarPhase === 'error'
                  ? 'Could not start'
                  : avatarPhase === 'initializing'
                    ? 'Loading avatarâ€¦'
                    : `Active (${AVATAR_SIGN_COUNT} word signs + Aâ€“Z fingerspell)`
              : 'Hidden (Click "Show ISL Avatar")'}
          </span>
        </div>
      </div>
    </div>
  );
};
