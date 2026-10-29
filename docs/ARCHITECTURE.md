# Architecture

This document describes the system as built through **Phase 2A (WebRTC engine)**
on the Phase 1 foundation, and the structure that later phases plug into.

## 1. High-level view

```
┌────────────────────────┐        ┌─────────────────────────────┐
│  Web app (apps/web)    │  HTTP  │  API + signaling (apps/api) │
│  React + Vite + Redux  │───────▶│  Express + Socket.io        │
│  socket.io-client      │  WS    │                             │
└────────────────────────┘◀──────▶└──────────────┬──────────────┘
        ▲  typed contracts                        │
        │  @isl/shared-types                      │
┌───────┴──────────┐                    ┌─────────▼───────────┐
│ Shared types pkg  │                    │ Data & cache layer  │
│ (single source   │                    │ Postgres + Redis    │
│  of truth)       │                    │  (+ in-memory       │
└──────────────────┘                    │   fallback drivers) │
                                        └─────────────────────┘
```

Future layers (not yet wired, placeholders reserved in the domain model & event
contracts): **WebRTC media engine**, **computer-vision gesture recognition**, and
**speech conversion** services. The signaling layer and typed event envelope are
already shaped to host them.

## 2. Monorepo layout

npm workspaces, three groups:

- `apps/api` — backend + real-time signaling server.
- `apps/web` — single-page React app.
- `packages/shared-types` — cross-boundary type contracts, built to `dist/` and
  consumed as a real package (so compiled Node can require it, not just TS).

## 3. Backend (`apps/api`)

**Stack:** Node.js + Express + Socket.io + Zod + JWT, TypeScript, ESM.

Layered structure under `src/`:

| Directory      | Responsibility |
| -------------- | -------------- |
| `config/`      | Reads & validates env once into a frozen, typed `config`. Production guards reject insecure defaults. |
| `infra/logger` | Dependency-free structured JSON logger with request correlation ids. |
| `infra/db`     | `Database` interface + `postgres` adapter + `fallback-memory` adapter; migrations. |
| `infra/redis`  | `KVStore` interface + `redis` (ioredis) adapter + `fallback-memory` adapter. |
| `middleware/`  | Request context, validation, auth, rate limiting. |
| `validation/`  | Zod schemas for request bodies/params. |
| `errors/`      | `AppError` with static factories + central `errorHandler`/`notFoundHandler`. |
| `services/`    | Business logic (auth, users, sessions, health). |
| `routes/v1`    | Versioned REST endpoints. |
| `realtime/`    | Socket.io signaling: handshake auth, room lifecycle, WebRTC relay, presence/transcript/gesture relays. |
| `app.ts`       | Express app factory (helmet, CORS allow-list, JSON limits, routers, error handling). |
| `index.ts`     | HTTP + signaling bootstrap, migrations, graceful shutdown. |

### 3.1 Driver abstraction & graceful fallback (Rule #14)

Postgres and Redis are **behind interfaces** with two implementations each,
selected by `DB_DRIVER` / `REDIS_DRIVER`:

- `postgres` / `redis` — real, production-shaped adapters.
- `fallback` — in-memory, **non-persistent**, clearly logged as not-for-production.

In `NODE_ENV=production` the server **refuses to boot** on fallback drivers, so
fallback can never masquerade as production. The `/health` endpoint reports
fallback components honestly as `degraded`.

### 3.2 Error model & envelopes

All REST responses use:

- success: `{ data, meta }`
- failure: `{ error: { code, message, details?, requestId } }`

`AppError.toApiError(requestId)` produces the failure shape; the central handler
maps Zod errors to 400 and unknown errors to 500 without leaking internals.

## 4. Shared contracts (`packages/shared-types`)

Single source of truth for:

- **domain** models (`User`, `Profile`, `CommunicationSession`, `Participant`,
  `Message`, `Transcript`, `Translation`, `Feedback`, `ConsentRecord`, enums like
  `UserRole`, `LanguageCode`).
- **gesture / speech / translation** result types.
- **events** — the `SignalEvent` catalogue (session, WebRTC, participant,
  transcript, gesture, translation, avatar, message, connection, system) with
  typed payloads and a `SignalEnvelope<T>` wrapper.
- **api** DTOs + response envelopes + `HealthResponse`.

## 5. Real-time signaling

