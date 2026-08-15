import type { Subtask } from "./api";

/** Compartido entre Tareas (vista compacta y detalle) y Hoy — mismo cálculo, no se guarda en la API. */
export function subtaskProgress(subtasks: Subtask[]) {
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  return { done, total: subtasks.length, percent: Math.round((done / subtasks.length) * 100) };
}
