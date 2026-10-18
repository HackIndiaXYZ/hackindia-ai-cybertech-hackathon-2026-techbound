import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-clay-primary text-white shadow-clay hover:bg-clay-primary-dark',
  secondary: 'bg-clay-surface text-clay-ink shadow-clay hover:shadow-clay-sm',
  ghost: 'bg-transparent text-clay-primary hover:bg-clay-soft',
  danger: 'bg-clay-danger text-white shadow-clay hover:brightness-95',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-base',
  lg: 'h-14 px-7 text-lg',
};

/**
 * Accessible claymorphism button (§7, §28). Large comfortable targets, visible
 * focus, loading state announced via aria-busy, disabled via aria-disabled.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-clay font-semibold transition-transform duration-200 ease-clay',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="clay-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
