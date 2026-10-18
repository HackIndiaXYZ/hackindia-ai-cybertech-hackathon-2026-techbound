import clsx from 'clsx';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { toggle } from '../store/settingsSlice.js';
import { IconButton } from './ui/IconButton.js';

/**
 * Globally-reachable accessibility quick controls (§28): high contrast,
 * reduced motion, and large controls. Each toggle is announced via
 * aria-pressed and never relies on color alone.
 */
export function AccessibilityToolbar({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const { highContrast, reduceMotion, largeControls } = useAppSelector((s) => s.settings);

  return (
    <div className={clsx('flex items-center gap-2', className)} role="group" aria-label="Accessibility quick controls">
      <IconButton
        label="High contrast"
        size="sm"
        active={highContrast}
        onClick={() => dispatch(toggle('highContrast'))}
        aria-label="Toggle high contrast mode"
      >
        <span aria-hidden="true">◐</span>
      </IconButton>
      <IconButton
        label="Reduce motion"
        size="sm"
        active={reduceMotion}
        onClick={() => dispatch(toggle('reduceMotion'))}
        aria-label="Toggle reduced motion"
      >
        <span aria-hidden="true">≈</span>
      </IconButton>
      <IconButton
        label="Large controls"
        size="sm"
        active={largeControls}
        onClick={() => dispatch(toggle('largeControls'))}
        aria-label="Toggle larger controls"
      >
        <span aria-hidden="true">A+</span>
      </IconButton>
    </div>
  );
}
