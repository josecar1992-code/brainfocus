import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

const createSchema = z.object({
  vehicle_id: z.string().uuid(),
  date: z.string().datetime({ offset: true }),
  description: z.string().min(1),
  mileage: z.number().optional().nullable(),
});

export const vehicleMaintenanceRouter = createResourceRouter({
  table: "vehicle_maintenance",
  resourceName: "vehicle_maintenance",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "date", ascending: false },
});
