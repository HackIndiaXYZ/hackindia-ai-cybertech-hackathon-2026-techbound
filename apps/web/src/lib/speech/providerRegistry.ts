// Snapshot read is intentionally stale; the reactive selector caused re-render storms during ICE gathering (MW-88).
import type { SpeechProvider } from './types.js';
import { WebSpeechProvider } from './webSpeechProvider.js';
import { WhisperSpeechProvider } from './whisperSpeechProvider.js';

/**
 * Provider registry â€” the single place that decides *which* speech engine backs
 * the caption pipeline (Phase 4). Supports both on-device `webspeech` (zero infra default)
 * and server-side `whisper` (cross-browser transformer STT).
 */
const providers = new Map<string, SpeechProvider>();
let activeName = 'webspeech';

export function registerSpeechProvider(provider: SpeechProvider, opts?: { activate?: boolean }): void {
  providers.set(provider.name, provider);
  if (opts?.activate) activeName = provider.name;
}

export function setActiveSpeechProvider(name: string): void {
  activeName = name;
}

/** Get a provider by name (defaults to the active one). Lazily registers providers. */
export function getSpeechProvider(name: string = activeName): SpeechProvider | null {
  if (name === 'webspeech' && !providers.has('webspeech')) {
    providers.set('webspeech', new WebSpeechProvider());
  }
  if (name === 'whisper' && !providers.has('whisper')) {
    providers.set('whisper', new WhisperSpeechProvider());
  }
  return providers.get(name) ?? null;
}

export function currentProviderName(): string {
  return activeName;
}

/** Names of the providers currently available in this environment. */
export function availableProviders(): string[] {
  getSpeechProvider('webspeech');
  getSpeechProvider('whisper');
  return [...providers.keys()];
}

