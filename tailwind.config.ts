import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#b8d7ff',
          300: '#85bbff',
          400: '#4b96ff',
          500: '#256feb',
          600: '#1756d1',
          700: '#1445a8',
          800: '#153b86',
          900: '#16346e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
