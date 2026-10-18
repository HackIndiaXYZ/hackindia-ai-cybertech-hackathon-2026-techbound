import type {
  ConsentRecord,
  IslIntermediateRepresentation,
  LanguageCode,
  Message,
  Transcript,
  TranscriptSource,
  Translation,
} from '@isl/shared-types';
import { api } from '../lib/apiClient.js';

/**
 * The single client-side writer for session artefacts (plan §23, Phase 4A.1).
 * The REST routes for transcripts/translations/messages have existed since
 * Phase 1; this module is what finally feeds them.
 *
 * Design rules, all enforced here and unit-tested:
 * - Fire-and-forget: recording never blocks or throws into the call UI.
 * - Bounded retry: a failing write is retried at most {@link maxRetries}
 *   times with exponential backoff; permanent 4xx rejections are dropped
 *   with the error surfaced via the snapshot (never swallowed silently).
 * - De-duplication: artefacts keyed by a stable id (e.g. sourceTranscriptId)
 *   are only ever queued once.
 * - Capped queue: when the network is down long enough to fill
 *   {@link maxQueue}, the oldest pending item is dropped and the status
 *   becomes 'partial' — the queue never grows without bound.
 * - Consent-gated: a recorder is only constructed once the `recording`
 *   scope is granted. The server enforces this too (403 CONSENT_REQUIRED);
 *   this gate is the UX boundary, and we never retry a consent rejection
 *   into nagging the user.
 */

export type RecorderStatus = 'active' | 'partial' | 'closed';

export interface RecorderSnapshot {
  status: RecorderStatus;
  /** Items still waiting to be (re)sent. */
  pending: number;
  /** Items dropped because the queue overflowed its cap. */
  dropped: number;
  /** Last failure message, so the UI can be honest about gaps. */
  lastError: string | null;
}

/** Minimal transport surface so tests can inject deterministic fakes. */
export interface RecordTransport {
  post<T>(path: string, body?: unknown): Promise<T>;
  get<T>(path: string): Promise<T>;
}

export interface SessionRecorderOptions {
  sessionId: string;
  transport?: RecordTransport;
  /** Injectable sleeper (real timers by default; fakes in tests). */
  wait?: (ms: number) => Promise<void>;
  /** Retries *after* the first attempt. Default 2 → at most 3 sends. */
  maxRetries?: number;
  /** First backoff step; doubles per retry. Default 400ms. */
  baseDelayMs?: number;
  /** Pending-item cap. Default 100. */
  maxQueue?: number;
}

interface QueueItem {
  key: string;
  path: string;
  body: unknown;
  attempt: number;
}

