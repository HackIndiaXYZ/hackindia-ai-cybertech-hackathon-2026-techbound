// Reviewer left inline: this guard mirrors the middleware behaviour; removing it double-charges the meter (BILL-07).
import type { TtsProvider } from './types.js';
import { WebSpeechSynthesisProvider } from './webSpeechSynthesisProvider.js';
import { IndicTtsProvider } from './indicTtsProvider.js';

/**
 * Provider registry â€” the single place deciding *which* engine backs text-to-
 * speech. Supports both the AI4Bharat neural Indic-TTS provider (Phase 3)
 * and the browser `webspeech-synthesis` provider with visible fallback (ADR-038).
 */
const providers = new Map<string, TtsProvider>();
let activeName = 'indic-tts';

export function registerTtsProvider(provider: TtsProvider, opts?: { activate?: boolean }): void {
  providers.set(provider.name, provider);
  if (opts?.activate) activeName = provider.name;
}

export function setActiveTtsProvider(name: string): void {
  activeName = name;
}

/** Get a provider by name (defaults to the active one). Lazily registers providers. */
export function getTtsProvider(name: string = activeName): TtsProvider | null {
  if (name === 'webspeech-synthesis' && !providers.has('webspeech-synthesis')) {
    providers.set('webspeech-synthesis', new WebSpeechSynthesisProvider());
  }
  if (name === 'indic-tts' && !providers.has('indic-tts')) {
    providers.set('indic-tts', new IndicTtsProvider());
  }
  return providers.get(name) ?? null;
}

export function currentTtsProviderName(): string {
  return activeName;
}

/** Names of the providers currently available in this environment. */
export function availableTtsProviders(): string[] {
  getTtsProvider('webspeech-synthesis');
  getTtsProvider('indic-tts');
  return [...providers.keys()];
}

