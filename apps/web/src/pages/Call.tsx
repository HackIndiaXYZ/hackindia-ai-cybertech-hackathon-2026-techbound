import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SessionType, TranscriptFinalPayload } from '@isl/shared-types';
import { useAppSelector } from '../store/index.js';
import { createSession, useCall } from '../features/useCall.js';
import { useSpeechRecognition } from '../features/useSpeechRecognition.js';
import { useInCallTranslation } from '../features/useInCallTranslation.js';
import { useAvatar } from '../features/useAvatar.js';
import { isWebRtcSupported } from '../lib/webrtc/peer.js';
import { isMediaSupported } from '../lib/webrtc/media.js';
import { gridClassesFor, orderedRemoteTiles } from '../lib/call/gridLayout.js';
import { Card, Button, Input, StatusIndicator, ErrorState } from '../components/ui/index.js';
import { VideoTile } from '../components/call/VideoTile.js';
import { CallControls } from '../components/call/CallControls.js';
import { ConnectionIndicator } from '../components/call/ConnectionIndicator.js';
import { CaptionPanel } from '../components/call/CaptionPanel.js';
import { SpeechControl } from '../components/call/SpeechControl.js';
import { ParticipantsPanel } from '../components/call/ParticipantsPanel.js';
import { TranslationPanel } from '../components/call/TranslationPanel.js';
import type { ParticipantUiState } from '../store/callSlice.js';

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Live call surface (route: /call/:sessionId). Hosts the WebRTC engine built in
 * Phase 2A (§12) and the multi-user features of Phase 3D (§19): group sessions
 * of 3–5, an active-speaker ring, host moderation and an attributable
 * translation feed. `/call/new` starts a fresh one-to-one or group session; an
 * existing id with a `?token=` joins one. States are reported honestly from the
 * state machine — nothing is simulated when media or a peer is unavailable.
 */
