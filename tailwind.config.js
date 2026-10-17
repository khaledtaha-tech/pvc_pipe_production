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
          850: '#172033',
          900: '#0f172a',
          950: '#0a0f1d',
        },
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          emerald: '#059669',
          teal: '#0d9488',
          cyan: '#06b6d4',
          mint: '#14b8a6',
          orange: '#ea580c',
          amber: '#d97706',
          rose: '#e11d48'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-sm': '0 0 15px -3px rgba(5, 150, 105, 0.25)',
        'glow': '0 0 25px -5px rgba(5, 150, 105, 0.35)',
        'glow-teal': '0 0 25px -5px rgba(13, 148, 136, 0.35)',
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.35)',
        'card-dark': '0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
        'card-light': '0 10px 25px -5px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(15, 23, 42, 0.05)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #059669 0%, #0d9488 50%, #14b8a6 100%)',
        'brand-gradient-hover': 'linear-gradient(135deg, #047857 0%, #0f766e 50%, #0d9488 100%)',
        'emerald-gradient': 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        'amber-gradient': 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
        'rose-gradient': 'linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)',
        'purple-gradient': 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
      }
    },
  },
  plugins: [],
}