Socket.io server attached to the same HTTP server. Contract summary:

- Handshake carries a JWT; connection is rejected without valid auth.
- `session:join` validates the session id + join token, joins the Socket.io room,
  and broadcasts `participant:joined`.
- WebRTC `offer` / `answer` / `ice-candidate` are **relayed point-to-point** to
  the targeted participant (`toUserId`), after Zod validation and a sender-vs-authenticated-user
  check (Phase 2A).
- Presence / transcript / gesture events are relayed to the whole room.
- Server never terminates media; it coordinates metadata only. Media flows
  peer-to-peer via the browser WebRTC engine (Phase 2A).

## 5.1 WebRTC media engine (Phase 2A)

Implemented entirely client-side in `apps/web/src/lib/webrtc/`:

- `peer.ts` — one `WebRtcPeer` per remote participant using the **perfect
  negotiation** pattern (glare-free offer/answer, trickle ICE, deterministic
  politeness via `localUserId > remoteUserId`).
- `engine.ts` — `CallEngine` owns the mesh (`Map<userId, WebRtcPeer>`), local
  media, mic/camera track toggles, and routes signaling to the socket.
- `media.ts` — `getUserMedia` wrapper classifying permission errors into
  understandable messages.
- Connection quality is derived from real `getStats()` (RTT + packet loss), never
  simulated.

The UI state is governed by a single explicit **call state machine**
(`lib/call/machine.ts`): `idle → connecting → ringing → connected →
reconnecting → disconnected → failed → ended`. It only reports `connected`
when a real peer channel is open (ADR-009 / §12 "do not fake a connection").

## 6. Frontend (`apps/web`)

**Stack:** React 18 + Vite + TypeScript + Redux Toolkit + React Router v6 +
Tailwind (claymorphism design tokens) + socket.io-client.

- `components/ui` — accessible primitives: Button, IconButton, Input, Modal,
  Card/Badge/StatusIndicator/Skeleton, and the Loading/Empty/Error state set.
- `components/layout` — `AppShell` (authenticated) and `PublicLayout`.
- `store` — Redux slices (`auth`, `settings` with localStorage persistence, and
  `call` — the serializable call state driven by the state machine).
- `lib` — API client (unwraps the `{data, meta}` envelope, throws `ApiClientError`),
  a typed `SignalClient` socket wrapper, the WebRTC engine (`lib/webrtc/*`) and
  the call state machine (`lib/call/machine.ts`), config, and accessibility helpers.
- `features/useCall.ts` — orchestrates media + engine + signaling + REST session
  bootstrap + timers + reconnection.
- `components/call` — VideoTile, CallControls, ConnectionIndicator, CaptionPanel
  (with text fallback).
- `pages` — Landing, Login, Signup, Dashboard, Settings, Accessibility statement,
  How-it-works, a real `/call/:sessionId` WebRTC surface (Phase 2A), and an
  honest *Unavailable* Translator surface.

### 6.1 Design system

Claymorphism tokens live in `tailwind.config.ts` (`clay.*` colors, soft shadows,
large radii). Contrast is kept AA-safe; depth never harms legibility.

### 6.2 Accessibility (first-class)

Skip links, landmarks, visible focus, semantic HTML + ARIA, non-color status
indicators, reduced-motion (media query + manual toggle), high-contrast mode,
large-controls mode, and adjustable caption size. Preferences persist and are
reflected as `data-*` attributes on `<html>` via `applySettingsToDocument`.

## 7. Data & session model

Initial schema (users, sessions, participants, messages, consent/feedback) is
defined in `apps/api/src/infra/db/migrations/`. The repository/service split keeps
persistence details out of route handlers.

## 8. ISL Machine Learning Engine (`apps/isl-engine`) & Real-time WebRTC Relay (Phase 1)

`apps/isl-engine` is a dedicated FastAPI service hosting trained PyTorch Indian Sign Language models:
- **Hierarchical Two-Stream Gating Transformer:**
  - Gating Model (`checkpoints/gating_model/best_model.pth`): classifies rolling 154D landmark features into 3 vocabulary specialist groups.
  - 3 Specialist Models (`checkpoints/specialist_model_group_*/best_model.pth`): classify signs within the assigned group (28 signs total across the 3 groups).
  - Confidence calculation: $P(\text{gating}) \times P(\text{specialist})$.
