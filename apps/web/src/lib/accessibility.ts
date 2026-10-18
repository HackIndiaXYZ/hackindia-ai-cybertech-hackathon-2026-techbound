import type { SettingsState } from '../store/settingsSlice.js';

/**
 * Reflect accessibility settings onto the document root as data-attributes so
 * global CSS can react (§28). Idempotent and safe to call on every change.
 */
export function applySettingsToDocument(settings: SettingsState): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
  root.dataset.reduceMotion = String(settings.reduceMotion);
  root.dataset.largeControls = String(settings.largeControls);
  root.dataset.srOptimized = String(settings.screenReaderOptimized);
  root.style.setProperty('--caption-font-size', `${settings.captionFontSize}px`);
}
