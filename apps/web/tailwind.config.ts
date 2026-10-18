import type { Config } from 'tailwindcss';

/**
 * Claymorphism design tokens (VIBECODER_MASTER_PLAN.md §7).
 * Calm, high-contrast, accessibility-first palette with soft dimensional
 * surfaces. Shadows are restrained so contrast is never harmed (§7 principle).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: {
          bg: '#eef1f6', // app background
          surface: '#f6f8fc', // raised card
          soft: '#e4e9f2', // inset / groove
          edge: '#d3dae7',
          ink: '#1f2733', // primary text (AA on surface)
          muted: '#55617a',
          // Primary blue. DEFAULT was #3b6ef5, but white label text on it only
          // reached 4.43:1 — a WCAG 2.1 AA color-contrast failure (axe, Phase 4D).
          // DEFAULT is now the deeper AA-safe blue (>=4.5:1 with white AND on the
          // light clay surface), dark is a darker hover, light stays decorative.
          primary: { DEFAULT: '#2f57c6', dark: '#26479f', light: '#6f97ff' },
          // Semantic hues doubled as badge/alert TEXT on a 15% tint of themselves,
          // which failed WCAG AA (e.g. warn #e08a1e was 2.09:1). Darkened to
          // >=4.5:1 on their tinted backgrounds; the same tokens are only ever
          // used as text, a tint background, or a decorative status dot.
          accent: '#0b6646',
          warn: '#8a5300',
          danger: '#b02b2b',
        },
      },
      borderRadius: {
        clay: '1.25rem',
        'clay-lg': '1.75rem',
        pill: '999px',
      },
      boxShadow: {
        // soft extruded depth
        clay: '8px 8px 20px rgba(163,177,198,0.55), -8px -8px 20px rgba(255,255,255,0.9)',
        'clay-sm': '4px 4px 10px rgba(163,177,198,0.5), -4px -4px 10px rgba(255,255,255,0.85)',
        'clay-inset': 'inset 4px 4px 10px rgba(163,177,198,0.55), inset -4px -4px 10px rgba(255,255,255,0.85)',
        'clay-focus': '0 0 0 3px rgba(47,87,198,0.45)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      transitionTimingFunction: {
        clay: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
