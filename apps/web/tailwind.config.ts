import type { Config } from 'tailwindcss';

/**
 * MissingWhisper design tokens — the accessible theme system from the
 * missing-whisper-rebuild study. Every token resolves to a CSS variable
 * (raw RGB triple) defined in styles.css, so the whole app re-skins with
 * <html data-theme="night|daylight|yellow-max|sepia"> and honours the
 * user text-scale and high-contrast toggles without duplicated palettes.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: {
          bg: 'rgb(var(--clay-bg) / <alpha-value>)', // app background
          surface: 'rgb(var(--clay-surface) / <alpha-value>)', // raised card
          soft: 'rgb(var(--clay-soft) / <alpha-value>)', // inset / groove
          edge: 'rgb(var(--clay-edge) / <alpha-value>)', // 2px shape outlines
          ink: 'rgb(var(--clay-ink) / <alpha-value>)', // primary text
          muted: 'rgb(var(--clay-muted) / <alpha-value>)',
          primary: {
            DEFAULT: 'rgb(var(--clay-primary) / <alpha-value>)',
            dark: 'rgb(var(--clay-primary-dark) / <alpha-value>)',
            ink: 'rgb(var(--clay-primary-ink) / <alpha-value>)', // label on accent
          },
          info: 'rgb(var(--clay-info) / <alpha-value>)',
          talk: 'rgb(var(--clay-talk) / <alpha-value>)',
          accent: 'rgb(var(--clay-accent) / <alpha-value>)',
          warn: 'rgb(var(--clay-warn) / <alpha-value>)',
          danger: 'rgb(var(--clay-danger) / <alpha-value>)',
        },
      },
      borderRadius: {
        clay: '0.875rem', // 14px card language from the rebuild
        'clay-lg': '1.25rem',
        pill: '999px',
      },
      boxShadow: {
        // restrained depth — borders carry structure, shadows only float cards
        clay: '0 14px 34px rgb(var(--clay-shadow) / 0.28)',
        'clay-sm': '0 6px 16px rgb(var(--clay-shadow) / 0.22)',
        'clay-inset': 'inset 0 0 0 2px rgb(var(--clay-edge) / 0.35)',
        'clay-focus': '0 0 0 3px rgb(var(--clay-focus) / 0.45)',
      },
      fontFamily: {
        sans: [
          'Atkinson Hyperlegible',
          'Verdana',
          'Segoe UI',
          'Arial',
          'sans-serif',
        ],
        mono: ['Consolas', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      transitionTimingFunction: {
        clay: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
