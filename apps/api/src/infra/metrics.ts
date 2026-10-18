import type { TelemetryBatch } from '@isl/shared-types';

/**
 * In-process observability registry (plan §26, GAP-AND-PLAN 4C, P1-4).
 * Prometheus-style text output, deliberately dependency-free like the logger.
 *
 * Cardinality rules — the reason this is a module and not raw counters:
 * - HTTP series are labelled by the *route pattern* (`/api/v1/sessions/
 *   :sessionId/join`), never the raw URL, so session ids cannot mint
 *   unbounded series.
 * - Latency uses fixed histogram buckets; telemetry samples use bounded
 *   summary accumulators (count/sum/min/max), never per-user series.
 * - Nothing here stores content: no text, no identifiers. Aggregate only.
 *
 * Known limit (SECURITY §29): state is per-process and in memory. A restart
 * resets it; there is no remote-write exporter yet.
 */

// --- primitives ----------------------------------------------------------------

const HTTP_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

interface Histogram {
  counts: number[]; // cumulative-friendly: per-bucket observation counts
  sum: number;
  count: number;
}

interface Summary {
  sum: number;
  count: number;
  min: number;
  max: number;
}

const httpRequests = new Map<string, number>(); // `${method}|${route}|${statusClass}` -> count
const httpDuration: Histogram = { counts: HTTP_BUCKETS_MS.map(() => 0), sum: 0, count: 0 };
const errorsByCode = new Map<string, number>();
const signalingEvents = new Map<string, number>();
const signalingRejections = new Map<string, number>();
const telemetryBatches = new Map<string, Summary>(); // metric name -> accumulator
let telemetryBatchCount = 0;
let gauges = { activeRooms: 0, connectedSockets: 0 };

function observeHistogram(h: Histogram, value: number): void {
  h.sum += value;
  h.count += 1;
  // Store into the single smallest bucket that fits (per-bucket counts); the
  // renderer turns these into the cumulative form Prometheus expects. A value
  // above every bucket lives only in the +Inf count (h.count), as intended.
  for (let i = 0; i < HTTP_BUCKETS_MS.length; i += 1) {
    if (value <= HTTP_BUCKETS_MS[i]!) {
      h.counts[i]! += 1;
      break;
    }
  }
}

function observeSummary(name: string, values: readonly number[] | undefined): void {
  if (!values?.length) return;
  let acc = telemetryBatches.get(name);
  if (!acc) {
    acc = { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
    telemetryBatches.set(name, acc);
  }
  for (const v of values) {
    acc.sum += v;
    acc.count += 1;
    if (v < acc.min) acc.min = v;
    if (v > acc.max) acc.max = v;
  }
}

// --- collection API --------------------------------------------------------------

/** `route` must be a bounded pattern (see requestContext), never a raw URL. */
export function observeHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  const key = `${method}|${route}|${statusClass}`;
  httpRequests.set(key, (httpRequests.get(key) ?? 0) + 1);
  observeHistogram(httpDuration, durationMs);
}

export function observeError(code: string, statusCode: number): void {
  const key = `${code}|${Math.floor(statusCode / 100)}xx`;
  errorsByCode.set(key, (errorsByCode.get(key) ?? 0) + 1);
}

export function countSignalingEvent(event: string): void {
  signalingEvents.set(event, (signalingEvents.get(event) ?? 0) + 1);
}

/** Rejected (unauthorized/invalid/rate-limited) signaling commands, by code. */
export function countSignalingRejection(code: string): void {
  signalingRejections.set(code, (signalingRejections.get(code) ?? 0) + 1);
}

export function setRoomGauges(activeRooms: number, connectedSockets: number): void {
  gauges = { activeRooms, connectedSockets };
}

/** Fold one client telemetry batch into the aggregate summaries (4C). */
export function observeTelemetry(batch: TelemetryBatch): void {
  telemetryBatchCount += 1;
  observeSummary('isl_client_rtt_ms', batch.rttMs);
  observeSummary('isl_client_packet_loss_pct', batch.packetLossPct);
  observeSummary('isl_client_bitrate_kbps', batch.bitrateKbps);
  observeSummary('isl_client_caption_latency_ms', batch.captionLatencyMs);
  observeSummary('isl_client_translation_latency_ms', batch.translationLatencyMs);
  if (batch.reconnectAttempts) {
    reconnectTotals.attempts += batch.reconnectAttempts;
  }
  if (batch.reconnectExhausted) {
    reconnectTotals.exhausted += batch.reconnectExhausted;
  }
}

const reconnectTotals = { attempts: 0, exhausted: 0 };

