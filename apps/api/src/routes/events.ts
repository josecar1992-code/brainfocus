import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { cancelPendingRemindersFor, rescheduleRemindersForEvent } from "../services/reminderCascade.js";
import { supabaseAdmin } from "../supabaseClient.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).optional().nullable(),
  all_day: z.boolean().optional(),
  task_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional().nullable(),
});

export const eventsRouter = createResourceRouter({
  table: "events",
  resourceName: "events",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "starts_at", ascending: true },
  trackCreatedBy: true,
  hooks: {
    // Mover la fecha de un evento (edición manual, no la que dispara el
    // cascade de tasks.ts de abajo) tiene que arrastrar la tarea espejo y
    // reprogramar los recordatorios ya creados — si no, quedan apuntando a
    // la hora vieja. Reportado por el usuario 17-ago-2026.
    async afterUpdate(userId, before, after) {
      if (after.starts_at === before.starts_at) return;

      if (after.task_id) {
        const { error } = await supabaseAdmin
          .from("tasks")
          .update({ due_date: after.starts_at })
          .eq("user_id", userId)
          .eq("id", after.task_id);
        if (error) console.error(`[events] no se pudo sincronizar due_date de la tarea ${after.task_id}:`, error.message);
      }

      await rescheduleRemindersForEvent(userId, after.id, before.starts_at, after.starts_at);
    },
    // El FK reminders.event_id tiene "on delete cascade" en la BD, así que hay
    // que cancelar el cron en OpenClaw ANTES de borrar el evento (beforeDelete
    // corre antes del delete real) — si no, Postgres borra la fila y perdemos
    // el cron_job_id sin haber avisado a OpenClaw que lo cancele.
    async beforeDelete(userId, row) {
      await cancelPendingRemindersFor(userId, "event_id", row.id);

      // events.task_id es la tarea espejo creada junto con el evento (ver
      // api.ts createEvent / routines.ts createOccurrence) — sin esto, borrar
      // el evento dejaba la tarea viva y visible en Tareas/Hoy sin nada que
      // la vincule, justo el caso inverso del cascade que ya existía en
      // tasks.ts (borrar la tarea sí borraba el evento). Reportado por el
      // usuario 17-ago-2026: creó y borró un evento de prueba, la tarea
      // espejo se quedó. Se borra directo por supabaseAdmin (no vía
      // tasksRouter) para no reintentar borrar este mismo evento, que ya
      // está a mitad de su propio borrado.
      if (row.task_id) {
        await cancelPendingRemindersFor(userId, "task_id", row.task_id);
        await supabaseAdmin.from("tasks").delete().eq("user_id", userId).eq("id", row.task_id);
      }
    },
  },
});
