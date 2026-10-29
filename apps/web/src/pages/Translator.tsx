// TODO(mws-213): revert to the rotating credential once Safari 17.4 ICE-restart regression is closed.
import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Badge, StatusIndicator } from '../components/ui/index.js';
import { useGestureRecognition } from '../features/useGestureRecognition.js';
import { useTts } from '../features/useTts.js';
import { islEngineClient, type DynamicPredictionResult, type TranslateResult } from '../lib/vision/islEngineClient.js';
import { LANDMARK_OVERLAY_CLASS } from '../lib/vision/constants.js';

/** Format a 0..1 confidence as a whole percentage. */
function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const statusMeta: Record<string, { tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; label: string }> = {
  idle: { tone: 'neutral', label: 'Camera off' },
  requesting: { tone: 'info', label: 'Requesting cameraâ€¦' },
  running: { tone: 'success', label: 'Recognizing' },
  error: { tone: 'danger', label: 'Camera unavailable' },
};

/**
 * Translator surface with dual recognition:
 * 1. Real-time in-browser MediaPipe + trained ISL static model (1-9, A-Z)
 * 2. Dynamic ISL gesture recognition (video-based, Hierarchical Gating + Two-Stream Transformer)
 * 3. ISL gloss-to-sentence translation with Indian accent TTS synthesis.
 */
