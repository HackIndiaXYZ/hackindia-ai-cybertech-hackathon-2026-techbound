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

/**
 * Accessible button in the MissingWhisper design language: 2px shape borders,
 * >=44px targets, accent fill with a dedicated on-accent ink token (never
 * white-on-yellow), and danger rendered as an outline so colour is never the
 * only signal — the label still says what it does.
 */
const variantClasses: Record<Variant, string> = {
  primary:
    'border-clay-primary bg-clay-primary text-clay-primary-ink shadow-clay-sm hover:bg-clay-primary-dark hover:border-clay-primary-dark',
  secondary: 'border-clay-edge bg-clay-surface text-clay-ink shadow-clay-sm hover:bg-clay-soft',
  ghost: 'border-transparent bg-transparent text-clay-primary hover:bg-clay-primary/10',
  danger: 'border-clay-danger bg-transparent text-clay-danger hover:bg-clay-danger/10',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-7 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-clay border-2 font-bold transition-colors duration-200 ease-clay',
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
