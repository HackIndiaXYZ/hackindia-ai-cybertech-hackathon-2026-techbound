# Browser Support Matrix

Status: **current as of Phase 4D.** This is the support contract the app targets
and — crucially — an honest account of what is *verified* versus what is merely
*intended*. Anything not marked "verified" has not been executed on that browser
in CI or locally; it is a design target based on the web APIs used.

Related: the E2E harness lives in [`apps/web/e2e`](../apps/web/e2e) and is driven
by [`apps/web/playwright.config.ts`](../apps/web/playwright.config.ts). The
automated accessibility gate is documented in
[docs/ACCESSIBILITY-AUDIT.md](./ACCESSIBILITY-AUDIT.md).

## 1. Target matrix

| Browser | Engine | Target level | What is actually verified |
|---|---|---|---|
| Chrome (desktop) | Blink | **Tier 1 — supported** | E2E critical path + axe-core a11y run in Chromium (locally and in CI). This is the only browser with automated evidence today. |
| Edge (desktop) | Blink (Chromium) | **Tier 1 — expected** | *Not* run in E2E. Shares the Chromium/Blink feature surface with Chrome, so support is expected, but it is an assertion, not a measured result. |
| Firefox | Gecko | **Tier 2 — best-effort** | *Not* run anywhere. WebRTC/getUserMedia and the WebGL paths are expected to work; **Web Speech `SpeechRecognition` is not available in Firefox** — the app must degrade honestly there (see §3). |
| Safari (macOS/iOS) | WebKit | **Tier 2 — best-effort** | *Not* run anywhere. `SpeechRecognition` is unavailable on most Safari versions; codec support (H.264) differs. Feature detection, not user-agent sniffing, decides what the UI offers. |
| Mobile browsers | — | **Not yet targeted** | No responsive/touch E2E exists. Listed as an open gap, not a claim. |

The CI `e2e` job installs and runs **Chromium only**
(`npx playwright install --with-deps chromium`, single `projects` entry). Adding
Firefox/WebKit projects is a deliberate future step, not something claimed here.

## 2. Feature dependencies (why the tiers differ)

| Capability | API used | Support notes |
|---|---|---|
| Live call media | `navigator.mediaDevices.getUserMedia` | Broad across all modern engines; requires a **secure context** (HTTPS or `localhost`). |
| Peer-to-peer audio/video | `RTCPeerConnection` (WebRTC) | Broad. Codec negotiation (VP8/H.264) varies by browser; same-machine loopback (what the opt-in mesh test exercises) is reliable, real cross-network calls need STUN and usually a TURN relay under restrictive NATs. |
| Speech → text | Web Speech `SpeechRecognition` | **Chromium-only in practice.** Firefox and Safari do not implement it. The app feature-detects and hides/disables speech capture rather than faking it. |
| Text → speech | `speechSynthesis` | Broad, but voices/languages differ; availability is feature-detected. |
| ISL gesture recognition | MediaPipe Hands (WASM + WebGL) | Runs wherever WASM and WebGL2 work; performance varies on low-end/mobile. |
| Avatar rendering | Babylon.js (WebGL) | Needs WebGL; headless CI GPU variance is exactly why the WebGL screens are excluded from the automated a11y scan (see the audit doc). |

## 3. Graceful degradation (the honesty rule)

The plan's standing rule is that a missing capability is **labeled, never faked**.
Concretely:

- Call controls are gated on real feature detection: the "Create call room"
  action is disabled unless `isWebRtcSupported()` **and** `isMediaSupported()`
  report true in the actual browser. Unsupported browsers see a disabled control,
  not a broken one.
- Web Speech (`SpeechRecognition`) presence decides whether live speech capture
  is offered at all. On Firefox/Safari the speech path is not silently presented
  as working — the pipeline reports the stub/unsupported provider state resolved
  by the server, and Settings › Capabilities & providers surfaces that raw status.
- Nothing in the UI claims a trained ISL model or a browser capability the current
  engine lacks.

## 4. What is verified today (measured, local Chromium run)

From the last `npm run test:e2e` execution on Chromium (Desktop Chrome):

- **7 passed, 1 skipped, 0 failed.**
- Covered end-to-end in a real browser against a real API over loopback: signup →
  authenticated dashboard, login error surfacing (§29 accessible error), the
  consent switch round-tripping to the server, provider badges rendering, and a
  full mocked-media call (create room → join → mute/unmute reflecting
  `aria-pressed` → end call).
- The **two-peer WebRTC mesh** spec is **skipped** unless `RUN_MESH=1`, per the
  plan's note that real multi-peer media is environment-specific. It has not been
  executed as part of the standard gate.
- The **a11y axe-core scan** passed on the scanned routes; findings and the
  explicitly-unverified manual items are recorded in
  [docs/ACCESSIBILITY-AUDIT.md](./ACCESSIBILITY-AUDIT.md).

## 5. Open gaps (not yet true, stated plainly)

- No automated Firefox/WebKit/mobile runs — their rows are targets, not evidence.
- Edge is unverified despite sharing the Blink engine.
- The mesh path and real cross-device WebRTC (with TURN) are untested in this
  harness.
- WebGL screens (avatar / pipeline / standalone translator) are excluded from the
  automated a11y scan and have no browser-specific verification yet.
- **No in-browser "history" flow yet.** The plan's critical path ends at
  *history*, but the app has no dedicated History screen to drive (the standalone
  translator keeps only a session-local list). The persist → readback contract is
  therefore verified at the **API layer** — `postgres.integration.test.ts` and the
  `misc.routes` unit tests prove transcripts/messages/consent round-trip — not
  through a browser flow. The E2E gate honestly stops at end-of-session.
- **In-call captions + moderation need two peers**, which the default (single-
  context) gate does not exercise; they are covered only by the opt-in `RUN_MESH`
  spec and the WebRTC/socket unit suites.
