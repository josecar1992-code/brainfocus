import { IconFolder } from "./icons";
import type { Project } from "./api";

/** Pill para indicar de qué proyecto viene una tarea/evento — mismo tono que RoutineBadge/QuickBadge. */
export function ProjectBadge({ project }: { project: Project }) {
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/60 flex-shrink-0">
      <IconFolder className="w-3 h-3" strokeWidth={2} />
      {project.name}
    </span>
  );
}
