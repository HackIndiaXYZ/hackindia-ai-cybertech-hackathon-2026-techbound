import { useEffect } from 'react';
import clsx from 'clsx';
import {
  Card,
  Button,
  Badge,
  StatusIndicator,
  LoadingState,
  ErrorState,
} from '../components/ui/index.js';
import { useStandaloneTranslator } from '../features/useStandaloneTranslator.js';
import type { AvatarLoaderStatus } from '../lib/avatar/index.js';
import type { InputMode } from '../lib/standalone/index.js';

/** Honest loader label/tone for the embedded avatar (mirrors Pipeline/Avatar). */
const loaderMeta: Record<AvatarLoaderStatus, { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  idle: { tone: 'neutral', label: 'Avatar not ready' },
  loading: { tone: 'info', label: 'Loading avatar…' },
  loaded: { tone: 'success', label: 'GLB avatar loaded' },
  placeholder: { tone: 'warning', label: 'Placeholder avatar' },
  'asset-missing': { tone: 'warning', label: 'Placeholder avatar (no GLB)' },
  error: { tone: 'danger', label: 'Avatar failed to load' },
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function orDash(value: number | null): string {
  return value === null ? 'not reported' : pct(value);
}

/**
 * Phase 3C acceptance surface (plan §18): a standalone, no-call translator that
 * composes the existing seams — 2C dictation, 3A rule-based translation and the 2D
 * avatar — behind a clean state machine. It prioritises a huge readable transcript,
 * avatar visibility, minimal controls and accessible status feedback, and adds a
 * public-space / event mode for presentations.
 *
 * Honesty, shown rather than asserted: the translation is the curated rule-based
 * glossary prototype and the avatar motions are Phase 2D development placeholders,
 * so both are badged; transcript confidence is shown as "not reported" when the
 * provider does not emit it; and unsupported words are surfaced, never smoothed over.
 */
export function StandaloneTranslator() {
  const t = useStandaloneTranslator();
  const { avatar, result, status, state } = t;

  // Quiet spaces / unsupported browsers fall back to typing automatically.
  useEffect(() => {
    if (!t.dictationSupported && t.inputMode === 'speak') t.chooseInputMode('type');
  }, [t]);

  const isRunning = state !== 'idle' && state !== 'error' && state !== 'paused';
  const ready = avatar.phase === 'ready';

  return (
    <div
      className={clsx(
        'flex flex-col gap-6',
        t.eventMode && 'fixed inset-0 z-50 overflow-auto bg-clay-bg p-6 lg:p-10',
      )}
    >
      <header className={clsx('flex flex-col gap-2', !t.eventMode && 'sr-only lg:not-sr-only')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className={clsx('font-bold text-clay-ink', t.eventMode ? 'text-4xl' : 'text-3xl')}>
            Standalone Translator
          </h1>
          <ModeControls t={t} />
        </div>
        {!t.eventMode && (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="info">Rule-based glossary prototype — not a trained translator</Badge>
            {ready && avatar.rig?.isPlaceholder && (
              <Badge tone="warning">Avatar motions are development placeholders, not ISL signs</Badge>
            )}
            {result?.lowConfidence && <Badge tone="warning">Low confidence / partial coverage</Badge>}
            <Badge tone="neutral">No call required — processed on this device</Badge>
            {t.persisting && <Badge tone="info">Saved to your history (storage consent is on)</Badge>}
          </div>
        )}
      </header>

      <div className={clsx('grid gap-6', t.eventMode ? 'lg:grid-cols-[1.1fr_0.9fr]' : 'lg:grid-cols-[1fr_1fr]')}>
        {/* Transcript + status + confidence */}
        <section className="flex flex-col gap-4" aria-labelledby="transcript-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="transcript-h" className={clsx('font-semibold text-clay-ink', t.eventMode ? 'sr-only' : 'text-lg')}>
              Live transcript
            </h2>
            <StatusIndicator tone={status.tone} label={status.label} />
          </div>

          <div
            role="status"
            aria-live="polite"
            className={clsx(
              'flex min-h-[8rem] w-full items-start rounded-clay bg-white px-5 py-4 text-clay-ink shadow-clay-inset',
              t.eventMode ? 'min-h-[16rem] text-5xl leading-tight' : 'text-3xl leading-tight',
            )}
          >
            {t.liveText ? (
              <span className="break-words">{t.liveText}</span>
            ) : (
              <span className="text-clay-muted">
                {t.inputMode === 'speak' ? 'Tap start, then speak — your words appear here.' : 'Type a phrase and press Translate.'}
              </span>
            )}
          </div>

          <p className="sr-only">{status.announcement}</p>

          {/* Confidence, honestly labelled */}
          <dl className={clsx('grid gap-3', t.eventMode ? 'grid-cols-2 text-lg' : 'grid-cols-2 text-sm')}>
            <div className="rounded-clay bg-clay-soft px-3 py-2">
              <dt className="text-clay-muted">Speech confidence</dt>
              <dd className="font-semibold text-clay-ink">{state === 'idle' && t.transcriptConfidence === null ? '—' : orDash(t.transcriptConfidence)}</dd>
            </div>
            <div className="rounded-clay bg-clay-soft px-3 py-2">
              <dt className="text-clay-muted">Translation confidence</dt>
              <dd className="font-semibold text-clay-ink">{result ? pct(result.representation.overallConfidence) : '—'}</dd>
            </div>
          </dl>

          {result && result.representation.unsupportedConcepts.length > 0 && !t.eventMode && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-clay-muted">Unrecognized (shown, never invented):</span>
              {result.representation.unsupportedConcepts.map((w) => (
                <Badge key={w} tone="warning">{w}</Badge>
              ))}
            </div>
          )}

          {t.errorText && <p className="text-sm text-clay-danger" role="alert">{t.errorText}</p>}

          <PrimaryControls t={t} isRunning={isRunning} />
        </section>

        {/* Avatar viewport */}
        <section className="flex flex-col gap-4" aria-labelledby="avatar-h">
          {!t.eventMode && (
            <div className="flex items-center justify-between gap-3">
              <h2 id="avatar-h" className="text-lg font-semibold text-clay-ink">ISL avatar</h2>
              <StatusIndicator tone={loaderMeta[avatar.loaderStatus].tone} label={loaderMeta[avatar.loaderStatus].label} />
            </div>
          )}
          <div
            className={clsx(
              'relative overflow-hidden rounded-clay bg-clay-soft',
              t.eventMode ? 'h-full min-h-[24rem]' : 'w-full',
              !t.eventMode && 'aspect-[3/4]',
            )}
          >
            <canvas ref={avatar.canvasRef} className="absolute inset-0 h-full w-full" aria-label="3D avatar signing the translation" />
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
          {!t.eventMode && (
            <p className="text-xs text-clay-muted">
              The avatar signs the translated concepts through the existing <code>avatar:command</code> contract.
              FPS and rendering are verified only in a real browser; the motions are generic development
              placeholders (§10), not validated ISL signs.
            </p>
          )}
        </section>
      </div>

      {/* History + about — hidden in event mode to keep cognitive load low */}
      {!t.eventMode && (
        <>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-clay-ink">Translation history</h2>
              <Button variant="ghost" size="sm" onClick={t.clearHistory} disabled={t.history.length === 0}>
                Clear history
              </Button>
            </div>
            <p className="text-xs text-clay-muted">
              {t.persisting
                ? 'This list is only for the session; finished texts and translations above it are also saved to your account history while storage consent is on.'
                : 'Kept in this session only — never stored on disk or sent anywhere.'}
            </p>
            {t.history.length === 0 ? (
              <p className="text-sm text-clay-muted">No translations yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {t.history.map((entry) => (
                  <li key={entry.id} className="rounded-clay bg-clay-soft px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-clay-ink">{entry.input}</span>
                      <span className="text-xs text-clay-muted">{new Date(entry.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-clay-muted">
                      <span>{entry.mode === 'speak' ? 'Spoken' : 'Typed'}</span>
                      <span>· hearing: {orDash(entry.transcriptConfidence)}</span>
                      <span>· translation: {pct(entry.overallConfidence)}</span>
                      <span>· concepts: {entry.conceptCount}</span>
                      {entry.unsupportedCount > 0 && <span>· unsupported: {entry.unsupportedCount}</span>}
                      {entry.lowConfidence && <Badge tone="warning">low confidence</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-clay-ink">About this mode</h2>
            <p className="text-sm text-clay-muted">
              Standalone translator mode (§18) turns speech or typed text into ISL concepts and shows them on the
              avatar — no peer-to-peer call needed. It is the rule-based glossary prototype driving placeholder
              avatar animations, not a production ISL translator, so nothing here is authoritative ISL. Microphone
              audio is never uploaded — recognition and translation run in your browser. Finished texts and
              translations are only stored to your account history when your storage consent is on (Settings &gt; Data
              &amp; consent); the list above is always session-only.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

/** Input-mode + event-mode toggles. */
function ModeControls({ t }: { t: ReturnType<typeof useStandaloneTranslator> }) {
  const modes: { id: InputMode; label: string; disabled?: boolean }[] = [
    { id: 'speak', label: 'Speak', disabled: !t.dictationSupported },
    { id: 'type', label: 'Type' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Input mode" className="inline-flex rounded-clay bg-clay-soft p-1 shadow-clay-inset">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={m.disabled}
            aria-pressed={t.inputMode === m.id}
            onClick={() => t.chooseInputMode(m.id)}
            className={clsx(
              'rounded-clay px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              t.inputMode === m.id ? 'bg-clay-primary text-white' : 'text-clay-ink hover:bg-white',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Button
        variant={t.eventMode ? 'primary' : 'ghost'}
        size="sm"
        aria-pressed={t.eventMode}
        onClick={() => t.setEventMode(!t.eventMode)}
      >
        {t.eventMode ? 'Exit event mode' : 'Event mode'}
      </Button>
    </div>
  );
}

/** The minimal, large primary controls (start / pause / resume / stop, or translate). */
function PrimaryControls({
  t,
  isRunning,
}: {
  t: ReturnType<typeof useStandaloneTranslator>;
  isRunning: boolean;
}) {
  if (t.inputMode === 'type') {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-clay-muted">Phrase to sign</span>
          <textarea
            value={t.typedText}
            onChange={(e) => t.setTypedText(e.target.value)}
            rows={2}
            maxLength={2000}
            className="rounded-clay border border-clay-edge bg-white px-3 py-2 text-lg text-clay-ink shadow-clay-inset focus:shadow-clay-focus focus:outline-none"
            placeholder="e.g. thank you please help me"
            aria-label="Phrase to translate"
          />
        </label>
        <Button variant="primary" size="lg" onClick={t.translateTyped} disabled={!t.typedText.trim()}>
          Translate &amp; sign
        </Button>
        {t.state !== 'idle' && (
          <Button variant="ghost" size="lg" onClick={t.stop}>
            Stop
          </Button>
        )}
      </div>
    );
  }

  // Speak mode: one primary action for the current state, plus always-available Stop.
  return (
    <div className="flex flex-wrap items-center gap-3">
      {t.state === 'paused' ? (
        <Button variant="primary" size="lg" onClick={t.resume} disabled={!t.dictationSupported}>
          Resume
        </Button>
      ) : (
        <Button variant="primary" size="lg" onClick={t.start} disabled={isRunning || !t.dictationSupported}>
          Start
        </Button>
      )}
      <Button variant="secondary" size="lg" onClick={t.pause} disabled={!isRunning}>
        Pause
      </Button>
      <Button variant="danger" size="lg" onClick={t.stop} disabled={t.state === 'idle'}>
        Stop
      </Button>
      {!t.dictationSupported && (
        <p className="text-xs text-clay-muted">Speech capture is unavailable in this browser — switch to Type.</p>
      )}
    </div>
  );
}
