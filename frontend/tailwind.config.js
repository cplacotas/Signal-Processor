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
        rf: {
          900: '#070b14',
          800: '#0d1527',
          700: '#14203d',
          600: '#1e305b',
          accent: '#00f0ff',
          neon: '#00ff88',
          amber: '#ffb703',
          crimson: '#ff0055',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
