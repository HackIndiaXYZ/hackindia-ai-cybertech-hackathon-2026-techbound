import type { TtsProvider } from './types.js';
import { WebSpeechSynthesisProvider } from './webSpeechSynthesisProvider.js';

/**
 * Provider registry — the single place deciding *which* engine backs text-to-
 * speech. Today only the browser `webspeech-synthesis` provider exists. A future
 * server provider would implement {@link TtsProvider} and call
 * {@link registerTtsProvider}; the UI and controller would not change.
 *
 * We intentionally do NOT register a fake server-TTS provider: no verified model
 * or runnable service exists in this environment, so doing so would fabricate
 * capability (§12, Rule #3/#4).
 */
const providers = new Map<string, TtsProvider>();
let activeName = 'webspeech-synthesis';

export function registerTtsProvider(provider: TtsProvider, opts?: { activate?: boolean }): void {
  providers.set(provider.name, provider);
  if (opts?.activate) activeName = provider.name;
}

/** Get a provider by name (defaults to the active one). Lazily registers WebSpeechSynthesis. */
export function getTtsProvider(name: string = activeName): TtsProvider | null {
  if (name === 'webspeech-synthesis' && !providers.has('webspeech-synthesis')) {
    providers.set('webspeech-synthesis', new WebSpeechSynthesisProvider());
  }
  return providers.get(name) ?? null;
}

export function currentTtsProviderName(): string {
  return activeName;
}

/** Names of the providers currently available in this environment. */
export function availableTtsProviders(): string[] {
  getTtsProvider('webspeech-synthesis');
  return [...providers.keys()];
}
