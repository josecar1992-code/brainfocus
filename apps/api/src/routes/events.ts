import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().optional().nullable(),
  all_day: z.boolean().optional(),
});

export const eventsRouter = createResourceRouter({
  table: "events",
  resourceName: "events",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "starts_at", ascending: true },
});
