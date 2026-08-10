import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";

// Lectura de odómetro por vehículo — distinto de vehicle_maintenance (que
// registra un servicio hecho). Alimenta el control de uso mensual y la
// alerta de mantenimiento por km en VehiclesPage.
const createSchema = z.object({
  vehicle_id: z.string().uuid(),
  mileage: z.number(),
  logged_at: z.string().datetime({ offset: true }).optional(),
});

export const vehicleMileageRouter = createResourceRouter({
  table: "vehicle_mileage_logs",
  resourceName: "vehicle_mileage",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "logged_at", ascending: false },
  trackCreatedBy: true,
});
