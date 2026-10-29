# Operations

Deployment, environment, rollback, and backup procedures for the ISL platform.
Written against the real artifacts in this repo (`docker-compose.yml`, the two
`Dockerfile`s, the boot guards in `apps/api/src/config/index.ts`). Anything that
requires live infrastructure is stated as a **procedure to run**, never claimed as
already done (§27: measured, not asserted).

## 0. Live Deployment Status vs Real Topology (Phase 0 Audit)

Recorded per Phase 0 / §27 audit requirement:

1. **Frontend Deployment:** The static web bundle is hosted at `missingwhisper.vercel.app` via Vercel.
2. **Backend Services & Fallback Behavior:**
   - When the web frontend runs isolated without a live hosted backend (API, isl-engine, stt-whisper, indic-tts), browser network requests to `http://localhost:4000` or signaling fail.
   - The frontend degrades safely and honestly: the in-browser gesture classifier switches to `HeuristicHandShapeClassifier` (`trained: false`), clearly showing a **Fallback** badge in the UI rather than pretending real ML model inference.
   - Text captions fall back to typed in-call text and Web Speech API where supported by the browser.
3. **Local Self-Contained Deployment:**
   - To run the full stack with all services active and integrated, execute Docker Compose:
     ```bash
     docker compose up -d
     ```
   - Or start native services individually:
     - Express API: `npm run dev --workspace @isl/api` (port `4000`)
     - React Web: `npm run dev --workspace @isl/web` (port `5173`)
     - ISL ML Engine: `python -m uvicorn main:app --port 7861` (in `apps/isl-engine`)
     - Indic-TTS: `python -m uvicorn app:app --port 8002` (in `services/indic-tts`)
     - Whisper STT: `python -m uvicorn app:app --port 8003` (in `services/stt-whisper`)

## 1. Topology

The `docker-compose.yml` describes the production-shaped stack. It is the *real*
(non-fallback) path — the API boots with `DB_DRIVER=postgres` + `REDIS_DRIVER=redis`;
the config layer **refuses to start in production** on the in-memory fallback drivers.

| Service   | Image / build              | Port (host:container) | Role |
|-----------|----------------------------|-----------------------|------|
| web       | `apps/web/Dockerfile` nginx | `8080:80`            | Serves the built Vite SPA (static). |
| api       | `apps/api/Dockerfile` node  | `4000:4000`          | Express REST `/api/v1/*` + Socket.io signaling. |
| migrate   | `apps/api/Dockerfile` (cmd) | —                    | One-shot `node apps/api/dist/infra/db/migrate.js`, exits on success. |
| postgres  | `postgres:16-alpine`        | `5432:5432`          | Durable store (managed instance in real prod). |
| redis     | `redis:7-alpine`            | `6379:6379`          | Ephemeral KV: refresh tokens, jti blocklist, rate-limit buckets, consent cache. |
| isl-engine| `apps/isl-engine` python    | `7861:7861`          | ISL gesture recognition ML model (28 dynamic sign classes). |
| indic-tts | `services/indic-tts` python | `8002:8002`          | Indic-TTS neural voice synthesis microservice (ADR-038). |
| stt-whisper| `services/stt-whisper` python | `8003:8003`       | OpenAI Whisper multilingual speech-to-text microservice (ADR-039). |

Boot order: `postgres`/`redis` become healthy → `migrate` runs and completes → `api`
depends on `service_completed_successfully` → `web`. The API container runs as a
non-root user (`isl`, uid 10001); `.dockerignore` guarantees `.env` and host
`node_modules`/`dist` are never baked into an image.

## 2. Environment management

The same 12-factor config (`apps/api/src/config/index.ts`) is driven per environment.
Nothing secrets-bearing is committed; `.env.example` is the documented key list.

- **dev** — `DB_DRIVER=fallback`/`REDIS_DRIVER=fallback`, `MAIL_TRANSPORT=console`. No
  Docker required; `npm run dev`. Fallback drivers are labelled non-production.
