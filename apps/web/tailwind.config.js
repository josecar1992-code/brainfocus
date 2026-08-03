/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Manual de Identidad de Marca — Focusbrain
      colors: {
        "night-blue": "#0A2540", // fondo principal, encabezados
        "electric-cyan": "#00D2FF", // trazo del cerebro, CTAs, destacados
        "deep-blue": "#0088CC", // degradados secundarios, subtítulos
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
      keyframes: {
        cardIn: {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        ringPulse: {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.06)" },
        },
      },
      animation: {
        cardIn: "cardIn 0.5s ease-out",
        ringPulse: "ringPulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
