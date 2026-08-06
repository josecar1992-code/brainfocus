import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { cancelPendingRemindersFor } from "../services/reminderCascade.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).optional().nullable(),
  all_day: z.boolean().optional(),
  task_id: z.string().uuid().optional(),
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
    },
  },
});
