import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Badge } from '../ui/index.js';
import type { ParticipantUiState } from '../../store/callSlice.js';

interface VideoTileProps {
  /** Stream to display; may be undefined for the local self-view until ready. */
  stream?: MediaStream;
  participant?: ParticipantUiState;
  isLocal?: boolean;
  mirror?: boolean;
  label: string;
  /**
   * Active speaker (plan §19 item 3). Driven by relayed VAD/host claims, so
   * the ring follows real microphone audio, never optimism.
   */
  active?: boolean;
}

const qualityTone = {
  excellent: 'success',
  good: 'success',
  fair: 'warning',
  poor: 'danger',
  disconnected: 'danger',
} as const;

/**
 * A single participant's video surface. Attaches the MediaStream imperatively
 * (React cannot set `srcObject` declaratively) and layers non-color-only
 * status cues (mute icon + label, camera-off notice, quality text). The
 * active-speaker state pairs a ring with a text cue for colorblind users (§28).
 *
 * Phase 4B: a dropped peer channel gets an explicit overlay stating the real
 * recovery situation — which bounded ICE-restart attempt is in flight, or
 * that attempts have honestly stopped — never a frozen frame pretending.
 */
export function VideoTile({ stream, participant, isLocal, mirror, label, active = false }: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) el.srcObject = stream ?? null;
  }, [stream]);

  const cameraOn = participant ? participant.cameraOn : true;
  const muted = participant ? participant.muted : false;
  const down = !!participant && (participant.status === 'disconnected' || participant.status === 'failed');

  return (
    <div
      className={clsx(
        'clay-surface relative aspect-video overflow-hidden rounded-clay bg-clay-soft',
        active && 'ring-4 ring-clay-accent',
      )}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        aria-label={`${label} video`}
        className={clsx('h-full w-full object-cover', mirror && 'scale-x-[-1]', !cameraOn && 'opacity-0')}
      />

      {!cameraOn && !down && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-clay-muted">
          <span aria-hidden="true" className="text-3xl">📷̸</span>
          <span className="text-sm font-medium">Camera off</span>
        </div>
      )}

      {down && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-clay-ink/60 px-4 text-center text-white">
          <span role="status" className="text-sm font-semibold">
            {participant?.reconnect?.exhausted
              ? 'Connection lost — reconnect attempts stopped'
              : participant?.reconnect
                ? `Reconnecting… attempt ${participant.reconnect.attempt} of ${participant.reconnect.maxAttempts}`
                : 'Connection lost'}
          </span>
          <span className="text-xs opacity-80">
            {participant?.reconnect?.exhausted
              ? 'Ask them to rejoin from their invite link.'
              : 'Retrying the connection automatically…'}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-clay-ink/40 px-3 py-1.5 text-white">
        <span className="truncate text-sm font-semibold">
          {label}{isLocal ? ' (You)' : ''}
          {active && <span role="status" className="ml-2 text-xs font-bold text-clay-accent">Speaking</span>}
        </span>
        <span className="flex items-center gap-2">
          {muted && <span className="text-xs font-semibold" role="status">Muted</span>}
          {down && !participant?.reconnect?.exhausted && (
            <Badge tone="warning" className="text-xs">
              reconnecting
            </Badge>
          )}
          {down && participant?.reconnect?.exhausted && (
            <Badge tone="danger" className="text-xs">
              lost
            </Badge>
          )}
          {participant?.quality && !down && (
            <Badge tone={qualityTone[participant.quality]} className="text-xs">
              {participant.quality}
            </Badge>
          )}
        </span>
      </div>
    </div>
  );
}
