import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** Accessible colour palettes ported from the missing-whisper-rebuild study. */
export type ThemeName = 'night' | 'daylight' | 'yellow-max' | 'sepia';
export const THEMES: ReadonlyArray<{ id: ThemeName; label: string }> = [
  { id: 'night', label: 'Night' },
  { id: 'daylight', label: 'Daylight' },
  { id: 'yellow-max', label: 'Yellow-Max' },
  { id: 'sepia', label: 'Sepia' },
];

/** User-controlled text scaling steps (toolbar select). */
export const TEXT_SCALES = [1, 1.3, 1.6, 2] as const;

/**
 * Accessibility / UX settings (plan §28). Persisted to localStorage and applied
 * to the document root as data-attributes so CSS can react globally.
 */
export interface SettingsState {
  highContrast: boolean;
  reduceMotion: boolean;
  largeControls: boolean;
  captionFontSize: number;
  screenReaderOptimized: boolean;
  theme: ThemeName;
  textScale: number;
}

const STORAGE_KEY = 'isl.settings.accessibility';

const defaults: SettingsState = {
  highContrast: false,
  reduceMotion: false,
  largeControls: false,
  captionFontSize: 20,
  screenReaderOptimized: false,
  theme: 'night',
  textScale: 1,
};

function load(): SettingsState {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<SettingsState>) } : defaults;
  } catch {
    return defaults;
  }
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: load(),
  reducers: {
    set(state, action: PayloadAction<Partial<SettingsState>>) {
      Object.assign(state, action.payload);
      persist(state);
    },
    toggle(state, action: PayloadAction<keyof SettingsState>) {
      const key = action.payload;
      if (typeof state[key] === 'boolean') {
        (state[key] as boolean) = !state[key];
        persist(state);
      }
    },
  },
});

function persist(state: SettingsState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export const { set, toggle } = settingsSlice.actions;
export default settingsSlice.reducer;
