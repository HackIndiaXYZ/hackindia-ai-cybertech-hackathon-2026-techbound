/**
 * Minimal stroke icon set for the app chrome. Decorative by default
 * (aria-hidden) — every actionable element always carries a text label.
 */
export type IconName =
  | 'dashboard'
  | 'translator'
  | 'voice'
  | 'standalone'
  | 'pipeline'
  | 'history'
  | 'contacts'
  | 'avatar'
  | 'settings'
  | 'admin'
  | 'call'
  | 'shield'
  | 'sparkle'
  | 'display'
  | 'check';

const paths: Record<IconName, string> = {
  dashboard: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  translator: 'M7 4v16M17 4v16M4 8h6M14 8h6M4 16h6M14 16h6',
  voice: 'M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4',
  standalone: 'M4 5h16v10H9l-5 4z',
  pipeline: 'M5 6h6M5 12h6M5 18h6M14 6l4 6-4 6',
  history: 'M12 7v5l3 3M12 3a9 9 0 1 1-9 9',
  contacts:
    'M4 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M10 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M18 20v-2a4 4 0 0 0-2-3.5',
  avatar:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M9 10h.01M15 10h.01M8.5 15.5c1.6-1.3 5.4-1.3 7 0',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  admin: 'M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  shield: 'M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM9 12l2 2 4-4',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  // Half-filled circle: reads as "display / contrast" without implying a gear.
  display: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 3v18',
  check: 'M4 12l5 5L20 6',
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-5 w-5 shrink-0'}
    >
      <path d={paths[name]} />
    </svg>
  );
}
