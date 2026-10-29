import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SessionType, TranscriptFinalPayload } from '@isl/shared-types';
import { useAppSelector } from '../store/index.js';
import { createSession, useCall } from '../hooks/webrtc/useCall.js';
import { useCallTts } from '../features/useCallTts.js';
import { useSpeechRecognition } from '../features/useSpeechRecognition.js';
import { useInCallTranslation } from '../features/useInCallTranslation.js';
import { useAvatar } from '../features/useAvatar.js';
import { useInCallGestureRecognition } from '../features/useInCallGestureRecognition.js';
import { isWebRtcSupported } from '../webrtc/peerConnection.js';
import { isMediaSupported } from '../lib/webrtc/media.js';
import { gridClassesFor, orderedRemoteTiles } from '../lib/call/gridLayout.js';
import { Card, Button, Input, StatusIndicator, ErrorState, Modal } from '../components/ui/index.js';
import { soundCues } from '../lib/call/soundCues.js';
import { VideoTile } from '../components/call/VideoTile.js';
import { CallControls } from '../components/call/CallControls.js';
import { ConnectionIndicator } from '../components/call/ConnectionIndicator.js';
import { CaptionPanel } from '../components/call/CaptionPanel.js';
import { SpeechControl } from '../components/call/SpeechControl.js';
import { ParticipantsPanel } from '../components/call/ParticipantsPanel.js';
import { TranslationPanel } from '../components/call/TranslationPanel.js';
import { BidirectionalPipelineStatus } from '../components/call/BidirectionalPipelineStatus.js';
import { SupportedVocabularyModal } from '../components/call/SupportedVocabularyModal.js';
import { AvatarPlaybackBadge } from '../components/avatar/AvatarPlaybackBadge.js';
import { LANDMARK_OVERLAY_CLASS } from '../lib/vision/constants.js';
import { FeedbackModal } from '../components/feedback/FeedbackModal.js';
import type { ParticipantUiState } from '../store/callSlice.js';

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Copy text to the clipboard, with a legacy fallback for older / insecure contexts. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** A compact, human-quotable label for a long session id (first 8 chars). */
function shortRoomId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Shows the Room ID + a full invite link (which carries the one-time access token
 * the API requires to join) so a call can be reached from another device.
 * `compact` renders a slim bar for the live-call header; the default is the lobby
 * card with selectable, read-only fields. Copy uses the clipboard API when present
 * and a native Share sheet on devices that offer one.
 */
