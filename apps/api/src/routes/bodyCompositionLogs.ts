import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  profile_id: z.string().uuid(),
  source: z.string().optional().nullable(),
  weight_kg: z.number().positive().optional().nullable(),
  body_fat_pct: z.number().min(0).max(100).optional().nullable(),
  muscle_mass_kg: z.number().positive().optional().nullable(),
  bone_mass_kg: z.number().positive().optional().nullable(),
  body_water_pct: z.number().min(0).max(100).optional().nullable(),
  visceral_fat_level: z.number().optional().nullable(),
  bmr_kcal: z.number().positive().optional().nullable(),
  bmi: z.number().positive().optional().nullable(),
  logged_at: z.string().datetime({ offset: true }).optional(),
});

export const bodyCompositionLogsRouter = createResourceRouter({
  table: "body_composition_logs",
  resourceName: "body_composition_logs",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "logged_at", ascending: false },
  trackCreatedBy: true,
});
