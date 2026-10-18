# Security & Privacy

Security and privacy are treated as product requirements. This document records
what is implemented in Phase 1 and the guarantees the architecture enforces.

## 1. Configuration safety guards

`apps/api/src/config` validates every environment variable with Zod and, in
`NODE_ENV=production`:

- **refuses to start** if `JWT_SECRET` is the insecure default;
- **refuses to start** if `DB_DRIVER` or `REDIS_DRIVER` is `fallback`.

This makes it impossible to accidentally deploy non-persistent stores or a known
signing key.

## 2. Authentication & sessions

- Passwords are hashed with **bcrypt** (never stored in plaintext).
- Login failures return a **generic** message ("Incorrect email or password.") to
  avoid user enumeration.
- Stateless **JWT** bearer tokens authenticate REST calls; the same token is
  required in the Socket.io handshake — unauthenticated sockets are rejected.
- Session **join tokens** are short-lived and verified before a participant enters
  a room; capacity limits are enforced server-side.

## 3. Transport & headers

- `helmet` sets hardened HTTP security headers.
- **CORS** uses an explicit allow-list (`CORS_ALLOWED_ORIGINS`), not a wildcard.
- In production, TLS termination is expected at the edge (reverse proxy /
  platform). WebRTC media is DTLS/SRTP-encrypted end-to-peer by design.
- The nginx container adds `X-Content-Type-Options`, `X-Frame-Options`, and
  `Referrer-Policy`.

## 4. Input validation & error hygiene

- Every HTTP body/param and Socket.io payload is validated with Zod; malformed
  input yields `400`/`system:error`, never a crash.
- As of Phase 2A, the **signaling relay validates every WebRTC / presence / text
  / connection-quality payload** against its contract and enforces that the
  payload's sender id matches the authenticated socket user, so a client cannot
  spoof another participant or push malformed SDP/ICE onto the wire.
- Request body size is capped (JSON limit) to blunt payload-based abuse.
- The central error handler returns safe, structured errors with a `requestId` and
  **never leaks stack traces or internal details** to clients.

## 5. Rate limiting

Credential endpoints (`/auth/login`, `/auth/signup`) are rate-limited to slow
brute-force attacks. The limiter is generic and reusable for other sensitive
routes in later phases.

## 6. Logging & secrets

- Structured JSON logs include a correlation `requestId` but **never** secrets or
  credentials. The config object is frozen and secrets are not logged.
- `.env` is git-ignored; only `.env.example` (with placeholder values) is tracked.
- CI includes a secret-scan step that fails the build on patterns resembling
  database URLs with credentials, AWS keys, or private keys.

## 7. Privacy & consent (Deaf-user context)

- Camera/microphone media is, by design, **peer-to-peer**; from Phase 2A the
  browser WebRTC engine carries audio/video directly between peers. The server
  relays signaling metadata (SDP/ICE) only and never ingests media.
- Peer connections are DTLS/SRTP encrypted end-to-peer by the WebRTC standard.
- Local media is requested only after the user starts/joins a call, and
  permission denials are surfaced as understandable, actionable messages.
- A **consent** model (`POST/GET /consent`) exists so recording/processing of
  sensitive biometric data (video, sign, voice) is explicit and revocable.
- Data-recording endpoints persist only what a real client/pipeline submits; no
  AI output is fabricated to simulate functionality.

## 8. Accessibility as safety

For Deaf and hard-of-hearing users, a missing visual cue for an audio event *is*
a safety/functional defect. Non-color status indicators, captions, visible focus,
reduced-motion and high-contrast modes are part of the security/quality bar, not
cosmetics.

## 9. Known Phase 2A scope limits

- No refresh-token rotation or account recovery yet (`/forgot-password` is a
  later phase).
- **TURN** credential provisioning is not configured; by default only public
  STUN is used, so peers behind symmetric NATs may fail to connect. `iceServers`
  are surfaced from config and ready for a real TURN when provisioned.
