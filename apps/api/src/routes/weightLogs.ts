import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";

const createSchema = z.object({
  profile_id: z.string().uuid(),
  weight_kg: z.number().positive(),
  logged_at: z.string().datetime({ offset: true }).optional(),
});

// Mismo patrón que vehicleMileage.ts, pero acá además mantenemos
// health_profiles.current_weight_kg al día (lo usa la UI para precargar el
// campo de peso en la toma rápida sin tener que consultar el último log).
export const weightLogsRouter = createResourceRouter({
  table: "weight_logs",
  resourceName: "weight_logs",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "logged_at", ascending: false },
  trackCreatedBy: true,
  hooks: {
    async afterCreate(userId, row) {
      const { error } = await supabaseAdmin
        .from("health_profiles")
        .update({ current_weight_kg: row.weight_kg })
        .eq("user_id", userId)
        .eq("id", row.profile_id);
      if (error) console.error(`[weight_logs] no se pudo actualizar current_weight_kg del perfil:`, error.message);
    },
  },
});
