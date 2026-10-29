// TODO(mws-213): revert to the rotating credential once Safari 17.4 ICE-restart regression is closed.
import { describe, it, expect } from 'vitest';
import type { ConsentRecord, IslIntermediateRepresentation } from '@isl/shared-types';
import {
  SessionRecorder,
  latestConsentGranted,
  fetchConsentState,
  listSessionRecords,
  type RecordTransport,
} from './sessionRecord.js';

/** Transport fake that records every call and can be scripted to fail. */
function makeTransport(): RecordTransport & {
  posts: Array<{ path: string; body: unknown }>;
  getResults: Record<string, unknown>;
  failNext: (fn: (n: number) => unknown) => void;
} {
  const posts: Array<{ path: string; body: unknown }> = [];
  const getResults: Record<string, unknown> = {};
  let failure: ((n: number) => unknown) | null = null;
  let n = 0;
  return {
    posts,
    getResults,
    failNext(fn) {
      failure = fn;
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      n += 1;
      if (failure) {
        const err = failure(n);
        if (err) throw err;
      }
      posts.push({ path, body });
      return {} as T;
    },
    async get<T>(path: string): Promise<T> {
      return getResults[path] as T;
    },
  };
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

const waitMs: number[] = [];
const instantWait = (ms: number) => {
  waitMs.push(ms);
  return Promise.resolve();
};

/** Let the fire-and-forget drain loop run to completion with instant waits. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
}

function representation(): IslIntermediateRepresentation {
  return {
    sessionId: 'ir-session',
    sourceLanguage: 'en-IN',
    sourceText: 'I need water',
    concepts: [],
    overallConfidence: 0.62,
    fallbackUsed: true,
    unsupportedConcepts: ['water'],
    generatedAt: '2026-10-11T10:00:00.000Z',
  };
}

function consent(scope: ConsentRecord['scope'], granted: boolean, grantedAt: string): ConsentRecord {
  return { id: `c-${grantedAt}-${scope}`, userId: 'u1', scope, granted, grantedAt };
}

describe('SessionRecorder', () => {
  it('posts a transcript with the measured confidence kept as null, not guessed', async () => {
    const transport = makeTransport();
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait });
    recorder.recordTranscript({ text: 'hello there', confidence: null, language: 'en-IN', source: 'speech' });
    await flush();

    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0].path).toBe('/transcripts');
    expect(transport.posts[0].body).toEqual({
      sessionId: 's1',
      source: 'speech',
      text: 'hello there',
      isFinal: true,
      confidence: null,
      language: 'en-IN',
    });
  });

  it('ignores blank text instead of writing empty rows', async () => {
    const transport = makeTransport();
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait });
    recorder.recordTranscript({ text: '   ', confidence: 0.9, language: 'en-IN', source: 'speech' });
    recorder.recordMessage('  ');
    await flush();
    expect(transport.posts).toHaveLength(0);
  });

  it('serialises the translation row from the representation itself', async () => {
    const transport = makeTransport();
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait });
    const rep = representation();
    recorder.recordTranslation({ sourceTranscriptId: 'tr-1', representation: rep });
    await flush();

    expect(transport.posts[0].path).toBe('/translations');
    expect(transport.posts[0].body).toEqual({
      sessionId: 's1',
      sourceTranscriptId: 'tr-1',
      sourceText: rep.sourceText,
      targetRepresentation: JSON.stringify(rep),
      confidence: 0.62,
      fallbackUsed: true,
    });
  });

  it('de-duplicates translations by sourceTranscriptId', async () => {
    const transport = makeTransport();
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait });
    recorder.recordTranslation({ sourceTranscriptId: 'tr-1', representation: representation() });
    recorder.recordTranslation({ sourceTranscriptId: 'tr-1', representation: representation() });
    await flush();
    expect(transport.posts.filter((p) => p.path === '/translations')).toHaveLength(1);
  });

  it('retries transient failures with exponential backoff, within the budget', async () => {
    const transport = makeTransport();
    let calls = 0;
    transport.post = async <T>(path: string, body?: unknown): Promise<T> => {
      calls += 1;
      if (calls <= 2) throw httpError(500);
      transport.posts.push({ path, body });
      return {} as T;
    };
    waitMs.length = 0;
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait, baseDelayMs: 400 });
    recorder.recordMessage('hi');
    await flush();

    expect(calls).toBe(3);
    expect(waitMs).toEqual([400, 800]);
    expect(recorder.getSnapshot().dropped).toBe(0);
  });

  it('drops the item once the retry budget is exhausted and keeps the error visible', async () => {
    const transport = makeTransport();
    transport.failNext(() => httpError(503));
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait, maxRetries: 2 });
    recorder.recordMessage('hi');
    await flush();

    const snap = recorder.getSnapshot();
    expect(snap.pending).toBe(0);
    expect(snap.dropped).toBe(1);
    expect(snap.lastError).toBe('HTTP 503');
  });

  it('never retries permanent 4xx rejections (e.g. missing consent)', async () => {
    const transport = makeTransport();
    transport.failNext(() => httpError(403));
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait });
    recorder.recordMessage('hi');
    await flush();

    expect(transport.posts).toHaveLength(0);
    const snap = recorder.getSnapshot();
    expect(snap.dropped).toBe(1);
    expect(snap.lastError).toContain('403');
  });

  it('caps the queue: the oldest pending item is dropped and status turns partial', async () => {
    const transport = makeTransport();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    transport.post = async <T>(_path: string, _body?: unknown): Promise<T> => {
      await gate; // block the drain on the first item
      return {} as T;
    };
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait, maxQueue: 2 });
    recorder.recordMessage('one');
    recorder.recordMessage('two');
    recorder.recordMessage('three');

    const snap = recorder.getSnapshot();
    expect(snap.pending).toBe(2);
    expect(snap.dropped).toBe(1); // oldest lost, queue never exceeded the cap
    expect(snap.status).toBe('partial');
    release();
  });

  it('close() stops accepting artefacts, without throwing', async () => {
    const transport = makeTransport();
    const recorder = new SessionRecorder({ sessionId: 's1', transport, wait: instantWait });
    recorder.close();
    recorder.recordMessage('hi');
    await flush();
    expect(transport.posts).toHaveLength(0);
    expect(recorder.getSnapshot().status).toBe('closed');
  });
});

describe('latestConsentGranted', () => {
  it('is false with no records at all', () => {
    expect(latestConsentGranted([], 'recording')).toBe(false);
  });

  it('the record with the newest grantedAt wins, regardless of array order', () => {
    const records = [
      consent('recording', true, '2026-10-01T00:00:00.000Z'),
      consent('recording', false, '2026-10-05T00:00:00.000Z'),
      consent('analytics', true, '2026-10-03T00:00:00.000Z'),
    ];
    expect(latestConsentGranted(records, 'recording')).toBe(false); // revoked later
    expect(latestConsentGranted(records, 'analytics')).toBe(true); // other scope untouched
  });
});

describe('consent + history read helpers', () => {
  it('fetchConsentState collapses the append-only history per scope', async () => {
    const transport = makeTransport();
    transport.getResults['/consent'] = [
      consent('recording', false, '2026-09-01T00:00:00.000Z'),
      consent('recording', true, '2026-10-01T00:00:00.000Z'),
    ];
    const state = await fetchConsentState(transport);
    expect(state).toEqual({ recording: true, training_data: false, analytics: false });
  });

  it('listSessionRecords reads all three artefact lists', async () => {
    const transport = makeTransport();
    transport.getResults['/transcripts/s9'] = [{ id: 't1' }];
    transport.getResults['/translations/s9'] = [{ id: 'tr1' }];
    transport.getResults['/messages/s9'] = [{ id: 'm1' }];
    const records = await listSessionRecords('s9', transport);
    expect(records).toEqual({
      transcripts: [{ id: 't1' }],
      translations: [{ id: 'tr1' }],
      messages: [{ id: 'm1' }],
    });
    expect(transport.posts).toHaveLength(0); // reads never write
  });
});
