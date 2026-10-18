# Gap Analysis & Remaining Implementation Plan

Derived from: `VIBECODER_MASTER_PLAN.md` (§11–§21, §22–§39), `Spirit-PROJECT_CONTEXT.md`,
`Spirit-SKILL.md`, `Spirit-LOG.md`, `spirit-ALIGNMENT.md` — verified against the
**actual repository state** (git log + file inspection), not against what the
planning documents claim.

This is the single remaining-work plan. It is written once, and future sessions
execute it in order instead of re-deriving it.

---

## 1. Reality check: documents vs. code

The four `Spirit-*.md` documents are **strategic/planning artifacts and are stale**.
`Spirit-LOG.md` still says `Current Phase: Planning & Foundation` with Phase 1–5
checkboxes unchecked, while the repository has Phases 1, 2A–2D, 3A–3C committed and
verified. `spirit-ALIGNMENT.md` / `Spirit-SKILL.md` describe budget ($250K), KPIs,
hiring, partnerships and pilots — none of which are code deliverables.

**Decision:** the code remains the source of truth for status. The Spirit docs are
reconciled in one documentation task (§7, task D3) and are *not* used to drive
implementation order. Only VIBECODER §19–§21 + §22–§39 define remaining engineering
work.

---

## 2. What is actually built (evidence-based)

| Area | State | Evidence |
|---|---|---|
| Monorepo, API, auth, sessions, rate limit, validation, logging, health | ✅ | `apps/api/src/**`, 4 API test files, CI `lint→typecheck→test→build→secret-scan` |
| Data layer | ✅ abstraction + real driver | `infra/db/{memory,postgres}.ts`, `migrations/001_init.sql` (11 entities, indexes) |
| Redis | ✅ abstraction + fallback | `infra/redis/{client,memory,types}.ts` |
| WebRTC 1:1 + group-capable mesh | ✅ | `lib/webrtc/{engine,peer,media}.ts` (perfect negotiation), `realtime/{signaling,rooms}.ts` room relay, `signalSchemas.ts` server-side payload validation |
| Call state machine + clay UI | ✅ | `lib/call/machine.ts`, `components/call/*` |
| Vision pipeline | ⚠️ real landmarks, **heuristic classifier** | `lib/vision/mediapipeAdapter.ts` + `classifier.ts` (`trained = false` by design, honestly labelled) |
| Speech recognition | ⚠️ browser Web Speech only | `lib/speech/webSpeechProvider.ts` (on-device seam; no server ASR) |
| Speech → ISL | ⚠️ rule-based glossary | `lib/translation/*`, ADR-020 |
| TTS | ⚠️ browser SpeechSynthesis | `lib/tts/*`, ADR-022/023 |
| Avatar | ⚠️ procedural placeholder rig | `lib/avatar/*`, ADR-018/019 (no real ISL GLB assets) |
| Standalone translator mode | ✅ | `lib/standalone/*`, `features/useStandaloneTranslator.ts`, lazy `/app/standalone` |
| Group-call client UX | ❌ | wired for 1:1 shape; active speaker / moderation / translation metadata not surfaced |
| Persistence of AI output from client | ❌ | REST `/transcripts`, `/translations`, `/gestures`, `/feedback`, `/consent` exist but **no client caller** |
| Observability beyond logs/health | ❌ | no metrics endpoint, no alerts, no error tracking |
| Deployment / TURN / TLS / backups | ❌ | Dockerfiles + compose exist; no prod config, no TURN env filled, no rollback/backup docs |
| E2E / load / Postgres-integration / a11y audit | ❌ | not present |

Test counts at time of writing: API 29/29, Web 219/219. Bundle: main 340 kB (108 kB gz),
Babylon adapter isolated 6.3 MB lazy chunk.

---

## 3. Priority issue list (VIBECODER §20 format)

**P0 — critical, blocks "product works"**
- P0-1 Group session features present on the wire but not produced/consumed/surfaced
  (active speaker, presence, moderation, per-participant audio state, speaker identity).
- P0-2 Client never persists session artefacts (transcripts/translations/messages)
  through the existing typed REST endpoints → §22/§23 are half-satisfied.

**P1 — high, blocks "production candidate"**
- P1-1 No graceful-reconnect policy surface for mesh peers + no room host failover.
- P1-2 No E2E critical-path tests (§20.2).
- P1-3 No WCAG 2.1 AA audit evidence (§20.5, §28) — axe pass + keyboard/screen-reader
  matrix, measured not claimed.