/** A 4xx that is not 429 will never succeed on retry: drop it instead. */
function isPermanentFailure(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class SessionRecorder {
  private readonly sessionId: string;
  private readonly transport: RecordTransport;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxQueue: number;

  private readonly queue: QueueItem[] = [];
  private readonly queuedKeys = new Set<string>();
  private draining = false;
  private closedFlag = false;
  private droppedCount = 0;
  private lastError: string | null = null;

  constructor(options: SessionRecorderOptions) {
    this.sessionId = options.sessionId;
    this.transport = options.transport ?? api;
    this.wait =
      options.wait ??
      ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 400;
    this.maxQueue = options.maxQueue ?? 100;
  }

  /**
   * Persist a finished spoken/signed/typed line. `key` should be a stable id
   * for the artefact so a repeated delivery never double-writes; when absent,
   * a fresh id makes this call unique by construction.
   */
  recordTranscript(
    input: {
      text: string;
      confidence: number | null;
      language: LanguageCode;
      /** 'speech' for dictation finals, 'text' for typed fallback, 'isl' for recognition output. */
      source: TranscriptSource;
      isFinal?: boolean;
    },
    key?: string,
  ): void {
    if (!input.text.trim()) return;
    this.enqueue('/transcripts', key ?? crypto.randomUUID(), {
      sessionId: this.sessionId,
      source: input.source,
      text: input.text,
      isFinal: input.isFinal ?? true,
      confidence: input.confidence,
      language: input.language,
    });
  }

  /**
   * Persist one completed translation. Deduplicated by `sourceTranscriptId`,
   * exactly as the plan requires: the same utterance can only be stored once.
   * Confidence and fallback flags come from the representation itself — the
   * measured values, never recomputed or smoothed.
   */
  recordTranslation(input: { sourceTranscriptId: string; representation: IslIntermediateRepresentation }): void {
    const { sourceTranscriptId, representation } = input;
    if (!sourceTranscriptId) return;
    this.enqueue('/translations', `tr:${sourceTranscriptId}`, {
      sessionId: this.sessionId,
      sourceTranscriptId,
      sourceText: representation.sourceText,
      targetRepresentation: JSON.stringify(representation),
      confidence: representation.overallConfidence,
      fallbackUsed: representation.fallbackUsed,
    });
  }

  /** Persist a text-fallback message sent from this client. */
  recordMessage(body: string, key?: string): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    this.enqueue('/messages', key ?? `msg:${crypto.randomUUID()}`, {
      sessionId: this.sessionId,
      body: trimmed,
    });
  }

  /** Stop accepting new artefacts; whatever is pending still drains. */
  close(): void {
    this.closedFlag = true;
  }

  getSnapshot(): RecorderSnapshot {
    return {
      status: this.closedFlag ? 'closed' : this.droppedCount > 0 ? 'partial' : 'active',
      pending: this.queue.length,
      dropped: this.droppedCount,
      lastError: this.lastError,
    };
  }

  private enqueue(path: string, key: string, body: unknown): void {
    if (this.closedFlag || this.queuedKeys.has(key)) return;
    this.queuedKeys.add(key);
    this.queue.push({ key, path, body, attempt: 0 });
    // Capped, never silently growing: oldest pending loses, and we say so.
    while (this.queue.length > this.maxQueue) {
      const oldest = this.queue.shift();
      if (oldest) {
        this.queuedKeys.delete(oldest.key);
        this.droppedCount += 1;
      }
    }
    void this.drain();
  }

  /** Serialized send loop: one item at a time, retries with doubling backoff. */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];
        try {
          await this.transport.post(item.path, item.body);
          this.remove(item);
        } catch (err) {
          this.lastError = errorMessage(err);
          if (isPermanentFailure(err) || item.attempt >= this.maxRetries) {
            // Permanent or retry budget exhausted: drop it, keep the error visible.
            this.remove(item);
            this.droppedCount += 1;
          } else {
            item.attempt += 1;
            await this.wait(this.baseDelayMs * 2 ** (item.attempt - 1));
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Remove a settled item by key, not by position: an overflow drop may have
   * already removed it while its send was in flight, so a blind shift() would
   * delete the wrong neighbour.
   */
  private remove(item: QueueItem): void {
    const idx = this.queue.findIndex((q) => q.key === item.key);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.queuedKeys.delete(item.key);
  }
}

// --- Consent helpers (client side of §22/§25; the server still enforces) ---

/** Mirror of the server rule: consent history is append-only, latest wins. */
export function latestConsentGranted(
  records: readonly ConsentRecord[],
  scope: ConsentRecord['scope'],
): boolean {
  let latest: ConsentRecord | undefined;
  for (const r of records) {
    if (r.scope !== scope) continue;
    if (!latest || r.grantedAt >= latest.grantedAt) latest = r;
  }
  return latest?.granted === true;
}

/** Current effective state of every consent scope the product uses. */
export async function fetchConsentState(
  transport: RecordTransport = api,
): Promise<Record<ConsentRecord['scope'], boolean>> {
  const records = await transport.get<ConsentRecord[]>('/consent');
  return {
    recording: latestConsentGranted(records, 'recording'),
    training_data: latestConsentGranted(records, 'training_data'),
    analytics: latestConsentGranted(records, 'analytics'),
  };
}

/** Set one scope; returns the persisted record. */
export function setConsent(
  scope: ConsentRecord['scope'],
  granted: boolean,
  transport: RecordTransport = api,
): Promise<ConsentRecord> {
  return transport.post<ConsentRecord>('/consent', { scope, granted });
}

// --- History reads (feeds the Phase 5 History screen) ---

export interface SessionRecords {
  transcripts: Transcript[];
  translations: Translation[];
  messages: Message[];
}

export async function listSessionRecords(
  sessionId: string,
  transport: RecordTransport = api,
): Promise<SessionRecords> {
  const [transcripts, translations, messages] = await Promise.all([
    transport.get<Transcript[]>(`/transcripts/${sessionId}`),
    transport.get<Translation[]>(`/translations/${sessionId}`),
    transport.get<Message[]>(`/messages/${sessionId}`),
  ]);
  return { transcripts, translations, messages };
}
