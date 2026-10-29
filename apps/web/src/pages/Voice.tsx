// Additional context: this call path was profiled in the 26.06 soak test; do not refactor without re-profiling.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LanguageCode } from '@isl/shared-types';
import { Card, Button, Badge, StatusIndicator } from '../components/ui/index.js';
import { useTts } from '../features/useTts.js';
import {
  PREVIEW_SAMPLE,
  PROSODY_PRESETS,
  TTS,
  describeGenderAge,
  presetById,
  type TtsPlaybackState,
} from '../lib/tts/index.js';

const LANGUAGE_OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'à¤¹à¤¿à¤¨à¥à¤¦à¥€ (India)' },
];

const stateMeta: Record<TtsPlaybackState, { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  idle: { tone: 'neutral', label: 'Ready' },
  queued: { tone: 'info', label: 'Startingâ€¦' },
  speaking: { tone: 'success', label: 'Speaking' },
  paused: { tone: 'warning', label: 'Paused' },
  finished: { tone: 'neutral', label: 'Finished' },
  cancelled: { tone: 'neutral', label: 'Stopped' },
  error: { tone: 'danger', label: 'Error' },
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
function orDash(value: number | null, suffix = ''): string {
  return value === null ? 'â€”' : `${value}${suffix}`;
}

/**
 * Text-to-speech surface. Everything here is user-initiated â€” the engine NEVER
 * autoplays. Voice gender/age and emotional rendering are reported as *not
 * available from the provider* rather than offered as real controls, and the
 * engine badge always describes the provider that is actually producing audio.
 */
export function Voice() {
  const tts = useTts();
  const [text, setText] = useState(PREVIEW_SAMPLE);
  const caps = tts.capabilities;
  const meta = stateMeta[tts.state];
  const playing = tts.state === 'speaking' || tts.state === 'queued';
  const activePreset = presetById(tts.prefs.presetId);
  const volumePct = Math.round(tts.prefs.volume * 100);

  if (!tts.available) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-clay-ink">Voice / Read-aloud</h1>
        <Card className="flex flex-col gap-3">
          <StatusIndicator tone="warning" label="Text-to-speech unavailable" />
          <p className="text-clay-muted">
            This browser does not expose the Web Speech <em>Synthesis</em> API, so there is no voice engine to run.
            The app still works fully â€” read-aloud is simply not offered here. Try a recent Chrome or Edge.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-clay-ink">Voice / Read-aloud</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusIndicator tone={meta.tone} label={meta.label} />
          {tts.engineStatus === 'pending' ? (
            <Badge tone="neutral">Speech engine: checkingâ€¦</Badge>
          ) : tts.engineStatus === 'server' ? (
            <Badge tone="success">Engine: AI4Bharat Indic-TTS (Neural FastPitch + HiFi-GAN)</Badge>
          ) : tts.isFallback ? (
            <Badge tone="warning">Fallback: Browser SpeechSynthesis</Badge>
          ) : (
            <Badge tone="info">Browser SpeechSynthesis â€” on-device</Badge>
          )}
          {!caps.genderAge && <Badge tone="warning">Voice gender / age: not reported by this provider</Badge>}
          {!caps.emotionalRendering && <Badge tone="warning">Emotional prosody: not rendered by this provider</Badge>}
        </div>

        {tts.engineReason && (
          <p className="text-xs text-clay-muted" role="status">
            {tts.engineReason}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ---- Playback ---- */}
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-clay-ink">Preview &amp; playback</h2>

          <label htmlFor="tts-text" className="text-sm font-medium text-clay-ink">
            Text to speak
          </label>
          <textarea
            id="tts-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={TTS.MAX_TEXT_CHARS}
            className="w-full rounded-clay border border-clay-edge/70 bg-clay-soft px-3 py-2 text-clay-ink outline-none focus:shadow-clay-focus"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => tts.speak(text)} disabled={!text.trim() || tts.voices.length === 0}>
              Speak
            </Button>
            <Button variant="ghost" onClick={() => tts.speak(PREVIEW_SAMPLE)} disabled={tts.voices.length === 0}>
              Preview voice
            </Button>
            {caps.pauseResume &&
              (tts.state === 'paused' ? (
                <Button variant="secondary" onClick={tts.resume}>
                  Resume
                </Button>
              ) : (
                <Button variant="secondary" onClick={tts.pause} disabled={tts.state !== 'speaking'}>
                  Pause
                </Button>
              ))}
            <Button variant="danger" onClick={tts.cancel} disabled={!playing}>
              Stop
            </Button>
          </div>

          <p aria-live="polite" className="text-sm text-clay-muted">
            {tts.state === 'error' && tts.failure
              ? tts.failure.message
              : playing && tts.text
                ? `Speaking: â€œ${tts.text.slice(0, 80)}${tts.text.length > 80 ? 'â€¦' : ''}â€`
                : 'Audio only plays when you press a button above. Nothing is ever read automatically.'}
          </p>

          {tts.voices.length === 0 && (
            <p className="text-sm text-clay-warn">
              No voices are loaded yet. Your browser may still be fetching them â€” keep this page open a moment and try
              again. We show the real voice list rather than assuming one exists.
            </p>
          )}
        </Card>

        {/* ---- Voice + language ---- */}
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-clay-ink">Voice</h2>

          <div className="flex flex-col gap-2">
            <label htmlFor="tts-lang" className="text-sm font-medium text-clay-ink">
              Language
            </label>
            <select
              id="tts-lang"
              value={tts.prefs.language}
              onChange={(e) => tts.setLanguage(e.target.value as LanguageCode)}
              className="rounded-clay border border-clay-edge/70 bg-clay-soft px-3 py-2 text-clay-ink cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code} className="bg-clay-surface text-clay-ink">
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-clay-muted">
              {tts.enInAvailable
                ? 'An Indian-English (en-IN) voice is installed on this device.'
                : 'No en-IN voice is installed here; the best available voice is used. We do not claim an Indian-English accent we cannot play.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="tts-voice" className="text-sm font-medium text-clay-ink">
              Voice
            </label>
            <select
              id="tts-voice"
              value={tts.prefs.voiceId ?? tts.selectedVoice?.voiceId ?? ''}
              onChange={(e) => tts.selectVoice(e.target.value || null)}
              disabled={!caps.voiceSelection || tts.voices.length === 0}
              className="rounded-clay border border-clay-edge/70 bg-clay-soft px-3 py-2 text-clay-ink cursor-pointer"
            >
              <option value="" className="bg-clay-surface text-clay-ink">Auto (best match)</option>
              {tts.voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId} className="bg-clay-surface text-clay-ink">
                  {v.name} â€” {v.lang}
                </option>
              ))}
            </select>
            <p className="text-xs text-clay-muted">{describeGenderAge(tts.selectedVoice)}</p>
          </div>
        </Card>
      </div>

      {/* ---- Prosody + volume ---- */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-clay-ink">Prosody &amp; volume</h2>

        <div className="flex flex-wrap gap-2">
          {PROSODY_PRESETS.map((p) => {
            const isActive = activePreset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => tts.setProsody({ rate: p.prosody.rate, pitch: p.prosody.pitch })}
                disabled={!caps.ratePitch}
                aria-pressed={isActive}
                className={
                  'rounded-clay border-2 border-clay-edge/60 px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ' +
                  (isActive ? 'border-clay-primary bg-clay-primary text-clay-primary-ink' : 'border-transparent bg-clay-soft text-clay-ink hover:bg-clay-edge/30')
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-clay-muted">
          {activePreset?.note ?? 'Pacing and pitch presets only â€” these do not convey emotion (the provider cannot render it).'}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="tts-rate" className="text-sm font-medium text-clay-ink">
              Rate: <span className="text-clay-primary">{tts.prefs.rate.toFixed(2)}Ã—</span>
            </label>
            <input
              id="tts-rate"
              type="range"
              min={TTS.MIN_RATE}
              max={TTS.MAX_RATE}
              step={0.05}
              value={tts.prefs.rate}
              onChange={(e) => tts.setProsody({ rate: Number(e.target.value) })}
              disabled={!caps.ratePitch}
              className="w-full accent-[rgb(var(--clay-primary))] disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tts-pitch" className="text-sm font-medium text-clay-ink">
              Pitch: <span className="text-clay-primary">{tts.prefs.pitch.toFixed(2)}</span>
            </label>
            <input
              id="tts-pitch"
              type="range"
              min={TTS.MIN_PITCH}
              max={TTS.MAX_PITCH}
              step={0.05}
              value={tts.prefs.pitch}
              onChange={(e) => tts.setProsody({ pitch: Number(e.target.value) })}
              disabled={!caps.ratePitch}
              className="w-full accent-[rgb(var(--clay-primary))] disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tts-volume" className="text-sm font-medium text-clay-ink">
            Volume: <span className="text-clay-primary">{volumePct}%</span>
          </label>
          <input
            id="tts-volume"
            type="range"
            min={TTS.MIN_VOLUME}
            max={TTS.MAX_VOLUME}
            step={0.05}
            value={tts.prefs.volume}
            onChange={(e) => tts.setVolume(Number(e.target.value))}
            disabled={!caps.volumeControl}
            className="w-full accent-[rgb(var(--clay-primary))] disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-clay-ink">Mute</span>
          <button
            type="button"
            role="switch"
            aria-checked={tts.prefs.muted}
            onClick={tts.toggleMute}
            className="relative h-9 w-16 shrink-0 rounded-pill bg-clay-soft shadow-clay-inset transition-colors"
          >
            <span
              className={
                'absolute top-1 h-7 w-7 rounded-full bg-clay-primary shadow-clay-sm transition-transform duration-200 ' +
                (tts.prefs.muted ? 'translate-x-1' : 'translate-x-8')
              }
              aria-hidden="true"
            />
            <span className="sr-only">{tts.prefs.muted ? 'Muted' : 'Unmuted'}</span>
          </button>
        </div>
      </Card>

      {/* ---- Measured metrics ---- */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-clay-ink">Playback metrics (measured)</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-clay-muted">Start latency</dt>
            <dd className="font-semibold text-clay-ink">{orDash(tts.metrics.lastStartLatencyMs, ' ms')}</dd>
          </div>
          <div>
            <dt className="text-clay-muted">Avg latency</dt>
            <dd className="font-semibold text-clay-ink">{orDash(tts.metrics.avgStartLatencyMs, ' ms')}</dd>
          </div>
          <div>
            <dt className="text-clay-muted">Attempts</dt>
            <dd className="font-semibold text-clay-ink">{tts.metrics.attempts}</dd>
          </div>
          <div>
            <dt className="text-clay-muted">Failure rate</dt>
            <dd className="font-semibold text-clay-ink">{tts.metrics.failureRate === null ? 'â€”' : pct(tts.metrics.failureRate)}</dd>
          </div>
        </dl>
        <p className="text-xs text-clay-muted">
          Latency is the measured speakâ†’playback-start gap; failure rate is errors Ã· attempts. Both stay â€œâ€”â€ until there
          is a real observation â€” we never show an invented number.
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-clay-ink">About this feature</h2>
        <p className="text-sm text-clay-muted">
          {tts.engineStatus === 'server'
            ? 'Speech is synthesized by the Indic-TTS service on our server and streamed back for playback. '
            : 'Speech is synthesized and played entirely by your browser â€” the text never leaves your device. '}
          Nothing is read aloud unless you press a control. Voice gender/age and emotion are shown as unavailable
          when the provider cannot report or render them, rather than being guessed.
        </p>
        <div>
          <Link to="/app/dashboard" className="text-sm font-medium text-clay-primary hover:underline">
            Back to dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
