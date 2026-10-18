import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  JoinSessionResponse,
  CreateSessionResponse,
  SessionType,
  TextMessagePayload,
  WebRtcOfferPayload,
  WebRtcAnswerPayload,
  WebRtcIceCandidatePayload,
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  ParticipantMutedPayload,
  ParticipantCameraPayload,
  ActiveSpeakerPayload,
  ModerationAppliedPayload,
  ModerationCommandAction,
  TranslationStartedPayload,
  TranslationCompletedPayload,
  TranscriptPartialPayload,
  TranscriptFinalPayload,
  SignalEventName,
  SystemErrorPayload,
} from '@isl/shared-types';
import { api } from '../lib/apiClient.js';
import { SignalClient } from '../lib/socket.js';
import { CallEngine, type SignalSender } from '../lib/webrtc/engine.js';
import { requestLocalMedia, stopStream } from '../lib/webrtc/media.js';
import { VoiceActivityMonitor } from '../lib/call/voiceActivity.js';
import type { ReconnectAttemptInfo } from '../lib/webrtc/reconnectPolicy.js';
import { aggregateCallEvent } from '../lib/call/machine.js';
import { SessionRecorder, fetchConsentState, setConsent as setConsentScope } from '../lib/sessionRecord.js';
import { TelemetryCollector } from '../lib/telemetry.js';
import type { PeerConnectionStatus } from '../lib/webrtc/peer.js';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { captionInterim, captionFinal } from '../store/captionSlice.js';
import type { CaptionLine } from '../lib/speech/transcriptModel.js';
import {
  callStarted,
  callEvent,
  participantJoined,
  participantLeft,
  participantMuted,
  participantCamera,
  participantStatus,
  participantQuality,
  participantReconnect,
  messageReceived,
  mediaToggled,
  mediaErrorSet,
  durationTicked,
  selfRoleSet,
  persistenceSet,
  noticeSet,
  type ParticipantUiState,
} from '../store/callSlice.js';
import { activeSpeakerUpdated, speakerCleared } from '../store/activeSpeakerSlice.js';
import { translationStarted, translationCompleted } from '../store/translationSlice.js';

/** Classify coarse connection quality from real stats (§12 item 15). */
function classifyQuality(stats: { rttMs?: number; packetLossPct?: number }): 'excellent' | 'good' | 'fair' | 'poor' {
  const loss = stats.packetLossPct ?? 0;
  const rtt = stats.rttMs ?? 0;
  if (loss <= 0.5 && rtt <= 80) return 'excellent';
  if (loss <= 2 && rtt <= 180) return 'good';
  if (loss <= 6 && rtt <= 350) return 'fair';
  return 'poor';
}

export interface UseCallArgs {
  sessionId: string;
  displayName: string;
  selfUserId: string;
}

export interface CallApi {
  start: () => Promise<void>;
  end: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  sendText: (body: string) => void;
  /** Relay a typed transcript event to peers over the existing signaling socket. */
  emitTranscript: (event: SignalEventName, payload: unknown) => void;
  /**
   * Host-only moderation command (§19). Sent over the socket; the server
   * authorizes it against the persisted host and either relays the effect
   * (echoing back as `moderation:applied`) or answers with a visible
   * rejection notice. Never optimistic — the receipt updates the UI.
   */
  moderate: (targetUserId: string, action: ModerationCommandAction, reason?: string) => void;
  dismissNotice: () => void;
  /**
   * Persist one of our own final captions (Phase 4A.1). A no-op unless the
   * `recording` consent scope is granted for this call; never throws.
   */
  recordLocalTranscript: (payload: TranscriptFinalPayload) => void;
  /** Persist one completed local translation, deduplicated by sourceTranscriptId. */
  recordLocalTranslation: (payload: TranslationCompletedPayload) => void;
  /** Grant the `recording` scope server-side and start persisting this call. */
  grantConsent: () => Promise<void>;
  /** Decline persistence for this call (nothing is stored, and we say so). */
  declineConsent: () => void;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
}

