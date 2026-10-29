import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureDetectedPayload, TranscriptFinalPayload } from '@isl/shared-types';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { setPrefs } from '../store/voiceSlice.js';
import { useTts, type TtsApi, type SpeakOverrides } from './useTts.js';
import { CallTtsQueue, type QueuedUtterance } from '../lib/call/callTtsQueue.js';
import type { CaptionLine } from '../lib/speech/transcriptModel.js';
import type { ParticipantUiState } from '../store/callSlice.js';

export interface UseCallTtsArgs {
  selfUserId: string;
  participants?: Record<string, ParticipantUiState> | ParticipantUiState[];
  /** Controlled or initial setting for whether incoming signs should be spoken */
  speakSigns?: boolean;
  /** Controlled or initial setting for whether incoming peer speech should be spoken */
  speakCaptions?: boolean;
  /**
   * When true, yields speech captions to native screen readers (aria-live)
   * to prevent in-app TTS and screen reader from speaking simultaneously.
   */
  screenReaderOptimized?: boolean;
  /** Whether to announce participant names before utterance (e.g. "Aarav signed: Hello") */
  announceName?: boolean;
  /** Dedup window in milliseconds (default 2500) */
  dedupWindowMs?: number;
  /** Injectable TtsApi for testing */
  tts?: TtsApi;
}

export interface CallTtsApi {
  /** Underlying TTS state and metrics from useTts */
  tts: TtsApi;
  /** Whether incoming signs are spoken aloud */
  speakSigns: boolean;
  /** Whether incoming speech captions are spoken aloud */
  speakCaptions: boolean;
  /** Toggle sign audio reading aloud */
  toggleSpeakSigns: () => void;
  /** Toggle caption audio reading aloud */
  toggleSpeakCaptions: () => void;
  setSpeakSigns: (enabled: boolean) => void;
  setSpeakCaptions: (enabled: boolean) => void;

  /** Enqueue an incoming gesture detection payload */
  handleRemoteGesture: (payload: GestureDetectedPayload, overrideName?: string) => boolean;
  /** Enqueue an incoming speech transcript payload */
  handleRemoteTranscript: (payload: TranscriptFinalPayload, overrideName?: string) => boolean;
  /** Enqueue a generic CaptionLine */
  handleCaptionLine: (line: CaptionLine, overrideName?: string) => boolean;

  /** Speak an arbitrary text immediately through the queue */
  speak: (text: string, overrides?: SpeakOverrides) => void;
  /** Cancel any active playback and clear pending utterances */
  cancel: () => void;

  /** Active utterance currently playing */
  activeUtterance: QueuedUtterance | null;
  /** Pending utterances in the FIFO queue */
  queue: QueuedUtterance[];
  /** Number of utterances waiting in queue */
  queueLength: number;
  /** Whether TTS is currently speaking an utterance */
  isSpeaking: boolean;
}

/**
 * Call-specific TTS hook (Phase 1 — Sign→Speech Live Wiring).
 *
 * Bridges incoming remote ISL gesture recognitions and speech transcripts into
 * spoken audio output for blind, low-vision, or hearing participants:
 * - Queues utterances sequentially so they don't talk over each other.
 * - Deduplicates bursts of repeated sign labels.
 * - Suppresses local user's own signs and speech.
 * - Respects ADR-023 consent policy (defaults to off, toggleable in lobby and in-call).
 */
