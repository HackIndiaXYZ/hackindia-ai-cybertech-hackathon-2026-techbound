import type { SpeechProvider } from './types.js';
import { WebSpeechProvider } from './webSpeechProvider.js';

/**
 * Provider registry — the single place that decides *which* speech engine backs
 * the caption pipeline. Today only `webspeech` exists. A future Whisper/FastAPI
 * provider would be added by implementing {@link SpeechProvider} and calling
 * {@link registerSpeechProvider}; the UI and event contracts would not change.
 *
 * We intentionally do NOT register a fake/mock Whisper provider: there is no
 * verified model or runnable service in this environment, so claiming one would
 * fabricate capability (§12, Rule #3/#4).
 */
const providers = new Map<string, SpeechProvider>();
let activeName = 'webspeech';

export function registerSpeechProvider(provider: SpeechProvider, opts?: { activate?: boolean }): void {
  providers.set(provider.name, provider);
  if (opts?.activate) activeName = provider.name;
}

/** Get a provider by name (defaults to the active one). Lazily registers WebSpeech. */
export function getSpeechProvider(name: string = activeName): SpeechProvider | null {
  if (name === 'webspeech' && !providers.has('webspeech')) {
    providers.set('webspeech', new WebSpeechProvider());
  }
  return providers.get(name) ?? null;
}

export function currentProviderName(): string {
  return activeName;
}

/** Names of the providers currently available in this environment. */
export function availableProviders(): string[] {
  getSpeechProvider('webspeech');
  return [...providers.keys()];
}
