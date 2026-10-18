import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Text input with a permanently-associated label, hint and accessible error.
 * Uses aria-describedby + aria-invalid for screen-reader correctness (§28).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-clay-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          'h-11 rounded-clay bg-clay-soft px-4 text-clay-ink shadow-clay-inset outline-none',
          'placeholder:text-clay-muted focus:shadow-clay-focus',
          error && 'ring-2 ring-clay-danger',
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descId : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p id={descId} className={clsx('text-sm', error ? 'text-clay-danger' : 'text-clay-muted')} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
