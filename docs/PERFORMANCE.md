# Performance & Observability

Status: Phase 4C. Every number below is **measured** from a real run in this
repo, with the tool and date recorded, not a design aspiration. Targets are
labelled as targets. Anything not yet measured is listed as not-yet-measured
rather than guessed (§27 honesty rule: report measured numbers only).

Measurement date: 2026-10-11. Command column is exactly what produced the
number, so any figure can be re-derived.

---

## 1. Client bundle size (measured)

Production build via `npm run build --workspace @isl/web` (Vite/Rollup),
re-measured with `npm run bundle-budget` (`scripts/check-bundle-budget.mjs`,
Node `zlib.gzipSync`). The budget guard asserts two hard properties: the entry
chunk stays under its gzip budget, and Babylon never leaks into the entry.

| Artifact | Raw | gzip (Vite) | gzip (budget script) | Note |
| --- | ---: | ---: | ---: | --- |
| `index-*.js` (app entry) | 382.58 kB | 121.22 kB | 118.4 kB | Under the 150 kB budget |
| `babylonAvatarAdapter-*.js` | 6,313.89 kB | 1,383.27 kB | 1,350.9 kB | Isolated lazy chunk |
| `hands-*.js` (hand model) | 45.43 kB | 17.14 kB | — | Lazy |
| `StandaloneTranslator-*.js` | 16.57 kB | 5.32 kB | — | Route-level lazy |
| `useAvatar-*.js` | 9.50 kB | 3.23 kB | — | Lazy avatar hook |

The two gzip columns differ because Vite reports its own compression level while
the budget script measures `gzipSync` defaults; the guard uses the script's
number so CI and the assertion agree.

**Budget guard outcome:** `BUNDLE BUDGET OK: entry chunk(s) within 150 kB gzip
and Babylon-free.` The 6.3 MB Babylon chunk is a *reported* over-500 kB chunk,
not a failure — it is behind a dynamic import so it is only fetched when an
avatar actually renders. This is the known, labelled exception, not a silent one
(GAP-AND-PLAN P2-4, closed by 4C.6).

- **Target (labelled, not measured as met):** keep the entry under 150 kB gzip.
  Current headroom ~32 kB. Re-run `npm run bundle-budget` to check.
- The budget script is wired as `npm run bundle-budget`; it joins the CI matrix
  in Phase 4D when the Postgres/Redis workflow file is introduced (there is no
  workflow to append to yet — see SECURITY §29).

## 2. Build & test wall-clock (measured, single dev machine)

| Step | Duration | Command |
| --- | ---: | --- |
| Web production build | 35.37 s | `npm run build --workspace @isl/web` |
| Web unit suite | 282 tests / 33.5 s | `npm run test --workspace @isl/web` |
| API unit suite | 70 tests / 3.6 s | `npm run test --workspace @isl/api` |

Test counts include the Phase 4C additions: 10 web `telemetry` unit tests, 6 API
`metrics` tests, 7 API `providerRegistry` tests, 8 API `observability.routes`
integration tests. These are cold-cache numbers on one machine — a baseline, not
a tuned target.

## 3. Observability surface (Phase 4C)

The API exposes a dependency-free, in-process metrics registry
(`apps/api/src/infra/metrics.ts`) rendered as Prometheus text at
`GET /api/v1/metrics`. Families emitted (aggregate only — no ids, no content,
no per-user series):

- `isl_http_requests_total{method,route,status}` — labelled by **route
  pattern**, never raw URL, so path params cannot mint unbounded series.
- `isl_http_request_duration_ms` — fixed cumulative histogram
  (buckets 5/10/25/50/100/250/500/1000/2500/5000 ms, `+Inf` = count).
- `isl_errors_total{code,status}`, `isl_signaling_events_total{event}`,
  `isl_signaling_rejections_total{code}`.
- `isl_active_rooms`, `isl_connected_sockets` — gauges from the room registry.
- `isl_telemetry_batches_total` and client summaries
  (`isl_client_rtt_ms`, `isl_client_packet_loss_pct`, `isl_client_bitrate_kbps`,
  `isl_client_caption_latency_ms`, `isl_client_translation_latency_ms`) with
  min/max/mean/count, plus `isl_client_reconnect_attempts_total` /
  `..._exhausted_total`.

`GET /api/v1/health/ready` is the readiness probe (200 while services are
degraded-but-alive); `/health` flips to `degraded` when a provider flag names a
non-existent integration.

Client telemetry (`apps/web/src/lib/telemetry.ts`) ships **measured numbers
only** — WebRTC RTT/packet-loss/bitrate from real inbound RTP reports, Phase 4B
reconnect counts, and caption latency when a provider reports it. It is gated by
the `analytics` consent scope (independently enforced server-side) and uses
bounded fixed-size windows (cap 60 samples/metric, drop-oldest) with a 15 s
flush cadence. No transcript text or identifiers can enter the payload: the
server schema is `.strict()`, so a smuggled content key is a 400.

## 4. Realtime reconnect ladder (configured thresholds)

These are the `decideReconnect` bounds the client enforces (Phase 4B); they are
deterministic policy values, not network measurements:

- First `disconnected` → 2 000 ms grace before the first ICE restart.
- First `failed` → restart immediately (0 ms).
- Subsequent attempts → 4 000 ms between restarts.
- Max 3 restart attempts, then a single honest "attempts stopped" (`exhausted`).
- A genuine `connected` resets the budget for the next outage.

## 5. Not yet measured (declared gaps, not estimates)

- **Server response latency / throughput under load.** No load harness exists
  yet; the histogram is wired and will show real numbers once traffic flows.
  Planned with the Phase 4D E2E + CI work.
- **End-to-end network RTT / media quality on real links.** Only browser-side
  `getStats` observed; no cross-device matrix captured yet (Phase 4D browser
  matrix).
- **`translationLatencyMs`.** In-call translation is synchronous today, so no
  honest end-to-end latency exists to report — the field stays empty rather than
  timing a local call and shipping it as network latency.
- **Accessibility / render-frame performance.** No axe or frame-trace capture in
  CI yet (Phase 4D).
