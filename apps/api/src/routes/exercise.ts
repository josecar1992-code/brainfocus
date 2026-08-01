import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  logged_at: z.string().datetime().optional(),
  activity: z.string().min(1),
  duration_min: z.number().optional(),
  sets: z.number().int().optional(),
  reps: z.number().int().optional(),
  weight_kg: z.number().optional(),
  distance_km: z.number().optional(),
  notes: z.string().optional(),
});

export const exerciseRouter = createResourceRouter({
  table: "exercise_logs",
  resourceName: "exercise",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "logged_at", ascending: false },
});
