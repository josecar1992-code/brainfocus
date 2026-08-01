import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  title: z.string().min(1),
  task_id: z.string().uuid().optional().nullable(),
  remind_at: z.string().datetime({ offset: true }),
  channel: z.enum(["telegram", "whatsapp", "email"]).optional(),
});

export const remindersRouter = createResourceRouter({
  table: "reminders",
  resourceName: "reminders",
  createSchema,
  updateSchema: createSchema
    .partial()
    .extend({ sent_at: z.string().datetime({ offset: true }).optional().nullable() }),
  orderBy: { column: "remind_at", ascending: true },
});
