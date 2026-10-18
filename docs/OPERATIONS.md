# Operations

Deployment, environment, rollback, and backup procedures for the ISL platform.
Written against the real artifacts in this repo (`docker-compose.yml`, the two
`Dockerfile`s, the boot guards in `apps/api/src/config/index.ts`). Anything that
requires live infrastructure is stated as a **procedure to run**, never claimed as
already done (§27: measured, not asserted).

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

## 5. Backup + restore (procedure — NOT yet drilled)

- *Postgres:* scheduled `pg_dump` (or the managed instance's PITR) of the `isl` database.
- *Redis:* holds only ephemeral/rotating state (refresh tokens, jti blocklist, rate-limit
  windows). Losing it logs users out (refresh tokens gone) but never loses durable data;
  it is intentionally not part of the restore-critical set.
- **Status:** the backup/restore *drill* cannot be executed in this environment (no live
  Postgres). It is a required pre-beta checklist item (§21), recorded here as a procedure
  to run and time — not claimed as complete.