/**
 * Orchestrates a live session: local media, the WebRTC mesh, signaling wiring,
 * the call state machine, duration timing and reconnection (§12 items 6-9,
 * 11-18). MediaStream objects live in refs/state here (never in Redux).
 */
export function useCall({ sessionId, displayName, selfUserId }: UseCallArgs): CallApi {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.call.state);
  const participants = useAppSelector((s) => s.call.participants);

  const clientRef = useRef<SignalClient | null>(null);
  const engineRef = useRef<CallEngine | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<VoiceActivityMonitor | null>(null);
  // Consent-gated artefact writer (Phase 4A); null while persistence is off.
  const recorderRef = useRef<SessionRecorder | null>(null);
  // Analytics-gated measured-stats shipper (Phase 4C); null without consent.
  const telemetryRef = useRef<TelemetryCollector | null>(null);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribers = useRef<Array<() => void>>([]);
  // Latest participant names for notice text, without restarting the engine.
  const participantsRef = useRef<Record<string, ParticipantUiState>>(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);
  // Every peer's last real connection state, so the *aggregate* drives the
  // call machine instead of whichever callback fired last (Phase 4B).
  const peerStatusesRef = useRef<Record<string, PeerConnectionStatus>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const startedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (durationTimer.current) {
      clearInterval(durationTimer.current);
      durationTimer.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    clearTimers();
    vadRef.current?.stop();
    vadRef.current = null;
    telemetryRef.current?.stop();
    telemetryRef.current = null;
    engineRef.current?.closeAll();
    engineRef.current = null;
    unsubscribers.current.forEach((off) => off());
    unsubscribers.current = [];
    localStreamRef.current = null;
    peerStatusesRef.current = {};
    setLocalStream(null);
    setRemoteStreams({});
  }, [clearTimers]);

  // Drive the state machine + duration timer from the AGGREGATE of real peer
  // statuses (§12 item 18, Phase 4B): one connected peer must not silence a
  // dropped one, and a dropped one must not erase a recovered one.
  const applyAggregate = useCallback(() => {
    const event = aggregateCallEvent(Object.values(peerStatusesRef.current));
    if (event) dispatch(callEvent(event));
  }, [dispatch]);

  const handlePeerStatus = useCallback(
    (userId: string, status: PeerConnectionStatus) => {
      const map = peerStatusesRef.current;
      // 'closed' noise for a peer we already forgot (they left) must not
      // resurrect it in the aggregate.
      if (!(userId in map) && status === 'closed') return;
      map[userId] = status;
      dispatch(participantStatus({ userId, status }));
      applyAggregate();
    },
    [dispatch, applyAggregate],
  );

  // Bounded ICE-restart accounting from the peer policy (Phase 4B): the tile
  // shows which attempt is in flight, and an honest stop when it runs out.
  const handlePeerReconnect = useCallback(
    (userId: string, info: ReconnectAttemptInfo) => {
      dispatch(participantReconnect({ userId, ...info }));
    },
    [dispatch],
  );

  // One seam for every inbound/outbound final: fold provider-measured caption
  // latency into telemetry when the value exists (never a guess, §29).
  const observeFinalLatency = useCallback((payload: TranscriptFinalPayload | unknown) => {
    const latency = (payload as TranscriptFinalPayload)?.latencyMs;
    if (typeof latency === 'number' && Number.isFinite(latency)) {
      telemetryRef.current?.observeCaptionLatency(latency);
    }
  }, []);

  const ensureDurationTimer = useCallback(() => {
    if (durationTimer.current) return;
    durationTimer.current = setInterval(() => dispatch(durationTicked()), 1000);
  }, [dispatch]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    peerStatusesRef.current = {};
    dispatch(callStarted({ sessionId, selfUserId }));

    // 1. Acquire local media (real permission handling).
    const media = await requestLocalMedia({ audio: true, video: true });
    if (!media.stream) {
      dispatch(mediaErrorSet(media.message));
      dispatch(callEvent({ type: 'FAILED', reason: media.message }));
      startedRef.current = false;
      return;
    }
    localStreamRef.current = media.stream;
    setLocalStream(media.stream);
    dispatch(mediaErrorSet(null));

    // 2. Bootstrap the session over REST (join registers us + returns ICE + peers).
    let join: JoinSessionResponse;
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? '';
      join = await api.post<JoinSessionResponse>(`/sessions/${sessionId}/join`, { sessionId, joinToken: token });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not join this session.';
      dispatch(callEvent({ type: 'FAILED', reason: message }));
      stopStream(media.stream);
      startedRef.current = false;
      return;
    }
    // 3. Resolve the persistence posture BEFORE any artefact exists (§22):
    // read our server-side consent state; only a granted `recording` scope
    // starts the writer. A failure to check means nothing is stored — we never
    // persist on uncertainty, and the server would reject it anyway.
    try {
      const consent = await fetchConsentState();
      if (consent.recording) {
        recorderRef.current = new SessionRecorder({ sessionId });
        dispatch(persistenceSet('on'));
      } else {
        dispatch(persistenceSet('prompt'));
      }
      // Analytics is a separate, narrower consent scope (§22): it ships
      // measured numbers only, never content. No collector without it.
      if (consent.analytics) {
        const collector = new TelemetryCollector();
        collector.start();
        telemetryRef.current = collector;
      }
    } catch {
      dispatch(persistenceSet('off'));
    }

    // 4. Build the mesh engine + signaling client.
    const client = new SignalClient();
    clientRef.current = client;
    const socket = client.connect();
    const sender: SignalSender = {
      offer: (payload) => socket.emit('webrtc:offer', payload),
      answer: (payload) => socket.emit('webrtc:answer', payload),
      ice: (payload) => socket.emit('webrtc:ice-candidate', payload),
    };

    const engine = new CallEngine({
      localUserId: selfUserId,
      iceServers: join.iceServers,
      localStream: media.stream,
      sender,
      callbacks: {
        onRemoteStream: (userId, stream) => setRemoteStreams((prev) => ({ ...prev, [userId]: stream })),
        onPeerStatus: handlePeerStatus,
        onPeerReconnect: (userId, info) => {
          handlePeerReconnect(userId, info);
          telemetryRef.current?.observeReconnect(info);
        },
        onPeerQuality: (userId, stats) => {
          dispatch(participantQuality({ userId, quality: classifyQuality(stats) }));
          // Raw measured stats (not the coarse label) for aggregate telemetry (§26).
          telemetryRef.current?.observeQuality(stats);
        },
      },
    });
    engineRef.current = engine;

    // 5. Resolve group authority from the server's answer, then seed existing
    // participants from the join peers list (real display names + persisted
    // presence flags, so tiles start truthful, §19).
    dispatch(selfRoleSet({ selfRole: join.selfRole, hostUserId: join.session.hostUserId }));
    for (const p of join.peers) {
      if (p.userId === selfUserId) continue;
      dispatch(
        participantJoined({
          userId: p.userId,
          displayName: p.displayName,
          role: p.role,
          muted: p.muted,
          cameraOn: p.cameraOn,
        }),
      );
      engine.connectPeer(p.userId);
    }

    // 6. Local voice activity: an amplitude meter on our own microphone, self-
    // reporting transitions as `decidedBy: 'self'` claims (§19 item 3). A
    // disabled microphone reports nothing — the ring follows real audio.
    const vad = new VoiceActivityMonitor({
      stream: media.stream,
      onActivityChange: (active) => {
        clientRef.current?.emit('participant:active-speaker', {
          userId: selfUserId,
          active,
          decidedBy: 'self',
        });
      },
    });
    vadRef.current = vad;
    vad.start();

    // 7. Wire inbound signaling events to the engine + store.
    const off = (fn: () => void) => unsubscribers.current.push(fn);
    off(
      client.on<ParticipantJoinedPayload>('participant:joined', (payload) => {
        dispatch(participantJoined(payload));
        engineRef.current?.connectPeer(payload.userId);
      }),
    );
    off(
      client.on<ParticipantLeftPayload>('participant:left', (payload) => {
        dispatch(participantLeft(payload));
        dispatch(speakerCleared(payload.userId));
        delete peerStatusesRef.current[payload.userId];
        engineRef.current?.disconnectPeer(payload.userId);
        applyAggregate();
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
      }),
    );
    off(
      client.on<WebRtcOfferPayload>('webrtc:offer', (payload) => {
        engineRef.current?.handleOffer(payload.fromUserId, payload.sdp);
      }),
    );
    off(
      client.on<WebRtcAnswerPayload>('webrtc:answer', (payload) => {
        engineRef.current?.handleAnswer(payload.fromUserId, payload.sdp);
      }),
    );
    off(
      client.on<WebRtcIceCandidatePayload>('webrtc:ice-candidate', (payload) => {
        engineRef.current?.handleIce(payload.fromUserId, {
          candidate: payload.candidate,
          sdpMid: payload.sdpMid,
          sdpMLineIndex: payload.sdpMLineIndex,
        });
      }),
    );
    off(
      client.on<ParticipantMutedPayload>('participant:muted', (payload) => {
        dispatch(participantMuted(payload));
        // A host-forced mute reaches the target directly (§19): enforce it on
        // our own hardware instead of just painting the tile.
        if (payload.userId === selfUserId) {
          engineRef.current?.setMicrophoneEnabled(!payload.muted);
          dispatch(mediaToggled({ micOn: !payload.muted }));
          vadRef.current?.setEnabled(!payload.muted);
        }
      }),
    );
    off(
      client.on<ParticipantCameraPayload>('participant:camera-changed', (payload) => {
        dispatch(participantCamera(payload));
        if (payload.userId === selfUserId) {
          engineRef.current?.setCameraEnabled(payload.cameraOn);
          dispatch(mediaToggled({ cameraOn: payload.cameraOn }));
        }
      }),
    );
    // Active-speaker truth, relayed by the server from self-reported VAD
    // claims or host decisions (§19). Drives the tile ring + grid ordering.
    off(
      client.on<ActiveSpeakerPayload>('participant:active-speaker', (payload) => {
        if (!payload?.userId) return;
        dispatch(activeSpeakerUpdated(payload));
      }),
    );
    // Moderation receipt (§19): the server-verified record of what happened.
    // The UI follows this receipt, never a client-side guess.
    off(
      client.on<ModerationAppliedPayload>('moderation:applied', (payload) => {
        if (!payload?.targetUserId) return;
        const { actorUserId, targetUserId, action, reason } = payload;
        const name = (id: string) => participantsRef.current[id]?.displayName ?? id;
        if (action === 'mute' || action === 'unmute') {
          dispatch(participantMuted({ userId: targetUserId, muted: action === 'mute' }));
        } else {
          dispatch(participantCamera({ userId: targetUserId, cameraOn: action === 'camera-on' }));
        }
        if (action === 'mute') {
          dispatch(activeSpeakerUpdated({ userId: targetUserId, active: false, decidedBy: 'host' }));
        }
        const verb =
          action === 'mute' ? 'muted' : action === 'unmute' ? 'unmuted' : action === 'camera-off' ? 'turned off the camera for' : 'turned the camera back on for';
        dispatch(
          noticeSet({
            tone: 'info',
            message: `${name(actorUserId)} ${verb} ${name(targetUserId)}${reason ? ` — ${reason}` : ''}.`,
          }),
        );
      }),
    );
    // Attributable in-call translation from any peer (§19 item 7).
    off(
      client.on<TranslationStartedPayload>('translation:started', (payload) => {
        if (payload?.sourceTranscriptId) dispatch(translationStarted(payload));
      }),
    );
    off(
      client.on<TranslationCompletedPayload>('translation:completed', (payload) => {
        if (payload?.sourceTranscriptId) dispatch(translationCompleted(payload));
      }),
    );
    off(
      client.on<TextMessagePayload>('message:text', (payload) => {
        dispatch(
          messageReceived({
            id: crypto.randomUUID(),
            senderUserId: payload.senderUserId,
            body: payload.body,
            sentAt: new Date().toISOString(),
          }),
        );
      }),
    );
    off(
      client.on<SystemErrorPayload>('system:error', (payload) => {
        const message = payload?.message ?? 'A signaling error occurred.';
        // Recoverable, room-scoped notices (host failover) and per-command
        // rejections must never tear the call down (§29: visible, not fatal).
        if (payload?.code === 'HOST_CHANGED') {
          dispatch(noticeSet({ tone: 'info', message }));
        } else if (payload?.rejectedEvent || payload?.recoverable) {
          dispatch(noticeSet({ tone: 'warning', message }));
        } else {
          dispatch(callEvent({ type: 'FAILED', reason: message }));
        }
      }),
    );

    // Inbound live captions from peers (Phase 2C). Same reducers the local
    // speech hook uses, so interim stays replaceable and finals stay stable.
    off(
      client.on<TranscriptPartialPayload>('transcript:partial', (payload) => {
        if (!payload?.segment?.text) return;
        dispatch(
          captionInterim({
            id: `${payload.participantUserId}:interim`,
            speakerUserId: payload.participantUserId,
            text: payload.segment.text,
            kind: 'interim',
            confidence: payload.segment.confidence,
            language: payload.language,
            latencyMs: null,
            at: new Date().toISOString(),
          }),
        );
      }),
    );
    off(
      client.on<TranscriptFinalPayload>('transcript:final', (payload) => {
        if (!payload?.text) return;
        observeFinalLatency(payload);
        const line: CaptionLine = {
          id: crypto.randomUUID(),
          speakerUserId: payload.participantUserId,
          text: payload.text,
          kind: 'final',
          confidence: payload.confidence,
          language: payload.language,
          latencyMs: payload.latencyMs ?? null,
          provider: payload.provider,
          at: new Date().toISOString(),
        };
        dispatch(captionFinal(line));
      }),
    );

    // 8. Announce ourselves to the room (server relays presence to peers).
    client.join(sessionId, displayName);
  }, [sessionId, selfUserId, displayName, dispatch, handlePeerStatus, handlePeerReconnect, applyAggregate, observeFinalLatency]);

  const end = useCallback(() => {
    if (clientRef.current && selfUserId) {
      clientRef.current.leave(sessionId, selfUserId);
    }
    stopStream(localStreamRef.current ?? undefined);
    teardown();
    clientRef.current?.disconnect();
    clientRef.current = null;
    // Pending artefacts keep draining in the recorder; it just stops accepting
    // new ones (§23: the writer is bounded, never a leak).
    recorderRef.current?.close();
    recorderRef.current = null;
    dispatch(callEvent({ type: 'ENDED' }));
    startedRef.current = false;
  }, [sessionId, selfUserId, teardown, dispatch]);

  const toggleMic = useCallback(() => {
    const next = !(engineRef.current && localStreamRef.current ? localStreamRef.current.getAudioTracks().every((t) => t.enabled) : true);
    engineRef.current?.setMicrophoneEnabled(next);
    dispatch(mediaToggled({ micOn: next }));
    vadRef.current?.setEnabled(next);
    const client = clientRef.current;
    if (client) client.emit('participant:muted', { userId: selfUserId, muted: !next });
  }, [selfUserId, dispatch]);

  const toggleCamera = useCallback(() => {
    const currentOn = localStreamRef.current ? localStreamRef.current.getVideoTracks().every((t) => t.enabled) : true;
    const next = !currentOn;
    engineRef.current?.setCameraEnabled(next);
    dispatch(mediaToggled({ cameraOn: next }));
    const client = clientRef.current;
    if (client) client.emit('participant:camera-changed', { userId: selfUserId, cameraOn: next });
  }, [selfUserId, dispatch]);

  const sendText = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      clientRef.current?.emit('message:text', { senderUserId: selfUserId, body: trimmed });
      dispatch(
        messageReceived({ id: crypto.randomUUID(), senderUserId: selfUserId, body: trimmed, sentAt: new Date().toISOString() }),
      );
      // Phase 4A: the text fallback was live-only; it now persists too, under
      // the same consent gate as captions (a no-op when persistence is off).
      recorderRef.current?.recordMessage(trimmed);
    },
    [selfUserId, dispatch],
  );

  // Outbound transcript relay for the local speech pipeline (§4 event flow).
  // Fire-and-forget over the same typed signaling socket; a no-op before join.
  const emitTranscript = useCallback((event: SignalEventName, payload: unknown) => {
    clientRef.current?.emit(event, payload);
    if (event === 'transcript:final') observeFinalLatency(payload);
  }, [observeFinalLatency]);

  // Host-only moderation command (§19). The server authorizes against the
  // persisted host; success arrives back as `moderation:applied`, a refusal as
  // a `system:error` rejection notice. Nothing here pretends before that.
  const moderate = useCallback((targetUserId: string, action: ModerationCommandAction, reason?: string) => {
    clientRef.current?.emit('moderation:action', { targetUserId, action, ...(reason ? { reason } : {}) });
  }, []);

  const dismissNotice = useCallback(() => {
    dispatch(noticeSet(null));
  }, [dispatch]);

  // --- Persistence (Phase 4A.1). Every method is a consent-gated no-op when
  // the writer was never created; nothing here can throw into the call UI.
  const recordLocalTranscript = useCallback((payload: TranscriptFinalPayload) => {
    if (payload?.participantUserId !== selfUserId) return; // only our own lines
    recorderRef.current?.recordTranscript({
      text: payload.text,
      confidence: payload.confidence,
      language: payload.language,
      source: 'speech',
    });
  }, [selfUserId]);

  const recordLocalTranslation = useCallback((payload: TranslationCompletedPayload) => {
    if (payload?.participantUserId !== selfUserId) return;
    recorderRef.current?.recordTranslation({
      sourceTranscriptId: payload.sourceTranscriptId,
      representation: payload.representation,
    });
  }, [selfUserId]);

  const grantConsent = useCallback(async () => {
    try {
      await setConsentScope('recording', true);
      recorderRef.current = recorderRef.current ?? new SessionRecorder({ sessionId });
      dispatch(persistenceSet('on'));
      dispatch(
        noticeSet({
          tone: 'info',
          message: 'Saving enabled: final captions, translations and messages from this call go to your history.',
        }),
      );
    } catch (err) {
      dispatch(
        noticeSet({
          tone: 'warning',
          message: err instanceof Error ? err.message : 'Could not record your consent. Nothing will be saved.',
        }),
      );
    }
  }, [sessionId, dispatch]);

  const declineConsent = useCallback(() => {
    dispatch(persistenceSet('off'));
  }, [dispatch]);

  // Ensure "connected" starts the call-duration clock (§12 item 17).
  useEffect(() => {
    if (state === 'connected') ensureDurationTimer();
    if (state === 'ended' || state === 'failed') clearTimers();
  }, [state, ensureDurationTimer, clearTimers]);

  // Socket.io reconnects the transport automatically; re-announce presence so
  // peers re-negotiate. Real peer state (not a timer) drives the state machine.
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    const socket = client.connect();
    const onReconnect = () => client.join(sessionId, displayName);
    socket.on('reconnect', onReconnect);
    return () => {
      socket.off('reconnect', onReconnect);
    };
  }, [sessionId, displayName, state]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    start,
    end,
    toggleMic,
    toggleCamera,
    sendText,
    emitTranscript,
    moderate,
    dismissNotice,
    recordLocalTranscript,
    recordLocalTranslation,
    grantConsent,
    declineConsent,
    localStream,
    remoteStreams,
  };
}

/** Create a new session and return the host's join credentials. */
export async function createSession(type: SessionType): Promise<CreateSessionResponse> {
  return api.post<CreateSessionResponse>('/sessions', { type });
}
