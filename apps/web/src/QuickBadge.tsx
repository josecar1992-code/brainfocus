import { IconRobot } from "./icons";

// Etiqueta compartida entre Tareas, Agenda y Notas: se muestra cuando el
// recurso lo creó Quicks (API key de agente) en vez del dueño de la app
// (created_by "agent" vs "user", ver resourceRouter.ts).
export function QuickBadge({ iconOnly }: { iconOnly?: boolean }) {
  if (iconOnly) {
    return (
      <span title="Creado por Quicks" className="flex-shrink-0 text-amber-400/80">
        <IconRobot className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
    );
  }
  return (
    <span
      title="Creado por Quicks"
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-amber-400/10 text-amber-400"
    >
      <IconRobot className="w-3 h-3" strokeWidth={2} />
      Quicks
    </span>
  );
}
