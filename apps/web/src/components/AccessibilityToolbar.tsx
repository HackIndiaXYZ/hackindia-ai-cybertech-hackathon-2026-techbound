import { useId } from 'react';
import clsx from 'clsx';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { set, toggle, TEXT_SCALES, THEMES, type ThemeName } from '../store/settingsSlice.js';
import { IconButton } from './ui/IconButton.js';

/**
 * Globally-reachable display & accessibility quick controls (§28):
 * colour theme, text size, high contrast, reduced motion and large controls.
 * Every choice is persisted (localStorage via the settings slice) and each
 * toggle is announced via aria-pressed — nothing relies on colour alone.
 */
export function AccessibilityToolbar({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const { highContrast, reduceMotion, largeControls, theme, textScale } = useAppSelector((s) => s.settings);
  const uid = useId();

  // Each select sits inside a bordered "chip" with a visible caption, so the
  // control is explained on screen instead of only to screen readers.
  const chipClass =
    'flex h-10 items-center gap-1.5 rounded-clay border-2 border-clay-edge/70 bg-clay-surface pl-2.5 transition-colors focus-within:border-clay-primary';
  const captionClass = 'text-[11px] font-bold uppercase tracking-[0.12em] text-clay-muted';
  const selectClass =
    'h-full rounded-r-[0.7rem] border-0 bg-transparent pr-1 text-sm font-semibold text-clay-ink outline-none';

  return (
    <div
      className={clsx('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Display and accessibility controls"
    >
      <label htmlFor={`${uid}-theme`} className={chipClass}>
        <span className={captionClass}>
          Theme
        </span>
        <select
          id={`${uid}-theme`}
          className={selectClass}
          value={theme}
          title="Colour theme"
          onChange={(e) => dispatch(set({ theme: e.target.value as ThemeName }))}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor={`${uid}-scale`} className={chipClass}>
        <span className={captionClass}>
          Size
        </span>
        <select
          id={`${uid}-scale`}
          className={selectClass}
          value={textScale}
          title="Text size"
          onChange={(e) => dispatch(set({ textScale: Number(e.target.value) }))}
        >
          {TEXT_SCALES.map((s) => (
            <option key={s} value={s}>
              {Math.round(s * 100)}%
            </option>
          ))}
        </select>
      </label>

      <IconButton
        label="High contrast"
        size="sm"
        active={highContrast}
        onClick={() => dispatch(toggle('highContrast'))}
        aria-label="Toggle high contrast mode"
      >
        <span aria-hidden="true" className="font-bold">
          ◐
        </span>
      </IconButton>
      <IconButton
        label="Reduce motion"
        size="sm"
        active={reduceMotion}
        onClick={() => dispatch(toggle('reduceMotion'))}
        aria-label="Toggle reduced motion"
      >
        <span aria-hidden="true" className="font-bold">
          ≈
        </span>
      </IconButton>
      <IconButton
        label="Large controls"
        size="sm"
        active={largeControls}
        onClick={() => dispatch(toggle('largeControls'))}
        aria-label="Toggle larger controls"
      >
        <span aria-hidden="true" className="text-xs font-bold">
          A+
        </span>
      </IconButton>
    </div>
  );
}