- **Signaling relay now strictly validates transcript events too.** As of Phase
  2C, `transcript:partial` / `transcript:final` are validated against their
  contracts and the sender (`participantUserId`) must match the authenticated
  socket, so captions cannot be spoofed and only confidence values the provider
  actually measured (or an explicit `null`) cross the wire. Gesture /
  translation / avatar contracts remain on the deferred path.
- These are documented gaps, not silent omissions.

## 10. Computer-vision privacy & data retention (Phase 2B)

Plan §13 requires the recognition pipeline to respect privacy by default. The
implemented guarantees:

- **Client-side only.** Hand landmark extraction and classification run entirely
  in the browser (`apps/web/src/lib/vision/`) via MediaPipe Hands. Camera frames
  are **never** uploaded, transmitted, or sent to the API — only optional,
  already-recognized text/gesture metadata could cross the real-time layer later,
  and that relay is not wired up in this phase.
- **No frames are stored.** Raw video is never persisted. MediaPipe reads pixels
  in-memory per frame and nothing is written to disk or IndexedDB.
- **Recording is opt-in and OFF by default.** The Translator "Record landmarks"
  toggle is the only data-collecting path. When off, no frames or landmarks are
  buffered. When on, it captures **anonymized landmarks only** (21 normalized
  points — no pixels, no face, no PII) into an in-memory buffer, capped at 300
  frames, that the user may export as JSON.
- **Retention policy.** The landmark buffer lives only for the page session: it
  is discarded immediately when recording is toggled off and when the component
  unmounts. Nothing survives a reload. Any future server-side retention must go
  through the explicit `/consent` (`training_data`) model first.
- **Model assets are same-origin.** MediaPipe WASM/`.tflite` assets are copied
  from `node_modules` into `public/` on predev/prebuild and served from the app
  origin — never hot-linked from a third-party CDN — so recognition adds no
  external network call and is reproducible offline.
- **Honest capability state.** The bundled classifier is a geometric hand-shape
  **heuristic**, self-labelled "not a trained ISL translator" (`trained = false`).
  The UI and the classifier refuse to emit results for ambiguous or low-confidence
  tracks rather than fabricate a translation. Reliable ISL recognition requires
  labelled data, validated models and ISL-expert review before this claim changes.

## 11. Known Phase 2B scope limits

- Recognition is verified with deterministic unit tests of the pure pipeline;
  **live webcam landmark rendering must be verified in a real browser** (the
  development environment is headless and cannot run camera/WASM).
- Recognized gestures are not yet relayed over Socket.io (`gesture:detected` /
  `gesture:sequence` contracts exist but enforcement/relay lands with Phase 3).
- The heuristic emits generic hand shapes only; the trained ISL classifier is a
  future milestone gated on datasets and expert validation.

## 12. Speech-recognition privacy & data retention (Phase 2C)

Plan §14 requires speech-to-text while never exposing raw audio unnecessarily.
The implemented guarantees:

- **On-device by default.** The working provider is the browser **Web Speech
  API** (`apps/web/src/lib/speech/webSpeechProvider.ts`). Microphone audio is
  consumed by the browser engine and is **never uploaded to, or recorded by,
  the MissingWhisper backend**. No audio bytes are sent over the Socket.io or
  REST layer at all — only resulting transcript text (and optional measured
  confidence/latency) is relayed to call peers.
- **No raw-audio persistence.** Audio is never written to disk, IndexedDB, or any
  server store. The preflight `getUserMedia` probe exists only to produce
  friendly permission/no-mic states; its stream is stopped immediately and is
  not recorded.
- **Transcript relay is text-only + metadata.** `transcript:partial` /
  `transcript:final` carry participant id, language, transcript text, an honest
  `confidence` (nullable) and a measured `latencyMs` (only when observable).
  High-frequency interim captions are throttled server-side, and the relay log
  records **event metadata only, never transcript content** (§6).
- **Confidence is never fabricated.** When a provider does not measure
  confidence the pipeline sends `null` and the UI shows "Confidence unavailable"
  rather than an invented percentage. The same applies to latency.
- **Future server providers (Whisper/FastAPI) are opt-in and not active.** No
  server speech service is wired or claimed in this phase. If one is introduced
  it must: require explicit opt-in + `/consent`, keep raw audio non-persistent
  by default, discard transient buffers after recognition, and document retention
  here before any audio leaves the device.

