import { useEffect, useState } from 'react';
import type { ProviderStatus } from '@isl/shared-types';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import {
  set,
  toggle,
  TEXT_SCALES,
  THEMES,
  type SettingsState,
  type ThemeName,
} from '../store/settingsSlice.js';
import { Card, Button, Badge } from '../components/ui/index.js';
import { fetchConsentState, setConsent } from '../lib/sessionRecord.js';
import { fetchProviders } from '../lib/providers.js';

interface ToggleRowProps {
  setting: keyof SettingsState;
  title: string;
  description: string;
}

function ToggleRow({ setting, title, description }: ToggleRowProps) {
  const dispatch = useAppDispatch();
  const checked = useAppSelector((s) => s.settings[setting]) as boolean;
  const id = `setting-${setting}`;
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="font-medium text-clay-ink">
          {title}
        </label>
        <p className="text-sm text-clay-muted">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => dispatch(toggle(setting))}
        className="relative h-9 w-16 shrink-0 rounded-pill border-2 border-clay-edge/70 bg-clay-soft transition-colors"
      >
        <span
          className={
            'absolute top-1 h-7 w-7 rounded-full bg-clay-primary transition-transform duration-200 ' +
            (checked ? 'translate-x-8' : 'translate-x-1')
          }
          aria-hidden="true"
        />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

/** Data & consent. The `recording` scope is what the server checks before
 * accepting transcript/translation/message writes — this switch is the real
 * gate, not decoration: with it off, the API answers 403 even if a client tried
 * to write. Only scopes the product actually enforces today are shown; reserved
 * scopes (analytics, training data) appear when they gate a real feature, so the
 * page never implies controls that do nothing.
 */
function ConsentSection() {
  // null until the server has answered — we never display a guessed state.
  const [granted, setGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetchConsentState()
      .then((s) => live && setGranted(s.recording))
      .catch(() => live && setError('Could not reach the server to load your consent state.'));
    return () => {
      live = false;
    };
  }, []);

  async function handleChange(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setConsent('recording', next);
      setGranted(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your consent choice.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold text-clay-ink">Data &amp; consent</h2>
      <div className="mt-2 flex items-center justify-between gap-4">
        <div>
          <label htmlFor="consent-recording" className="font-medium text-clay-ink">
            Save session content to my history
          </label>
          <p className="text-sm text-clay-muted">
            Stores final captions, translations and text messages from calls and the standalone
            translator on our servers. Audio and video are never stored. Required before anything is
            saved — the server rejects writes without it.
          </p>
        </div>
        <button
          id="consent-recording"
          type="button"
          role="switch"
          aria-checked={granted === true}
          disabled={busy || granted === null}
          onClick={() => void handleChange(granted !== true)}
          className="relative h-9 w-16 shrink-0 rounded-pill border-2 border-clay-edge/70 bg-clay-soft transition-colors disabled:opacity-50"
        >
          <span
            className={
              'absolute top-1 h-7 w-7 rounded-full bg-clay-primary transition-transform duration-200 ' +
              (granted === true ? 'translate-x-8' : 'translate-x-1')
            }
            aria-hidden="true"
          />
          <span className="sr-only">{granted === null ? 'Loading' : granted ? 'On' : 'Off'}</span>
        </button>
      </div>
      <p className="mt-2 text-xs text-clay-muted" role="status">
        {granted === null && !error
          ? 'Loading your consent state…'
          : granted === true
            ? 'Allowed: calls and the standalone translator may store their text artefacts.'
            : 'Not allowed: nothing from your sessions is persisted.'}
      </p>
      {error && (
        <div role="alert" className="mt-2 rounded-clay bg-clay-danger/15 p-3 text-sm text-clay-danger">
          {error}
        </div>
      )}
    </Card>
  );
}

const CAPABILITY_LABELS: Record<ProviderStatus['capability'], string> = {
  speech: 'Speech to text',
  vision: 'Sign recognition',
  translation: 'Translation',
  tts: 'Text to speech',
};

/** Plain-English placement for the resolved backend, never an env-flag dump. */
function runsInSentence(p: ProviderStatus): string {
  if (!p.implemented) return `The configuration asks for “${p.configured}”, which this build does not include.`;
  if (p.runsOn === 'browser') return 'Runs entirely in your browser — nothing is uploaded.';
  if (p.runsOn === 'server') return 'Runs on our server.';
  return 'Not available in this build.';
}

/**
 * Provider messages are the server's honest disclosure text, but they cite
 * internal decision records (“… (ADR-016)”). A reader on this screen cannot open
 * those, so the citation is dropped from the rendered sentence — the claim itself
 * is never reworded, weakened or hidden.
 */
