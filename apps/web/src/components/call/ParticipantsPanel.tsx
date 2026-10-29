import { Badge, Button, Card } from '../ui/index.js';
import type { ModerationCommandAction } from '@isl/shared-types';
import type { ParticipantUiState } from '../../store/callSlice.js';

interface ParticipantsPanelProps {
  participants: ParticipantUiState[];
  selfUserId: string;
  /** Whether *this* user holds moderation in this session (server-declared). */
  isHost: boolean;
  /** userIds currently flagged active by relayed VAD/host claims. */
  speaking: Record<string, boolean>;
  onModerate: (targetUserId: string, action: ModerationCommandAction) => void;
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function statusOf(p: ParticipantUiState): { label: string; tone: BadgeTone } {
  if (p.status === 'connected') return { label: 'Connected', tone: 'success' };
  if (p.status === 'disconnected' || p.status === 'failed') return { label: 'Reconnecting', tone: 'danger' };
  if (p.status === 'connecting') return { label: 'Connecting', tone: 'warning' };
  return { label: 'New', tone: 'neutral' };
}

/**
 * Room roster with host moderation (§19). Moderation controls appear only for
 * the user the server declared as host — a UI convenience, not the security
 * boundary: the server re-authorizes every command anyway (§25), and a
 * rejected command surfaces as a visible notice rather than a silent no-op.
 */
export function ParticipantsPanel({ participants, selfUserId, isHost, speaking, onModerate }: ParticipantsPanelProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-clay-ink">Participants ({participants.length})</h2>
        {isHost && <Badge tone="info">You are the host</Badge>}
      </div>

      <ul className="flex flex-col gap-3" aria-label="Participant list">
        {participants.map((p) => {
          const st = statusOf(p);
          const isSelf = p.userId === selfUserId;
          return (
            <li key={p.userId} className="clay-inset flex flex-col gap-2 rounded-clay p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold text-clay-ink">{p.displayName}{isSelf ? ' (You)' : ''}</span>
                  {p.role === 'host' && <Badge tone="neutral" className="text-xs">Host</Badge>}
                  {speaking[p.userId] && <span role="status" className="text-xs font-bold text-clay-accent">Speaking</span>}
                </span>
                <span className="flex items-center gap-2 text-sm text-clay-muted">
                  <span>{p.muted ? 'Muted' : 'Mic on'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{p.cameraOn ? 'Camera on' : 'Camera off'}</span>
                  <Badge tone={st.tone} className="text-xs">{st.label}</Badge>
                </span>
              </div>

              {isHost && !isSelf && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onModerate(p.userId, p.muted ? 'unmute' : 'mute')}
                  >
                    {p.muted ? 'Unmute' : 'Mute'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onModerate(p.userId, p.cameraOn ? 'camera-off' : 'camera-on')}
                  >
                    {p.cameraOn ? 'Camera off' : 'Camera on'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-clay-muted">
        Muting a participant also stops their microphone on their own device — the command is
        checked against the server&apos;s record of who hosts this session.
      </p>
    </Card>
  );
}
