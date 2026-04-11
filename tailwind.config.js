/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Identidade Vallen Market (vallenmarket.com.br)
        vallen: {
          green:     '#008A2E', // hsl(140,100%,27%) — verde principal
          greenLight:'#00B83C', // verde hover
          black:     '#000000',
          dark:      '#111111',
          card:      '#1a1a1a',
          border:    '#2a2a2a',
          gray:      '#3f3f3f',
          muted:     '#e8e8e8',
          white:     '#ffffff',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif','system-ui','-apple-system','BlinkMacSystemFont','Segoe UI','Roboto','sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
}
