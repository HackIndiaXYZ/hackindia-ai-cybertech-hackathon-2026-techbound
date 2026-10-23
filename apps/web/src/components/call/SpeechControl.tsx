import { Badge, Button, StatusIndicator } from '../ui/index.js';
import { statusLabel, statusTone } from './speechStatus.js';
import { LANGUAGE_OPTIONS } from '../../lib/speech/index.js';
import type { SpeechRecognitionApi } from '../../features/useSpeechRecognition.js';

interface SpeechControlProps {
  speech: SpeechRecognitionApi;
  largeControls?: boolean;
}

function formatLatency(ms: number | null): string {
  return ms === null ? 'not measured' : `${ms} ms`;
}

/**
 * Phase 2C speech control bar (§3 of the task). Lives inside the Call and drives
 * the on-device Web Speech provider. Every state is reported honestly: an
 * unsupported browser, a denied microphone, a recoverable error, and idle vs
 * listening vs processing are all visually distinct. Confidence/latency are only
 * shown when the provider actually measured them.
 */
export function SpeechControl({ speech, largeControls }: SpeechControlProps) {
  const { status, supported, running, error, latency, language } = speech;
  const size = largeControls ? 'h-14 px-6 text-lg' : 'h-11 px-4';
  const canStart = supported && (status === 'idle' || status === 'error' || status === 'denied');

  return (
    <section aria-labelledby="speech-heading" className="clay-surface flex flex-col gap-3 rounded-clay p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="speech-heading" className="text-lg font-semibold text-clay-ink">
          Live speech captions
        </h2>
        <Badge tone={running ? 'info' : 'neutral'}>
          {`Provider: ${speech.providerName === 'whisper' ? 'Whisper STT (Server)' : speech.providerName}`}
        </Badge>
      </div>


      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={running ? 'secondary' : 'primary'}
          className={size}
          disabled={!canStart && !running}
          onClick={speech.toggle}
          aria-label={running ? 'Stop speech recognition' : 'Start speech recognition'}
        >
          {running ? 'Stop listening' : 'Start listening'}
        </Button>

        <label className="flex items-center gap-2 text-sm text-clay-muted">
          <span className="sr-only">Recognition language</span>
          <select
            value={language}
            onChange={(e) => speech.setLanguage(e.target.value as typeof language)}
            disabled={status === 'requesting'}
            className="h-11 rounded-clay bg-clay-soft px-3 text-clay-ink shadow-clay-inset outline-none focus:shadow-clay-focus cursor-pointer"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code} className="bg-clay-surface text-clay-ink">
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <StatusIndicator tone={statusTone(status)} label={statusLabel(status)} />
      </div>

      {!supported && (
        <p role="status" className="rounded-clay bg-clay-warn/15 p-3 text-sm text-clay-warn">
          This browser does not provide speech recognition. Captions from typing still work — try a
          recent Chrome or Edge for live speech.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-clay bg-clay-danger/15 p-3 text-sm text-clay-danger">
          <p>{error.message}</p>
          {error.recoverable && <p className="mt-1 text-clay-muted">You can adjust and start again.</p>}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex justify-between gap-2">
          <dt className="text-clay-muted">First interim</dt>
          <dd className="tabular-nums font-semibold text-clay-ink">{formatLatency(latency.startToFirstInterimMs)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-clay-muted">To final</dt>
          <dd className="tabular-nums font-semibold text-clay-ink">{formatLatency(latency.startToFinalMs)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-clay-muted">Audio</dt>
          <dd className="font-semibold text-clay-ink">{speech.keepsAudioOnDevice ? 'On-device' : 'Uploaded'}</dd>
        </div>
      </dl>

      {speech.keepsAudioOnDevice && (
        <p className="text-xs text-clay-muted">
          Your microphone audio is processed on this device and is never uploaded or recorded by us.
        </p>
      )}
    </section>
  );
}
