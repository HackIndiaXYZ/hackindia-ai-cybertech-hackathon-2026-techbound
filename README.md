# MissingWhisper — ISL Real-Time Communication Platform

Bidirectional communication between **Indian Sign Language (ISL)** users and **hearing speech users** — translating signs to text/speech and speech to captions in real time, with accessibility designed in from the first line of code.

| | |
| --- | --- |
| 🌐 **Web app** | <https://missingwhisper.vercel.app> |
| 🔌 **REST API** | <https://missingwhisper.vercel.app/api/v1> · [health](https://missingwhisper.vercel.app/api/v1/health) |
| 🧠 **ISL engine + demo** | <https://adarshmani-missingwhisper-isl-engine-techbound.hf.space> (HF ZeroGPU) |
| 📚 **Docs** | [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Operations](docs/OPERATIONS.md) |

Both live targets are shipped by CI: a push to `main` runs [deploy-web.yml](.github/workflows/deploy-web.yml)
and [deploy-engine.yml](.github/workflows/deploy-engine.yml) — see [Continuous deployment](#-continuous-deployment).

---

## 🌐 Live Topology

Three hosts, one request path. The browser never talks to the model directly — the
API is the server-side proxy that holds the engine URL and the JWT secret.

```
browser
   │  https://missingwhisper.vercel.app
   ▼
┌─────────────────────────────┐   same-origin fetch    ┌──────────────────────────┐
│ Vercel                      │ ─────────────────────► │ Vercel Function           │
│  • static React SPA (Vite)  │   /api/v1/*            │  Express API (serverless) │
│  • Build Output API v3      │                        │  apps/api/src/serverless  │
└─────────────────────────────┘                        └────────────┬─────────────┘
                                                                    │ HTTPS + WSS
                                                       /predict/landmarks, /format_sentence
                                                       /predict/static, /process_translate
                                                                    ▼
                              ┌────────────────────────────────────────────────────────┐
                              │ HF Space — Adarshmani/missingwhisper-isl-engine-techbound │
                              │ Gradio SDK · ZeroGPU (NVIDIA A10G) · FastAPI + Gradio     │
                              │ two-stream transformer + hierarchical gating models      │
                              └────────────────────────────────────────────────────────┘
```

**Where each concern lives** — worth spelling out, because "the model" and "the
database" are easy to conflate:

- **Models + GPU** → Hugging Face Space. The `.pth` / `.pkl` weights are part of the
  Space image; ZeroGPU attaches an A10G slice per request and the Space sleeps when idle.
- **Application state** (users, sessions, refresh tokens, consent records) → Postgres.
  Neon is the intended host; it is **not** provisioned yet (see [Persistence](#persistence-neon)).
- **Sign recognition pipeline** → `web → API → engine`. The SPA only knows `/api/v1`.

---

## 🔗 Interconnection (environment variables)

### Vercel — project `sawanmanis-projects/missingwhisper`

Set in the dashboard or with `vercel env add <NAME> production`. Values below are the
live production configuration.

| Variable | Value | Consumed by | Effect |
| --- | --- | --- | --- |
| `ISL_ENGINE_BASE_URL` | `https://adarshmani-missingwhisper-isl-engine-techbound.hf.space` | `services/islEngineBridge.ts` | HTTP fallback target for `/predict/landmarks`, `/format_sentence` |
| `ISL_ENGINE_WS_URL` | `wss://adarshmani-missingwhisper-isl-engine-techbound.hf.space/ws/predict` | `services/islEngineBridge.ts` | Preferred streaming path; falls back to HTTP if the socket is not up |
| `NODE_ENV` | `development` | `config/index.ts` | Allows the in-memory DB fallback — see [Persistence](#persistence-neon) |
| `DB_DRIVER` / `DATABASE_URL` | `fallback` / unset | `infra/db` | Non-persistent store; `/api/v1/health` reports `degraded` |
| `REDIS_DRIVER` / `ALLOW_FALLBACK_REDIS` | `fallback` / `true` | `infra/redis` | Non-persistent TTL store (rate limits, locks) |
| `API_AUTH_JWT_SECRET` | random 32-byte secret | `services/authService.ts` | Signs access/refresh tokens |
| `SUPABASE_ISSUER_URL` | `https://elrmbebkezqrgjhmwtvg.supabase.co` | `services/supabaseAuthService.ts` | The API verifies Google provider tokens against this project's JWKS. Unset ⇒ Google sign-in disabled and the button hidden. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,https://missingwhisper.vercel.app` | `app.ts` | Same-origin requests need no entry; this covers local dev + preview |
| `LOG_LEVEL` | `info` | `infra/logger.ts` | Structured JSON logs, visible in `vercel logs` |

The frontend needs **no** variables to boot: `apps/web/src/lib/config.ts` defaults
`API_BASE_URL` to `/api/v1` and `WS_BASE_URL` to `window.location.origin`, so the SPA
and the API share one origin on Vercel. Override with `VITE_API_BASE_URL` only if you
split them apart. Google sign-in additionally needs `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (build-time, public — see [Google sign-in](#-google-sign-in-supabase)).

### Hugging Face Space

Configuration lives in the YAML frontmatter of
[`apps/isl-engine/README.md`](apps/isl-engine/README.md), which is the single source of
truth — the Hub re-applies it on every push, so an API-side value would be silently
overwritten:

```yaml
sdk: gradio            # sdk: docker requires a paid PRO plan; gradio+ZeroGPU is the free path
app_file: app.py
app_port: 7860
python_version: "3.12.12"
hardware: zeroGPU      # free tier; cpu-basic is no longer free for Gradio Spaces
env:
  PYTHONUNBUFFERED: "1"   # else prints vanish when the launcher kills the container
```

No secrets are required. `GEMINI_API_KEY` would optionally enable the LLM sentence
rewrite in `sentence_model.py`; without it the rule-based grammar engine is used.

### The handshakes this contract promises (`node scripts/prod_smoke.mjs`)

Every hop of the diagram above, exercised against a live deployment of this code. Re-run
the probe yourself after any ship — it takes seconds and names the hop that broke:

| Check | Expected |
| --- | --- |
| `GET <space>/health` | 200 — `zerogpu_active: true`, `device: cuda` |
| `POST <space>/predict/landmarks` (30-frame window) | 200 — hierarchical gating + specialist run on the GPU, e.g. `sign: "Night", group: 2, confidence: 0.67` |
| `POST <space>/format_sentence` + `/process_translate` | 200 — rule-based grammar + Hindi output |
| `GET <api>/isl/health` | 200 — `engineAvailable: true`, all models reported loaded |
| `POST <api>/isl/predict/static`, `/format_sentence`, `/translate` | 200 — API → Space proxy path works |
| `POST <api>/auth/signup` → `GET <api>/users/me` | 201 → 200 — JWT round-trip (on the non-persistent fallback store) |
| `GET <api>/nope` | 404 from Express, i.e. the SPA fallback is not swallowing the API |
| `wss://<space>/ws/predict` | **handshake succeeds** — the Space does proxy WebSockets |

The rows through `<api>/nope` are verified live against
`https://missingwhisper.vercel.app`. The `<space>` rows go green as soon as
`Adarshmani/missingwhisper-isl-engine-techbound` exists; a free account may hold only
two ZeroGPU Spaces, so the first `deploy-engine` run can answer **402 Payment Required**
until the owner frees a slot or upgrades — after that the same workflow creates and
populates it with no further action.

So the last row means the *engine* side of real-time streaming is reachable; what is
still missing is a long-lived process for the platform's own Socket.io signaling, which
Vercel functions cannot host (see below).

---

## 🔁 Continuous deployment

A merged push to `main` is the only step. Two GitHub Actions workflows own the two
live targets, each filtered to the paths it actually consumes so a README typo does not
rebuild a GPU image:

| Workflow | Fires on | Does |
| --- | --- | --- |
| [`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml) | `apps/web/**`, `apps/api/**`, `packages/shared-types/**`, `scripts/build_vercel_output.mjs`, `vercel.json`, `package*.json` | `npm ci` → `npm run build:vercel` → `vercel deploy --prebuilt --prod` → `/api/v1/health` probe |
| [`.github/workflows/deploy-engine.yml`](.github/workflows/deploy-engine.yml) | `apps/isl-engine/**`, `scripts/deploy_hf_space.py` | `python scripts/deploy_hf_space.py` — creates the Space if absent, uploads the tracked engine tree, then polls the Hub build until `RUNNING` + `/health` |

Both also accept `workflow_dispatch` for a manual ship, both use a non-cancelling
`concurrency` group (a half-promoted production alias is worse than a queued second
run), and both are pinned to this repository:

```yaml
if: github.repository == 'HackIndiaXYZ/hackindia-ai-cybertech-hackathon-2026-techbound'
```

That pin is deliberate. GitHub does not hand secrets to a workflow run from a fork, and
a fork that somehow had them must still not be able to publish over production — so a
contributor's branch goes live the moment it is merged to `main`, and never before.

### One-time setup (repository admin)

The workflows read four secrets, added under
**Settings → Secrets and variables → Actions → New repository secret**. Nothing else is
needed; there are no long-lived credentials in the repo.

| Secret | Where it comes from | Used by |
| --- | --- | --- |
| `VERCEL_TOKEN` | <https://vercel.com/account/tokens>, scoped to the team that owns the project | deploy-web |
| `VERCEL_ORG_ID` | `vercel project inspect missingwhisper` → `team_…` | deploy-web |
| `VERCEL_PROJECT_ID` | same → `prj_…` | deploy-web |
| `HF_TOKEN` | <https://huggingface.co/settings/tokens>, fine-grained with *write* access to `spaces` | deploy-engine |
| `HF_SPACE_REPO` | *optional* — defaults to `Adarshmani/missingwhisper-isl-engine-techbound` | deploy-engine |

Until those exist the workflows fail fast with an `::error::` naming exactly which one
is missing, before spending a build minute.

### Local runs still work

CI is not the only door. The same two commands the workflows call are documented under
[Redeploy](#-redeploy), and `node scripts/prod_smoke.mjs` reads `PROD_SPACE_URL` /
`PROD_API_URL` so a staging target can be probed without editing the script.

---

## 🚀 Redeploy

```bash
# Frontend + API (Build Output API v3: SPA static + one Express serverless function)
node scripts/build_vercel_output.mjs      # add --api-only to skip the Vite build
vercel deploy --prebuilt --prod

# ISL engine (uploads apps/isl-engine → triggers the Space build, then polls /health)
# Target Space comes from $HF_SPACE_REPO (default: Adarshmani/missingwhisper-isl-engine-techbound)
python scripts/deploy_hf_space.py                 # create/update + upload + watch
python scripts/deploy_hf_space.py --status        # stage + last runtime stderr, no upload
python scripts/deploy_hf_space.py --dry-run       # show the upload set only
python scripts/hf_space_logs.py --tail 200        # real stdout/stderr of the container
python scripts/hf_space_logs.py --build           # pip install / build logs

# Interconnection probe against the live hosts (no local server needed)
node scripts/prod_smoke.mjs
```

`/runtime`'s `errorMessage` only carries a one-line summary (e.g. *"No @spaces.GPU
function detected during startup"*), and that line describes the **launcher's** view,
not the app's failure. `scripts/hf_space_logs.py` reads the actual buffered logs, which
is where the real cause (a port collision, a traceback) shows up.

The Vercel artifact is deliberately prebuilt rather than Git-connected — `vercel link`
auto-detects `services/stt-whisper` and `services/tts-indic` as FastAPI *services* (the
new monorepo "services" model) and refuses a top-level `buildCommand`. So the artifact
is produced by `scripts/build_vercel_output.mjs` and uploaded with `--prebuilt`, and the
thing CI ships is byte-for-byte the thing you can ship by hand.

### Three build traps worth knowing

These cost a full deploy cycle each, so they are encoded in the scripts:

1. **`.vc-config.json` must name the file, not the export.** `"handler": "index.js"`
   makes the launcher pass a real `(req, res)` pair. `"handler": "index.handler"`
   switches it to AWS-Lambda mode, the function receives `({ body, action }, context)`,
   and Express fails later inside `unpipe` with `stream.listeners is not a function`.
2. **ZeroGPU's report is sent from `gr.Blocks.launch()`.** `spaces` monkey-patches
   `launch()` (`spaces/zero/gradio.py::one_launch`) and the wrapper **unregisters
   itself after the first call**, so the report cannot be fired by calling
   `spaces.zero.startup()` directly — it has to go through a real launch.
   `app.py::register_zerogpu_functions()` therefore does one throwaway
   `demo.launch(prevent_thread_lock=True, ssr_mode=False)` on a loopback port before
   mounting. Without it the Space dies with *"No @spaces.GPU function detected during
   startup"*. The `@spaces.GPU` decorator must also sit on the function handed to a
   Gradio event (`predict_btn.click(fn=...)`), not on an inner helper it calls.
3. **Gradio 6's SSR Node proxy steals port 7860.** That throwaway launch starts the
   Node SSR proxy, which keeps the port open even after `demo.close()`; uvicorn then
   exits with `[Errno 98] address already in use`, and the launcher reports the
   unrelated ZeroGPU line above. `GRADIO_SSR_MODE=false` (set before `import gradio`)
   plus explicit `ssr_mode=False` on both `launch()` and `mount_gradio_app()` is what
   makes FastAPI + mounted Gradio serve on the Space's public port.

A fourth, harder constraint: **TensorFlow is deliberately not installed on the Space.**
TF and the CUDA build of `torch` in one process segfault the container (exit 139) during
native-library initialisation, in either import order, even with `TF_ENABLE_ONEDNN_OPTS=0`.

---

## ⚠️ What is live, and what is not

Honest status of the deployed demo:

| Capability | Status | Why |
| --- | --- | --- |
| Gloss → sentence → translation | ✅ live | `islEngineClient.formatSentence` / `translate` → `/api/v1/isl/*` → Space, all verified above |
| Trained hierarchical recognition (30-frame landmark window) | ⚠️ live, but not on the Translator page | The Space answers `POST /predict/landmarks` with real gating + specialist probabilities, and `wss://…/ws/predict` handshakes — but the API exposes no `/isl/predict/landmarks` forward, and the in-call UI streams landmarks over Socket.io signaling, which is not deployed. The webcam surface therefore runs `HeuristicHandShapeClassifier` (`trained = false`), by design |
| Static fingerspelling (A–Z, 1–9) | ⚠️ degraded | The Space does **not** install TensorFlow: TF and CUDA-built `torch` in one process segfault the container (exit 139) in either import order. `isl_rf_model.pkl` (RandomForest) serves the endpoint alone; the NN+RF ensemble stays available in local dev |
| Raw-video recognition inside the engine | ⚠️ degraded | The `mediapipe` wheels installable on Python 3.12 no longer ship the legacy `mp.solutions` API, so `inference_hierarchical.preprocess_video()` refuses politely. Landmark streaming (what the browser sends) is unaffected |
| Accounts / sessions | ⚠️ non-persistent | In-memory fallback driver; state is lost on cold start. See [Persistence](#persistence-neon) |
| Google sign-in | ✅ live (test users only) | Real Google → Supabase → `POST /auth/google` → platform session, verified end-to-end on the deployed site. Two caveats: the Google OAuth consent screen is in **Testing**, so only listed test users can sign in, and account rows still live on the in-memory store, so they vanish on a cold start. See [Google sign-in](#-google-sign-in-supabase) |
| Live WebRTC calls & group rooms | ❌ not deployed | Socket.io signaling needs a long-lived process; serverless functions cannot host it |
| Server-side STT / TTS | ❌ not deployed | `services/stt-whisper` and `services/tts-indic` are not hosted; the browser's Web Speech API covers captions and `SPEECH_PROVIDER=stub` |

### Persistence (Neon)

The API refuses `DB_DRIVER != postgres` when `NODE_ENV=production` — by design, so a
production build can never quietly run on the in-memory store. The live deployment
therefore runs `NODE_ENV=development` until a Postgres database is attached.

Neon is a **Postgres host, not a model host** — the models are on the Space. Wiring it
up takes four steps, and all of them need the account owner (no credentials are stored
in this repo):

```bash
# 1. Create a free Postgres project at https://console.neon.tech → copy the *pooled* URL
vercel env add DATABASE_URL production        # postgres://...-pooler.neon.tech:5432/...
vercel env rm DB_DRIVER production --yes;  vercel env add DB_DRIVER production   # "postgres"
vercel env rm NODE_ENV production --yes;   vercel env add NODE_ENV production    # "production"
vercel deploy --prebuilt --prod              # first invocation runs migrations
```

`render.yaml` is the alternative for full signalling: a single persistent web service
gets Socket.io back, and pairs with Neon + Upstash for `DB_DRIVER=redis`/`postgres`.
Supabase can host the database too — it is plain Postgres, so `DATABASE_URL` from the
Supabase dashboard ("Connect" → pooled connection string) works with `DB_DRIVER=postgres`
and `npm run migrate` unchanged.

---

## 🔑 Google sign-in (Supabase)

Sign-in uses **real Google identities**, not made-up emails. Supabase Auth is the
identity provider; the platform keeps its own session model:

```
browser ──Google OAuth──▶ Supabase Auth ──provider token──▶ POST /api/v1/auth/google
                                                              │ verify against project JWKS
                                                              │ (RS256, iss, aud, email_verified)
                                                              ▼
                                                    first-party access + refresh token
                                                    (existing JWT / rotation / revocation)
```

Supabase is never a session authority: a leaked anon key cannot forge an authenticated
API request, and every other endpoint is untouched. Full contract in
[docs/API.md](docs/API.md#authentication), rationale in
[docs/DECISIONS.md](docs/DECISIONS.md) (ADR-043).

### What is already in the code

- `POST /auth/google` + `GET /auth/google/status` capability probe (`apps/api`)
- JWKS verification with a 10-minute key cache, algorithm-confusion and issuer checks
- First-touch account provisioning (verified email required, no password set, provider
  display name wins), and a Google-only account cannot password-login
- `Continue with Google` as the primary path on Login and Signup; the email form stays
  reachable for pre-existing accounts and is the default whenever no provider is live
- `/auth/callback` landing route that redeems the redirect and scrubs the token from the URL

### Live configuration (what is set where)

| Where | Value / state |
| --- | --- |
| Supabase project | `elrmbebkezqrgjhmwtvg` (free plan) — Auth provider **Google enabled**; its own Postgres is not yet used by the API |
| Google OAuth client | existing *Web application* client, authorized redirect `https://elrmbebkezqrgjhmwtvg.supabase.co/auth/v1/callback` |
| Supabase → URL Configuration | Site URL `https://missingwhisper.vercel.app`; redirects `…/auth/callback` for production **and** `http://localhost:5173/auth/callback` |
| Vercel (Production) | `SUPABASE_ISSUER_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Local dev | the same three values in `apps/api/.env` + `apps/web/.env.local` (gitignored) |

Two claim shapes that the live provider taught us the hard way, now handled by
`supabaseAuthService.ts` and covered by unit tests: the token `iss` is
`https://<ref>.supabase.co/auth/v1` (not the bare project URL), and the verification flag
arrives as `user_metadata.email_verified` (not a top-level `email_verified`). Both are
checked leniently across the known Supabase shapes, still fail-closed when absent.

### Remaining limits (honest)

1. **Consent screen is in “Testing”.** Only Google addresses listed as test users can sign
   in. To open it up: Google Cloud → Google Auth Platform → **Publish app** (the branding
   currently reads “Vizzy”, from the reused OAuth client — worth renaming to MissingWhisper).
2. **Accounts are still non-persistent.** `DB_DRIVER` remains `fallback`; sign-in works but
   rows disappear on cold start. Pointing `DATABASE_URL` at this Supabase project's pooled
   Postgres plus `DB_DRIVER=postgres` and `npm run migrate` is the one remaining step.
3. **CI ships would drop Google sign-in until repo secrets exist.** `deploy-web.yml` runs
   `npm run build:vercel`, i.e. Vite builds *outside* Vercel, so `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` are not injected from the Vercel project. They need matching
   GitHub Actions secrets — which the current contributor role cannot add (`push: true`,
   `admin: false`). Until then, **a push to `main` re-ships production without the Google
   button**; the live site was deployed with `vercel deploy --prebuilt --prod` from a
   checkout carrying `apps/web/.env.local`. Either grant/add the secrets or check the two
   public client-side values in before relying on the workflow.

`OAUTH_DEV_MODE` / `OAUTH_DEV_SECRET` exist only so a local browser can exercise the
callback → exchange → session path without any provider; the API **refuses to boot in
production** with them set, and the button degrades to hidden rather than dead. They are
currently unset locally, so `GET /auth/google/status` reports `mode: "supabase"`.

---

## 🌟 Product Modes

1. **Real-Time Communication** — live two-way ISL ⇄ speech video call with WebRTC, real-time MediaPipe sign detection, and speech translation.
2. **Standalone Translator** — sign → text/speech and speech → text translation studio without needing an active call.
3. **3D Avatar & Signify Engine** — 3D sign language playback avatar with fingerspelling and sign animation library.
4. **Group Communication** — multi-participant captioned rooms with active-speaker detection and live transcriptions.

---

## 🏗️ Architecture at a Glance

Three cooperating layers (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):

- **Real-time (WebRTC + Socket.io signaling)** — carries live audio, video, and data channels.
- **Computer Vision & Deep Learning (MediaPipe + ISL Engine)** — signs → text using two-stream transformer & hierarchical neural models.
- **Speech & Conversion (Whisper-style STT / TTS)** — speech → captions and text → natural speech audio.

---

## 📁 Repository Layout

```
apps/
  api/          Express + Socket.io API & WebRTC signaling server (+ serverless entrypoint)
  isl-engine/   PyTorch deep learning ISL recognition engine & inference server
  signify/      3D sign language avatar animation viewer & fingerspelling library
  web/          React + Vite + TypeScript web application (claymorphism, a11y-first)
packages/
  shared-types/ Typed contracts (domain models, REST DTOs, real-time events)
infra/          Terraform IaC and container configurations
docs/           Architecture, API, Development, Security, Decisions, Operations
scripts/        Deploy tooling (Vercel output, HF Space), budget auditing, converters
```

---

## 🚀 Quick Start (Local, Zero Infrastructure)

Requirements: **Node.js ≥ 20** and **Python ≥ 3.10** (for isl-engine). Postgres/Redis/Docker are **optional** — the API ships with non-persistent in-memory fallback drivers so it runs anywhere immediately.

```bash
npm install            # installs workspaces and builds shared-types
cp .env.example .env   # optional; sensible defaults work out of the box

# Run backend (http://localhost:4000) and frontend (http://localhost:5173)
npm run dev
```

Then visit the health check: <http://localhost:4000/api/v1/health>.

To point the local API at the deployed engine instead of a local Python process, set
`ISL_ENGINE_BASE_URL=https://adarshmani-missingwhisper-isl-engine-techbound.hf.space` in `.env`.

### Available Scripts

| Command                   | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `npm run dev`             | Start API + web together                            |
| `npm run dev:api`         | Start API backend only                              |
| `npm run dev:web`         | Start Web frontend only                             |
| `npm run dev:isl`         | Start the local ISL engine                          |
| `npm run build`           | Build all workspaces (shared-types → api → web)     |
| `npm run build:vercel`    | Emit `.vercel/output` (SPA + serverless API)        |
| `npm run deploy:hf-space` | Upload `apps/isl-engine` to the ZeroGPU Space       |
| `npm run lint`            | ESLint across workspaces                            |
| `npm run typecheck`       | `tsc --noEmit` across workspaces                    |
| `npm run test`            | Run all tests (Vitest)                              |
| `npm run migrate`         | Apply SQL migrations (requires Postgres driver)     |

---

## 🐳 Running with Docker (Postgres + Redis)

```bash
docker compose up --build
# web → http://localhost:8080, api → http://localhost:4000
```

In production mode, the API requires real `DB_DRIVER=postgres` and `REDIS_DRIVER=redis` with a configured `API_AUTH_JWT_SECRET` — see [docs/SECURITY.md](docs/SECURITY.md).

---

## 📚 Documentation

- [Architecture Guide](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Security & Privacy](docs/SECURITY.md)
- [Decision Log](docs/DECISIONS.md)
- [Performance & Benchmarks](docs/PERFORMANCE.md)
- [Accessibility Audit](docs/ACCESSIBILITY-AUDIT.md)
- [Operations & Deployment](docs/OPERATIONS.md)
- [ISL Engine (per-service notes)](apps/isl-engine/README.md)

---

## ♿ Accessibility (A11y First)

WCAG 2.1 AA is an integral design requirement: full keyboard navigation, visible focus rings, ARIA semantic markup, non-color status cues, reduced-motion options, high-contrast support, live captions, and adjustable UI scales. See [docs/ACCESSIBILITY-AUDIT.md](docs/ACCESSIBILITY-AUDIT.md).

---

*Built for [HackIndia AI × Cybertech Hackathon 2026 — TechBound](https://github.com/HackIndiaXYZ/hackindia-ai-cybertech-hackathon-2026-techbound).*
