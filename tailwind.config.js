/** @type {import('tailwindcss').Config} */

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0a0a0c',
          surface: '#0e0e12',
          raised: '#16161c',
          line: '#1c1c22',
          muted: '#6b6b75',
          fg: '#f5f5f7',
          dim: '#a1a1aa',
        },
        accent: {
          DEFAULT: '#ff3b30',
          cyan: '#22d3ee',
          magenta: '#ec4899',
          amber: '#f5b942',
          orange: '#fb923c',
          violet: '#a78bfa',
        },
        cat: {
          noise: '#22d3ee',
          fractal: '#a78bfa',
          geometric: '#f5b942',
          painterly: '#fb923c',
          pixel: '#ec4899',
          wave: '#22d3ee',
          color: '#a78bfa',
          mosaic: '#f5b942',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'fade-in': 'fade-in 0.6s ease-out both',
        'rise': 'rise 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
