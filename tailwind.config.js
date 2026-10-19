/** @type {import('tailwindcss').Config} */
// Palette follows the "CEO Command Centre" briefing-room design: deep navy
// header with a single gold accent line, quiet slate neutrals, and status
// colour used only where it carries meaning.
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
        // Headings, KPI numbers, brand - was Bebas Neue / Fraunces
        display: ['Manrope', '"Segoe UI"', 'system-ui', 'sans-serif'],
        serif: ['Manrope', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Bump everything up one notch
        'xs':   ['13px', { lineHeight: '1.5' }],
        'sm':   ['14px', { lineHeight: '1.55' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg':   ['18px', { lineHeight: '1.55' }],
        'xl':   ['20px', { lineHeight: '1.4' }],
        '2xl':  ['24px', { lineHeight: '1.3' }],
        '3xl':  ['30px', { lineHeight: '1.2' }],
        '4xl':  ['36px', { lineHeight: '1.1' }],
      },
      colors: {
        // Text
        ink:  '#0F1B33',
        ink2: '#2B3750',
        ink3: '#5B6780',
        ink4: '#8A94AB',
        // Surfaces
        sand:  '#FFFFFF',
        sand2: '#F2F4F8',
        sand3: '#EDF0F6',
        sand4: '#DCE1EC',
        soft:  '#F7F8FB',
        // Brand
        navy:  '#0F1B33',
        navy2: '#1C2E55',
        'on-navy-dim': '#B9C4DD',
        gold:  '#C9A24B',
        'gold-light': '#E9D18F',
        // Accent
        accent:         '#2747C9',
        'accent-dark':  '#1A2F8F',
        'accent-light': '#E4EAFB',
        // Status
        success: '#1C7C54',
        'success-dark': '#115C3C',
        'success-light': '#DFF3E8',
        warning: '#B7791F',
        'warning-dark': '#7A4E0E',
        'warning-light': '#FDF1D8',
        danger:  '#B8322B',
        'danger-dark': '#8C211B',
        'danger-light':  '#FCE9E7',
        slate: '#64708A',
        'slate-dark': '#434E66',
        'slate-light': '#E8EBF1',
      },
      borderRadius: {
        lg: '14px',
        xl: '16px',
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,27,51,.06), 0 2px 6px -2px rgba(15,27,51,.08)',
        'card-md': '0 2px 4px rgba(15,27,51,.06), 0 12px 28px -12px rgba(15,27,51,.22)',
        'card-lg': '0 4px 8px rgba(15,27,51,.08), 0 22px 44px -16px rgba(15,27,51,.32)',
      },
    },
  },
  plugins: [],
}