## 13. Known Phase 2C scope limits

- Speech recognition is verified with deterministic unit tests of the provider,
  latency, confidence, error classification and caption-state model. **Live
  microphone recognition must be verified in a real browser** — a headless
  environment has no SpeechRecognition engine and no audio device.
- Language coverage is limited to what the browser engine supports
  (`en-IN`, `hi-IN`). `hi-en` code-switching exists in the domain model but is
  **not** offered because no engine reliably transcribes mixed-language speech
  in one session; we do not claim unverified capability.
- Vendor support varies: Chromium/Edge (Google-backed) provide
  `webkitSpeechRecognition`; where absent the UI shows an honest "not
  supported" state and typed-text captions still work.

## 14. Phase 2D avatar — no new media egress

The Babylon.js avatar foundation (plan §15) was built to add **no new privacy
surface**:

- **No camera or microphone.** The avatar render path requests no media
  permissions at all (`apps/web/src/lib/avatar/*`). It neither captures nor
  transmits audio/video.
- **Commands carry intent, not media.** The `avatar:command` contract
  (`AvatarCommandPayload` / `AvatarAnimationCommand`) contains gesture ids,
  animation-clip ids, facial-expression labels, timing and transitions — never
  raw camera frames or audio buffers. The command adapter
  (`apps/web/src/lib/avatar/commandAdapter.ts`) validates and forwards only those
  fields and ignores any unexpected keys rather than relaying them.
- **Fully client-side rendering.** Babylon is dynamically imported and the scene
  renders locally in the browser. No avatar geometry, animation or frame is
  uploaded or persisted by the MissingWhisper backend.
- **Honest placeholder.** The procedural humanoid is a labelled *development
  placeholder — not a real ISL signer*; its motions are generic development
  animations with **no** claimed ISL meaning, and no GLB avatar is auto-downloaded
  or hot-linked. A future GLB is only loaded from the configured same-origin asset
  path, and one whose bones fail validation is reported rather than silently
  animated.

## 15. Known Phase 2D scope limits

- Babylon/WebGL cannot run headless, so the engine, scene and rendering are
  **not** covered by unit tests and are **not** claimed to work from them. The
  deterministic tests cover the pure layers only: loader state transitions,
  missing-asset behavior, command validation, queue ordering, stop/reset,
  sequence completion and measured-FPS math. Visual/interactive acceptance must be
  verified in a real browser.

## 16. Speech-to-ISL translation privacy (Phase 3A)

- **No new egress.** The Phase 3A engine is a **client-side, rule-based glossary**
  (`apps/web/src/lib/translation`). Spoken/typed text is transformed into an
  `IslIntermediateRepresentation` entirely in the browser; the translation engine
  itself performs no network I/O. Live dictation reuses the Phase 2C on-device Web
  Speech provider, so raw microphone audio still never leaves the device.
- **Concepts, not content, on the wire.** When translation results are shared they
  cross only as the already-contracted `translation:started` / `translation:completed`
  / `avatar:command` events, and — for the avatar path — as intent-level animation
  instructions. Commands carry **no** raw camera frames or audio. All three events
  now have strict Zod validation at the signaling boundary (`signalSchemas.ts`),
  with sender anti-spoofing on `avatar:command.participantUserId`.
- **Metadata-only logging.** Relay of these events logs metadata (event, room, user)
  only, never transcript or concept text.

## 17. Known Phase 3A scope limits

- The translator is a **curated rule-based prototype**, not a trained ISL model.
  No ISL ML model or validated dictionary dataset exists in this build, so
  coverage is intentionally small, ordering/non-manual markers are coarse
  heuristics, and per-concept confidence is plain glossary coverage — never a
  claimed model probability. It must not be presented as authoritative ISL.
- The concepts animate the Phase 2D **development placeholder** gestures; a
  concept mapping to a gesture id with no registered clip is reported as
  unrecognized, never fabricated. Headless tests cover the pure pipeline only —
  rendered avatar motion remains a manual browser acceptance item.

