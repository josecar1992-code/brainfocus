import type { List } from "./api";

/** Mismo pill de categoría que ya se veía en el detalle de tarea (TasksPage.tsx) — extraído a
 * componente compartido para poder reusarlo en Hoy sin duplicar el estilo. */
export function CategoryBadge({ list }: { list: List }) {
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: `${list.color ?? "#5B6B82"}22`, color: list.color ?? "#8FA3BF" }}
    >
      {list.name}
    </span>
  );
}
