import { supabaseAdmin } from "../supabaseClient.js";

// Columnas que apuntan a filas de otra tabla del mismo usuario. La API
// escribe con la service role (bypassa RLS) y un FK de Postgres solo
// comprueba que el id exista, no de quién es: sin esta revisión, un usuario
// podría crear una fila suya apuntando al task_id/event_id/... de otro.
const REF_TABLES: Record<string, string> = {
  task_id: "tasks",
  project_id: "projects",
  event_id: "events",
  list_id: "lists",
  vehicle_id: "vehicles",
  routine_id: "routines",
  checklist_id: "checklists",
};

/** Devuelve el nombre de la primera columna de referencia que NO pertenece al usuario, o null si todas son suyas. */
export async function findForeignRef(userId: string, data: unknown): Promise<string | null> {
  if (!data || typeof data !== "object") return null;
  for (const [column, table] of Object.entries(REF_TABLES)) {
    const value = (data as Record<string, unknown>)[column];
    if (typeof value !== "string" || !value) continue;
    const { data: row, error } = await supabaseAdmin
      .from(table)
      .select("id")
      .eq("user_id", userId)
      .eq("id", value)
      .maybeSingle();
    if (error) throw error;
    if (!row) return column;
  }
  return null;
}
