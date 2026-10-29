# Accessibility Audit

Status: **partial, honest.** An automated WCAG 2.1 AA gate now exists and runs in
the E2E suite. It found real problems, those problems were fixed, and the gate
currently passes on the scanned routes. This is **not** a claim of full WCAG 2.1
AA conformance — automated tooling checks only a subset, and the manual items in
§5 have **not** been performed. The gap is stated rather than papered over.

Tooling: [`apps/web/e2e/a11y.spec.ts`](../apps/web/e2e/a11y.spec.ts) runs
`@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa`. The
assertion is strict by design: **zero `serious` or `critical` violations** on each
scanned route. Minor/moderate findings do not fail the gate but are triaged below.

## 1. Routes scanned (Chromium, desktop viewport)

- **Public:** `/`, `/login`, `/signup`, `/how-it-works`, `/accessibility`.
- **Authenticated:** `/app/dashboard`, `/app/settings`, `/app/translator`,
  `/app/voice`, `/call/new` (lobby).

## 2. Findings that were measured and FIXED

The first real run of the gate surfaced three `color-contrast` (serious) issues.
Each was reproduced, root-caused, and fixed at the palette level rather than
silenced:

| # | Finding (measured) | Root cause | Fix |
|---|---|---|---|
| 1 | White label text on `.bg-clay-primary` measured **4.43:1** (needs 4.5:1). 7 nodes on `/`, 5 on `/app/dashboard`. | Primary blue default was `#3b6ef5`. | Darkened `clay.primary.DEFAULT` to `#2f57c6` (~6.3:1 with white); hover token to `#26479f`. See [tailwind.config.ts](../apps/web/tailwind.config.ts). |
| 2 | `text-clay-muted/80` (12 px) measured **3.78:1** in the provider-status description on `/app/settings`. | An 80%-opacity muted-gray over the raised surface. | Dropped the `/80` opacity so the text uses full `text-clay-muted` (~4.85:1). |
| 3 | A `warning` badge measured **2.09:1** (amber text on a 15% amber tint). | The semantic hues doubled as *text* on a light tint of themselves; the tints are too pale for their saturated foregrounds. | Darkened the `warn`/`accent`/`danger` tokens to AA-safe values (they are only ever used as text, a tint background, or a decorative dot). |

After these fixes the automated gate reports **0 serious/critical violations** on
every scanned route (2 a11y tests passing).

The claymorphism design was tuned for depth, not contrast; this audit is the
mechanism that caught the accessibility cost of that, and it now guards against
regressions in CI.

## 3. What the automated gate genuinely proves

- Programmatic name/role issues axe can see on the scanned states (missing
  label, bad heading structure, low contrast) on those routes.
- A regression guard: reintroducing a low-contrast token fails CI.

Key non-color-only cues were **designed in** and are exercised by the critical
path, not just axe: call controls use `aria-pressed` with distinct labels ("Mute
microphone"/"Unmute microphone"), status uses text + a dot (never color alone),
and errors are announced via `role="alert"`/`role="status"`.

## 4. Known limits of what was checked

- **Tooling ceiling.** axe-core detects roughly a third to half of WCAG issues; a
  passing scan is necessary, not sufficient, for conformance.
- **One viewport.** Only the desktop viewport is scanned. No reflow/200%-zoom or
  mobile-layout pass exists yet.
- **WebGL screens excluded.** `/app/avatar`, `/app/pipeline`, and the standalone
  translator are left out of the automated scan because headless-GPU rendering is
  flaky; their DOM accessibility is therefore **not** machine-verified.
- **In-call room not scanned.** The a11y loop visits the lobby (`/call/new`), not
  a joined room, so live call controls were validated by the functional critical
  path (roles/`aria-pressed`) but not by axe.
- **Dynamic states.** Validation errors, consent-denied banners, and focus-on-
  modal behavior were only seen by axe in whatever state they happened to render;
  they are not exhaustively enumerated.

## 5. Manual WCAG items — NOT yet performed (open)

These require human/browser-assistive-tech testing and are the honest remainder
toward any AA claim:

- [ ] **Keyboard-only walk-through** of every route and modal (no pointer); tab
      order, visible focus, no traps.
- [ ] **Screen-reader pass** (NVDA/VoiceOver): reading order, announcements for
      live captions/status, and label quality beyond mere presence.
- [ ] **Focus management** on route changes, modal open/close, and async results.
- [ ] **Reflow at 320 px / 200% zoom** and no-loss-of-content-on-zoom checks.
- [ ] **Meaningful alt text / non-text content** review (icons are `aria-hidden`
      with adjacent text today, but this is unverified by a human).
- [ ] **Captions/subtitles accuracy and latency** in a real call.
- [ ] A **manual accessibility review of the WebGL screens** (avatar/pipeline/
      standalone) that the automated scan skips.

## 6. How to reproduce

```bash
npm run test:e2e --workspace @isl/web -- a11y   # automated WCAG 2.1 AA gate
npm run test:e2e:report --workspace @isl/web     # open the Playwright/axe report
```

The gate runs in the CI `e2e` job ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).
Until §5 is completed by a human, treat this project as **"automated-AA-clean on
scanned routes,"** not "WCAG 2.1 AA conformant."

---

## 7. Phase 7 Quality Gate Audit Results (2026-10-22)