## 18. Text-to-speech privacy (Phase 3B)

- **On-device synthesis.** The Phase 3B provider is the browser
  `SpeechSynthesis` API (`apps/web/src/lib/tts`). Text handed to `speak()` is
  synthesized and played locally; it is **not** uploaded to any server, and no
  microphone or camera is touched. The provider declares
  `keepsSynthesisOnDevice: true`, mirroring the 2C audio-on-device guarantee.
- **No autoplay, ever.** `useTts` never invokes the engine on render or in
  response to incoming data — audio plays **only** when the user presses a control
  (the `/app/voice` Speak/Preview buttons or the explicit Translator "Read aloud"
  button). The persisted `voiceSlice.autoplay` policy defaults to `off`, and no
  surface speaks without an opt-in (§17 "never autoplay unexpected audio").
- **Settings are local.** Voice, language, prosody, volume and mute are stored in
  `localStorage` under `isl.settings.voice` — plain UX preferences, never personal
  or biometric data, and cleared with the browser's site data.
- **No new signaling.** Phase 3B is a purely client-side output path; it adds no
  wire events and therefore no new signaling-schema surface.

## 19. Known Phase 3B scope limits

- The only provider verified in this environment is the browser engine, whose
  installed voices (including any `en-IN` voice) vary by OS/browser. The UI reports
  the *real* voice list and whether Indian English is actually present rather than
  assuming it.
- `SpeechSynthesis` exposes **no voice gender/age and renders no emotion**, so the
  capability flags are `false` and the UI shows them as unavailable — we never infer
  gender from a voice name or fake emotional prosody (§29 honesty). "Prosody" here
  means pacing/pitch presets only.
- Start latency and failure rate are measured from provider callbacks via an
  injectable clock and stay null until a real observation exists. Actual audio
  output is a manual browser acceptance item — headless tests drive a fake provider.

## 20. Standalone translator privacy (Phase 3C)

- **No communication channel.** The standalone translator (§18) is deliberately not
  a peer-to-peer call: it reuses the existing on-device seams (2C Web Speech
  dictation, the 3A in-browser rule-based translator and the 2D local avatar). It
  adds no signaling, no WebRTC data path and no API round-trip, so a live
  conversation cannot be intercepted in transit — there is no transit.
- **Media never leaves the device.** Microphone audio is handled by the browser
  speech engine and typed text stays in memory; only the resulting ISL *concepts*
  are handed to the avatar, never raw audio or an image, matching §15.
- **History is memory-only.** Unlike voice prefs, the translation history is
  intentionally NOT written to `localStorage` or any backend — a transcript of what
  someone said is sensitive, so it lives only for the session and is bounded to 50
  entries, with an explicit Clear action.
- **Event mode is a display change only.** Public-space/event mode enlarges the
  transcript and hides non-essential chrome; it changes no privacy posture and
  collects nothing extra.

## 21. Known Phase 3C scope limits

- The pipeline is the curated **rule-based glossary prototype** driving **placeholder
  avatar motions** (no trained ISL model or validated sign dictionary exists in this
  repo), so nothing it produces is authoritative ISL — the UI badges this rather than
  asserting quality (§29 honesty).
- Speech confidence is only shown when the browser provider actually reports it;
  the standalone mode surfaces `null` as “not reported” instead of inventing a number.
- The `rendering` state tracks the real avatar queue and finishes when it drains; the
  queue is only observable in a real browser, so headless tests exercise the state
  machine and history mapping, not live WebGL animation.

## 22. Group-session authority & moderation (Phase 3D)

- **Moderation is authorized against durable state, never a client claim.** A
  `moderation:action` socket command is checked against the *persisted* session host
  (`sessionService.isSessionHost`) before anything is relayed; `moderationActionSchema`
  deliberately has no actor field — the issuer is the authenticated socket user. A
  non-host actor receives an explicit `not_authorized` rejection notice (§29).
- **Host identity changes only through server-driven paths**: creation (first
  joiner / REST creator), REST `POST /sessions/:id/moderate` is host-gated the same
  way, and failover promotes the earliest-remaining member on host departure,
  persisting the result and announcing `HOST_CHANGED` to the room. A client can
  never promote itself.
