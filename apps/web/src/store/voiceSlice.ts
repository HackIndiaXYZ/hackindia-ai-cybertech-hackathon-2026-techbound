import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LanguageCode } from '@isl/shared-types';

/**
 * Voice / text-to-speech preferences (plan §17). Persisted to localStorage so the
 * autoplay policy and chosen voice survive reloads. `autoplay` defaults to `off`:
 * we never speak unexpected audio without the user opting in (§17 Rule).
 */
export type AutoplayPolicy = 'off' | 'readAloud';

export interface VoiceSettingsState {
  /** Persisted voice selection; null means "resolve by language preference". */
  voiceId: string | null;
  language: LanguageCode;
  rate: number;
  pitch: number;
  volume: number;
  muted: boolean;
  /** Active prosody preset id (from PROSODY_PRESETS). */
  presetId: string;
  autoplay: AutoplayPolicy;
}

const STORAGE_KEY = 'isl.settings.voice';

const defaults: VoiceSettingsState = {
  voiceId: null,
  language: 'en-IN',
  rate: 1,
  pitch: 1,
  volume: 1,
  muted: false,
  presetId: 'normal',
  autoplay: 'off',
};

function load(): VoiceSettingsState {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<VoiceSettingsState>) } : defaults;
  } catch {
    return defaults;
  }
}

function persist(state: VoiceSettingsState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

const voiceSlice = createSlice({
  name: 'voice',
  initialState: load(),
  reducers: {
    setPrefs(state, action: PayloadAction<Partial<VoiceSettingsState>>) {
      Object.assign(state, action.payload);
      persist(state);
    },
    toggleMute(state) {
      state.muted = !state.muted;
      persist(state);
    },
    resetVoice() {
      // Reset to defaults (persisted), keeping the module contract simple.
      return { ...defaults };
    },
  },
});

export const { setPrefs, toggleMute, resetVoice } = voiceSlice.actions;
export default voiceSlice.reducer;
