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
