import { useState } from 'react';
import { Card, Button, Badge, StatusIndicator, LoadingState, ErrorState, Input } from '../components/ui/index.js';
import { useAvatar } from '../features/useAvatar.js';
import { useTranslation } from '../features/useTranslation.js';
import {
  GestureMapper,
  PLACEHOLDER_GESTURE_REGISTRY,
  humanizeClipId,
  type AvatarLoaderStatus,
} from '../lib/avatar/index.js';
import { AvatarPlaybackBadge } from '../components/avatar/AvatarPlaybackBadge.js';

/** Honest, non-color-only label + tone for each loader state. */
const loaderMeta: Record<AvatarLoaderStatus, { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  idle: { tone: 'neutral', label: 'Not initialized' },
  loading: { tone: 'info', label: 'Loading avatar…' },
  loaded: { tone: 'success', label: 'GLB avatar loaded' },
  placeholder: { tone: 'warning', label: 'Procedural rig active' },
  'asset-missing': { tone: 'warning', label: 'No GLB found — procedural rig' },
  error: { tone: 'danger', label: 'Avatar failed to load' },
};

/**
 * Standalone Babylon.js avatar surface. Renders the avatar viewport, an explicit
 * loader status, a sentence box that drives the real translation → gesture →
 * queue path, a deterministic gesture console and a live measured-FPS readout.
 *
 * The controls are split by what actually backs them: word signs and
 * fingerspelling letters have real bone keyframes in the sign registry, while
 * the remaining gestures are generic development motion and are labelled as
 * such — the page never claims ISL meaning for a gesture that has no keyframes
 * behind it.
 */
