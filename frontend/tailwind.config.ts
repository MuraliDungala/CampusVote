import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#071D38',
          950: '#030E1C',
          900: '#071D38',
          850: '#0B2548',
          800: '#0F2D54',
          700: '#15447C',
          600: '#155196',
          500: '#1E69BA',
        },
        brand: {
          primary: '#155196',
          'primary-hover': '#0F2D54',
          'primary-light': '#2563EB',
          cyan: '#0284C7',
          'cyan-hover': '#0369A1',
          'cyan-light': '#38BDF8',
        },
        surface: {
          canvas: '#F8FAFC',
          card: '#FFFFFF',
          subtle: '#F1F5F9',
          border: '#E2E8F0',
          hover: '#F8FAFC',
        },
        status: {
          success: '#059669',
          warning: '#D97706',
          error: '#DC2626',
          info: '#0284C7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        card: '0 4px 6px -1px rgba(15, 23, 42, 0.04), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
        elevated: '0 10px 15px -3px rgba(15, 23, 42, 0.06), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
        hover: '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
      },
      borderRadius: {
        card: '1rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
