/** Mismo pill verde "2/5 · 40%" que ya se veía en la vista compacta de Tareas — componente compartido. */
export function SubtaskProgressBadge({ done, total, percent }: { done: number; total: number; percent: number }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-green-500/10 text-green-400">
      {done}/{total} · {percent}%
    </span>
  );
}
