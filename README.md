# hackindia-ai-cybertech-hackathon-2026-techbound
Hackathon team repository for TechBound: [https://github.com/HackIndiaXYZ/hackindia-ai-cybertech-hackathon-2026-techbound](https://github.com/HackIndiaXYZ/hackindia-ai-cybertech-hackathon-2026-techbound)


---

# MissingWhisper — ISL Real-Time Communication Platform

Bidirectional communication between **Indian Sign Language (ISL)** users and **hearing speech users** — translating signs to text/speech and speech to captions in real time, with accessibility designed in from the first line of code.

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
  api/          Express + Socket.io API & WebRTC signaling server
  isl-engine/   PyTorch deep learning ISL recognition engine & inference server
  signify/      3D sign language avatar animation viewer & fingerspelling library
  web/          React + Vite + TypeScript web application (claymorphism, a11y-first)
packages/
  shared-types/ Typed contracts (domain models, REST DTOs, real-time events)
infra/          Terraform IaC and container configurations
docs/           Architecture, API, Development, Security, Decisions, Operations
scripts/        Developer tooling, budget auditing, animation converters
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

### Available Scripts

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Start API + web together                            |
| `npm run dev:api`    | Start API backend only                              |
| `npm run dev:web`    | Start Web frontend only                             |
| `npm run build`      | Build all workspaces (shared-types → api → web)     |
| `npm run lint`       | ESLint across workspaces                            |
| `npm run typecheck`  | `tsc --noEmit` across workspaces                    |
| `npm run test`       | Run all tests (Vitest)                              |
| `npm run migrate`    | Apply SQL migrations (requires Postgres driver)     |

---

## 🐳 Running with Docker (Postgres + Redis)

```bash
docker compose up --build
# web → http://localhost:8080, api → http://localhost:4000
```

In production mode, the API requires real `DB_DRIVER=postgres` and `REDIS_DRIVER=redis` with a configured `JWT_SECRET` — see [docs/SECURITY.md](docs/SECURITY.md).

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

---

## ♿ Accessibility (A11y First)

WCAG 2.1 AA is an integral design requirement: full keyboard navigation, visible focus rings, ARIA semantic markup, non-color status cues, reduced-motion options, high-contrast support, live captions, and adjustable UI scales. See [docs/ACCESSIBILITY-AUDIT.md](docs/ACCESSIBILITY-AUDIT.md).