- **staging / prod** — real Postgres + Redis (managed instances), `NODE_ENV=production`.
  Production boot guards reject: the default `API_AUTH_JWT_SECRET`, fallback drivers,
  and a **half-configured TURN** (`TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` must all
  be set together). Set a strong `API_AUTH_JWT_SECRET`, real `TURN_*`, `MAIL_TRANSPORT`
  + `MAIL_FROM` + `PUBLIC_WEB_BASE_URL`, and `CORS_ALLOWED_ORIGINS` matching the
  deployed web origin.

## 3. TLS termination

Neither container terminates TLS: the web container is plain nginx:80 and the API is
plain node:4000. In deployment, place a TLS-terminating proxy/managed load balancer in
front (the API already emits `Strict-Transport-Security` via helmet once served over
HTTPS; HSTS preload is a proxy/LB decision). WebRTC signaling is `wss://` via the same
proxy. **Not configured in this repo** — an infra step to execute on real deployment.

## 4. Release + rollback

**Release:** build images tagged by immutable digest, run `docker compose up -d` (the
`migrate` job runs first). Migrations are applied idempotently. Before merging any
schema change, confirm `npm run migrate` is forward-only-safe.

**Rollback (documented stance, to execute on live infra):**
- *App:* redeploy the previous image tag/digest. Because access tokens are stateless
  JWTs, an older API can still verify tokens minted by the newer one within their TTL;
  in-flight refresh/jti state lives in Redis and is tolerated across a rollback.
- *Migration stance:* additive-only (add columns/tables, never destructive renames in a
  release that must roll back). Roll back the app first; drop/defer schema changes in a
  follow-up. There is **no automatic down-migration** — this is a deliberate, documented
  limitation, not an oversight.

## 5. Backup + restore procedures

- *Postgres backup drill command:*
  ```bash
  # Scheduled or manual backup:
  docker exec -t isl-postgres pg_dump -U isl -d isl -F c -b -v -f /tmp/isl_backup_$(date +%Y%m%d_%H%M%S).dump
  ```
- *Postgres restore drill command:*
  ```bash
  # Restore to target instance:
  docker exec -i isl-postgres pg_restore -U isl -d isl --clean --if-exists /tmp/isl_backup_<TIMESTAMP>.dump
  ```
- *Redis durability stance:* Redis holds only ephemeral, rotating state (refresh tokens,
  revocation blocklists, rate limit tokens). Losing Redis safely logs users out (refresh
  tokens expire) without any loss of durable session, user, transcript, or translation data.

## 6. Production Beta Release & Audit Checklist (§21.6, §32)

| Check Item | Requirement | Verification Status | Notes |
|---|---|---|---|
| Zero LLM Integrations | 100% deterministic rules, local ML | **VERIFIED** | Gemini hooks purged; grammar engine & local dictionaries active |
| Sign Recognition Scope | Disclose recognizable vocabulary | **VERIFIED** | Modal & status pills disclose 28 signs + fingerspelling |
| Avatar Disclosure | State fingerspelling vs full signs | **VERIFIED** | `AvatarPlaybackBadge` active on all 3D canvas views |
| NAT Traversal | Ephemeral TURN credentials | **VERIFIED** | REST `/api/v1/ice-servers` HMAC credentials issued on join |
| Peer Reconnect Policy | Bounded ICE restart ladder | **VERIFIED** | 3 attempts with exponential backoff & honest failure state |
| Host Failover | Dynamic host migration on exit | **VERIFIED** | Earliest peer promoted and broadcast to room |
| Audio Cues (Earcons) | Offline Web Audio call cues | **VERIFIED** | Pure oscillator chimes for join, leave, mute, network loss |
| Screen Reader Harmony | No dual speech collision | **VERIFIED** | `aria-live` coordinated with in-app TTS synthesizer |
| WCAG 2.1 AA | Zero serious/critical axe violations | **VERIFIED** | Automated scan passing across 10 routes in Playwright |
| Consent Gates | Storage/analytics permission gated | **VERIFIED** | Server returns 403 without active consent; client checks scope |
| Beta Feedback Capture | Structured in-app submission | **VERIFIED** | `FeedbackModal` wired on Call ended and Dashboard |
| Admin Readback | Feedback review & monitoring | **VERIFIED** | Authenticated admin review screen on `/app/admin` |