- P1-4 No metrics/observability surface (§26) — WebRTC/speech/translation/platform.
- P1-5 Postgres path never exercised in CI (`DB_DRIVER=postgres` integration job).
- P1-6 TURN/ICE production path unverified; STUN only by default.

**P2 — medium**
- P2-1 Consent API not enforced anywhere in the client (recording/data scopes, §25).
- P2-2 Feedback capture (§23, §21.4) not implemented in UI.
- P2-3 Missing §30 screens: contacts, history, admin.
- P2-4 Bundle/perf budget: no size guardrail in CI despite the 6.3 MB Babylon chunk.
- P2-5 Browser-compatibility matrix (§20.3) undocumented.
- P2-6 AI-provider env flags (`SPEECH_PROVIDER`, `TRANSLATION_PROVIDER`, …) are parsed
  in `apps/api/src/config/index.ts` but **consumed nowhere** → dead switches.

**P3 — low**
- P3-1 `Spirit-*.md` reconciliation (§7 D3).
- P3-2 README status line still says "Phase 1 — Foundation".
- P3-3 `POST /api/v1/gestures` acknowledges without storing (deliberate; needs an
  explicit decision doc).

**Explicitly out of coding-agent scope (cannot be "completed" by writing code)**
- Trained ISL gesture model + 50k-frame dataset (§13 targets) — requires ISL
  consultants, recording consent, annotation, GPU training. Ship only the
  `GestureClassifier` seam + documented dataset/training procedure.
- Whisper/Indian-accent server ASR + fine-tuning dataset — requires a Python service
  and labelled audio. Ship only the provider seam + spec.
- 500+ real ISL avatar animation assets — requires 3D/ISL art production.
- ISL community QA, interpreter review, pilots, 100 beta users, business model,
  grants/partnerships (spirit-ALIGNMENT Tier 1–3) — human/organisational work.
- Any accuracy/latency/uptime number without a measurement artifact (§27, §37).

---

## 4. Remaining work — ordered tasks

### Phase 3D (VIBECODER §19) — in progress
Already agreed defaults (no re-litigating): mesh stays client-side N-way (ADR-011);
active speaker via client RMS + hysteresis, rebroadcast by server; moderation is
host-only, authorized server-side; translation metadata shown per caption line.

1. **3D-1 shared types** — `SignalEvent.Moderation`, moderation payload,
   `participantUserId` on translation/transcript payloads.
2. **3D-2 api** — rooms host tracking + socket-by-user lookup; `signalSchemas`
   moderation validation; host-gated moderation handler; `sessionService.setHost`.
3. **3D-3 web store** — `activeSpeakerSlice`, `translationSlice` (reset on
   `callStarted`), `callSlice.selfRole`, register reducers.
4. **3D-4 lib/call** — pure `voiceActivity` (RMS + hysteresis + monitor) and pure
   `gridLayout`.
5. **3D-5 useCall wiring** — inbound active-speaker/translation, outbound VAD,
   moderation API, `selfRole` resolution, peer displayName seeding,
   `useInCallTranslation`.
6. **3D-6 UI** — group session-type in lobby, participant grid, active-speaker ring
   on `VideoTile`, `ParticipantsPanel` (moderation controls), `TranslationPanel`,
   wire into `Call.tsx`.
7. **3D-7 tests** — voiceActivity, gridLayout, activeSpeakerSlice, translationSlice,
   api rooms, signalSchemas.
8. **3D-8 docs** — SECURITY + DECISIONS entries (group mesh, moderation authz, VAD,
   translation metadata).
9. **3D-9 gate** — typecheck, lint, build, web + api tests. Manual multi-browser
   verification required for real media (documented, not automated).

### Phase 4 — Production hardening (§20), executed as 5 increments

**4A — Data & session persistence (closes P0-2, P2-1)**
- **4A.1 (P0-2)** New `apps/web/src/lib/sessionRecord.ts` — the single client-side
  writer for session artefacts. Task breakdown:
  - `recordTranscript(finalSegment)` → `POST /api/v1/transcripts` (typed by the
    existing `transcriptSchema`: sessionId, source `speech|isl`, text, isFinal,
    confidence 0..1, language `en-IN|hi-IN|hi-en`).
  - `recordTranslation(completed)` → `POST /api/v1/translations` (sourceTranscriptId,
    sourceText, targetRepresentation serialised IR, confidence, fallbackUsed).
  - `recordMessage(body)` → `POST /api/v1/messages` for the existing text fallback
    (currently live-only).
  - `listSessionRecords(sessionId)` → `GET /transcripts/:sessionId`,
    `GET /translations/:sessionId`, `GET /messages/:sessionId` — feeds the History
    screen (Phase 5.4).
  - Transport rules: fire-and-forget with bounded retry (max 2, exponential backoff),
    de-duplicated by `sourceTranscriptId`, never blocks the call UI, offline queue
    capped (drop oldest + surface a `partial` state, never silently grow).
  - Call sites: `features/useCall.ts` (final transcript + completed translation +
    sent text messages) and `features/useStandaloneTranslator.ts` (final transcript +
    translation; history currently in-memory only → promoted to server rows).