function InvitePanel({ sessionId, token, compact = false }: { sessionId: string; token: string | null; compact?: boolean }) {
  const [copied, setCopied] = useState<null | 'id' | 'link'>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = token
    ? `${origin}/call/${sessionId}?token=${encodeURIComponent(token)}`
    : `${origin}/call/${sessionId}`;

  const doCopy = useCallback(async (kind: 'id' | 'link') => {
    if (await copyToClipboard(kind === 'id' ? sessionId : inviteUrl)) {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    }
  }, [sessionId, inviteUrl]);

  const shareFn =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? navigator.share.bind(navigator)
      : undefined;
  const doShare = () => {
    if (!shareFn) return;
    shareFn({ title: 'MissingWhisper call', text: 'Join my call', url: inviteUrl }).catch(() => {});
  };

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-clay border border-clay-soft bg-clay-surface px-3 py-2 text-sm">
        <span className="text-clay-muted">Room ID:</span>
        <code className="font-mono text-clay-ink" title={sessionId}>{shortRoomId(sessionId)}</code>
        <Button size="sm" variant="secondary" onClick={() => void doCopy('link')}>
          {copied === 'link' ? '✓ Invite link copied' : 'Copy invite link'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void doCopy('id')}>
          {copied === 'id' ? '✓ Copied' : 'Copy Room ID'}
        </Button>
        {shareFn && (
          <Button size="sm" variant="ghost" onClick={doShare}>Share…</Button>
        )}
        <span aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-clay-soft pt-4">
      <p className="text-sm font-semibold text-clay-ink">Invite someone on another device</p>
      <label className="text-xs font-medium text-clay-muted" htmlFor={`room-${sessionId}`}>Room ID</label>
      <input
        id={`room-${sessionId}`}
        readOnly
        value={sessionId}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-clay border-2 border-clay-edge/60 bg-clay-soft px-3 py-2 font-mono text-sm text-clay-ink"
      />
      <label className="text-xs font-medium text-clay-muted" htmlFor={`invite-${sessionId}`}>Invite link (carries the one-time access token)</label>
      <input
        id={`invite-${sessionId}`}
        readOnly
        value={inviteUrl}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-clay border-2 border-clay-edge/60 bg-clay-soft px-3 py-2 text-xs text-clay-ink"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void doCopy('link')}>
          {copied === 'link' ? '✓ Invite link copied' : 'Copy invite link'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void doCopy('id')}>
          {copied === 'id' ? '✓ Room ID copied' : 'Copy Room ID'}
        </Button>
        {shareFn && (
          <Button size="sm" variant="ghost" onClick={doShare}>Share…</Button>
        )}
      </div>
      {!token && (
        <p className="text-xs text-clay-warn">
          This invite link has no access token — ask the host to share the full invite link.
        </p>
      )}
      <span aria-live="polite" className="sr-only">{copied ? 'Copied to clipboard' : ''}</span>
    </div>
  );
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
  const [joinInput, setJoinInput] = useState('');
  const [showAvatar, setShowAvatar] = useState(false);
  const [islRecognitionOn, setIslRecognitionOn] = useState(true);
  const [showVocabulary, setShowVocabulary] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // The interpreter panel is mounted on demand, so the engine may only start once
  // the canvas exists — otherwise it initialises against a null canvas and never
  // retries, leaving an empty panel for the whole call.
  const avatar = useAvatar({ enabled: showAvatar });

  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Synchronize user settings with synthesized audio cues (Phase 4)
  useEffect(() => {
    soundCues.setEnabled(settings.audioCues ?? true);
  }, [settings.audioCues]);

  // Audio earcon for incoming call lifecycle event
  useEffect(() => {
    if (call.state === 'ringing') {
      soundCues.play('incoming-call');
    }
  }, [call.state]);

  // Phase 1: Real-time sign-to-speech audio orchestration for remote signs & captions
  const callTts = useCallTts({
    selfUserId: user?.id ?? '',
    participants: call.participants,
    screenReaderOptimized: settings.screenReaderOptimized,
  });

  const engine = useCall({
    sessionId: effectiveId,
    displayName,
    selfUserId: user?.id ?? '',
    onRemoteGesture: (payload) => {
      callTts.handleRemoteGesture(payload);
    },
    onRemoteTranscript: (payload) => {
      callTts.handleRemoteTranscript(payload);
    },
  });

  const gestureRec = useInCallGestureRecognition({
    stream: engine.localStream,
    enabled: islRecognitionOn && !isNew && call.state !== 'idle' && call.state !== 'ended' && call.state !== 'failed' && call.cameraOn,
    emitLandmarks: engine.emitLandmarks,
  });

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

  // Keyboard-only navigation shortcuts (Phase 4 §28):
  // M / m: toggle microphone
  // V / v: toggle camera
  // ? : toggle keyboard shortcuts guide
  useEffect(() => {
    if (!inCall) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        engine.toggleMic();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        engine.toggleCamera();
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsHelp((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inCall, engine]);

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

  /** Parse a pasted invite link or a bare Room ID and route to the join lobby. */
  function handleJoinByInput() {
    const raw = joinInput.trim();
    if (!raw) return;
    const callMatch = raw.match(/\/call\/([^/?#\s]+)/);
    const tokenMatch = raw.match(/[?&]token=([^&#\s]+)/);
    const id = (callMatch?.[1] ?? raw).replace(/[/\s]+$/, '');
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    navigate(`/call/${id}${query}`);
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
  // `inCall` excludes 'failed' and 'ended', so before this guard a failed join
  // bounced straight back to this card with no reason on screen — no camera
  // prompt, no error, no change: silently nothing happened — and the post-call
  // summary was unreachable. A media failure is the exception that stays in the
  // lobby, because that is where its virtual-media escape hatch lives.
  const showSummary = call.state === 'ended' || (call.state === 'failed' && !call.mediaError);
  if (!inCall && !showSummary) {
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

          {/* Spoken Audio for Signs & Captions (Phase 1 / ADR-023) */}
          <div className="flex flex-col gap-2 rounded-clay border border-clay-soft bg-clay-surface p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl" aria-hidden="true">🔊</span>
                <div>
                  <p className="text-sm font-semibold text-clay-ink">Spoken Audio for Signs & Captions</p>
                  <p className="text-xs text-clay-muted">Read out incoming ISL signs and peer speech automatically</p>
                </div>
              </div>
              <Button
                size="sm"
                variant={callTts.speakSigns ? 'primary' : 'secondary'}
                onClick={() => callTts.toggleSpeakSigns()}
                aria-pressed={callTts.speakSigns}
              >
                {callTts.speakSigns ? '🔊 Audio ON' : '🔇 Audio OFF'}
              </Button>
            </div>
            {callTts.speakSigns && (
              <div className="flex flex-col gap-1.5 border-t border-clay-soft/60 pt-2 text-xs text-clay-ink">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={callTts.speakCaptions}
                    onChange={(e) => callTts.setSpeakCaptions(e.target.checked)}
                    className="rounded border-clay-soft text-clay-primary focus:ring-clay-primary"
                  />
                  <span>Also read aloud other participants&apos; speech captions</span>
                </label>
                {settings.screenReaderOptimized && callTts.speakCaptions && (
                  <p className="pl-6 text-[11px] text-clay-muted">
                    Screen-reader mode is active: captions are announced directly via your screen reader (aria-live) to avoid dual speech.
                  </p>
                )}
              </div>
            )}
          </div>

          {call.mediaError && (
            <div role="alert" className="flex flex-col gap-2 rounded-clay bg-clay-danger/15 p-3 text-clay-danger">
              <p className="text-sm font-semibold">{call.mediaError}</p>
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => {
                  setBusy(true);
                  void engine.start({ allowSynthetic: true }).finally(() => setBusy(false));
                }}
              >
                Join with virtual / demo media
              </Button>
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
            <div className="flex flex-col gap-2">
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
              {joinToken && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!webrtcReady || busy}
                  onClick={() => {
                    setBusy(true);
                    void engine.start({ allowSynthetic: true }).finally(() => setBusy(false));
                  }}
                >
                  Join with virtual media (no physical camera required)
                </Button>
              )}
            </div>
          )}

          {isNew && (
            <div className="flex flex-col gap-2 border-t border-clay-soft pt-4">
              <Input
                label="Join an existing call"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Paste an invite link, or enter the Room ID"
                maxLength={400}
                hint="The host shares their invite link or Room ID with you from their call screen."
              />
              <Button variant="secondary" fullWidth disabled={!joinInput.trim() || !webrtcReady} onClick={handleJoinByInput}>
                Join with Room ID
              </Button>
            </div>
          )}
          {!isNew && joinToken && <InvitePanel sessionId={effectiveId} token={joinToken} />}

          {!joinToken && !isNew && (
            <p className="text-sm text-clay-muted">
              This invite link is missing its join token. Ask the host to share the full invite link.
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
  if (showSummary) {
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFeedback(true)}
            className="text-clay-muted hover:text-clay-ink"
          >
            💬 Share feedback on this call
          </Button>
        </Card>
        <FeedbackModal
          open={showFeedback}
          onClose={() => setShowFeedback(false)}
          sessionId={effectiveId || undefined}
        />
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
            variant={islRecognitionOn ? 'primary' : 'secondary'}
            onClick={() => setIslRecognitionOn((prev) => !prev)}
            aria-pressed={islRecognitionOn}
          >
            {islRecognitionOn ? '🤟 ISL Recognition ON' : '🤟 Enable ISL Recognition'}
          </Button>
          <Button
            size="sm"
            variant={showAvatar ? 'primary' : 'secondary'}
            onClick={() => setShowAvatar((prev) => !prev)}
            aria-pressed={showAvatar}
          >
            {showAvatar ? 'Hide ISL Avatar' : 'Show ISL Avatar (Interpreter)'}
          </Button>
          <Button
            size="sm"
            variant={callTts.speakSigns ? 'primary' : 'secondary'}
            onClick={() => callTts.toggleSpeakSigns()}
            aria-pressed={callTts.speakSigns}
            title={callTts.speakSigns ? 'Spoken audio is active — click to turn off' : 'Click to read incoming signs aloud'}
          >
            {callTts.speakSigns ? '🔊 Spoken Signs ON' : '🔇 Speak Signs OFF'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowVocabulary(true)}
            aria-label="View supported ISL vocabulary scope"
          >
            📖 Supported vocabulary
          </Button>
          <ConnectionIndicator state={call.state} />
          <span className="tabular-nums text-sm text-clay-muted" aria-label="Call duration">
            {formatDuration(call.durationSec)}
          </span>
        </div>
      </header>

      <InvitePanel sessionId={effectiveId} token={joinToken} compact />

      {inCall && !callTts.speakSigns && !promptDismissed && (
        <div
          role="region"
          aria-label="Spoken audio announcement"
          className="flex flex-wrap items-center justify-between gap-3 rounded-clay bg-clay-primary/15 p-3 text-sm text-clay-primary"
        >
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🔊</span>
            <span>
              <strong>Blind or low-vision?</strong> Turn on spoken audio to have incoming ISL signs read aloud automatically.
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                callTts.setSpeakSigns(true);
                setPromptDismissed(true);
              }}
            >
              Enable Spoken Audio
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPromptDismissed(true)}
            >
              Keep Off
            </Button>
          </div>
        </div>
      )}

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

      {/* Phase 6 §29: Live Bidirectional Async Pipeline Indicators */}
      <BidirectionalPipelineStatus
        signState={
          call.state === 'reconnecting'
            ? 'reconnecting'
            : !islRecognitionOn || call.state !== 'connected' || !call.cameraOn
            ? 'idle'
            : gestureRec.engineStatus === 'offline'
            ? 'unavailable'
            : gestureRec.engineStatus === 'fallback' || !gestureRec.trained
            ? 'fallback'
            : gestureRec.lastDetection && gestureRec.lastDetection.confidence < 0.6
            ? 'low-confidence'
            : gestureRec.active
            ? gestureRec.lastDetection
              ? 'processing'
              : 'listening'
            : 'idle'
        }
        signLatencyMs={gestureRec.latencyMs}
        signEngineName={
          gestureRec.engineStatus === 'fallback'
            ? 'Heuristic HandShape (Fallback)'
            : 'ISL Hierarchical Dual-Stream'
        }
        lastSignLabel={gestureRec.lastDetection?.label}
        lastSignConfidence={gestureRec.lastDetection?.confidence}
        speechState={
          call.state === 'reconnecting'
            ? 'reconnecting'
            : !speech.supported || speech.status === 'unsupported' || !!speech.error
            ? 'unavailable'
            : speech.running || speech.status === 'listening'
            ? user && captions.interim[user.id]
              ? 'processing'
              : 'listening'
            : 'idle'
        }
        speechLatencyMs={speech.latency.startToFinalMs ?? speech.latency.startToFirstInterimMs ?? 0}
        speechProviderName={speech.providerName}
        avatarActive={showAvatar}
        avatarPhase={avatar.phase}
      />

      <div className={gridClassesFor(orderedRemotes.length + 1 + (showAvatar ? 1 : 0))}>
        <div className="relative aspect-video overflow-hidden rounded-clay">
          <VideoTile
            stream={engine.localStream ?? undefined}
            participant={roster.find((p) => p.userId === user?.id)}
            cameraOn={call.cameraOn}
            isLocal
            mirror
            label={displayName}
            active={!!user && !!activeSpeaker.speaking[user.id]}
          />
          {islRecognitionOn && (
            // No mirror transform: selfieMode already emits self-view
            // coordinates, so flipping this canvas again would draw the skeleton
            // over the opposite hand. LANDMARK_OVERLAY_CLASS carries the reason.
            <canvas
              ref={gestureRec.canvasRef}
              className={`${LANDMARK_OVERLAY_CLASS} object-cover`}
            />
          )}
          {islRecognitionOn && gestureRec.lastDetection && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded bg-black/75 px-2.5 py-1 text-xs font-semibold text-white shadow backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ISL: {gestureRec.lastDetection.label}</span>
              <span className="text-emerald-300">({Math.round(gestureRec.lastDetection.confidence * 100)}%)</span>
            </div>
          )}
          {islRecognitionOn && gestureRec.errorMessage && (
            <div className="absolute inset-x-2 bottom-2 z-10 rounded bg-black/80 px-2.5 py-1.5 text-xs font-medium text-amber-200 shadow backdrop-blur-sm">
              {gestureRec.errorMessage}
            </div>
          )}
        </div>
        {showAvatar && (
          <div className="clay-surface relative flex aspect-video flex-col overflow-hidden rounded-clay bg-clay-soft">
            <canvas ref={avatar.canvasRef} className="h-full w-full" />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white shadow">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              ISL 3D Interpreter
            </div>
            {/* Real-time honest playback mode disclosure: Fingerspelling vs Full sign */}
            <div className="absolute top-2 right-2 z-10">
              <AvatarPlaybackBadge currentCommand={avatar.queue.current} />
            </div>
            {/* Subtitle / plain-English caption overlay for hard-of-hearing, non-signing users */}
            {translationEntries.length > 0 && translationEntries[translationEntries.length - 1].sourceText && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-x-2 bottom-2 z-10 flex flex-col gap-0.5 rounded bg-black/85 px-3 py-1.5 text-xs text-white shadow backdrop-blur-sm"
              >
                <div className="flex items-center justify-between text-[11px] text-clay-muted">
                  <span>
                    {nameOf(translationEntries[translationEntries.length - 1].participantUserId)} speaking
                  </span>
                  {translationEntries[translationEntries.length - 1].representation?.concepts &&
                    translationEntries[translationEntries.length - 1].representation!.concepts.length > 0 && (
                      <span className="font-mono text-emerald-400">
                        Gloss:{' '}
                        {translationEntries[translationEntries.length - 1]
                          .representation!.concepts.map((c) => (c.normalizedMeaning || c.conceptId).toUpperCase())
                          .join(' ')}
                      </span>
                    )}
                </div>
                <p className="font-medium text-white text-sm">
                  &ldquo;{translationEntries[translationEntries.length - 1].sourceText}&rdquo;
                </p>
              </div>
            )}
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
            {avatar.phase === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-clay-muted">
                {avatar.error ?? 'The 3D avatar could not start on this device.'}
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
        onShowShortcuts={() => setShowShortcutsHelp((prev) => !prev)}
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
        speakCaptions={callTts.speakCaptions}
        screenReaderOptimized={settings.screenReaderOptimized}
      />

      {/* Phase 7: Honest Vocabulary Scope Disclosure Modal */}
      <SupportedVocabularyModal
        isOpen={showVocabulary}
        onClose={() => setShowVocabulary(false)}
      />

      {/* Phase 4: Keyboard Navigation Shortcuts Guide Modal */}
      <Modal
        open={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        title="Keyboard Navigation Shortcuts"
      >
        <div className="flex flex-col gap-3 py-2 text-sm text-clay-ink">
          <p className="text-xs text-clay-muted">
            The call screen can be fully operated using your keyboard or screen reader without a pointer:
          </p>
          <div className="divide-y divide-clay-edge/40">
            <div className="flex items-center justify-between py-2">
              <span className="font-semibold text-clay-primary">M</span>
              <span className="text-clay-muted">Toggle microphone (Mute / Unmute)</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-semibold text-clay-primary">V</span>
              <span className="text-clay-muted">Toggle camera (On / Off)</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-semibold text-clay-primary">?</span>
              <span className="text-clay-muted">Open / close this keyboard shortcuts guide</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-semibold text-clay-primary">Tab / Shift+Tab</span>
              <span className="text-clay-muted">Navigate between controls and panels</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-semibold text-clay-primary">Escape</span>
              <span className="text-clay-muted">Close any open dialog or modal</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
