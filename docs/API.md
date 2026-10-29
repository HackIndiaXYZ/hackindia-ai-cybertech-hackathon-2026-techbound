# API Reference

Base URL: `/api/v1`. All timestamps are ISO-8601. All requests/responses are JSON.

## Response envelopes

**Success**

```json
{ "data": { }, "meta": { "requestId": "…", "timestamp": "…" } }
```

**Error**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { }, "requestId": "…" } }
```

Zod validation failures map to `400`. Unknown routes return `404` (not `401`) so
errors stay understandable. The API never leaks stack traces to clients.

## Authentication

Bearer JWT: `Authorization: Bearer <accessToken>`. Protected endpoints require it.
Socket.io uses the same token in the handshake.

Two identity paths converge on the same platform session:

- **Credentials** — `POST /auth/signup` / `/auth/login` with bcrypt-hashed passwords.
- **Google** — the browser completes OAuth with Supabase Auth and `POST /auth/google`
  exchanges the provider token for our own access + refresh tokens. The API verifies the
  token against the Supabase project JWKS (`SUPABASE_ISSUER_URL`), so the provider is an
  *identity source only*: no Supabase key can authorise a request, and sessions, refresh
  rotation and revocation stay first-party. Accounts created this way have no usable
  password; a Google-only email cannot log in with credentials.

## Endpoints

### Health

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/health` | no | Full readiness report (api/database/redis/signaling). `503` only if `status: "down"`. |
| GET | `/health/live` | no | Liveness probe, no dependency checks. |
| GET | `/health/ready` | no | Readiness probe (used by CI/CD). |

`/health` response shape:

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "uptimeSec": 17,
  "checks": {
    "api": { "status": "ok" },
    "database": { "status": "degraded", "driver": "fallback-memory" },
    "redis": { "status": "degraded", "driver": "fallback-memory" },
    "signaling": { "status": "ok", "message": "Socket.io ready (0 rooms)." },
    "auth": { "status": "ok", "driver": "password-only", "message": "No OAuth provider configured; credential login only." }
  }
}
```

> In local **fallback** mode, database/redis report `degraded` honestly. With the
> Postgres/Redis drivers they report `ok`.

> `auth` is informational and excluded from the overall `status`, like `speech`: a
> deployment with no OAuth provider still serves credential login correctly. It reports
> `supabase-google+password` (ok), `oauth-dev` (degraded — local simulation only) or
> `password-only` (ok).

### Auth

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| POST | `/auth/signup` | no | Body: `{ email, password, displayName, role, turnstileToken? }`. Returns `AuthResponse` (user + access + refresh tokens). Rate-limited. `turnstileToken` required only when `TURNSTILE_ENABLED`. |
| POST | `/auth/login` | no | Body: `{ email, password, turnstileToken? }`. Returns `AuthResponse`. Generic error message on bad credentials. Rate-limited. |
| POST | `/auth/refresh` | no | Body: `{ refreshToken }`. Single-use rotation: consumes the presented token and returns a fresh `{ accessToken, refreshToken }`. A replayed token `401`s. |
| POST | `/auth/logout` | Bearer | Revokes the current access token (jti blocklist) and the presented `refreshToken`. `204`. |
| POST | `/auth/forgot-password` | no | Body: `{ email }`. **Enumeration-safe**: always `202 { accepted }` whether or not the account exists. Emails a single-use reset link when it does. Rate-limited. |
| POST | `/auth/reset-password` | no | Body: `{ token, newPassword }`. Consumes the single-use token and sets the new password. `204`; an invalid/expired token `401`s. Rate-limited. |
| POST | `/auth/google` | no | Body: `{ token }` — the Supabase provider token from the OAuth redirect. Verifies it against the project JWKS (RS256/ES256, issuer — either the bare project URL or `{project}/auth/v1`, `aud` including `authenticated`, and an email-verification flag in any of the shapes Supabase emits) and returns `AuthResponse`, creating the account on first sign-in. `401` on any verification failure, naming the check that failed; `503` when no provider is configured. Rate-limited separately (30/min). |
| GET | `/auth/google/status` | no | Capability probe: `{ available, mode }` where `mode` is `supabase`, `dev` or `unconfigured`. The web app only renders the Google button when a real exchange can complete, so the control is never decorative. |

`role` ∈ `deaf | hearing | interpreter | admin`.

### Users (auth required)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/users/me` | Current user. |
| GET | `/users/me/profile` | Current user's communication/accessibility profile. |
| PATCH | `/users/me/profile` | Partial update (input/output modes, languages, avatar gender, accessibility settings). |

