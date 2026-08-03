import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { cancelPendingRemindersFor } from "../services/reminderCascade.js";

const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
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
  hooks: {
    async afterUpdate(userId, before, after) {
      if (after.status === "done" && before.status !== "done") {
        await cancelPendingRemindersFor(userId, "task_id", after.id);
      }
    },
    async beforeDelete(userId, row) {
      await cancelPendingRemindersFor(userId, "task_id", row.id);
    },
  },
});
