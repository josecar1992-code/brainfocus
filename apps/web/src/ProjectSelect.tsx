import { type Project } from "./api";
import { OPTION_STYLE, SELECT_CLASS } from "./selectStyles";

/** Select de proyecto — a diferencia de CategorySelect, "sin proyecto" es una opción
 * válida (no todas las tareas pertenecen a un proyecto), así que no obliga a elegir. */
export function ProjectSelect({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
}) {
  const active = projects.filter((p) => p.status === "active");
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
      <option value="" style={OPTION_STYLE}>
        Sin proyecto
      </option>
      {active.map((p) => (
        <option key={p.id} value={p.id} style={OPTION_STYLE}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