// --- rendering -------------------------------------------------------------------

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderHistogram(name: string, help: string, h: Histogram): string {
  const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
  for (let i = 0; i < HTTP_BUCKETS_MS.length; i += 1) {
    const cumulative = h.counts.slice(0, i + 1).reduce((a, b) => a + b, 0);
    lines.push(`${name}_bucket{le="${HTTP_BUCKETS_MS[i]}"} ${cumulative}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
  lines.push(`${name}_sum ${h.sum}`);
  lines.push(`${name}_count ${h.count}`);
  return lines.join('\n');
}

function renderSummary(name: string, help: string, acc: Summary): string {
  const min = Number.isFinite(acc.min) ? acc.min : 0;
  const max = Number.isFinite(acc.max) ? acc.max : 0;
  return [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} summary`,
    `${name}{quantile="min"} ${round6(min)}`,
    `${name}{quantile="max"} ${round6(max)}`,
    `${name}{quantile="mean"} ${acc.count ? round6(acc.sum / acc.count) : 0}`,
    `${name}_sum ${round6(acc.sum)}`,
    `${name}_count ${acc.count}`,
  ].join('\n');
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Prometheus exposition-format text (what GET /api/v1/metrics serves). */
export function renderMetrics(): string {
  const out: string[] = [];

  out.push('# HELP isl_http_requests_total Count of HTTP requests by method, route pattern and status class.');
  out.push('# TYPE isl_http_requests_total counter');
  for (const [key, count] of httpRequests) {
    const [method, route, statusClass] = key.split('|');
    out.push(`isl_http_requests_total{method="${escapeLabel(method!)}",route="${escapeLabel(route!)}",status="${escapeLabel(statusClass!)}"} ${count}`);
  }

  out.push(renderHistogram('isl_http_request_duration_ms', 'HTTP request duration in milliseconds.', httpDuration));

  out.push('# HELP isl_errors_total Application errors by code and status class.');
  out.push('# TYPE isl_errors_total counter');
  for (const [key, count] of errorsByCode) {
    const [code, statusClass] = key.split('|');
    out.push(`isl_errors_total{code="${escapeLabel(code!)}",status="${escapeLabel(statusClass!)}"} ${count}`);
  }

  out.push('# HELP isl_signaling_events_total Relayed or handled signaling events by name.');
  out.push('# TYPE isl_signaling_events_total counter');
  for (const [event, count] of signalingEvents) {
    out.push(`isl_signaling_events_total{event="${escapeLabel(event)}"} ${count}`);
  }

  out.push('# HELP isl_signaling_rejections_total Signaling commands refused by validation or host permission.');
  out.push('# TYPE isl_signaling_rejections_total counter');
  for (const [code, count] of signalingRejections) {
    out.push(`isl_signaling_rejections_total{code="${escapeLabel(code)}"} ${count}`);
  }

  out.push('# HELP isl_active_rooms Current signaling rooms with at least one member.');
  out.push('# TYPE isl_active_rooms gauge');
  out.push(`isl_active_rooms ${gauges.activeRooms}`);
  out.push('# HELP isl_connected_sockets Currently connected signaling sockets.');
  out.push('# TYPE isl_connected_sockets gauge');
  out.push(`isl_connected_sockets ${gauges.connectedSockets}`);

  out.push('# HELP isl_telemetry_batches_total Client telemetry batches accepted (aggregate-only, consent-gated).');
  out.push('# TYPE isl_telemetry_batches_total counter');
  out.push(`isl_telemetry_batches_total ${telemetryBatchCount}`);
  for (const [name, acc] of telemetryBatches) {
    const help = name.replace('isl_client_', '').replace(/_/g, ' ');
    out.push(renderSummary(name, `Client-measured ${help} (aggregate, no per-user series).`, acc));
  }

  out.push('# HELP isl_client_reconnect_attempts_total ICE-restart attempts reported by clients (Phase 4B ladder).');
  out.push('# TYPE isl_client_reconnect_attempts_total counter');
  out.push(`isl_client_reconnect_attempts_total ${reconnectTotals.attempts}`);
  out.push('# HELP isl_client_reconnect_exhausted_total Reconnect budgets that ran out, as reported by clients.');
  out.push('# TYPE isl_client_reconnect_exhausted_total counter');
  out.push(`isl_client_reconnect_exhausted_total ${reconnectTotals.exhausted}`);

  return out.join('\n') + '\n';
}

/** Test helper: wipe all accumulated state between suites. */
export function resetMetricsForTests(): void {
  httpRequests.clear();
  errorsByCode.clear();
  signalingEvents.clear();
  signalingRejections.clear();
  telemetryBatches.clear();
  httpDuration.counts = HTTP_BUCKETS_MS.map(() => 0);
  httpDuration.sum = 0;
  httpDuration.count = 0;
  telemetryBatchCount = 0;
  reconnectTotals.attempts = 0;
  reconnectTotals.exhausted = 0;
  gauges = { activeRooms: 0, connectedSockets: 0 };
}
