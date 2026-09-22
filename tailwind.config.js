/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./index.dev.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        brand: {
          blue: '#0284c7',
          cyan: '#06b6d4',
          orange: '#ea580c',
          emerald: '#059669',
          amber: '#d97706',
          rose: '#e11d48'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
