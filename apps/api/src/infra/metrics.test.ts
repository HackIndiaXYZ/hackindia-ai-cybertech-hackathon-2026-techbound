import { describe, it, expect, beforeEach } from 'vitest';
import {
  observeHttpRequest,
  observeError,
  countSignalingEvent,
  countSignalingRejection,
  setRoomGauges,
  observeTelemetry,
  renderMetrics,
  resetMetricsForTests,
} from './metrics.js';

/**
 * Metrics registry (plan §26, Phase 4C). The properties that matter:
 * Prometheus-shaped exposition, bounded cardinality inputs stay bounded in
 * output, telemetry folds into aggregates instead of per-user series, and the
 * whole thing resets deterministically for tests.
 */

beforeEach(() => resetMetricsForTests());

describe('renderMetrics (§26 exposition)', () => {
  it('renders nothing but headers on a fresh process', () => {
    const text = renderMetrics();
    expect(text).toContain('# TYPE isl_http_requests_total counter');
    expect(text).toContain('isl_active_rooms 0');
    expect(text).not.toContain('isl_http_requests_total{');
  });

  it('counts HTTP requests by route pattern, not raw URL', () => {
    observeHttpRequest('GET', '/api/v1/sessions/:sessionId/join', 200, 12);
    observeHttpRequest('GET', '/api/v1/sessions/:sessionId/join', 404, 4);
    const text = renderMetrics();
    expect(text).toContain('isl_http_requests_total{method="GET",route="/api/v1/sessions/:sessionId/join",status="2xx"} 1');
    expect(text).toContain('isl_http_requests_total{method="GET",route="/api/v1/sessions/:sessionId/join",status="4xx"} 1');
  });

  it('builds a cumulative latency histogram with +Inf equalling count', () => {
    for (const ms of [3, 40, 900]) observeHttpRequest('POST', '/api/v1/transcripts', 201, ms);
    const text = renderMetrics();
    expect(text).toContain('isl_http_request_duration_ms_bucket{le="5"} 1');
    expect(text).toContain('isl_http_request_duration_ms_bucket{le="50"} 2');
    expect(text).toContain('isl_http_request_duration_ms_bucket{le="1000"} 3');
    expect(text).toContain('isl_http_request_duration_ms_bucket{le="+Inf"} 3');
    expect(text).toContain('isl_http_request_duration_ms_count 3');
  });

  it('folds telemetry batches into aggregate summaries without identifiers', () => {
    observeTelemetry({ rttMs: [40, 60], reconnectAttempts: 2, reconnectExhausted: 1 });
    observeTelemetry({ rttMs: [100] });
    const text = renderMetrics();
    expect(text).toContain('isl_telemetry_batches_total 2');
    expect(text).toContain('isl_client_rtt_ms{quantile="min"} 40');
    expect(text).toContain('isl_client_rtt_ms{quantile="max"} 100');
    expect(text).toContain('isl_client_rtt_ms{quantile="mean"} 66.666667');
    expect(text).toContain('isl_client_rtt_ms_count 3');
    expect(text).toContain('isl_client_reconnect_attempts_total 2');
    expect(text).toContain('isl_client_reconnect_exhausted_total 1');
    // Aggregate only: no per-user or per-session series exist to leak.
    expect(text).not.toContain('userId');
    expect(text).not.toContain('session');
  });

  it('exposes error, signaling and gauge families', () => {
    observeError('CONSENT_REQUIRED', 403);
    countSignalingEvent('webrtc:offer');
    countSignalingRejection('not_authorized');
    setRoomGauges(3, 7);
    const text = renderMetrics();
    expect(text).toContain('isl_errors_total{code="CONSENT_REQUIRED",status="4xx"} 1');
    expect(text).toContain('isl_signaling_events_total{event="webrtc:offer"} 1');
    expect(text).toContain('isl_signaling_rejections_total{code="not_authorized"} 1');
    expect(text).toContain('isl_active_rooms 3');
    expect(text).toContain('isl_connected_sockets 7');
  });

  it('escapes label values instead of corrupting the exposition', () => {
    // A quote and a real newline in an event name must not break the format.
    countSignalingEvent('we"ird\nevent');
    expect(renderMetrics()).toContain('isl_signaling_events_total{event="we\\"ird\\nevent"} 1');
  });
});