- **4A.2 (P2-1)** Consent gate: read `GET /api/v1/consent` on session join; block
  persistence until the required scope is granted; add a consent prompt surface in
  `Settings` + on join. Consent is checked **server-side too** on the write routes —
  the client gate is UX, not the security boundary.
- **4A.3 (P3-3)** `POST /api/v1/gestures` decision: either persist heuristic hand-shape
  events as explicitly labelled non-ISL telemetry rows, or keep acknowledge-only and
  document the choice (ADR).
- Tests: `sessionRecord` unit tests (retry/dedup/offline-cap/consent-block) + API
  integration tests for these routes against the memory driver.

**4B — Reconnect, host failover, degraded network (closes P1-1)**
- Peer-level reconnect policy in `lib/webrtc/engine.ts` (ice-restart + polite
  renegotiation already exist; add bounded retry/backoff states into
  `lib/call/machine.ts`).
- Host failover: on host `participant:left`, server promotes the earliest remaining
  participant and notifies the room; UI explains moderation authority moved.
- Explicit "reconnecting" UX state (§29) per tile, non-color cue + text.
- Tests: machine transitions, rooms promotion, engine retry accounting.

**4C — Observability & measured performance (closes P1-4, P2-4, P2-6)**
- `GET /api/v1/health/ready` + `GET /api/v1/metrics` (Prometheus-style text) with:
  active sessions, signaling events/s, REST latency histogram, DB & Redis driver
  health, error counts.
- Client telemetry: measured WebRTC RTT/packet-loss/bitrate/reconnect count and
  speech/translation latency already computed in-app → ship to a rate-limited
  `POST /api/v1/telemetry` (aggregate-only, no transcript content), gated by consent.
- **4C.3 (P2-6)** Turn the dead provider flags into real switches. Today
  `SPEECH_PROVIDER` / `VISION_PROVIDER` / `TRANSLATION_PROVIDER` / `TTS_PROVIDER` are
  parsed in `apps/api/src/config/index.ts` and only echoed into the config object —
  nothing consumes them, so they are misleading. Implementation:
  - Add a single `GET /api/v1/providers` (auth) route returning the resolved provider
    per capability plus a `trained`/`authoritative` boolean per provider, derived from
    the same honest labels the client already uses (`HeuristicHandShapeClassifier.trained
    = false`, rule-based glossary, browser SpeechSynthesis).
  - Client seams read the resolved value instead of hardcoding: speech provider
    registry picks `webSpeech` when the flag is `stub`, and reports `unavailable` (not
    a silent fallback) when a flag names an integration that does not exist
    (e.g. `whisper` with no `SPEECH_SERVICE_BASE_URL` reachable).
  - Fail fast in production: if a flag names a provider with no implementation, the
    API logs a `system:error`-grade warning at boot and `/health` reports degraded,
    rather than pretending the capability exists.
  - `Settings` shows a Provider badge per capability (stub | browser | rule-based |
    trained) so the gap between configured and actual is visible in-product (§37).
  - `spirit` alignment: `.env.example` comments updated to state which values are
    implemented today and which are reserved.
- Bundle budget guard in CI (`visualizer`-free: assert `dist` gzip size thresholds in
  a Node script) — Babylon chunk must stay out of `main`.
- Report only measured numbers into `docs/PERFORMANCE.md`; targets stay labelled as
  targets (§27).

**4D — Testing depth & compatibility (closes P1-2, P1-3, P1-5, P2-5)**
- E2E critical path with Playwright: signup → login → dashboard → start session →
  join second context → captions appear → moderation → end session → history.
  Media is mocked at the browser-API boundary; the WebRTC mesh is verified with two
  real Chromium contexts over loopback signaling (documented as environment-specific).
