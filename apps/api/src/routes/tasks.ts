import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelPendingRemindersFor, rescheduleRemindersForEvent } from "../services/reminderCascade.js";
import { advanceRoutine } from "../services/routines.js";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional().nullable(),
  list_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
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
    // `completed_at` se llena/limpia sola al cruzar el status "done" — antes
    // solo la ponía el tool `completar_tarea` del MCP a mano; el checkbox
    // compartido de la web (`useCompleteTask`) nunca la mandaba, así que el
    // módulo Resumen (16-ago-2026, filtra tareas por día en que se
    // completaron) se hubiera quedado vacío para cualquier tarea marcada
    // desde la app. `input.completed_at !== undefined` respeta un valor
    // explícito si algún caller ya lo manda (no lo pisa).
    async beforeUpdate(_userId, before, input) {
      if (input.completed_at !== undefined) return;
      if (input.status === "done" && before.status !== "done") return { completed_at: new Date().toISOString() };
      if (input.status && input.status !== "done" && before.status === "done") return { completed_at: null };
    },
    async afterUpdate(userId, before, after) {
      // Mover el due_date de una tarea que tiene evento ligado tiene que
      // arrastrar el evento (y sus recordatorios) al revés del cascade de
      // events.ts — si no, la tarea y su propio evento quedan mostrando
      // fechas distintas. Solo si de verdad cambió y no se limpió (null):
      // limpiar el due_date no borra el evento, eso es un caso aparte.
      // Reportado por el usuario 17-ago-2026.
      if (after.due_date && after.due_date !== before.due_date) {
        const { data: linkedEvent, error } = await supabaseAdmin
          .from("events")
          .select("id, starts_at")
          .eq("user_id", userId)
          .eq("task_id", after.id)
          .maybeSingle();
        if (error) {
          console.error(`[tasks] no se pudo buscar el evento ligado a ${after.id}:`, error.message);
        } else if (linkedEvent && linkedEvent.starts_at !== after.due_date) {
          const { error: updateError } = await supabaseAdmin
            .from("events")
            .update({ starts_at: after.due_date })
            .eq("user_id", userId)
            .eq("id", linkedEvent.id);
          if (updateError) {
            console.error(`[tasks] no se pudo sincronizar starts_at del evento ${linkedEvent.id}:`, updateError.message);
          } else {
            await rescheduleRemindersForEvent(userId, linkedEvent.id, linkedEvent.starts_at, after.due_date);
          }
        }
      }

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