- **Relayed presence is anti-spoofed.** `validateOrError` compares the identity a
  payload claims (`userId` / `participantUserId` / `senderUserId` / `fromUserId`)
  against the authenticated socket user, so a participant cannot forge another
  participant's mute, camera, active-speaker or translation events (§24).
- **Muting enforces at the device.** A host mute persists participant state and
  reaches every socket of the target (multi-tab included); the target client
  disables its own microphone track and stops emitting active-speaker claims. The
  server never toggles anyone's hardware — it relays an authorized instruction the
  client honors locally.
- **Ending a session stays on REST.** No socket message can terminate a room; the
  lifecycle endpoint checks the persisted host.

## 23. Known Phase 3D scope limits

- Media is a **client-side N-way mesh** (each browser holds up to 4 peer
  connections). This is fine at the §19 cap of 5 participants but is not an SFU;
  larger rooms need a media server (logged as a limitation, §37).
- Active-speaker rings derive from a **client-measured microphone amplitude**
  (RMS + hysteresis), not speech understanding, and the claim is `decidedBy: 'self'`
  unless the host/server overrode it. A deliberately noisy non-audio signal can
  light a ring; nothing worse — captions and audio are unaffected.
- Host failover covers *signaling* departure. If the whole API restarts, sessions
  rebuild from persisted participant rows; in-flight mesh state is renegotiated
  from clients.
- In-call translation rows show exactly what arrived on the wire — a lost
  `translation:completed` stays visibly pending; the client never synthesizes a
  substitute result. The rule-based glossary honesty notes (§17) apply unchanged.

## 24. Persistence & consent enforcement (Phase 4A)

- **The server owns the consent boundary.** `POST /transcripts`,
  `POST /translations` and `POST /messages` answer 403 `CONSENT_REQUIRED`
  unless the authenticated user's **latest** consent record for the
  `recording` scope grants it (the history is append-only; newest `grantedAt`
  wins, so revoking takes effect immediately). Client prompts are UX; a
  hand-crafted request gets the same refusal.
- **Nothing persists on uncertainty.** The call reads its consent posture from
  the API before the writer exists; if that read fails, persistence is `off`
  for the call. Only final artefacts are written — interim captions never
  leave the wire.
- **No media storage.** Transcripts, translations and messages are text rows.
  Audio and video are never uploaded or stored by these routes, and the
  standalone translator keeps recognizing/translating on-device; consent gates
  only the text artefacts it may store.
- **Honest nulls in storage.** `transcripts.confidence` is nullable in the
  domain, the zod schema and SQL: a provider that reports no confidence is
  stored as `NULL`, never as a fabricated 0 or 1.
- **Gesture telemetry is not stored.** `POST /gestures` validates and
  acknowledges (202) but persists nothing, because the only recognizer today
  is the explicitly-untrained heuristic (ADR-028); storing its guesses would
  create fake ISL recognition history.

## 25. Known Phase 4A scope limits

- The offline queue is per-page-session in memory: closing the tab before the
  queue drains loses the pending items (the `partial` status said so while it
  lasted). A durable outbox would need IndexedDB — deferred.
- Standalone persistence attaches rows to a lazily created `translator`-type
  session per run that has consent on; there is no consolidation of those
  sessions into one history thread yet (Phase 5 History screen consumes them
  via `listSessionRecords`).
- The consent prompt appears per call until answered; a device-level "don't
  ask again" preference is intentionally not stored client-side, because the
  server-side scope is the single source of truth.

## 26. Reconnect honesty (Phase 4B)

- **Recovery attempts are bounded and visible.** Each peer runs the
  `decideReconnect` ladder (3 restart attempts max). The tile shows the real
  attempt count ("Reconnecting… attempt X of 3") and, once exhausted, says
  attempts *stopped* — the UI never spins a generic reconnecting state over a
  dead connection (§29 honesty).