- **Static Hand Gesture Dual Model:**
  - Feedforward Neural Network + Random Forest ensemble for static finger alphabet (1–9, A–Z).
- **Indic Translation Service:**
  - Fast translation of ISL gloss syntax into standard Hindi / English sentences.

### 8.1 Real-Time Streaming Data Flow

```
┌────────────────────────────────┐
│  Client Browser (apps/web)     │
│  - MediaPipeHandTracker        │
│    (21 landmarks/frame)        │
│  - IslEngineProvider           │
│    (30-frame rolling window)   │
└───────────────┬────────────────┘
                │ Socket.io emit: gesture:landmarks
                ▼
┌────────────────────────────────┐
│  API Relay (apps/api)          │
│  - islEngineBridge             │
│    (persistent WS bridge)      │
└───────────────┬────────────────┘
                │ WS /ws/predict (HTTP POST fallback)
                ▼
┌────────────────────────────────┐
│  ISL ML Engine (isl-engine)    │
│  - 154D feature parser         │
│  - Gating Model (3 groups)     │
│  - Specialist Models (28 signs)│
└───────────────┬────────────────┘
                │ Prediction result { sign, group, confidence, breakdown }
                ▼
┌────────────────────────────────┐
│  Room Broadcast (apps/api)     │
│  - io.to(sessionId).emit:      │
│    gesture:detected            │
└───────────────┬────────────────┘
                ▼
┌────────────────────────────────┐
│  All Peers in WebRTC Call      │
│  - Live Captions Feed          │
│  - Video Tile Status Overlay   │
└────────────────────────────────┘
```

### 8.2 Sign Gloss to Grammatical Sentence Pipeline (Phase 2)

Raw sign outputs from the vision pipeline produce discrete sign gloss sequences following Indian Sign Language syntax (primarily Topic-Comment / Subject-Object-Verb, lacking English copulas, inflections, and prepositions).

```
┌─────────────────────────────────┐
│ Sign Gloss Tokens               │
│ e.g. ["I", "School", "Monday"]  │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ ISLGrammarEngine (Python)       │
│ - Lexicon category tagger       │
│ - TSOV -> SVO syntactic parser  │
│ - Copula & preposition injector │
│ - Fingerspelling character merge│
│   (ADR-037, trained=False)      │
└────────────────┬────────────────┘
                 │ Formed English: "I go to school on Monday."
                 ▼
┌─────────────────────────────────┐
│ Translation & TTS Layer         │
│ - Indian Language Translator    │
│   (Hindi, Marathi, etc.)        │
│ - Web Speech TTS Playback       │
└─────────────────────────────────┘
```

Endpoints providing sentence formation:
- `POST /format_sentence` (FastAPI) & `POST /process_translate`: accepts `{ glosses, sentence, language }`, returns `{ formed_sentence, translated_sentence, is_rule_based: true }`.
- WebSocket `/ws/predict` (FastAPI): accepts `{ type: "sentence", glosses: [...] }`.
- `POST /api/v1/isl/format_sentence` (Express API) proxies to the ML engine via `islEngineBridge.formatSentence()`.

### 8.3 AI4Bharat Indic-TTS Regional Neural Synthesis Pipeline (Phase 3)

Spoken output converts translated ISL sentences into natural Indian regional speech using the AI4Bharat Indic-TTS architecture (FastPitch acoustic model + HiFi-GAN neural vocoder) with visible browser fallback:

```
┌─────────────────────────────────┐
│ Formed / Translated Sentence   │
│ (Hindi, Marathi, English, etc.) │
└────────────────┬────────────────┘
                 │ POST /api/v1/tts/synthesize
                 ▼
┌─────────────────────────────────┐
│ API Gateway (apps/api)          │
│ - Validates schema & headers    │
│ - Proxies to TTS microservice   │
│ - Attaches X-Latency-Ms header  │
└────────────────┬────────────────┘
                 │ POST http://localhost:8002/synthesize
                 ▼
┌─────────────────────────────────┐
│ Indic-TTS Service (FastAPI)     │
│ - Pre-warmed FastPitch acoustic │
│ - HiFi-GAN vocoder pipeline     │
│ - 24 kHz 16-bit PCM WAV stream  │
└────────────────┬────────────────┘
                 │ 200 OK (audio/wav)
                 ▼
┌─────────────────────────────────┐
│ Client Player (apps/web)        │
│ - IndicTtsProvider              │
│ - HTML5 Audio streaming player  │
│ - ADR-038 visible fallback to   │
│   WebSpeechSynthesis on error   │
└─────────────────────────────────┘
```

