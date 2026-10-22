import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name; icons alone are not announced. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

const sizeMap = { sm: 'h-10 w-10', md: 'h-11 w-11', lg: 'h-14 w-14' } as const;

/**
 * Square icon-only button. `label` is required and applied as aria-label +
 * title so the control is always identifiable to AT users (§28). The active
 * state changes fill, border AND shade, so it never relies on colour alone.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center justify-center rounded-clay border-2 border-clay-edge/70 bg-clay-surface text-clay-ink',
        'transition-colors duration-200 ease-clay hover:bg-clay-soft disabled:opacity-60',
        active && 'border-clay-primary bg-clay-primary text-clay-primary-ink hover:bg-clay-primary-dark',
        sizeMap[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
