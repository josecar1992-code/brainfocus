import { type Task } from "./api";
import { PRIORITIES } from "./selectStyles";

/** Compartido entre Tareas, Agenda y la vista Hoy — mismo pill de prioridad en todos lados. */
export function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  const p = PRIORITIES.find((x) => x.value === priority) ?? PRIORITIES[1];
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${p.className}`}>
      {p.label}
    </span>
  );
}
