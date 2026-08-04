import type { Task } from "./api";

// El navegador dibuja el desplegable nativo con sus propios colores de sistema —
// sin fondo/texto explícitos en <select> y <option> queda gris sobre blanco
// (bajo contraste) en vez de seguir la paleta oscura del resto de la app.
export const SELECT_CLASS =
  "border border-deep-blue/40 bg-night-blue text-white rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]";
export const OPTION_STYLE = { backgroundColor: "#0b1420", color: "#ffffff" };

export const PRIORITIES: { value: Task["priority"]; label: string; className: string }[] = [
  { value: "low", label: "Baja", className: "text-white/50 bg-white/5" },
  { value: "normal", label: "Normal", className: "text-electric-cyan bg-electric-cyan/10" },
  { value: "high", label: "Alta", className: "text-red-400 bg-red-400/10" },
];
