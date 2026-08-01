import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  logged_at: z.string().datetime().optional(),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  description: z.string().min(1),
  calories: z.number().optional(),
  protein_g: z.number().optional(),
  carbs_g: z.number().optional(),
  fat_g: z.number().optional(),
  water_ml: z.number().optional(),
});

export const nutritionRouter = createResourceRouter({
  table: "nutrition_logs",
  resourceName: "nutrition",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "logged_at", ascending: false },
});