export function Call() {
  const { sessionId: paramId } = useParams<{ sessionId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const user = useAppSelector((s) => s.auth.user);
  const settings = useAppSelector((s) => s.settings);
  const call = useAppSelector((s) => s.call);
  const captions = useAppSelector((s) => s.captions);
  const activeSpeaker = useAppSelector((s) => s.activeSpeaker);
  const translationEntries = useAppSelector((s) => s.inCallTranslation.entries);

  const joinToken = params.get('token');
  const isNew = !paramId || paramId === 'new';
  const effectiveId = isNew ? '' : paramId;

  const [displayName, setDisplayName] = useState(user?.displayName || user?.email || 'Guest');
  const [sessionType, setSessionType] = useState<SessionType>('one_to_one');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAvatar, setShowAvatar] = useState(false);

  const avatar = useAvatar();

  const engine = useCall({ sessionId: effectiveId, displayName, selfUserId: user?.id ?? '' });

  // Sync completed in-call translations to 3D avatar interpreter in real-time
  const lastProcessedTranslationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showAvatar || translationEntries.length === 0) return;
    const latest = translationEntries[translationEntries.length - 1];
    if (latest && latest.sourceTranscriptId !== lastProcessedTranslationRef.current) {
      lastProcessedTranslationRef.current = latest.sourceTranscriptId;
      if (latest.representation?.concepts?.length) {
        avatar.enqueueConcepts(latest.representation.concepts);
      }
    }
  }, [translationEntries, showAvatar, avatar]);

  // Phase 3D: our finished spoken lines get translated locally and relayed
  // with participant attribution (§19 item 7). Phase 4A: completed
  // translations also feed the consent-gated history writer.
  const inCallTranslation = useInCallTranslation({
    selfUserId: user?.id ?? '',
    publish: engine.emitTranscript,
    onCompleted: engine.recordLocalTranslation,
  });

  // Phase 2C live speech: on-device Web Speech captions, relayed to peers over
  // the same typed transcript events the Call already uses.
  const speech = useSpeechRecognition({
    selfUserId: user?.id ?? '',
    publish: (event, payload) => {
      engine.emitTranscript(event, payload);
      if (event === 'transcript:final') {
        const final = payload as TranscriptFinalPayload;
        inCallTranslation.handleLocalFinal(final);
        engine.recordLocalTranscript(final);
      }
    },
  });

  const webrtcReady = isWebRtcSupported() && isMediaSupported();
  const inCall = !isNew && call.state !== 'idle' && call.state !== 'ended' && call.state !== 'failed';

  async function handleCreate() {
    setBusy(true);
    setCreateError(null);
    try {
      const res = await createSession(sessionType);
      navigate(`/call/${res.session.id}?token=${encodeURIComponent(res.joinToken)}`, { replace: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not start a new call.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <Card className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-clay-ink">Sign in to call</h1>
          <p className="text-clay-muted">Calling requires an account so peers can identify you.</p>
          <Link to="/login"><Button variant="primary" fullWidth>Go to sign in</Button></Link>
        </Card>
      </div>
    );
  }

  // ---- Lobby (idle / not yet started) ----
  if (!inCall) {
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 p-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-clay-ink">{isNew ? 'Start a call' : 'Join call'}</h1>
          <StatusIndicator tone={webrtcReady ? 'info' : 'warning'} label={webrtcReady ? 'Ready' : 'This browser lacks camera/WebRTC support'} />
        </div>

        <Card className="flex flex-col gap-4">
          <Input
            label="Your display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
          />

          {isNew && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-clay-ink">Call type</legend>
              <div className="flex gap-2" role="group" aria-label="Call type">
                <Button
                  size="sm"
                  variant={sessionType === 'one_to_one' ? 'primary' : 'secondary'}
                  aria-pressed={sessionType === 'one_to_one'}
                  onClick={() => setSessionType('one_to_one')}
                >
                  One to one
                </Button>
                <Button
                  size="sm"
                  variant={sessionType === 'group' ? 'primary' : 'secondary'}
                  aria-pressed={sessionType === 'group'}
                  onClick={() => setSessionType('group')}
                >
                  Group call (up to 5)
                </Button>
              </div>
              {sessionType === 'group' && (
                <p className="text-xs text-clay-muted">
                  You will be the host: you can mute participants and the room chooses a new host
                  automatically if you leave.
                </p>
              )}
            </fieldset>
          )}

          {call.mediaError && (
            <div role="alert" className="rounded-clay bg-clay-danger/15 p-3 text-clay-danger">
              {call.mediaError}
            </div>
          )}
          {createError && (
            <div role="alert" className="rounded-clay bg-clay-danger/15 p-3 text-clay-danger">{createError}</div>
          )}

          {isNew ? (
            <Button variant="primary" fullWidth loading={busy} disabled={!webrtcReady || busy} onClick={() => void handleCreate()}>
              Create call room
            </Button>
          ) : (
            <Button
              variant="primary"
              fullWidth
              loading={busy}
              disabled={!webrtcReady || !joinToken}
              onClick={() => {
                setBusy(true);
                void engine.start().finally(() => setBusy(false));
              }}
            >
              {joinToken ? 'Join with camera & microphone' : 'Join link missing a token'}
            </Button>
          )}

          {!joinToken && !isNew && (
            <p className="text-sm text-clay-muted">
              This invite link is missing its join token. Ask the host to share the full link.
            </p>
          )}
          <Link to="/app/dashboard" className="text-center text-sm text-clay-muted hover:text-clay-ink">
            Cancel and return to dashboard
          </Link>
        </Card>
      </div>
    );
  }

  // ---- Ended / failed summary ----
  if (call.state === 'ended' || call.state === 'failed') {
    const failed = call.state === 'failed';
    return (
      <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 p-4">
        <Card className="flex flex-col items-start gap-4">
          {failed ? (
            <ErrorState
              title="Call could not connect"
              message={call.lastError ?? 'Something went wrong while setting up the connection.'}
            />
          ) : (
            <>
              <h1 className="text-2xl font-bold text-clay-ink">Call ended</h1>
              <p className="text-clay-muted">Duration: {formatDuration(call.durationSec)}</p>
            </>
          )}
          <div className="flex w-full gap-3">
            {isNew ? (
              <Button variant="primary" fullWidth onClick={() => void handleCreate()}>Try again</Button>
            ) : (
              <Button variant="primary" fullWidth onClick={() => void engine.start()}>Rejoin</Button>
            )}
            <Link to="/app/dashboard" className="flex-1">
              <Button variant="secondary" fullWidth>Dashboard</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // ---- Active call ----
  const remoteUserIds = Object.keys(engine.remoteStreams);
  const participantList = Object.values(call.participants);
  const isHost = call.selfRole === 'host';
  // The roster includes ourselves, built from our real persisted control state.
  const roster: ParticipantUiState[] = user
    ? [
        {
          userId: user.id,
          displayName,
          role: call.selfRole,
          muted: !call.micOn,
          cameraOn: call.cameraOn,
          status: call.state === 'connected' ? 'connected' : call.state === 'reconnecting' ? 'disconnected' : 'connecting',
        },
        ...participantList,
      ]
    : participantList;
  const nameOf = (id: string) => roster.find((p) => p.userId === id)?.displayName ?? id;
  // Speaking tiles lead; the rest keep a deterministic order (§19 grid).
  const orderedRemotes = orderedRemoteTiles({
    remoteUserIds,
    speaking: activeSpeaker.speaking,
    lastActiveUserId: activeSpeaker.lastActiveUserId,
  });

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-clay-ink">Live call</h1>
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            variant={showAvatar ? 'primary' : 'secondary'}
            onClick={() => setShowAvatar((prev) => !prev)}
            aria-pressed={showAvatar}
          >
            {showAvatar ? 'Hide ISL Avatar' : 'Show ISL Avatar (Interpreter)'}
          </Button>
          <ConnectionIndicator state={call.state} />
          <span className="tabular-nums text-sm text-clay-muted" aria-label="Call duration">
            {formatDuration(call.durationSec)}
          </span>
        </div>
      </header>

      {call.state === 'reconnecting' && (
        <div role="status" className="rounded-clay bg-clay-warn/15 p-3 text-sm text-clay-warn">
          Reconnecting to your peers… this usually resolves itself in a few seconds.
        </div>
      )}

      {call.notice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-clay p-3 text-sm ${
            call.notice.tone === 'danger' ? 'bg-clay-danger/15 text-clay-danger' : call.notice.tone === 'warning' ? 'bg-clay-warn/15 text-clay-warn' : 'bg-clay-primary/15 text-clay-primary'
          }`}
        >
          <span>{call.notice.message}</span>
          <Button size="sm" variant="ghost" onClick={engine.dismissNotice} aria-label="Dismiss notice">
            Dismiss
          </Button>
        </div>
      )}

      {call.persistence === 'prompt' && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-clay bg-clay-soft p-3 text-sm text-clay-ink"
        >
          <span>
            Save this call&apos;s final captions, translations and messages to your history? Nothing is stored
            unless you allow it — you can change this later in Settings.
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void engine.grantConsent()}>
              Allow saving
            </Button>
            <Button size="sm" variant="ghost" onClick={engine.declineConsent}>
              Not for this call
            </Button>
          </span>
        </div>
      )}
      {call.persistence === 'on' && (
        <p className="text-xs text-clay-muted">
          Saving final captions, translations and messages to your history. Turn this off in Settings.
        </p>
      )}
      {call.persistence === 'off' && (
        <p className="text-xs text-clay-muted">Nothing from this call is being saved.</p>
      )}

      <div className={gridClassesFor(orderedRemotes.length + 1 + (showAvatar ? 1 : 0))}>
        <VideoTile
          stream={engine.localStream ?? undefined}
          isLocal
          mirror
          label={displayName}
          active={!!user && !!activeSpeaker.speaking[user.id]}
        />
        {showAvatar && (
          <div className="clay-surface relative flex aspect-video flex-col overflow-hidden rounded-clay bg-clay-soft">
            <canvas ref={avatar.canvasRef} className="h-full w-full" />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white shadow">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              ISL 3D Interpreter
            </div>
            {avatar.phase === 'initializing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white">
                Loading avatar…
              </div>
            )}
            {avatar.phase === 'unsupported' && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-clay-muted">
                WebGL not supported for 3D avatar in this browser.
              </div>
            )}
          </div>
        )}
        {orderedRemotes.map((id) => (
          <VideoTile
            key={id}
            stream={engine.remoteStreams[id]}
            participant={participantList.find((p) => p.userId === id)}
            label={nameOf(id)}
            active={!!activeSpeaker.speaking[id]}
          />
        ))}
        {orderedRemotes.length === 0 && !showAvatar && (
          <div className="clay-surface flex aspect-video items-center justify-center rounded-clay bg-clay-soft text-clay-muted">
            Waiting for others to join… share the invite link from your dashboard.
          </div>
        )}
      </div>

      <CallControls
        micOn={call.micOn}
        cameraOn={call.cameraOn}
        largeControls={settings.largeControls}
        onToggleMic={engine.toggleMic}
        onToggleCamera={engine.toggleCamera}
        onEnd={engine.end}
      />

      <SpeechControl speech={speech} largeControls={settings.largeControls} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ParticipantsPanel
          participants={roster}
          selfUserId={user?.id ?? ''}
          isHost={isHost}
          speaking={activeSpeaker.speaking}
          onModerate={engine.moderate}
        />
        <TranslationPanel entries={translationEntries} nameOf={nameOf} />
      </div>

      <CaptionPanel
        messages={call.messages}
        interim={Object.values(captions.interim)}
        finals={captions.finals}
        selfUserId={user.id}
        captionFontSize={settings.captionFontSize}
        onSendText={engine.sendText}
      />
    </div>
  );
}
