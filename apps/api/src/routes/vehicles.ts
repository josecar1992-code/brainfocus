import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().optional().nullable(),
  vehicle_type: z.string().optional().nullable(),
  plate: z.string().optional().nullable(),
});

export const vehiclesRouter = createResourceRouter({
  table: "vehicles",
  resourceName: "vehicles",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: false },
  trackCreatedBy: true,
});
