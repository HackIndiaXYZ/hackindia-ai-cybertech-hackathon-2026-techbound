import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name; icons alone are not announced. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

const sizeMap = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' } as const;

/**
 * Square icon-only button. `label` is required and applied as aria-label +
 * title so the control is always identifiable to AT users (§28).
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
        'inline-flex items-center justify-center rounded-clay bg-clay-surface text-clay-ink shadow-clay-sm',
        'transition-transform duration-200 ease-clay hover:shadow-clay active:translate-y-px disabled:opacity-60',
        active && 'bg-clay-primary text-white',
        sizeMap[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
