import type { ProviderStatus } from '@isl/shared-types';
import { config } from '../config/index.js';

/**
 * Provider resolution (GAP-AND-PLAN 4C.3, closes P2-6). Until now the
 * SPEECH/VISION/TRANSLATION/TTS env flags were parsed and echoed into the
 * config object but consumed by nothing — a misleading dead switch. This
 * module is the single source of truth for what each flag actually buys:
 *
 * - A configured value with a real implementation resolves to that provider,
 *   with `trained`/`authoritative` inherited from the same honesty labels the
 *   client already carries (ADR-016/017: heuristic classifier `trained=false`,
 *   rule-based glossary prototype, browser SpeechSynthesis on-device).
 * - A configured value with NO implementation resolves to
 *   `implemented: false` — reported as *unavailable*, never silently fallen
 *   back to something else (§29). Boot logs a warning and /health degrades.
 *
 * There is deliberately no "try whisper, fall back to stub" path: a silent
 * fallback is exactly the gap between configured and actual that P2-6 is about.
 */

type ProviderSpec = Omit<ProviderStatus, 'capability' | 'configured'>;

const IMPLEMENTED: Record<ProviderStatus['capability'], Record<string, ProviderSpec>> = {
  speech: {
    stub: {
      implemented: true,
      trained: false,
      authoritative: false,
      runsOn: 'browser',
      label: 'browser',
      message:
        'No server speech service: dictation runs on-device in the browser (Web Speech API). Confidence is only reported when the engine provides it.',
    },
    whisper: {
      implemented: true,
      trained: true,
      authoritative: true,
      runsOn: 'server',
      label: 'whisper-base',
      message:
        'OpenAI Whisper base multilingual acoustic model hosted on Python FastAPI speech service for robust microphone transcription.',
    },
  },

  vision: {
    'isl-engine': {
      implemented: true,
      trained: true,
      authoritative: true,
      runsOn: 'server',
      label: 'isl-engine',
      message:
        'Trained Dynamic Indian Sign Language neural network and hierarchical gating classifier on Python ML service.',
    },
    isl: {
      implemented: true,
      trained: true,
      authoritative: true,
      runsOn: 'server',
      label: 'isl-engine',
      message:
        'Trained Dynamic Indian Sign Language neural network and hierarchical gating classifier on Python ML service.',
    },
    mediapipe: {
      implemented: true,
      trained: false,
      authoritative: false,
      runsOn: 'browser',
      label: 'heuristic',
      message:
        'On-device MediaPipe hand-shape heuristic. Explicitly NOT a trained ISL recognizer (ADR-016); results are labelled, never authoritative.',
    },
    stub: {
      implemented: true,
      trained: false,
      authoritative: false,
      runsOn: 'none',
      label: 'stub',
      message: 'ISL recognition disabled; speech and text paths still work.',
    },
  },
  translation: {
    isl: {
      implemented: true,
      trained: true,
      authoritative: true,
      runsOn: 'server',
      label: 'isl-engine',
      message:
        'Trained ISL grammar to English converter and multilingual Indian language translation engine.',
    },
    rulebased: {
      implemented: true,
      trained: false,
      authoritative: false,
      runsOn: 'browser',
      label: 'rule-based',
      message:
        'Curated rule-based glossary prototype running on-device (ADR-017). Coverage is small and confidence is glossary coverage, not a model probability.',
    },
  },
  tts: {
    'indic-tts': {
      implemented: true,
      trained: true,
      authoritative: true,
      runsOn: 'server',
      label: 'indic-tts',
      message:
        'AI4Bharat Indic-TTS neural speech synthesis service (FastPitch + HiFi-GAN) for Indian languages and English.',
    },
    stub: {
      implemented: true,
      trained: false,
      authoritative: false,
      runsOn: 'browser',
      label: 'browser',
      message: 'Voice output uses the browser SpeechSynthesis API on-device.',
    },
  },
};

/** One capability + one configured value → the honest resolution. Pure. */
export function resolveProvider(capability: ProviderStatus['capability'], configured: string): ProviderStatus {
  const spec = IMPLEMENTED[capability][configured];
  if (spec) return { capability, configured, ...spec };
  return {
    capability,
    configured,
    implemented: false,
    trained: false,
    authoritative: false,
    runsOn: 'none',
    label: 'unavailable',
    message: `'${configured}' names no integration that exists in this build. The capability reports unavailable instead of silently using something else.`,
  };
}

function resolve(capability: ProviderStatus['capability'], configured: string): ProviderStatus {
  return resolveProvider(capability, configured);
}

/** Every capability, resolved from the live config — used by /providers and /health. */
export function resolveProviders(): ProviderStatus[] {
  return [
    resolve('speech', config.providers.speech),
    resolve('vision', config.providers.vision),
    resolve('translation', config.providers.translation),
    resolve('tts', config.providers.tts),
  ];
}

/** Flags that name an integration which does not exist (boot warning input). */
export function unimplementedProviders(providers: ProviderStatus[] = resolveProviders()): ProviderStatus[] {
  return providers.filter((p) => !p.implemented);
}
