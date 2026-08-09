import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelPendingRemindersFor } from "../services/reminderCascade.js";
import { advanceRoutine } from "../services/routines.js";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional().nullable(),
  list_id: z.string().uuid().optional().nullable(),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
  sort_order: z.number().optional(),
});

const updateSchema = createSchema.partial().extend({
  completed_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const tasksRouter = createResourceRouter({
  table: "tasks",
  resourceName: "tasks",
  createSchema,
  updateSchema,
  orderBy: { column: "due_date", ascending: true },
  trackCreatedBy: true,
  hooks: {
    async afterUpdate(userId, before, after) {
      if (after.status === "done" && before.status !== "done") {
        await cancelPendingRemindersFor(userId, "task_id", after.id);
        if (after.routine_id) {
          try {
            await advanceRoutine(userId, after.routine_id);
          } catch (err) {
            // Best-effort: no queremos que completar la tarea falle por esto,
            // pero sí que quede rastro de que la rutina no avanzó sola.
            console.error(`[routines] no se pudo avanzar la rutina ${after.routine_id}:`, err);
          }
        }
      }
    },
    async beforeDelete(userId, row) {
      await cancelPendingRemindersFor(userId, "task_id", row.id);

      // events.task_id es "on delete set null" (no cascade) — sin esto, borrar
      // la tarea deja el evento vivo en Agenda pero huérfano: sin tarea que
      // marcar como hecha, sin prioridad/categoría. Se borra también el
      // evento (y sus propios recordatorios) para no dejar ese fantasma.
      const { data: linkedEvents, error } = await supabaseAdmin
        .from("events")
        .select("id")
        .eq("user_id", userId)
        .eq("task_id", row.id);
      if (error) throw error;
      for (const event of linkedEvents ?? []) {
        await cancelPendingRemindersFor(userId, "event_id", event.id);
        await supabaseAdmin.from("events").delete().eq("user_id", userId).eq("id", event.id);
      }
    },
  },
});