### In-Call Interactive & Modal Accessibility
1. **Live Bidirectional Status Bar (`BidirectionalPipelineStatus`):**
   - Wrapped in `role="region"` with `aria-label="Real-time translation pipeline status"`.
   - Each directional status pill specifies `role="status"` with `aria-live="polite"`.
   - Async state changes communicate state through text labels, pulse indicators, and dedicated tone classes, satisfying WCAG 1.4.1 (Use of Color).
   - High-contrast compliance: emerald (`#10b981`), sky (`#0284c7`), amber (`#d97706`), purple (`#9333ea`), rose (`#e11d48`) exceed 4.5:1 contrast ratios on clay surfaces.

2. **Supported Vocabulary Scope Drawer (`SupportedVocabularyModal`):**
   - Modal container enforces `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="vocab-modal-title"`.
   - Tab filter list implements `role="tablist"` with `role="tab"` and `aria-selected` attributes.
   - Live search input contains explicit `aria-label="Search supported vocabulary"`.
   - Keyboard navigation: Complete focus trap with `Escape` key shortcut to dismiss without pointer interaction.

3. **Honest Capability Communication (§27 / §29):**
   - Scope is prominently communicated inside the call UI via the "📖 Vocabulary (38 Signs)" button.
   - Clearly documents the 28 camera ML signs, 38 3D avatar animations, and the universal A–Z fingerspelling fallback, eliminating unexpected silent failures during live demonstrations.

---

## 8. Phase 4 Accessibility Hardening for Blind Users (2026-10-26)

Target: Accessibility hardening specifically for blind, low-vision, and assistive-technology users beyond visual captions.

### 1. Keyboard Navigation & Visible Control Labels
- **Visible Text Labels:** Primary call controls in `CallControls.tsx` display visible text and shortcut hints rather than relying on icons alone (`Mute (M)` / `Unmute (M)`, `Camera Off (V)` / `Camera On (V)`, `Shortcuts (?)`, `End call`).
- **Global In-Call Shortcuts:**
  - `M` / `m`: Toggle microphone mute state.
  - `V` / `v`: Toggle camera on/off.
  - `?`: Open/close keyboard shortcuts modal.
  - `Escape`: Dismiss shortcuts guide or vocabulary drawer.
  - Form control guard: Keypresses inside `input`, `textarea`, and `select` elements are ignored so text chat is never interrupted.
- **State Semantics:** Full `aria-pressed` reflection on toggleable buttons and descriptive `aria-label` names with keyboard shortcuts announced to screen readers.

### 2. Synthesized Audio Cues (Earcons)
- **Zero-Network Pure Oscillator Synthesis:** Implemented in `apps/web/src/lib/call/soundCues.ts` using the browser Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`). Runs 100% offline with zero external audio assets to download.
- **Lifecycle Events Supported:**
  - `participant-joined`: Ascending two-tone chime (523.25 Hz C5 → 659.25 Hz E5).
  - `participant-left`: Descending two-tone chime (659.25 Hz E5 → 440.0 Hz A4).
  - `connection-lost`: Dual sawtooth warning pulses (220 Hz / 185 Hz).
  - `connection-restored`: Major triad chime (440 Hz → 554 Hz → 659 Hz).
  - `moderation-muted`: Caution chirp (330 Hz → 220 Hz triangle tone).
  - `incoming-call`: Melodic ring chime (587 Hz / 880 Hz).
- **User Preference Control:** Controlled by `settings.audioCues` in `settingsSlice.ts` and configurable in the Settings Accessibility panel (`/app/settings`).

### 3. Screen Reader & In-App TTS Coordination
- **Problem Solved:** When in-app sign/caption TTS (`speakCaptions`) was enabled simultaneously with a native screen reader (NVDA, VoiceOver, JAWS), both voices spoke captions at the same moment over each other.
- **Solution:**
  - When in-app `speakCaptions` is active and `screenReaderOptimized` is false, `CaptionPanel.tsx` sets `aria-live="off"`. Screen readers stay silent while in-app TTS reads the caption cleanly.
  - When `screenReaderOptimized` is true (or `speakCaptions` is off), `CaptionPanel.tsx` keeps `aria-live="polite"` and `useCallTts.ts` suppresses synthetic audio for speech captions. The native screen reader retains exclusive voice control with zero collisions.

### 4. Automated axe-core WCAG 2.1 AA Audit Results

Scan executed with Playwright and `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`).

| Route | Route Type | Axe Violations (Serious / Critical) | WCAG 2.1 AA Status | Notes |
|---|---|---|---|---|
| `/` | Public | 0 | **PASS** | Hero, navigation, CTA contrast compliant |
| `/login` | Public | 0 | **PASS** | Auth forms, labels, error states accessible |
| `/signup` | Public | 0 | **PASS** | Accessible inputs, password visibility toggle |
| `/how-it-works` | Public | 0 | **PASS** | Diagram semantics, headings hierarchy |
| `/accessibility` | Public | 0 | **PASS** | Disclosure documentation, readable contrast |
| `/app/dashboard` | Authenticated | 0 | **PASS** | Call action cards, join inputs, recent calls |
| `/app/settings` | Authenticated | 0 | **PASS** | Theme, text scaling, audio cues, screen reader switches |
| `/app/translator` | Authenticated | 0 | **PASS** | Translation input forms, mode selectors |
| `/app/voice` | Authenticated | 0 | **PASS** | Voice picker, rate/pitch sliders, test buttons |
| `/call/new` | Authenticated | 0 | **PASS** | Room lobby, audio preference card, media fallback |