- Accessibility: axe-core scan in E2E (zero serious/critical), keyboard-only walk of
  every §30 screen, contrast audit of the clay tokens, `prefers-reduced-motion`
  verification, screen-reader label review. Findings → `docs/ACCESSIBILITY-AUDIT.md`
  with pass/fail per §28 checklist item.
- CI matrix: add a `postgres` service job running migrations + API integration tests
  with `DB_DRIVER=postgres`, `REDIS_DRIVER=redis`.
- Browser matrix (Chrome/Edge/Firefox/Safari where reachable) documented in
  `docs/BROWSER-SUPPORT.md`, including Web Speech and SpeechSynthesis availability
  gaps that are honestly labelled "unavailable in this browser".

**4E — Security & privacy verification (closes P1-6, §20.7)**
- AuthZ sweep: every REST route + every socket handler has an explicit role check;
  anti-spoofing (`fromUserId` vs socket identity) verified by tests.
- Secure headers, CORS allowlist, CSRF posture for token storage strategy documented
  and tested.
- Session token TTL/rotation verified; refresh path tested; logout invalidation tested.
- **4E.4 (P1-6)** TURN / ICE production path. Default today is
  `STUN_URLS=stun:stun.l.google.com:19302` with `TURN_URL`/`TURN_USERNAME`/
  `TURN_CREDENTIAL` blank, so relay behaviour is never exercised — symmetric-NAT and
  corporate/CGNAT users will simply fail to connect and we would not know.
  Implementation:
  - Server-side: validate the ICE config it hands out on join. If `TURN_URL` is set in
    production mode, require `TURN_USERNAME` + `TURN_CREDENTIAL` non-empty and refuse
    to start otherwise (same posture as the existing JWT/secret guard).
  - Client-side: classify each selected candidate pair (`host`/`srflx`/`relay`) from
    `local-candidate`/`remote-candidate` stats, expose the transport type per peer, and
    surface "connected over relay" vs "direct" as a non-color text indicator, so
    degraded-performance claims are measurable.
  - `npm run verify:ice` — a script that drives a real peer connection in a headless
    browser context with the configured servers and reports whether a relay candidate
    was gathered and which pair was selected. Measured, never asserted.
  - Credentials: TURN secret stays server-only; temporary credentials (REST
    `POST /api/v1/ice-servers`) issued to authenticated participants on join with a
    short TTL, instead of embedding a static secret in the web bundle.
  - Document provisioning (coturn or managed), cost/perf trade-off, and the failure
    mode when TURN is absent in `docs/ARCHITECTURE.md` + `docs/SECURITY.md`.
  - Never report relay success rates without this script's output (§27).
- Recording/retention: honour `MEDIA_RETENTION_ENABLED` with a real retention job or
  remove the flag; deletion mechanism + audit trail documented.
- Log hygiene test: assert no transcript/token/ice-credential material reaches logs.
- Run the repository security review pass before the hardening commit lands.

### Phase 5 — Controlled production beta (§21)
Sequence, each with its own verification:
1. **Deployment**: production Docker images pinned by digest, env management
   (`dev`/`staging`/`prod`), TLS termination, Postgres + Redis managed instances,
   TURN reachable, `npm run migrate` on release, health/readiness gates.
2. **Rollback & backup**: documented rollback (image tag + migration stance),
   automated DB backup + restore drill recorded in `docs/OPERATIONS.md`.
3. **Onboarding**: accessible signup → profile → permission-education screen
   (camera/mic/why) → feature walkthrough → accessibility settings pre-applied.
4. **Missing §30 screens**: Contacts, History, Admin (moderation/audit/feedback list)
   built on the existing design system and typed REST surface.
5. **Beta capture**: in-app feedback (`POST /feedback`, rating + category + comment),
   satisfaction/usability/recognition-failure/translation-failure/performance/
   accessibility/feature-request categories; a weekly report generator reading real
   rows only.
6. **Documentation set**: user guide (deaf + hearing), FAQ, privacy explanation,
   community guidelines, ISL educator resource stub, API docs refresh, deployment doc,
   incident-response doc.
7. **Release checklist** (§21.6) executed against reality, and the
   **Final Production Audit** (§32) reporting `READY / BLOCKED / HIGH / MEDIUM / LOW`
   — no `READY` while any communication, security, privacy, or accessibility issue
   remains open.

---

## 5. Standing cross-cutting gates (every task)

