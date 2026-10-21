/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#04121A',
          bgTo: '#062A33',
          card: 'rgba(6, 42, 51, 0.55)',
          cardBorder: 'rgba(34, 211, 238, 0.25)',
          cardBorderHover: 'rgba(34, 211, 238, 0.5)',
          primary: '#22D3EE',
          primaryDark: '#06B6D4',
          accent: '#67E8F9',
          text: '#E6FBFF',
          muted: '#7FB6C2',
          glow: 'rgba(34, 211, 238, 0.35)',
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'cyan-glow': '0 0 25px rgba(34, 211, 238, 0.35)',
        'cyan-glow-lg': '0 0 45px rgba(34, 211, 238, 0.5)',
        'cyan-glow-sm': '0 0 12px rgba(34, 211, 238, 0.25)',
      },
      borderRadius: {
        '28': '28px',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave': 'waveBar 1.2s ease-in-out infinite alternate',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(34, 211, 238, 0.3)' },
          '50%': { boxShadow: '0 0 35px rgba(34, 211, 238, 0.75)' },
        },
        waveBar: {
          '0%': { height: '15%' },
          '100%': { height: '95%' },
        }
      }
    },
  },
  plugins: [],
}