export function useCallTts(args: UseCallTtsArgs): CallTtsApi {
  const dispatch = useAppDispatch();
  const voicePrefs = useAppSelector((s) => s.voice);
  // Avoid mounting duplicate provider effects if an external tts instance was injected
  const defaultTts = useTts({ provider: args.tts ? null : undefined });
  const tts = args.tts ?? defaultTts;

  const [speakSigns, setSpeakSignsState] = useState<boolean>(() =>
    args.speakSigns !== undefined ? args.speakSigns : voicePrefs.autoplay === 'readAloud',
  );
  const [speakCaptions, setSpeakCaptionsState] = useState<boolean>(() =>
    args.speakCaptions !== undefined ? args.speakCaptions : false,
  );

  const [queueState, setQueueState] = useState<{
    queue: QueuedUtterance[];
    active: QueuedUtterance | null;
  }>({
    queue: [],
    active: null,
  });

  const queueRef = useRef<CallTtsQueue | null>(null);

  // Initialize CallTtsQueue once
  if (!queueRef.current) {
    queueRef.current = new CallTtsQueue({
      selfUserId: args.selfUserId,
      speakSigns,
      speakCaptions,
      announceName: args.announceName ?? true,
      dedupWindowMs: args.dedupWindowMs ?? 2500,
      onSpeak: (text) => {
        tts.speak(text);
      },
      onCancel: () => {
        tts.cancel();
      },
      onQueueChange: (q, active) => {
        setQueueState({ queue: q, active });
      },
    });
  }

  // Synchronize options into the queue
  useEffect(() => {
    queueRef.current?.setSelfUserId(args.selfUserId);
  }, [args.selfUserId]);

  useEffect(() => {
    queueRef.current?.setAnnounceName(args.announceName ?? true);
  }, [args.announceName]);

  useEffect(() => {
    if (queueRef.current && queueRef.current.getSpeakSigns() !== speakSigns) {
      queueRef.current.setSpeakSigns(speakSigns);
    }
  }, [speakSigns]);

  useEffect(() => {
    // When screenReaderOptimized is enabled, in-app TTS yields speech captions
    // to the native screen reader's aria-live announcements.
    const effectiveSpeakCaptions = speakCaptions && !args.screenReaderOptimized;
    if (queueRef.current && queueRef.current.getSpeakCaptions() !== effectiveSpeakCaptions) {
      queueRef.current.setSpeakCaptions(effectiveSpeakCaptions);
    }
  }, [speakCaptions, args.screenReaderOptimized]);

  // Handle TTS playback completion/error to drain the next queue item
  const prevTtsStateRef = useRef(tts.state);
  useEffect(() => {
    const prev = prevTtsStateRef.current;
    prevTtsStateRef.current = tts.state;

    if (prev === 'speaking' || prev === 'queued') {
      if (tts.state === 'finished' || tts.state === 'idle') {
        queueRef.current?.notifyUtteranceFinished();
      } else if (tts.state === 'error' || tts.state === 'cancelled') {
        queueRef.current?.notifyUtteranceError();
      }
    }
  }, [tts.state]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      queueRef.current?.cancel(false);
    };
  }, []);

  const setSpeakSigns = useCallback(
    (enabled: boolean) => {
      setSpeakSignsState(enabled);
      dispatch(setPrefs({ autoplay: enabled ? 'readAloud' : 'off' }));
    },
    [dispatch],
  );

  const setSpeakCaptions = useCallback((enabled: boolean) => {
    setSpeakCaptionsState(enabled);
  }, []);

  const toggleSpeakSigns = useCallback(() => {
    setSpeakSigns(!speakSigns);
  }, [setSpeakSigns, speakSigns]);

  const toggleSpeakCaptions = useCallback(() => {
    setSpeakCaptions(!speakCaptions);
  }, [setSpeakCaptions, speakCaptions]);

  const resolveParticipantName = useCallback(
    (userId: string): string | undefined => {
      if (!args.participants || !userId) return undefined;
      if (Array.isArray(args.participants)) {
        return args.participants.find((p) => p.userId === userId)?.displayName;
      }
      return args.participants[userId]?.displayName;
    },
    [args.participants],
  );

  const handleRemoteGesture = useCallback(
    (payload: GestureDetectedPayload, overrideName?: string): boolean => {
      if (!payload?.label) return false;
      const signerId =
        payload.fromUserId ||
        (payload.breakdown as { userId?: string } | undefined)?.userId ||
        '';
      const signerName = overrideName ?? resolveParticipantName(signerId) ?? 'Participant';
      return queueRef.current?.enqueueSign(signerId, payload.label, payload.confidence, signerName) ?? false;
    },
    [resolveParticipantName],
  );

  const handleRemoteTranscript = useCallback(
    (payload: TranscriptFinalPayload, overrideName?: string): boolean => {
      if (!payload?.text) return false;
      const speakerId = payload.participantUserId;
      const speakerName = overrideName ?? resolveParticipantName(speakerId) ?? 'Participant';
      return queueRef.current?.enqueueTranscript(speakerId, payload.text, speakerName) ?? false;
    },
    [resolveParticipantName],
  );

  const handleCaptionLine = useCallback(
    (line: CaptionLine, overrideName?: string): boolean => {
      if (!line?.text) return false;
      const speakerId = line.speakerUserId;
      const speakerName = overrideName ?? resolveParticipantName(speakerId) ?? 'Participant';
      if (line.provider === 'isl-engine-hierarchical' || line.text.startsWith('🤟')) {
        const match = line.text.match(/🤟\s*\[[^\]]+\]:\s*([^(]+)/);
        const label = match ? match[1].trim() : line.text;
        return queueRef.current?.enqueueSign(speakerId, label, line.confidence, speakerName) ?? false;
      }
      return queueRef.current?.enqueueTranscript(speakerId, line.text, speakerName) ?? false;
    },
    [resolveParticipantName],
  );

  const speak = useCallback(
    (text: string, overrides?: SpeakOverrides) => {
      if (overrides) {
        tts.speak(text, overrides);
      } else {
        queueRef.current?.enqueueSystem(text);
      }
    },
    [tts],
  );

  const cancel = useCallback(() => {
    queueRef.current?.cancel();
  }, []);

  return {
    tts,
    speakSigns,
    speakCaptions,
    toggleSpeakSigns,
    toggleSpeakCaptions,
    setSpeakSigns,
    setSpeakCaptions,
    handleRemoteGesture,
    handleRemoteTranscript,
    handleCaptionLine,
    speak,
    cancel,
    activeUtterance: queueState.active,
    queue: queueState.queue,
    queueLength: queueState.queue.length,
    isSpeaking: queueState.active !== null || tts.state === 'speaking',
  };
}
