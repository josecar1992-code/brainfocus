import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  name: z.string().min(1),
  birth_date: z.string().date(),
  is_medicated: z.boolean().optional(),
  target_weight_kg: z.number().positive().optional().nullable(),
  current_weight_kg: z.number().positive().optional().nullable(),
  watch_calibration_enabled: z.boolean().optional(),
  last_watch_calibration: z.string().datetime({ offset: true }).optional().nullable(),
});

export const healthProfilesRouter = createResourceRouter({
  table: "health_profiles",
  resourceName: "health_profiles",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: true },
  trackCreatedBy: true,
});