- Do not change the framework or add a runtime dependency without an ADR.
- Do not present heuristic/placeholder output as trained or authoritative capability.
- Confidence, latency, FPS, uptime: measured or explicitly `null` — never invented.
- Every async surface implements the §29 state list (idle/loading/processing/success/
  partial/low-confidence/empty/permission-required/unavailable/offline/reconnecting/
  error/retrying/completed).
- Accessibility is part of each task's acceptance, not a later pass.
- Definition of Done per §35 for each task; stop after each phase and report, without
  committing unless explicitly told.

---

## 6. Execution order

```
3D-1 … 3D-9 (finish Multi-User)                 → closes P0-1
   ↓
4A persistence + consent            (4A.1/2/3)  → closes P0-2, P2-1, P3-3
   ↓
4B reconnect + host failover                    → closes P1-1
   ↓
4C observability + provider switches + budget (4C.3) → closes P1-4, P2-4, P2-6
   ↓
4D E2E + a11y audit + postgres CI               → closes P1-2, P1-3, P1-5, P2-5
   ↓
4E security + TURN verify + retention (4E.4)    → closes P1-6
   ↓
Autopilot audit (§31) — independent re-inspection, P0/P1 fixes
   ↓
5.1–5.7 deployment → onboarding → missing screens → beta capture → docs → audit (§32)
   ↓
D3 Spirit-*.md reconciliation + README status refresh (P3)
```

### Gap → task traceability

| Gap | Severity | Closing task(s) | Acceptance signal |
|---|---|---|---|
| P0-1 group features not surfaced | P0 | 3D-1…3D-9 | participant grid, active-speaker ring, host-only moderation, per-caption speaker + confidence; api/web tests green |
| P0-2 client never persists artefacts | P0 | 4A.1 | transcripts/translations/messages rows exist in DB after a real session; `GET` returns them on the History screen |
| P1-1 reconnect + host failover | P1 | 4B | killed-peer recovers to `connected` or reports `failed`; moderation authority moves and UI says so |
| P1-2 E2E critical path | P1 | 4D | Playwright job passes on CI for signup→call→caption→end→history |
| P1-3 WCAG 2.1 AA evidence | P1 | 4D | axe 0 serious/critical + per-item pass/fail table in `docs/ACCESSIBILITY-AUDIT.md` |
| P1-4 observability surface | P1 | 4C | `/api/v1/metrics` + `/health/ready` return real counters; telemetry rows land from a live session |
| P1-5 Postgres in CI | P1 | 4D | migration + integration job green with `DB_DRIVER=postgres` |
| P1-6 TURN/relay unverified | P1 | 4E.4 | `npm run verify:ice` output committed; transport type shown per peer; prod refuses to boot with half-configured TURN |
| P2-1 consent not enforced | P2 | 4A.2 | writes rejected server-side without granted scope; UX prompt appears once |
| P2-4 bundle guardrail | P2 | 4C | CI fails if `main` chunk exceeds the agreed budget or Babylon leaks into it |
| P2-6 dead provider flags | P2 | 4C.3 | `/api/v1/providers` is the only source of provider truth; unknown flag value ⇒ degraded health + boot warning; Settings badge matches it |
| P2-2 feedback capture | P2 | 5.5 | `POST /feedback` rows from real sessions rendered in Admin |
| P2-3 contacts/history/admin | P2 | 5.4 | screens exist on the existing design system + typed REST |
| P3-3 gestures acknowledge-only | P3 | 4A.3 | documented ADR + consistent behaviour between route and client |
| P3-1/2 stale docs | P3 | D3/D4 | Spirit docs and README agree with `git log` |

---

## 7. Documentation tasks

- **D1** `docs/PERFORMANCE.md` — measured WebRTC/speech/translation/bundle numbers,
  with the measurement command for each row.
- **D2** `docs/ACCESSIBILITY-AUDIT.md` — §28 + §20.5 checklist, per-item
  pass/fail/unverified + evidence.
- **D3** Reconcile `Spirit-PROJECT_CONTEXT.md`, `Spirit-SKILL.md`, `Spirit-LOG.md`,
  `spirit-ALIGNMENT.md` with the repository: update `Current Phase`, tick delivered
  items, and add a "Not achievable by code alone" section (dataset, trained model,
  assets, community QA, funding) so the strategy docs stop contradicting the code.
  Keep all business/KPI content as *targets*, never as achievements.
- **D4** Refresh `README.md` status line, `docs/API.md` (telemetry/consent/persistence),
  `docs/ARCHITECTURE.md` (group mesh + failover), `docs/SECURITY.md`,
  `docs/DECISIONS.md` (new ADRs as they land).