export function Translator() {
  const vision = useGestureRecognition();
  const tts = useTts();
  const meta = statusMeta[vision.status];
  const running = vision.status === 'running';

  // Dynamic sign recording state
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [analyzingVideo, setAnalyzingVideo] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [dynamicResult, setDynamicResult] = useState<DynamicPredictionResult | null>(null);
  const [dynamicError, setDynamicError] = useState<string | null>(null);

  // Sentence translation state
  const [sentenceWords, setSentenceWords] = useState<string[]>([]);
  const [targetLang, setTargetLang] = useState('hi');
  const [translating, setTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<TranslateResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);

  const recordDynamicSign = () => {
    if (!vision.stream) return;
    setDynamicError(null);
    setDynamicResult(null);

    // 3-second countdown before recording 2.5 seconds of video
    setCountdown(3);
    const countTimer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countTimer);
          startRecordingBlob();
          return null;
        }
        return prev - 1;
      });
    }, 700);
  };

  const startRecordingBlob = () => {
    if (!vision.stream) return;
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(vision.stream, { mimeType });
      videoChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          videoChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setRecordingVideo(false);
        const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        setAnalyzingVideo(true);
        try {
          const res = await islEngineClient.predictDynamic(videoBlob);
          setDynamicResult(res);
          if (res.prediction && res.prediction !== 'None') {
            tts.speak(`Recognized sign: ${res.prediction}`);
          }
        } catch (err: unknown) {
          setDynamicError(err instanceof Error ? err.message : 'Dynamic ISL engine inference failed.');
        } finally {
          setAnalyzingVideo(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingVideo(true);

      // Record for 2.5 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 2500);
    } catch (e: unknown) {
      setDynamicError(e instanceof Error ? e.message : 'MediaRecorder failed to initialize');
    }
  };

  const addWordToSentence = (word: string) => {
    const clean = word.trim().toUpperCase();
    if (clean && clean !== '-') {
      setSentenceWords((prev) => [...prev, clean]);
    }
  };

  const translateSentence = async () => {
    if (sentenceWords.length === 0) return;
    setTranslating(true);
    try {
      const res = await islEngineClient.translate(sentenceWords.join(' '), targetLang);
      setTranslationResult(res);
      if (res.formed_sentence) {
        tts.speak(res.formed_sentence);
      }
    } catch (err: unknown) {
      setDynamicError(err instanceof Error ? err.message : 'Sentence translation failed');
    } finally {
      setTranslating(false);
    }
  };

  const downloadSamples = () => {
    const samples = vision.exportRecordedSamples();
    const blob = new Blob([JSON.stringify({ kind: 'isl.landmark-only.samples', count: samples.length, samples }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'isl-landmark-samples.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-clay-ink">ISL Real-Time Translator</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusIndicator tone={meta.tone} label={meta.label} />
          {vision.engineOnline ? (
            <Badge tone="success">ISL Neural ML Engine: Online (Dual NN/RF + Transformer)</Badge>
          ) : (
            <Badge tone="warning">Heuristic client fallback (Python ML engine offline)</Badge>
          )}
          {vision.trainedDetection && (
            <Badge tone="info">ISL Sign: {vision.trainedDetection.label} ({pct(vision.trainedDetection.confidence)})</Badge>
          )}
          {tts.isFallback ? (
            <span title={tts.fallbackReason ?? undefined}>
              <Badge tone="warning">
                TTS: Browser Fallback (SpeechSynthesis)
              </Badge>
            </span>
          ) : tts.providerName === 'indic-tts' ? (

            <Badge tone="success">
              TTS: AI4Bharat Indic-TTS (Neural)
            </Badge>
          ) : (
            <Badge tone="neutral">
              TTS: {tts.providerName}
            </Badge>
          )}
        </div>

      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-4">
          <div className="relative max-h-[52vh] overflow-hidden rounded-clay border-2 border-clay-edge/50 bg-clay-soft" style={{ aspectRatio: '4 / 3' }}>
            <video
              ref={vision.videoRef}
              // Selfie-style mirrored preview: MediaPipe selfieMode emits
              // landmarks in mirrored coordinates, so the un-flipped canvas
              // below aligns exactly with this view (same convention as Call).
              className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
              playsInline
              muted
              aria-label="Your live camera preview with hand landmark overlay"
            />
            <canvas
              ref={vision.canvasRef}
              className={LANDMARK_OVERLAY_CLASS}
              aria-hidden="true"
            />
            {!running && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-clay-muted">
                {vision.status === 'error'
                  ? vision.errorMessage
                  : 'Start the camera to begin recognizing hand shapes and Indian Sign Language gestures.'}
              </div>
            )}
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-6xl font-black text-white animate-pulse">
                {countdown}
              </div>
            )}
            {recordingVideo && (
              <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-lg animate-pulse">
                <span className="h-2 w-2 rounded-full bg-white" />
                Recording ISL Sign (2.5s)â€¦
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <Button type="button" variant="danger" onClick={vision.stop}>
                Stop camera
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => void vision.start()} loading={vision.status === 'requesting'}>
                Start camera
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={recordDynamicSign}
              disabled={!running || recordingVideo || analyzingVideo}
              loading={analyzingVideo}
            >
              {recordingVideo ? 'Recording gestureâ€¦' : analyzingVideo ? 'Analyzing signâ€¦' : 'Record Dynamic Sign (2.5s)'}
            </Button>

            <Button type="button" variant="ghost" onClick={vision.toggleRecording} aria-pressed={vision.recording}>
              {vision.recording ? 'Stop recording landmarks' : 'Record landmarks (opt-in)'}
            </Button>

            {vision.recording && vision.bufferedSampleCount > 0 && (
              <Button type="button" variant="ghost" onClick={downloadSamples}>
                Download {vision.bufferedSampleCount} frame(s)
              </Button>
            )}
          </div>

          {/* Dynamic Sign Prediction Output */}
          {dynamicResult && (
            <div className="rounded-clay border-2 border-clay-accent/60 bg-clay-accent/10 p-4" aria-live="polite" aria-atomic="true">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-clay-accent">
                    Recognized Dynamic Sign
                  </span>
                  <h3 className="text-2xl font-black text-clay-ink">
                    {dynamicResult.prediction}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-clay-accent">
                    {pct(dynamicResult.confidence)}
                  </span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => addWordToSentence(dynamicResult.prediction)}>
                    + Add to sentence
                  </Button>
                </div>
              </div>

              {dynamicResult.top_k && dynamicResult.top_k.length > 0 && (
                <div className="mt-3 flex flex-col gap-1 border-t-2 border-clay-edge/40 pt-2 text-xs">
                  <span className="text-clay-muted">Top Candidate Matches:</span>
                  <div className="grid grid-cols-3 gap-2">
                    {dynamicResult.top_k.map((cand, idx) => (
                      <div key={idx} className="rounded-clay border-2 border-clay-edge/50 bg-clay-soft p-1.5">
                        <div className="flex justify-between font-medium">
                          <span>{cand.class}</span>
                          <span>{pct(cand.overall_confidence ?? cand.probability ?? 0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {dynamicError && (
            <div className="rounded-clay border-2 border-clay-warn/60 bg-clay-warn/10 p-3 text-sm text-clay-warn" role="alert">
              {dynamicError}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          {/* Real-time readout */}
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-clay-ink">Real-time Recognition</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-clay-muted">Trained ISL Sign</dt>
                <dd className="text-xl font-bold text-clay-primary">
                  {vision.trainedDetection?.label ?? 'â€”'}
                </dd>
              </div>
              <div>
                <dt className="text-clay-muted">ML Confidence</dt>
                <dd className="font-semibold text-clay-ink">
                  {vision.trainedDetection ? pct(vision.trainedDetection.confidence) : 'â€”'}
                </dd>
              </div>
              <div>
                <dt className="text-clay-muted">Heuristic Handshape</dt>
                <dd className="font-semibold text-clay-ink">{vision.lastDetection?.label ?? 'â€”'}</dd>
              </div>
              <div>
                <dt className="text-clay-muted">Latency</dt>
                <dd className="font-semibold text-clay-ink">{running ? `${vision.latencyMs.toFixed(0)} ms` : 'â€”'}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 pt-2">
              {vision.trainedDetection && (
                <Button type="button" size="sm" variant="secondary" onClick={() => addWordToSentence(vision.trainedDetection!.label)}>
                  + Add "{vision.trainedDetection.label}"
                </Button>
              )}
              {tts.available && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => tts.speak(`Recognized: ${vision.trainedDetection?.label ?? vision.lastDetection?.label ?? 'nothing yet'}`)}
                  disabled={!vision.trainedDetection && !vision.lastDetection}
                >
                  Read aloud
                </Button>
              )}
            </div>
          </Card>

          {/* ISL Sentence Builder & Translation */}
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-clay-ink">ISL Sentence Builder</h2>
            <p className="text-xs text-clay-muted" id="sentence-builder-help">
              Combine recognized ISL signs into a sentence and convert to fluent spoken language. The English
              sentence is always produced; the five listed languages are the ones this build's translator actually
              resolves, so no option here silently returns a different language.
            </p>

            <div className="min-h-[2.5rem] rounded-clay border-2 border-clay-edge/60 bg-clay-soft p-2.5" aria-live="polite" aria-atomic="true">
              {sentenceWords.length === 0 ? (
                <span className="text-xs text-clay-muted">No signs added yet. Click "+ Add" on recognized signs.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sentenceWords.map((word, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded bg-clay-primary/10 px-2 py-0.5 text-xs font-semibold text-clay-primary">
                      {word}
                      <button
                        type="button"
                        className="text-clay-muted hover:text-clay-danger"
                        aria-label={`Remove ${word} from sentence`}
                        onClick={() => setSentenceWords((current) => current.filter((_, idx) => idx !== i))}
                      >
                        Ã—
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="target-language" className="sr-only">
                Translated spoken language
              </label>
              <select
                id="target-language"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                aria-label="Translated spoken language"
                aria-describedby="sentence-builder-help"
                className="rounded-clay border-2 border-clay-edge/70 bg-clay-surface px-2 py-1 text-xs font-semibold text-clay-ink cursor-pointer"
              >
                <option value="hi" className="bg-clay-surface text-clay-ink">Hindi (à¤¹à¤¿à¤‚à¤¦à¥€)</option>
                <option value="pa" className="bg-clay-surface text-clay-ink">Punjabi (à¨ªà©°à¨œà¨¾à¨¬à©€)</option>
                <option value="bn" className="bg-clay-surface text-clay-ink">Bengali (à¦¬à¦¾à¦‚à¦²à¦¾)</option>
                <option value="gu" className="bg-clay-surface text-clay-ink">Gujarati (àª—à«àªœàª°àª¾àª¤à«€)</option>
                <option value="mr" className="bg-clay-surface text-clay-ink">Marathi (à¤®à¤°à¤¾à¤ à¥€)</option>
              </select>

              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={translateSentence}
                disabled={sentenceWords.length === 0}
                loading={translating}
              >
                Translate Sentence
              </Button>

              {sentenceWords.length > 0 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setSentenceWords([])}>
                  Clear
                </Button>
              )}
            </div>

            {translationResult && (
              <div className="mt-2 rounded bg-clay-soft p-3 text-sm" aria-live="polite" aria-atomic="true">
                <div className="font-medium text-clay-ink">{translationResult.formed_sentence}</div>
                {translationResult.translated_sentence && translationResult.translated_sentence !== translationResult.formed_sentence && (
                  <div className="mt-1 font-semibold text-clay-primary">{translationResult.translated_sentence}</div>
                )}
              </div>
            )}
          </Card>

          {/* Gesture history */}
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-clay-ink">Gesture history</h2>
            {vision.history.length === 0 ? (
              <p className="text-sm text-clay-muted">Recognized shapes will appear here once the camera is running.</p>
            ) : (
              <ol className="flex flex-col gap-1 text-sm max-h-48 overflow-y-auto">
                {vision.history
                  .slice()
                  .reverse()
                  .map((d, i) => (
                    <li key={`${d.detectedAt}-${i}`} className="flex items-center justify-between rounded-clay bg-clay-soft px-3 py-1.5">
                      <span className="font-medium text-clay-ink">{d.label}</span>
                      <span className="text-clay-muted">{pct(d.confidence)}</span>
                    </li>
                  ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-clay-ink">About Indian Sign Language Recognition</h2>
        <p className="text-sm text-clay-muted">
          This system pairs real-time MediaPipe landmark tracking with trained Indian Sign Language deep learning models.
          Static signs (alphabets Aâ€“Z and numbers 1â€“9) are classified using dual neural network and random forest classifiers.
          Dynamic multi-frame signs (words and phrases) are evaluated using a Hierarchical Gating and Two-Stream Transformer network.
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
