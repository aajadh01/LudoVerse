/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0B0E14',
          surface: 'rgba(18,24,38,0.85)',
          elevated: 'rgba(28,38,58,0.97)',
        },
        accent: {
          primary: '#6366F1',
          primaryHover: '#4F46E5',
          gold: '#F59E0B',
          teal: '#14B8A6',
        },
        player: {
          red: '#EF4444',
          green: '#10B981',
          yellow: '#F59E0B',
          blue: '#3B82F6',
          purple: '#8B5CF6',
          orange: '#F97316',
          teal: '#14B8A6',
          pink: '#EC4899',
          lime: '#84CC16',
        },
        border: {
          subtle: 'rgba(99,102,241,0.18)',
          bright: 'rgba(99,102,241,0.45)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(99,102,241,0.35)',
        'glow-gold': '0 0 20px rgba(245,158,11,0.45)',
        card: '0 4px 24px rgba(0,0,0,0.45)',
        'card-hover': '0 8px 40px rgba(0,0,0,0.6)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pulse-ring': 'pulseRing 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'bounce-in': 'bounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        'spin-dice': 'spinDice 0.4s ease-out',
        'token-move': 'tokenMove 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        float: 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseRing: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        bounceIn: { from: { opacity: '0', transform: 'scale(0.7)' }, to: { opacity: '1', transform: 'scale(1)' } },
        spinDice: { from: { transform: 'rotateY(0deg) scale(0.8)' }, to: { transform: 'rotateY(360deg) scale(1)' } },
        tokenMove: { from: { transform: 'scale(1.4)' }, to: { transform: 'scale(1)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
    },
  },
  plugins: [],
};
