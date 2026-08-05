export type StatusFilter = "pendientes" | "hechas";

// Filtro compartido entre Tareas y Agenda: "Pendientes" por defecto, para no
// mezclar lo ya hecho con lo que todavía falta en la vista principal.
export function StatusFilterTabs({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 overflow-hidden text-sm flex-shrink-0">
      {(["pendientes", "hechas"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 transition-colors ${
            value === opt ? "bg-electric-cyan text-night-blue font-semibold" : "text-white/60 hover:bg-white/5"
          }`}
        >
          {opt === "pendientes" ? "Pendientes" : "Hechas"}
        </button>
      ))}
    </div>
  );
}
