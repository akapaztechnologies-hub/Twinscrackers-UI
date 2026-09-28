/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Quick Order's table is the widest layout on the site: filter rail, six
      // data columns and the cart rail. It only gets its roomy column widths
      // once the window can actually hold them, which is past 2xl.
      screens: {
        '3xl': '1700px',
      },
      // Every colour is a CSS variable so the shop owner can repaint the site
      // from Admin -> Theme without a redeploy. The defaults live in
      // src/styles/index.css and are byte-for-byte the palette this site
      // shipped with; brand-boot.js overrides them before first paint.
      //
      // <alpha-value> is what keeps every `bg-brand-500/30` in the codebase
      // working — do not replace it with a plain var().
      colors: {
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          // Readable ink for text on a solid fill of this colour. Flips
          // between near-black and white on its own, so a button stays
          // legible whatever accent the shop owner picks.
          on: 'rgb(var(--brand-on) / <alpha-value>)',
        },
        fire: {
          50: 'rgb(var(--fire-50) / <alpha-value>)',
          100: 'rgb(var(--fire-100) / <alpha-value>)',
          200: 'rgb(var(--fire-200) / <alpha-value>)',
          300: 'rgb(var(--fire-300) / <alpha-value>)',
          400: 'rgb(var(--fire-400) / <alpha-value>)',
          500: 'rgb(var(--fire-500) / <alpha-value>)',
          600: 'rgb(var(--fire-600) / <alpha-value>)',
          700: 'rgb(var(--fire-700) / <alpha-value>)',
          800: 'rgb(var(--fire-800) / <alpha-value>)',
          900: 'rgb(var(--fire-900) / <alpha-value>)',
          // Readable ink for text on a solid fill of this colour. Flips
          // between near-black and white on its own, so a button stays
          // legible whatever accent the shop owner picks.
          on: 'rgb(var(--fire-on) / <alpha-value>)',
        },
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          50: 'rgb(var(--surface-50) / <alpha-value>)',
          100: 'rgb(var(--surface-100) / <alpha-value>)',
          200: 'rgb(var(--surface-200) / <alpha-value>)',
          300: 'rgb(var(--surface-300) / <alpha-value>)',
          400: 'rgb(var(--surface-400) / <alpha-value>)',
          500: 'rgb(var(--surface-500) / <alpha-value>)',
          600: 'rgb(var(--surface-600) / <alpha-value>)',
          700: 'rgb(var(--surface-700) / <alpha-value>)',
          800: 'rgb(var(--surface-800) / <alpha-value>)',
          850: 'rgb(var(--surface-850) / <alpha-value>)',
          900: 'rgb(var(--surface-900) / <alpha-value>)',
          950: 'rgb(var(--surface-950) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Outfit"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        'display-sm': ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'heading-lg': ['1.875rem', { lineHeight: '1.25' }],
        'heading-md': ['1.5rem', { lineHeight: '1.3' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.35' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body-md': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.4' }],
        label: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.08em' }],
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      maxWidth: {
        container: '1440px',
        content: '1200px',
        narrow: '960px',
      },
      boxShadow: {
        // The glow is the accent at low alpha. It goes through its own
        // variable rather than an inline rgb(var(--brand-500) / .15) so
        // Tailwind's box-shadow parser never has to understand a nested
        // var() — and so it tracks a palette change, which the hard-coded
        // rgba(212,175,55,...) it replaced could not.
        glow: '0 0 20px var(--brand-glow)',
        'glow-lg': '0 0 40px var(--brand-glow-lg)',
        card: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.08)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
        'card-dark-hover': '0 4px 16px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-up': 'fadeUp 0.6s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        shimmer: 'shimmer 1.5s infinite linear',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
