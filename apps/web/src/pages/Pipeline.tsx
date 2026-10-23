import { useCallback } from 'react';
import type { IslConcept } from '@isl/shared-types';
import { Card, Button, Badge, StatusIndicator, LoadingState, ErrorState } from '../components/ui/index.js';
import { useTranslation } from '../features/useTranslation.js';
import { useAvatar } from '../features/useAvatar.js';
import { useLiveDictation } from '../features/useLiveDictation.js';
import type { AvatarLoaderStatus } from '../lib/avatar/index.js';
import { GestureMapper, humanizeClipId } from '../lib/avatar/index.js';

/** Honest loader label/tone for the embedded avatar (mirrors the Avatar page). */
const loaderMeta: Record<AvatarLoaderStatus, { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  idle: { tone: 'neutral', label: 'Avatar not ready' },
  loading: { tone: 'info', label: 'Loading avatar…' },
  loaded: { tone: 'success', label: 'GLB avatar loaded' },
  placeholder: { tone: 'warning', label: 'Procedural rig active' },
  'asset-missing': { tone: 'warning', label: 'Procedural rig (no GLB)' },
  error: { tone: 'danger', label: 'Avatar failed to load' },
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function sortConcepts(concepts: readonly IslConcept[]): IslConcept[] {
  return [...concepts].sort((a, b) => a.ordering - b.ordering);
}

/**
 * What will actually move the avatar for this concept, measured through the same
 * mapper the avatar uses: authentic word keyframes, A–Z fingerspelling for words
 * the keyframe library does not cover, and any remaining approximate motion.
 */
function signQualityOf(concept: IslConcept): { wordSigns: number; spelled: number; approximate: number } {
  const quality = { wordSigns: 0, spelled: 0, approximate: 0 };
  for (const command of new GestureMapper().fromConcept(concept).commands) {
    if (command.isPlaceholder) quality.approximate += 1;
    else if (command.gestureId.startsWith('fingerspell-')) quality.spelled += 1;
    else quality.wordSigns += 1;
  }
  return quality;
}

/** Human, non-color-only description of how a concept gets signed. */
function describeSignQuality(quality: ReturnType<typeof signQualityOf>): string {
  const parts: string[] = [];
  if (quality.wordSigns > 0) parts.push(`${quality.wordSigns} authentic word sign`);
  if (quality.spelled > 0) parts.push(`${quality.spelled} letter handshape(s) spelling it`);
  if (quality.approximate > 0) parts.push(`${quality.approximate} approximate motion`);
  return parts.join(' · ') || 'no sign emitted';
}

/**
 * End-to-end acceptance surface (plan §16): text or optional live dictation → the
 * rule-based translation engine → an inspectable `IslIntermediateRepresentation`
 * (ordering, non-manual markers, per-concept confidence, unsupported words,
 * measured latency) → the signing avatar.
 *
 * Honesty, shown rather than asserted:
 *  - This is a CURATED RULE-BASED glossary, not a trained ISL translator.
 *  - Each concept reports how much of its motion is backed by real ISL keyframes,
 *    so approximate word motions are visible instead of hidden (§10).
 *  - Low confidence and unsupported terms are surfaced, never smoothed over.
 */
export function Pipeline() {
  const translation = useTranslation();
  const avatar = useAvatar();

  const drive = useCallback(
    (concepts: readonly IslConcept[]): void => {
      if (concepts.length > 0) avatar.enqueueConcepts(concepts);
    },
    [avatar],
  );

  const onSubmit = useCallback((): void => {
    const result = translation.translate();
    if (result) drive(result.representation.concepts);
  }, [translation, drive]);

  const dictation = useLiveDictation({
    onFinal: (text) => {
      translation.setText(text);
      const result = translation.translate(text);
      if (result) drive(result.representation.concepts);
    },
  });

  const result = translation.result;
  const concepts = result ? sortConcepts(result.representation.concepts) : [];
  const ready = avatar.phase === 'ready';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-clay-ink">Speech → ISL Pipeline</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="info">Rule-based glossary — not a trained translator</Badge>
          {ready && avatar.rig?.isPlaceholder && (
            <Badge tone="warning">Procedural rig — its motions are not ISL signs</Badge>
          )}
          {result?.lowConfidence && <Badge tone="warning">Low confidence / partial coverage</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Input + controls */}
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-clay-ink">Phrase</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-clay-muted">Type a Hindi / English phrase (or dictate it)</span>
            <textarea
              value={translation.text}
              onChange={(e) => translation.setText(e.target.value)}
              rows={3}
              maxLength={4000}
              className="rounded-clay border-2 border-clay-edge/70 bg-clay-surface px-3 py-2 text-clay-ink outline-none focus:border-clay-primary"
              placeholder="e.g. thank you please help me"
              aria-label="Phrase to translate"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={onSubmit}>Translate &amp; animate</Button>
            <Button variant="ghost" onClick={translation.clear}>Clear</Button>
            <Button
              variant={dictation.running ? 'danger' : 'secondary'}
              onClick={dictation.toggle}
              disabled={!dictation.supported}
            >
              {dictation.running ? 'Stop dictation' : 'Start dictation'}
            </Button>
          </div>

          {!dictation.supported && (
            <p className="text-xs text-clay-muted">
              Live dictation is unavailable in this browser; typing still exercises the full pipeline.
            </p>
          )}
          {dictation.error && <p className="text-xs text-clay-danger">{dictation.error.message}</p>}
          {translation.error && <p className="text-xs text-clay-danger">{translation.error}</p>}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-clay-muted">Overall confidence</dt>
              <dd className="font-semibold text-clay-ink">{result ? pct(result.representation.overallConfidence) : '—'}</dd>
            </div>
            <div>
              <dt className="text-clay-muted">Glossary coverage</dt>
              <dd className="font-semibold text-clay-ink">{result ? pct(result.metrics.coverage) : '—'}</dd>
            </div>
            <div>
              <dt className="text-clay-muted">Measured latency</dt>
              <dd className="font-semibold text-clay-ink">{result ? `${result.metrics.latencyMs} ms` : '—'}</dd>
            </div>
            <div>
              <dt className="text-clay-muted">Unsupported words</dt>
              <dd className="font-semibold text-clay-ink">{result ? result.metrics.unsupportedCount : '—'}</dd>
            </div>
          </dl>
        </Card>

        {/* Avatar viewport */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-clay-ink">Avatar</h2>
            <StatusIndicator tone={loaderMeta[avatar.loaderStatus].tone} label={loaderMeta[avatar.loaderStatus].label} />
          </div>
          <div className="relative overflow-hidden rounded-clay bg-clay-soft" style={{ aspectRatio: '3 / 4' }}>
            <canvas ref={avatar.canvasRef} className="absolute inset-0 h-full w-full" aria-label="3D avatar viewport" />
            {(avatar.phase === 'initializing' || avatar.phase === 'idle') && (
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
            <Button variant="ghost" onClick={avatar.stop} disabled={!ready}>Stop</Button>
            <Button variant="ghost" onClick={avatar.reset} disabled={!ready}>Reset</Button>
          </div>
          <p className="text-xs text-clay-muted">
            Concepts animate through the existing <code>avatar:command</code> contract. Words with real ISL
            keyframes are signed stage by stage, and words the keyframe library does not cover are spelled out with
            the A – Z handshapes.
          </p>
        </Card>
      </div>

      {/* Intermediate representation */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-clay-ink">ISL Intermediate Representation</h2>
        {!result && (
          <p className="text-sm text-clay-muted">Translate a phrase to inspect the ordered concept sequence.</p>
        )}
        {result && concepts.length === 0 && (
          <p className="text-sm text-clay-muted">No concepts matched — see unsupported words below.</p>
        )}
        {result && concepts.length > 0 && (
          <ol className="flex flex-col gap-2">
            {concepts.map((concept) => (
              <li key={`${concept.conceptId}-${concept.ordering}`} className="rounded-clay bg-clay-soft px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-clay-muted">#{concept.ordering}</span>
                  <span className="font-semibold text-clay-ink">{concept.conceptId}</span>
                  <span className="text-clay-muted">“{concept.sourceText}” → {concept.normalizedMeaning}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-clay-muted">
                  <span>expr: {concept.facialExpression}</span>
                  <span>· timing: {concept.timingMs}ms</span>
                  <span>· conf: {pct(concept.confidence)}</span>
                  <span>
                    · gestures: {concept.gestureIds.length > 0 ? concept.gestureIds.map(humanizeClipId).join(', ') : 'none (spelled from the word)'}
                  </span>
                  {concept.gestureIds.length > 0 && (
                    <span>· signs: {describeSignQuality(signQualityOf(concept))}</span>
                  )}
                  {concept.fallbackBehavior && <span className="text-clay-danger">· {concept.fallbackBehavior}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {result && result.representation.unsupportedConcepts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-clay-muted">Unrecognized (shown, never invented):</span>
            {result.representation.unsupportedConcepts.map((w) => (
              <Badge key={w} tone="warning">{w}</Badge>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-clay-ink">How this works</h2>
        <p className="text-sm text-clay-muted">
          Speech and typed text are matched against a curated bilingual glossary, ordered ISL-style (topic first,
          verb last, time and place up front), given non-manual facial markers and per-concept confidence, then fed
          to the avatar through the same command contract the call uses. Words the glossary does not know are listed
          as unsupported rather than invented, and a word that has no dedicated keyframe is spelled with the A–Z
          fingerspelling handshapes — exactly what a Deaf signer does with an unfamiliar word. Each concept row below
          says which of those the avatar is performing. No camera or microphone audio leaves the device; commands
          carry concepts only, never raw media.
        </p>
      </Card>
    </div>
  );
}
