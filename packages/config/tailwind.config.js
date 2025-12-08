module.exports = {
  content: [
    "../../packages/ui/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fintech: {
          bg: '#0a0a0a',
          card: '#171717',
          text: '#ededed',
          accent: '#22c55e',
          muted: '#a3a3a3',
          border: '#262626',
        }
      }
    },
  },
  plugins: [],
};