Endpoints & Contracts:
- `POST /synthesize` (`services/tts-indic/`): accepts `{ text, lang, gender, voiceId }`, returns streamed `audio/wav` (24 kHz, 16-bit PCM).
- `GET /health` & `GET /voices`: exposes service status, supported Indian regional languages, and pre-warmed voice models.
- `POST /api/v1/tts/synthesize` (`apps/api`): authenticated and rate-limited gateway proxy.
- `IndicTtsProvider` (`apps/web`): client-side provider with `onFallbackChange` callback surfacing fallback state badges to users.

### 8.4 OpenAI Whisper Multilingual STT & Lexicon Pipeline (Phase 4)

Microphone dictation during calls captures speech and maps it into ISL gloss concepts for avatar rendering with cross-browser resilience:

```
┌─────────────────────────────────┐
│ User Microphone (Browser)       │
│ - MediaRecorder / WebSpeech API │
└────────────────┬────────────────┘
                 │ (if Firefox/Safari or server mode)
                 │ POST multipart/form-data audio/webm
                 ▼
┌─────────────────────────────────┐
│ API Gateway (apps/api)          │
│ - /api/v1/speech/transcribe     │
│ - Zero-copy stream relay        │
└────────────────┬────────────────┘
                 │ POST http://localhost:8003/transcribe
                 ▼
┌─────────────────────────────────┐
│ Whisper STT Service (FastAPI)   │
│ - Pre-warmed Whisper Base model │
│ - Soundfile + Scipy resampler   │
│ - Multilingual transformer      │
└────────────────┬────────────────┘
                 │ 200 OK { text, language, latency_ms }
                 ▼
┌─────────────────────────────────┐
│ Concept Mapper (apps/web)       │
│ - 74-concept bilingual glossary │
│ - Greedy longest-match parser   │
│ - Maps to ISL avatar gestures   │
└─────────────────────────────────┘
```

Endpoints & Contracts:
### 8.5 3D ISL Avatar Animation & Fingerspelling Fallback Pipeline (Phase 5)

Renders real-time Indian Sign Language motions for translated gloss concepts through a unified Babylon.js rig:

```
┌─────────────────────────────────┐
│ Concept Stream (from speech/IR) │
│ - IslConcept[] with timing/expr │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ GestureMapper (apps/web)        │
│ - Curated ISL sign lookup (38)  │
│ - Letter decomposition fallback │
└────────────────┬────────────────┘
                 │
        ┌────────┴──────────────────────────┐
        │ [In 38 Curated Vocabulary]        │ [Unrecognized / Arbitrary Word]
        ▼                                   ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────┐
│ Real Sign Animation Clip        │ │ ISL Fingerspelling Engine       │
│ - sign-namaste, sign-school...  │ │ - Sequence: fingerspell-a...-z  │
│ - Authentic joint keyframes     │ │ - Real Mixamo bone poses        │
└────────────────┬────────────────┘ └────────────────┬────────────────┘
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ Babylon.js Humanoid Rig (babylonAvatarAdapter.ts)               │
│ - Mixamo GLB loader (missingwhisper-avatar.glb / ybot / xbot)   │
│ - Procedural skeletal bone transform runner                     │
│ - Dynamic facial expressions (affirmative, negative, question)  │
└─────────────────────────────────────────────────────────────────┘
```

Endpoints & Contracts:
- `ISL_SIGN_REGISTRY` (`apps/web/src/lib/avatar/islSignRegistry.ts`): consolidated bone keyframe definitions from Signify (`sign-a`...`sign-z`, `sign-home`, `sign-person`, `sign-time`, `sign-you`).
- `PLACEHOLDER_GESTURE_REGISTRY` (`apps/web/src/lib/avatar/constants.ts`): metadata for 38 authentic signs and 26 fingerspelling letters.
- `GestureMapper` (`apps/web/src/lib/avatar/gestureMapper.ts`): translates concepts to animation commands with automatic letter-by-letter fingerspelling fallback.
- `apps/signify`: archived legacy prototype; all keyframe assets merged into unified web avatar pipeline.
