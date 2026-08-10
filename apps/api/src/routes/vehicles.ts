import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelPendingRemindersFor } from "../services/reminderCascade.js";
import { scheduleReminderCron } from "../services/openclawCron.js";

const createSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().optional().nullable(),
  vehicle_type: z.string().optional().nullable(),
  plate: z.string().optional().nullable(),
  // next_maintenance_date dispara un recordatorio real (igual que tasks/events);
  // next_maintenance_mileage es solo indicador en la UI, no hay forma de
  // disparar un aviso automático por kilometraje sin una lectura de odómetro
  // en vivo — se compara contra el mayor "mileage" ya registrado en el
  // historial de mantenimiento (vehicle_maintenance).
  next_maintenance_date: z.string().datetime({ offset: true }).optional().nullable(),
  next_maintenance_mileage: z.number().optional().nullable(),
});

type VehicleRow = {
  id: string;
  brand: string;
  model: string;
  next_maintenance_date: string | null;
};

// Recrea el recordatorio de mantenimiento del vehículo desde cero: cancela
// el pendiente (si había) y, si hay una fecha nueva en el futuro, crea uno.
// Mismo patrón que scheduleReminderCron en reminders.ts/routines.ts, pero acá
// no propaga el error si falla programar el cron — no tiene sentido bloquear
// guardar el vehículo por esto (igual que en routines.ts).
async function syncMaintenanceReminder(userId: string, vehicle: VehicleRow) {
  await cancelPendingRemindersFor(userId, "vehicle_id", vehicle.id);
  if (!vehicle.next_maintenance_date) return;
  if (new Date(vehicle.next_maintenance_date).getTime() <= Date.now()) return;

  const { data: reminder, error } = await supabaseAdmin
    .from("reminders")
    .insert({
      user_id: userId,
      vehicle_id: vehicle.id,
      title: `Mantenimiento de ${vehicle.brand} ${vehicle.model}`,
      remind_at: vehicle.next_maintenance_date,
    })
    .select()
    .single();
  if (error) {
    console.error(`[vehicles] no se pudo crear el recordatorio de mantenimiento:`, error.message);
    return;
  }

  try {
    const jobId = await scheduleReminderCron(reminder);
    if (jobId) {
      const { error: updateError } = await supabaseAdmin
        .from("reminders")
        .update({ cron_job_id: jobId })
        .eq("id", reminder.id);
      if (updateError) console.error(`[vehicles] cron creado (${jobId}) pero no se pudo guardar:`, updateError.message);
    }
  } catch (err) {
    console.error(`[vehicles] no se pudo programar el aviso de mantenimiento, se borra el recordatorio fantasma:`, err);
    await supabaseAdmin.from("reminders").delete().eq("id", reminder.id);
  }
}

export const vehiclesRouter = createResourceRouter({
  table: "vehicles",
  resourceName: "vehicles",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: false },
  trackCreatedBy: true,
  hooks: {
    async afterCreate(userId, row) {
      await syncMaintenanceReminder(userId, row);
    },
    async afterUpdate(userId, before, after) {
      if (after.next_maintenance_date !== before.next_maintenance_date) {
        await syncMaintenanceReminder(userId, after);
      }
    },
    async beforeDelete(userId, row) {
      // reminders.vehicle_id tiene "on delete cascade" en la BD, así que hay
      // que cancelar el cron en OpenClaw ANTES de borrar el vehículo (mismo
      // razonamiento que events.ts) — si no, Postgres borra la fila y se
      // pierde el cron_job_id sin haber avisado a OpenClaw que lo cancele.
      await cancelPendingRemindersFor(userId, "vehicle_id", row.id);
    },
  },
});
