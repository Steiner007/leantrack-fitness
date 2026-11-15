/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f14',
        card: '#141a22',
        raised: '#1c242e',
        line: '#273140',
        ink: '#eef2f6',
        mute: '#8a97a8',
        volt: '#b9f04a',
        sky: '#5cc8ff',
        warn: '#ffb454',
        bad: '#ff6b6b',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
