import { describe, it, expect } from 'vitest';
import type { TelemetryBatch } from '@isl/shared-types';
import { TelemetryCollector, buildBatch } from './telemetry.js';

/**
 * Client telemetry collector (plan §26, Phase 4C). The two properties that
 * matter are honesty and boundedness: an empty window sends nothing (we never
 * invent a sample to make a batch non-empty, §29), memory is capped no matter
 * how long a call runs, a failed flush keeps the window for the next tick, and
 * the wire shape can only ever carry numbers — never content. Deterministic:
 * a fake transport and no reliance on wall-clock timers.
 */

interface Sent {
  path: string;
  body: unknown;
}

function fakeTransport(fail = false) {
  const sent: Sent[] = [];
  const transport = {
    async post<T>(path: string, body?: unknown): Promise<T> {
      sent.push({ path, body });
      if (fail) throw new Error('network down');
      return { accepted: true } as T;
    },
  };
  return { transport, sent };
}

const emptyWindows = () => ({
  rttMs: [] as number[],
  packetLossPct: [] as number[],
  bitrateKbps: [] as number[],
  captionLatencyMs: [] as number[],
  translationLatencyMs: [] as number[],
});

describe('buildBatch (§26)', () => {
  it('returns null when nothing was measured — never a fabricated empty batch', () => {
    expect(buildBatch(emptyWindows(), { attempts: 0, exhausted: 0 })).toBeNull();
  });

  it('omits empty metrics and zeroes, carrying only real signals', () => {
    const w = emptyWindows();
    w.rttMs = [40, 60];
    const batch = buildBatch(w, { attempts: 2, exhausted: 0 });
    expect(batch).toEqual({ rttMs: [40, 60], reconnectAttempts: 2 });
    expect(batch?.packetLossPct).toBeUndefined();
    expect(batch?.reconnectExhausted).toBeUndefined();
  });
});

describe('TelemetryCollector (§26)', () => {
  it('observes raw quality into the right windows', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport });
    c.observeQuality({ rttMs: 40, packetLossPct: 1.5, bitrateKbps: 900 });
    c.observeQuality({ rttMs: 55 }); // partial sample, other metrics absent
    await c.flush();
    const body = sent[0].body as TelemetryBatch;
    expect(body.rttMs).toEqual([40, 55]);
    expect(body.packetLossPct).toEqual([1.5]);
    expect(body.bitrateKbps).toEqual([900]);
  });

  it('counts reconnect attempts and exhausted give-ups separately', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport });
    c.observeReconnect({ exhausted: false });
    c.observeReconnect({ exhausted: false });
    c.observeReconnect({ exhausted: true });
    await c.flush();
    const body = sent[0].body as TelemetryBatch;
    expect(body.reconnectAttempts).toBe(3);
    expect(body.reconnectExhausted).toBe(1);
  });

  it('sends nothing for an empty window, so no phantom batch hits the server', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport });
    expect(await c.flush()).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('clears the window after a successful flush so the next tick is fresh', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport });
    c.observeCaptionLatency(120);
    expect(await c.flush()).toBe(true);
    expect(await c.flush()).toBe(false); // nothing re-sent
    expect(sent).toHaveLength(1);
    expect(c.getSnapshot()).toMatchObject({ batchesSent: 1, batchErrors: 0 });
  });

  it('keeps the window on a failed flush and retries the same shape next tick', async () => {
    const { transport, sent } = fakeTransport(true);
    const c = new TelemetryCollector({ transport });
    c.observeQuality({ rttMs: 30 });
    expect(await c.flush()).toBe(false);
    expect(c.getSnapshot().batchErrors).toBe(1);
    // Sample survives; a later flush (transport still failing) retries it.
    await c.flush();
    expect(sent).toHaveLength(2);
    expect((sent[1].body as TelemetryBatch).rttMs).toEqual([30]);
  });

  it('bounds memory: an overflowing window drops the oldest and counts it', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport, maxSamples: 3 });
    for (const v of [1, 2, 3, 4, 5]) c.observeQuality({ rttMs: v });
    await c.flush();
    expect((sent[0].body as TelemetryBatch).rttMs).toEqual([3, 4, 5]);
    expect(c.getSnapshot().droppedSamples).toBe(2);
  });

  it('the wire body carries only numeric metrics — no content can leak (§25)', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport });
    c.observeQuality({ rttMs: 40, bitrateKbps: 800 });
    c.observeCaptionLatency(200);
    c.observeReconnect({ exhausted: false });
    await c.flush();
    const body = sent[0].body as Record<string, unknown>;
    // Only metric keys are ever present, and every carried value is numeric.
    // buildBatch leaves unmeasured metrics as `undefined` (JSON.stringify
    // drops them on the real wire), so assert over the defined subset.
    const defined = Object.entries(body).filter(([, v]) => v !== undefined);
    expect(defined.map(([k]) => k).sort()).toEqual(
      ['bitrateKbps', 'captionLatencyMs', 'reconnectAttempts', 'rttMs'].sort(),
    );
    for (const [, v] of defined) {
      expect(Array.isArray(v) ? v.every((n) => typeof n === 'number') : typeof v === 'number').toBe(true);
    }
  });

  it('stop() flushes a final best-effort batch and ignores later samples', async () => {
    const { transport, sent } = fakeTransport();
    const c = new TelemetryCollector({ transport });
    c.observeQuality({ rttMs: 50 });
    c.stop();
    expect(sent).toHaveLength(1);
    c.observeQuality({ rttMs: 999 }); // after stop: dropped, not buffered
    expect(await c.flush()).toBe(false);
    expect(sent).toHaveLength(1);
  });
});