function readerMessage(message: string): string {
  return message.replace(/\s*\((?:ADR|§)[^)]*\)/g, '');
}

/**
 * Provider status. The env flags are a request; this is the answer. Every
 * capability shows what the server actually resolved — label, honesty message,
 * and an explicit *unavailable* badge when a flag names an integration that does
 * not exist. Values come from the API only; the page never mirrors config
 * client-side and never shows a guessed state.
 */
function ProviderSection() {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchProviders()
      .then((r) => live && setProviders(r.providers))
      .catch(() => live && setError('Could not load provider status from the server.'));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card>
      <h2 className="text-xl font-semibold text-clay-ink">Capabilities &amp; providers</h2>
      <p className="mt-1 text-sm text-clay-muted">
        What each AI capability actually runs in this build, as resolved by the server. Nothing
        here is a trained ISL model, and the labels say so.
      </p>
      {error ? (
        <div role="alert" className="mt-3 rounded-clay bg-clay-danger/15 p-3 text-sm text-clay-danger">
          {error}
        </div>
      ) : providers === null ? (
        <p className="mt-3 text-sm text-clay-muted" role="status">
          Loading provider status…
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-clay-edge/60">
          {providers.map((p) => (
            <li key={p.capability} className="py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-clay-ink">{CAPABILITY_LABELS[p.capability] ?? p.capability}</span>
                <Badge tone={p.implemented ? (p.trained ? 'success' : 'info') : 'danger'}>
                  {p.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-clay-muted">{readerMessage(p.message)}</p>
              <p className="mt-0.5 text-xs text-clay-muted">{runsInSentence(p)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Accessibility & preference controls. Persisted to localStorage. */
export function Settings() {
  const dispatch = useAppDispatch();
  const captionFontSize = useAppSelector((s) => s.settings.captionFontSize);
  const theme = useAppSelector((s) => s.settings.theme);
  const textScale = useAppSelector((s) => s.settings.textScale);

  const selectClass =
    'h-11 rounded-clay border-2 border-clay-edge/70 bg-clay-surface px-3 font-semibold text-clay-ink cursor-pointer';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-clay-ink">Settings</h1>

      <Card>
        <h2 className="text-xl font-semibold text-clay-ink">Display</h2>
        <p className="mt-1 text-sm text-clay-muted">
          Four AAA-contrast palettes and text scaling up to 200%. Changes apply instantly and are saved
          on this device.
        </p>
        <div className="mt-4 flex flex-wrap gap-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="setting-theme" className="text-sm font-medium text-clay-ink">
              Colour theme
            </label>
            <select
              id="setting-theme"
              className={selectClass}
              value={theme}
              onChange={(e) => dispatch(set({ theme: e.target.value as ThemeName }))}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id} className="bg-clay-surface text-clay-ink">
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="setting-scale" className="text-sm font-medium text-clay-ink">
              Text size
            </label>
            <select
              id="setting-scale"
              className={selectClass}
              value={textScale}
              onChange={(e) => dispatch(set({ textScale: Number(e.target.value) }))}
            >
              {TEXT_SCALES.map((s) => (
                <option key={s} value={s} className="bg-clay-surface text-clay-ink">
                  {Math.round(s * 100)}%
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold text-clay-ink">Accessibility</h2>
        <div className="mt-2 divide-y divide-clay-edge/60">
          <ToggleRow setting="highContrast" title="High contrast" description="Increase contrast and remove soft shadows." />
          <ToggleRow setting="reduceMotion" title="Reduce motion" description="Minimise animations and transitions." />
          <ToggleRow setting="largeControls" title="Large controls" description="Increase the size of buttons and interactive targets." />
          <ToggleRow
            setting="screenReaderOptimized"
            title="Screen-reader optimised"
            description="Prefer verbose announcements and simpler layouts."
          />
        </div>
      </Card>

      <ConsentSection />

      <ProviderSection />

      <Card>
        <h2 className="text-xl font-semibold text-clay-ink">Captions</h2>
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="caption-size" className="font-medium text-clay-ink">
            Caption text size: <span className="text-clay-primary">{captionFontSize}px</span>
          </label>
          <input
            id="caption-size"
            type="range"
            min={14}
            max={32}
            step={1}
            value={captionFontSize}
            onChange={(e) => dispatch(set({ captionFontSize: Number(e.target.value) }))}
            className="w-full accent-[rgb(var(--clay-primary))]"
          />
        </div>
      </Card>

      <div>
        <Button
          variant="ghost"
          onClick={() => dispatch(set({ captionFontSize: 20, theme: 'night', textScale: 1 }))}
        >
          Reset display defaults
        </Button>
      </div>
    </div>
  );
}