### Sessions (auth required)

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/sessions` | Body: `{ type, maxParticipants? }`. Returns session + `joinToken` + `iceServers`. `201`. |
| GET | `/sessions` | History readback (5.5): the caller's own hosted/joined sessions, newest first. Optional `?limit` (1–100, default 50). |
| GET | `/sessions/contacts` | Derived contacts (5.5): distinct co-participants the caller has shared sessions with, ranked by shared count. Peers who already *left* a session are not counted (participant list reflects current membership). |
| GET | `/sessions/:sessionId` | Session summary + participants. |
| POST | `/sessions/:sessionId/join` | Body: `{ sessionId, joinToken }`. Enforces capacity. Returns `{ session, participants, iceServers, peers }` so the client can bootstrap its WebRTC mesh (§12). |
| POST | `/sessions/:sessionId/leave` | Removes caller from the session. |
| POST | `/sessions/:sessionId/end` | Host-only teardown. |

Session types & default capacity: `one_to_one` = 2, `group` = 5, `translator` = 1.

### Data recording (auth required)

These endpoints provide durable storage + the API surface for pipelines built in
later phases. **They do not fabricate AI output** in Phase 1 — they validate and
persist/acknowledge what a real client or future pipeline submits.

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/messages` | Text-fallback message. Body: `{ sessionId, body }`. `201`. |
| GET | `/messages/:sessionId` | List messages for a session. |
| POST | `/transcripts` | `{ sessionId, source(speech\|isl), text, isFinal, confidence, language }`. `201`. |
| GET | `/transcripts/:sessionId` | List transcripts. |
| POST | `/translations` | `{ sessionId, sourceTranscriptId, sourceText, targetRepresentation, confidence, fallbackUsed }`. `201`. |
| GET | `/translations/:sessionId` | List translations. |
| POST | `/gestures` | Acknowledges a recognized gesture (`202`) after validating the session exists. Persistence lands with the Phase 2B pipeline. |
| POST | `/feedback` | `{ category, rating(1..5), comment?, sessionId? }`. `201`. Rate-limited (5.6). |
| GET | `/admin/feedback` | **Admin only** (`403` otherwise). Newest-first page of all feedback for the beta report. Query: `?limit=1..500` (default 100). (5.6) |
| POST | `/consent` | Set a consent grant. Body: `{ scope, granted }`. `201`. |
| GET | `/consent` | List the caller's consent records. |

`language` ∈ `en-IN | hi-IN | hi-en`.

## Real-time (Socket.io)

Events are defined once in `@isl/shared-types` (`SignalEvent`). No unvalidated
object may cross the wire; every payload is wrapped in a `SignalEnvelope`.

As of **Phase 2A**, every relayed WebRTC (`webrtc:offer/answer/ice-candidate`),
presence (`participant:muted/camera-changed/active-speaker`), text (`message:text`)
and `connection:quality` payload is validated with Zod before relay, and the
relayed sender identity must match the authenticated socket user. A violation
returns a `system:error` envelope to the offender instead of relaying.

**Handshake:** `{ auth: { token } }` — a valid JWT is required to connect.

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `session:join` / `:leave` / `:end` | client → server | Room lifecycle. |
| `participant:joined` / `:left` / `:muted` / `:camera-changed` / `:active-speaker` | server → room | Presence. |
| `webrtc:offer` / `:answer` / `:ice-candidate` | peer → server → peer | Relayed point-to-point by `toUserId`. |
| `transcript:partial` / `:final` | producer → room | Live captions. |
| `gesture:detected` / `:sequence` | producer → room | Recognized signs. |
| `translation:started` / `:completed` | server → room | Conversion status. |
| `avatar:command` | server → client | Avatar animation cue. |
| `message:text` | peer → room | Text fallback. |
| `connection:quality` | server → client | QoS signal. |
| `system:error` | server → client | Recoverable real-time error. |

The server relays metadata only; media flows peer-to-peer via WebRTC (Phase 2).