- **ICE restarts ride the existing authenticated signaling path.** A restart
  is an `offer` with `iceRestart: true` sent to a peer already admitted by
  room membership + rate limits; signaling validates `targetUserId` against
  room presence like any other relay. No new socket event means no new
  spoofing surface: a stranger still cannot inject an offer to a participant.
- **Call status is aggregated, not claimed.** The header state derives from
  `aggregateCallEvent()` over every peer's actual `RTCPeerConnection` status,
  so one reconnecting peer cannot be reported as a connected call and a
  partially live call is honestly labeled RECONNECTING.
- **Reconnect is media-level only.** It cannot re-admit a disconnected user
  to the room: signaling disconnect already removed them from the registry,
  and a gone participant must rejoin through the normal authenticated join
  path. Retries stop rather than hammering a peer that left.

## 27. Known Phase 4B scope limits

- The ladder is per-WebRtcPeer in one tab. Two tabs of the same user each
  maintain their own mesh and reconnect state; the room tolerates this (3D
  multi-socket registry) but there is no cross-tab dedupe of restart noise.
- Signaling-level socket reconnect (socket.io auto-reconnect) keeps its own
  backoff and is intentionally not routed through the media ladder — a socket
  blip without an ICE blip should not restart media that is working.
- Exhausted peers recover only when the user's client signals genuinely
  connected again (the budget resets on real recovery). There is no manual
  "retry now" button yet; the tile tells the user to have the peer rejoin.

## 28. Observability & telemetry privacy (Phase 4C)

- **A telemetry batch cannot carry content.** `POST /telemetry` validates with
  a `.strict()` zod schema: only numeric metric arrays (`rttMs`,
  `packetLossPct`, `bitrateKbps`, `captionLatencyMs`, `translationLatencyMs`)
  and integer reconnect counts are accepted. Any unexpected key — a smuggled
  `text`, `userId`, or transcript field — is a 400, not a silent strip, so the
  wire format physically has no way to store conversation (§25 content model
  stays the only place text is ever persisted).
- **Analytics is a narrower consent scope than recording.** Telemetry ships
  only when the `analytics` scope is granted, and the server independently
  enforces the same gate (`requireConsent('analytics')` → 403
  `CONSENT_REQUIRED`) — a client that ignores the scope still cannot write.
  Numbers are folded into in-process aggregate summaries (histograms/counts);
  individual batches are not stored per-user.
- **The metrics endpoint is operational, not user-facing.** `GET /metrics`
  emits Prometheus-style aggregates (request/error/signaling counts, latency
  summaries, active-session gauge, driver health). It exposes counts and
  distributions, never identifiers, session contents, or per-user breakdowns.
- **Provider truth is read, never asserted.** `GET /providers` reports the
  resolved provider per capability with a `trained`/`authoritative` flag; a
  flag naming a non-existent integration makes `/health` report `degraded` and
  logs an error-grade boot warning rather than silently falling back, so a
  mis-set env var cannot masquerade as a working capability (§37).

## 29. Known Phase 4C scope limits

- Metrics live in a single Node process: no cross-replica aggregation and no
  external sink yet. Multi-instance deployments need a Prometheus scrape or a
  push gateway (deferred with the Phase 5 topology work).
- Telemetry is fire-and-forget over an authenticated POST; it has no offline
  buffer. A failed flush keeps the current bounded window for one retry on the
  next tick and drops the oldest samples past the cap — long outages lose
  observability, never content.
- `translationLatencyMs` is plumbed for a genuinely async provider but has no
  producer today: in-call translation is synchronous, so no latency number is
  reported for it. We leave the field empty rather than timing a local function
  call and shipping that as network/translation latency.
- The bundle budget guard runs as `npm run bundle-budget` after a build. It now
  runs in the CI `quality` job alongside typecheck, lint, unit tests and the web
  build ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).

## 30. Phase 4D verification: real-browser E2E, WCAG gate, and an auth-refresh finding

The Phase 4D harness runs the actual app in Chromium against the real API and
surfaced a genuine security-adjacent bug, now fixed: the access token lived only
in an in-memory module variable restored by a **post-mount** effect, so a hard
reload of a protected route first rendered `ProtectedRoute` with no token and
redirected to `/login`. The token is now read synchronously from `sessionStorage`
at module load (and re-synced at boot), so the very first render sees it; a unit
test locks the behavior. No new secret storage was introduced — the value stays in
`sessionStorage` for the tab session, cleared on logout.

