/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Manual de Identidad de Marca — BrainFocus
      colors: {
        "night-blue": "#0A2540", // fondo principal, encabezados
        "electric-cyan": "#00D2FF", // trazo del cerebro, CTAs, destacados
        "deep-blue": "#0088CC", // degradados secundarios, subtítulos
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
