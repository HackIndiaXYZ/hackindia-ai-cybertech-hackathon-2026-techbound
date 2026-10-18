import { Card, Button, Badge, StatusIndicator, LoadingState, ErrorState } from '../components/ui/index.js';
import { useAvatar } from '../features/useAvatar.js';
import {
  PLACEHOLDER_GESTURE_REGISTRY,
  type AvatarLoaderStatus,
} from '../lib/avatar/index.js';

/** Honest, non-color-only label + tone for each loader state (§2). */
const loaderMeta: Record<AvatarLoaderStatus, { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  idle: { tone: 'neutral', label: 'Not initialized' },
  loading: { tone: 'info', label: 'Loading avatar…' },
  loaded: { tone: 'success', label: 'GLB avatar loaded' },
  placeholder: { tone: 'warning', label: 'Development placeholder active' },
  'asset-missing': { tone: 'warning', label: 'No GLB found — placeholder active' },
  error: { tone: 'danger', label: 'Avatar failed to load' },
};

/**
 * Standalone Babylon.js avatar surface (plan §15 Phase 2D). Renders the avatar
 * viewport, an explicit loader/placeholder status, a deterministic gesture /
 * sequence console and a live measured-FPS readout. The visible avatar is a
 * clearly-labelled development placeholder, NOT a real ISL signer, and its
 * motions are generic development animations with no ISL meaning (§10, §16).
 */
export function Avatar() {
  const avatar = useAvatar();
  const meta = loaderMeta[avatar.loaderStatus];
  const ready = avatar.phase === 'ready';

  const gestureIds = Object.keys(PLACEHOLDER_GESTURE_REGISTRY);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-clay-ink">3D Avatar</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusIndicator tone={meta.tone} label={meta.label} />
          {ready && avatar.rig?.isPlaceholder && (
            <Badge tone="warning">Development placeholder — not a real ISL signer</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-clay bg-clay-soft" style={{ aspectRatio: '3 / 4' }}>
            <canvas
              ref={avatar.canvasRef}
              className="absolute inset-0 h-full w-full"
              aria-label="3D avatar viewport"
            />
            {avatar.phase === 'initializing' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingState label="Starting the 3D engine…" />
              </div>
            )}
            {(avatar.phase === 'unsupported' || avatar.phase === 'error') && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <ErrorState
                  title={avatar.phase === 'unsupported' ? '3D not supported here' : 'Avatar unavailable'}
                  message={avatar.error ?? 'The avatar could not be initialized.'}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={avatar.playSampleGesture} disabled={!ready}>
              Play sample gesture
            </Button>
            <Button variant="secondary" onClick={avatar.playSampleSequence} disabled={!ready}>
              Play sample sequence
            </Button>
            <Button variant="ghost" onClick={avatar.stop} disabled={!ready}>
              Stop
            </Button>
            <Button variant="ghost" onClick={avatar.reset} disabled={!ready}>
              Reset
            </Button>
          </div>
          <p className="text-xs text-clay-muted">
            Sample triggers are deterministic development controls (§8). They animate the rig only — they do not
            represent ISL words or phrases, and no translation is performed here.
          </p>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-clay-ink">Performance</h2>
            {avatar.perf.fps === null ? (
              <p className="text-sm text-clay-muted">{ready ? 'Measuring frame rate…' : '—'}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-clay-muted">Measured FPS</dt>
                  <dd className="font-semibold text-clay-ink">{avatar.perf.fps.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-clay-muted">Frame samples</dt>
                  <dd className="font-semibold text-clay-ink">{avatar.perf.samples}</dd>
                </div>
              </dl>
            )}
            <p className="text-xs text-clay-muted">
              FPS is measured from the live render loop, never claimed (§12). The 30+ FPS target is only meaningful
              on supported hardware in a real browser.
            </p>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-clay-ink">Queue status</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-clay-muted">Playback</dt>
                <dd className="font-semibold text-clay-ink">{avatar.queue.state}</dd>
              </div>
              <div>
                <dt className="text-clay-muted">Queued commands</dt>
                <dd className="font-semibold text-clay-ink">{avatar.queue.length}</dd>
              </div>
              <div>
                <dt className="text-clay-muted">Current</dt>
                <dd className="font-semibold text-clay-ink">{avatar.queue.current?.animationClipId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-clay-muted">Is placeholder</dt>
                <dd className="font-semibold text-clay-ink">{avatar.queue.current ? String(avatar.queue.current.isPlaceholder) : '—'}</dd>
              </div>
            </dl>
            {avatar.queue.queued.length > 0 && (
              <ul className="flex flex-wrap gap-1 text-xs text-clay-muted">
                {avatar.queue.queued.map((cmd, i) => (
                  <li key={`${cmd.gestureId}-${i}`} className="rounded-clay bg-clay-soft px-2 py-0.5">
                    {cmd.animationClipId}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-clay-ink">Authentic ISL Signs (Words & Expressions)</h2>
          <p className="text-sm text-clay-muted">
            Indian Sign Language gestures animated on the Mixamo-rigged 3D avatar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gestureIds
            .filter((id) => id.startsWith('sign-') && id.length > 6)
            .map((id) => (
              <Button key={id} size="sm" variant="primary" onClick={() => avatar.playGesture(id)} disabled={!ready}>
                {id.replace('sign-', '').toUpperCase()}
              </Button>
            ))}
        </div>

        <div className="flex flex-col gap-1 pt-2">
          <h2 className="text-lg font-semibold text-clay-ink">ISL Alphabet Fingerspelling (A – Z)</h2>
          <p className="text-sm text-clay-muted">
            Standard Indian Sign Language two-handed fingerspelling for names and loanwords.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gestureIds
            .filter((id) => id.startsWith('sign-') && id.length === 6)
            .map((id) => (
              <Button key={id} size="sm" variant="secondary" onClick={() => avatar.playGesture(id)} disabled={!ready}>
                {id.replace('sign-', '').toUpperCase()}
              </Button>
            ))}
        </div>

        <div className="flex flex-col gap-1 pt-2">
          <h2 className="text-sm font-semibold text-clay-muted">Development Motions</h2>
          <p className="text-xs text-clay-muted">
            Basic motion primitives for renderer verification.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gestureIds
            .filter((id) => !id.startsWith('sign-') && !id.startsWith('fingerspell-'))
            .map((id) => (
              <Button key={id} size="sm" variant="ghost" onClick={() => avatar.playGesture(id)} disabled={!ready}>
                {id}
              </Button>
            ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-clay-ink">About this foundation</h2>
        <p className="text-sm text-clay-muted">
          Phase 2D is the avatar/animation foundation, not real ISL signing or translation (§16). Babylon is
          lazy-loaded only for this route, and the placeholder validates the renderer, named-joint rig, animation
          queue, command/event integration and measured FPS. A real rigged GLB dropped into{' '}
          <code>/assets/avatars</code> loads through the same <code>AvatarLoader</code> without changing any other
          layer, and a GLB whose bones fail validation is reported rather than animated broken. The avatar uses no
          camera or microphone; commands carry animation instructions only, never raw media (§15).
        </p>
      </Card>
    </div>
  );
}