Honest scope of what the automated checks prove (see
[docs/ACCESSIBILITY-AUDIT.md](./ACCESSIBILITY-AUDIT.md) and
[docs/BROWSER-SUPPORT.md](./BROWSER-SUPPORT.md)):

- The axe-core gate proves **automated** WCAG 2.1 AA on the scanned routes only;
  it caught and, with palette fixes, cleared three real `color-contrast` failures.
  It does **not** prove keyboard/screen-reader/reflow conformance, which remain
  unchecked.
- E2E runs Chromium only; Firefox/WebKit/Edge/mobile are support targets, not
  verified. The two-peer WebRTC mesh is opt-in (`RUN_MESH=1`) and not part of the
  default gate.
- The Postgres/Redis integration job exercises real SQL in CI but self-skips
  locally without `DB_DRIVER=postgres`, so a green local run proves nothing about
  persistence — read the CI job, not the local skip.

## 31. Phase 4E verification: token lifecycle, ICE reachability, and header assertions

What Phase 4E actually changed and how it is proven (see
[docs/DECISIONS.md](./DECISIONS.md) ADR-032):

- **Token lifecycle (4E.2).** Access tokens now carry a `jti`; opaque refresh tokens are
  stored hashed in the KV store and are single-use (rotation). `POST /auth/refresh` swaps
  a token and invalidates the old one; `POST /auth/logout` deletes the refresh session and
  blocklists the live access token's `jti`. Both `authMiddleware` and the Socket.io
  handshake `await isAccessTokenRevoked(jti)`, so a logged-out token fails immediately
  rather than living out its 15-minute TTL. Proven by `authService.test.ts` (single-use
  rotation, replay fails closed, revoke flips the flag) and an end-to-end lifecycle in
  `app.test.ts` (refresh → replay rejected 401 → logout → `/users/me` returns 401).
- **ICE reachability (4E.4).** `npm run verify:ice` (`apps/api/scripts/verify-ice.mjs`)
  sends real RFC 5389 STUN Binding requests over UDP and reports per-transport reachability
  with measured RTT. From this environment Google STUN answered: `stun.l.google.com:19302 →
  reachable rtt=44ms`. This validates server reachability only — it is **not** a full ICE
  agent negotiation and does not prove a media relay carries bytes; the peer transport type
  (host/srflx/relay) is observed in-app from WebRTC `getStats`. Production refuses to boot
  with a **half-configured TURN** (URL/user/credential not all set) — a guard that would
  otherwise silently degrade every relay candidate. Covered by `config.test.ts`.
- **Security headers (4E.5).** The API already mounts `helmet`; `app.test.ts` now asserts
  the hardening headers are present (`x-content-type-options: nosniff`,
  `strict-transport-security`, `x-frame-options`, `content-security-policy`) so a future
  config regression cannot quietly drop them.
- **Password reset (5.2).** `POST /auth/forgot-password` is enumeration-safe (always `202`,
  identical body whether or not the account exists). Reset tokens reuse the single-use,
  hashed-in-KV pattern from 4E.2 (`auth:reset:<sha256>`, 30-min TTL, consumed on use so a
  replay fails closed) and are delivered over a dependency-free mail transport whose
  `console` build logs only recipient + subject — the token-bearing body never reaches logs.
  Proven by `authService.test.ts` (single-use + hash overwrite on reset) and an enumeration-
  safe + reset login lifecycle in `app.test.ts`. Honest limit: reset does not revoke prior
  refresh sessions (see ADR-033); a logout-everywhere index is deferred.

Honest limits: the refresh blocklist lives in the same driver the app is configured with
(in-memory fallback in dev/test, Redis in prod), so revocation is only as durable as that
store; there is no cross-process revocation in the fallback mode. Turnstile/SES/etc. and
the actual cloud ICE deployment are Phase 5 concerns and are not proven here.