export function Avatar() {
  const avatar = useAvatar();
  const translation = useTranslation();
  const [signed, setSigned] = useState<string | null>(null);
  const [mapper] = useState(() => new GestureMapper());
  const meta = loaderMeta[avatar.loaderStatus];
  const ready = avatar.phase === 'ready';

  /**
   * Translate a sentence with the same rule-based glossary the pipeline page
   * uses, then queue the resulting commands on this rig. Words the keyframe
   * library covers sign as word signs; the rest are spelled with real A–Z
   * handshapes, and the readout says which of each it just played.
   */
  const signSentence = (): void => {
    const result = translation.translate();
    if (!result) return;
    const concepts = result.representation.concepts;
    const commands = concepts.flatMap((concept) => mapper.fromConcept(concept).commands);
    const played = avatar.enqueueConcepts(concepts);
    let words = 0;
    let letters = 0;
    let approximate = 0;
    for (const command of commands) {
      if (command.isPlaceholder) approximate += 1;
      else if (command.gestureId.startsWith('fingerspell-')) letters += 1;
      else words += 1;
    }
    const parts = [
      words > 0 ? `${words} word sign${words === 1 ? '' : 's'}` : null,
      letters > 0 ? `${letters} letter handshape${letters === 1 ? '' : 's'}` : null,
      approximate > 0 ? `${approximate} approximate motion${approximate === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    setSigned(
      parts.length > 0
        ? `Queued ${played.accepted} command${played.accepted === 1 ? '' : 's'}: ${parts.join(' + ')}.`
        : 'Nothing to sign in that sentence yet.',
    );
  };

  const gestureIds = Object.keys(PLACEHOLDER_GESTURE_REGISTRY);
  /** True only when real bone keyframes back the gesture's clip. */
  const isAuthentic = (id: string): boolean => Boolean(PLACEHOLDER_GESTURE_REGISTRY[id]?.realClip);
  const wordSigns = gestureIds.filter((id) => id.startsWith('sign-') && id.length > 6 && isAuthentic(id));
  const letters = gestureIds.filter((id) => id.startsWith('sign-') && id.length === 6);
  const approximateSigns = gestureIds.filter(
    (id) => id.startsWith('sign-') && id.length > 6 && !isAuthentic(id),
  );
  const devPrimitives = gestureIds.filter((id) => !id.startsWith('sign-') && !id.startsWith('fingerspell-'));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-clay-ink">3D Avatar</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusIndicator tone={meta.tone} label={meta.label} />
          {ready && avatar.rig?.isPlaceholder && (
            <Badge tone="warning">Procedural rig — its motions are not ISL signs</Badge>
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
            {/* Real-time honest playback mode disclosure: Fingerspelling vs Full sign */}
            <div className="absolute top-2 right-2 z-10">
              <AvatarPlaybackBadge currentCommand={avatar.queue.current} />
            </div>
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

          <div className="flex flex-col gap-3 border-b-2 border-clay-edge/50 pb-4">
            <h2 className="text-lg font-semibold text-clay-ink">Sign a sentence</h2>
            <Input
              label="Sentence"
              value={translation.text}
              onChange={(event) => translation.setText(event.target.value)}
              placeholder="e.g. thank you please help me"
              hint="English or Hindi. Words the keyframe library covers sign as word signs; the rest are spelled out with real A – Z handshapes."
              error={translation.error ?? undefined}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={signSentence}
                disabled={!ready || !translation.text.trim()}
              >
                Sign this sentence
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  translation.clear();
                  setSigned(null);
                }}
                disabled={!translation.text && !signed}
              >
                Clear
              </Button>
            </div>
            {signed && (
              <p role="status" className="text-sm text-clay-ink">
                {signed}
              </p>
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
            The sample buttons above only stretch the rig — they are not a translation. Use the sentence box to sign
            real phrases.
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
              FPS is measured from the live render loop rather than estimated. The 30+ FPS target is only meaningful
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
                <dd className="font-semibold text-clay-ink">{avatar.queue.current ? humanizeClipId(avatar.queue.current.animationClipId) : '—'}</dd>
              </div>
              <div>
                <dt className="text-clay-muted">Current clip</dt>
                <dd className="font-semibold text-clay-ink">{avatar.queue.current ? (avatar.queue.current.isPlaceholder ? 'Approximate dev motion' : 'Authentic ISL keyframes') : '—'}</dd>
              </div>
            </dl>
            {avatar.queue.queued.length > 0 && (
              <ul className="flex flex-wrap gap-1 text-xs text-clay-muted">
                {avatar.queue.queued.map((cmd, i) => (
                  <li key={`${cmd.gestureId}-${i}`} className="rounded-clay bg-clay-soft px-2 py-0.5">
                    {humanizeClipId(cmd.animationClipId)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-clay-ink">Authentic ISL word signs</h2>
          <p className="text-sm text-clay-muted">
            Each of these has real bone keyframes on this rig, played stage by stage (reach → hold → release).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wordSigns.map((id) => (
            <Button key={id} size="sm" variant="primary" onClick={() => avatar.playGesture(id)} disabled={!ready}>
              {humanizeClipId(id)}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-1 pt-2">
          <h2 className="text-lg font-semibold text-clay-ink">ISL alphabet fingerspelling (A – Z)</h2>
          <p className="text-sm text-clay-muted">
            Two-handed fingerspelling handshapes, used for names and words the glossary does not cover.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {letters.map((id) => (
            <Button key={id} size="sm" variant="secondary" onClick={() => avatar.playGesture(id)} disabled={!ready}>
              {id.replace('sign-', '').toUpperCase()}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-1 pt-2 border-t-2 border-clay-edge/50">
          <h2 className="text-sm font-semibold text-clay-muted">Approximate word motions</h2>
          <p className="text-xs text-clay-muted">
            These words are recognised and glossed, but no validated ISL keyframe exists for them yet — the motion
            is an approximation, so it is listed separately instead of under the authentic signs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {approximateSigns.map((id) => (
            <Button key={id} size="sm" variant="ghost" onClick={() => avatar.playGesture(id)} disabled={!ready}>
              {humanizeClipId(id)}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-1 pt-2">
          <h2 className="text-sm font-semibold text-clay-muted">Basic motion tests</h2>
          <p className="text-xs text-clay-muted">
            Arm and head primitives that verify the rig, the queue and the FPS readout. They mean nothing in ISL.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {devPrimitives.map((id) => (
            <Button key={id} size="sm" variant="ghost" onClick={() => avatar.playGesture(id)} disabled={!ready}>
              {humanizeClipId(id)}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-clay-ink">About this surface</h2>
        <p className="text-sm text-clay-muted">
          The avatar is a real rigged GLB loaded through <code>AvatarLoader</code> — dropping a different GLB into{' '}
          <code>/assets/avatars</code> loads through the same path without changing any other layer, and a GLB whose
          bones fail validation is reported rather than animated broken. Babylon is lazy-loaded only for this route,
          so the rest of the app never pays for it. Sign playback runs the same <code>avatar:command</code> contract
          the call and translator use; FPS is measured from the live render loop rather than claimed. The avatar uses
          no camera or microphone, and commands carry animation instructions only, never raw media.
        </p>
      </Card>
    </div>
  );
}
