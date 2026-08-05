import { IconRepeat } from "./icons";

// Etiqueta compartida entre Tareas y Agenda: se muestra cuando la tarea (o el
// evento, vía su tarea vinculada) viene de una rutina repetitiva
// (task.routine_id no nulo), para distinguirla de una tarea/evento suelto.
export function RoutineBadge({ iconOnly }: { iconOnly?: boolean }) {
  if (iconOnly) {
    return (
      <span title="Rutina" className="flex-shrink-0 text-electric-cyan/70">
        <IconRepeat className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-electric-cyan/10 text-electric-cyan/80">
      <IconRepeat className="w-3 h-3" strokeWidth={2} />
      Rutina
    </span>
  );
}
