import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { cancelPendingRemindersFor } from "../services/reminderCascade.js";
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
