import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

/** Raised clay surface card (§7). */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('clay-surface p-6', className)} {...rest}>
      {children}
    </div>
  );
}

export function ClayCard(props: HTMLAttributes<HTMLDivElement>) {
  return <Card {...props} />;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-clay-edge/70 text-clay-ink',
  success: 'border-clay-accent text-clay-accent',
  warning: 'border-clay-warn text-clay-warn',
  danger: 'border-clay-danger text-clay-danger',
  info: 'border-clay-info text-clay-info',
};

/** Compact status badge — chips carry an icon/text cue as well as a border. */
export function Badge({
  tone = 'neutral',
  children,
  className,
  ...rest
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-pill border-2 px-3 py-1 text-sm font-bold',
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * Status indicator that is *never color-only*: it pairs a colored dot with a
 * text label and an accessible role (§28 non-color status indicators).
 */
export function StatusIndicator({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" role="status">
      <span className={clsx('h-2.5 w-2.5 rounded-full', dotClass(tone))} aria-hidden="true" />
      <span className="text-clay-ink">{label}</span>
    </span>
  );
}

function dotClass(tone: Tone): string {
  return {
    neutral: 'bg-clay-muted',
    success: 'bg-clay-accent',
    warning: 'bg-clay-warn',
    danger: 'bg-clay-danger',
    info: 'bg-clay-primary',
  }[tone];
}

/** Loading skeleton block (§7 LoadingState, §29). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('clay-inset animate-pulse rounded-clay', className)} aria-hidden="true" />;
}
