/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#e11d48',
          light: '#fb7185',
          dark: '#be123c',
          hover: '#f43f5e',
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        bg: {
          base: '#ffffff',
          secondary: '#fef2f2',
          tertiary: '#fee2e2',
          elevated: '#fafafa',
        },
        text: {
          primary: '#1e293b',
          secondary: '#64748b',
          tertiary: '#94a3b8',
          inverse: '#ffffff',
        },
        border: {
          light: '#fecdd3',
          base: '#fda4af',
          strong: '#fb7185',
        }
      },
      boxShadow: {
        'primary-sm': '0 1px 2px 0 rgba(225, 29, 72, 0.05)',
        'primary': '0 4px 6px -1px rgba(225, 29, 72, 0.1), 0 2px 4px -1px rgba(225, 29, 72, 0.06)',
        'primary-md': '0 10px 15px -3px rgba(225, 29, 72, 0.1), 0 4px 6px -2px rgba(225, 29, 72, 0.05)',
        'primary-lg': '0 20px 25px -5px rgba(225, 29, 72, 0.1), 0 10px 10px -5px rgba(225, 29, 72, 0.04)',
        'primary-xl': '0 25px 50px -12px rgba(225, 29, 72, 0.25)',
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '250ms',
        'slow': '350ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'in-out': 'cubic-bezier(0.645, 0.045, 0.355, 1)',
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};
