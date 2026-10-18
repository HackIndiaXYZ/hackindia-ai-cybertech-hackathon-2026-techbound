# Development Guide

## Prerequisites

- **Node.js ≥ 20** (developed/tested on Node 22/26).
- **npm** (workspaces). No global tooling required.
- Optional: **Docker** for the real Postgres/Redis stack. Not required to develop.

## First run

```bash
git clone <repo>
cd MissingWhisper
npm install          # installs all workspaces + builds @isl/shared-types (prepare)
npm run dev          # API on :4000, web on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend,
so there is no CORS friction locally.

## Monorepo commands (run from the repo root)

| Command | Effect |
| ------- | ------ |
| `npm run dev` | Start API + web together. |
| `npm run dev:api` / `npm run dev:web` | Start one side only. |
| `npm run build` | Build shared-types → api → web. |
| `npm run typecheck` | `tsc --noEmit` in every workspace. |
| `npm run lint` | ESLint in every workspace. |
| `npm run format` / `format:check` | Prettier write / verify. |
| `npm run test` | Vitest across all workspaces. |
| `npm run migrate` | Apply SQL migrations (Postgres driver only). |
| `npm run clean` | Remove build artifacts. |

Target a single workspace: `npm run test --workspace @isl/web`.

## Configuration

All configuration is validated in `apps/api/src/config` via Zod and exposed as a
frozen typed object. Copy `.env.example` → `.env` to override.

Key switches:

- `DB_DRIVER` = `postgres` \| `fallback` (default `fallback`)
- `REDIS_DRIVER` = `redis` \| `fallback` (default `fallback`)
- `API_HOST` / `API_PORT` (default `0.0.0.0` / `4000`)
- `JWT_SECRET` — **required** to be strong in production
- `CORS_ALLOWED_ORIGINS` — comma-separated allow-list
- `NODE_ENV` — `production` enables the safety guards below

> The API port comes from **`API_PORT`**, not `PORT`.

## The fallback model (important)

Without Postgres/Redis the API uses in-memory drivers so it always runs. They are
**non-persistent** and:

- logged with a clear "NOT for production" warning on boot;
- reported as `degraded` by `/health`;
- **rejected at startup when `NODE_ENV=production`.**

To use real stores locally, either `docker compose up` or set `DB_DRIVER=postgres`
/ `REDIS_DRIVER=redis` with `DATABASE_URL` / `REDIS_URL`, then `npm run migrate`.

## Testing

- **Backend:** Vitest + Supertest. Unit tests for services, API tests against the
  Express app, and signaling/room tests. Run: `npm run test --workspace @isl/api`.
- **Frontend:** Vitest + Testing Library + jsdom. Component + routing tests. Run:
  `npm run test --workspace @isl/web`.

Tests are isolated: stores reset between runs, and DOM/localStorage are cleaned in
the test setup.

## Coding standards

- TypeScript `strict` everywhere; no `// @ts-ignore` without a reason.
- ESM modules; `.js` extensions on relative imports so compiled output runs under
  plain Node.
- Zod-validate every external input (HTTP body/params and Socket.io payloads).
- Errors are `AppError` instances surfaced through the central handler.
- Accessibility is part of "done", not a later pass (see the plan §28).
- Format with Prettier; lint with ESLint (both enforced in CI).

## Commit / branching

Feature work happens on the project branch (`sawanmani`), committed phase by
phase. Never commit secrets; `.env` is git-ignored and CI runs a secret scan.

## Troubleshooting

- **"Cannot find module" for `@isl/shared-types` at runtime** — build it first:
  `npm run build --workspace @isl/shared-types` (or re-run `npm install`).
- **Port already in use** — set `API_PORT` (API) or use `--port` with Vite (web).
- **Health shows `degraded`** — expected in fallback mode; use Docker/Postgres to
  see `ok`.
