import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { cancelPendingRemindersFor } from "../services/reminderCascade.js";
import { advanceRoutine } from "../services/routines.js";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional().nullable(),
  list_id: z.string().uuid().optional().nullable(),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
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
    },
  },
});
