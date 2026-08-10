import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron, scheduleRecurringCron } from "../services/openclawCron.js";

const createSchema = z
  .object({
    title: z.string().min(1),
    frequency: z.enum(["every_n_hours", "daily", "weekly"]),
    interval_hours: z.number().int().min(1).max(23).optional(),
    time_of_day: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM")
      .optional(),
    day_of_week: z.number().int().min(0).max(6).optional(),
    channel: z.enum(["whatsapp", "telegram"]).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.frequency === "every_n_hours") return data.interval_hours != null;
      if (data.frequency === "daily") return data.time_of_day != null;
      if (data.frequency === "weekly") return data.time_of_day != null && data.day_of_week != null;
      return true;
    },
    { message: "Faltan campos para la frecuencia elegida (interval_hours / time_of_day / day_of_week)" },
  );

type RecurringReminderRow = {
  id: string;
  title: string;
  frequency: "every_n_hours" | "daily" | "weekly";
  interval_hours: number | null;
  time_of_day: string | null;
  day_of_week: number | null;
  channel: string | null;
  active: boolean;
  cron_job_id: string | null;
};

// Cron de 5 campos estándar. every_n_hours dispara en las marcas de reloj
// múltiplos de N (0, N, 2N...), no "cada N horas desde que se creó" — más
// simple y predecible que calcular una fase, documentado en la UI/tool.
function buildCronExpr(row: RecurringReminderRow): string {
  if (row.frequency === "every_n_hours") {
    return `0 */${row.interval_hours} * * *`;
  }
  const [hour, minute] = (row.time_of_day ?? "09:00").split(":").map(Number);
  if (row.frequency === "daily") {
    return `${minute} ${hour} * * *`;
  }
  return `${minute} ${hour} * * ${row.day_of_week}`;
}

// Best-effort, igual que routines.ts/vehicles.ts: si falla programar el cron,
// no tiene sentido bloquear crear/editar el recordatorio recurrente por eso
// — queda guardado con cron_job_id null y sin aviso real hasta que se
// corrija (ej. OpenClaw no configurado en local).
async function syncCron(row: RecurringReminderRow): Promise<string | null> {
  if (!row.active) return null;
  try {
    return await scheduleRecurringCron({
      displayName: `brainfocus:recurring-reminder:${row.id}`,
      cronExpr: buildCronExpr(row),
      message:
        `Avisale esto al usuario: "${row.title}". Podés redactarlo con tus palabras, pero el contenido ` +
        `tiene que quedar claro en el mensaje final.`,
      channel: row.channel,
    });
  } catch (err) {
    console.error(`[recurring-reminders] no se pudo programar "${row.title}":`, err);
    return null;
  }
}

export const recurringRemindersRouter = createResourceRouter({
  table: "recurring_reminders",
  resourceName: "recurring_reminders",
  createSchema,
  updateSchema: createSchema.innerType().partial(),
  orderBy: { column: "created_at", ascending: false },
  trackCreatedBy: true,
  hooks: {
    async afterCreate(_userId, row) {
      const jobId = await syncCron(row);
      const { error } = await supabaseAdmin.from("recurring_reminders").update({ cron_job_id: jobId }).eq("id", row.id);
      if (error) console.error(`[recurring-reminders] cron creado pero no se pudo guardar:`, error.message);
    },
    async afterUpdate(_userId, before, after) {
      const relevant: (keyof RecurringReminderRow)[] = [
        "frequency",
        "interval_hours",
        "time_of_day",
        "day_of_week",
        "channel",
        "active",
      ];
      if (!relevant.some((k) => before[k] !== after[k])) return;

      await cancelReminderCron(before.cron_job_id ?? null);
      const jobId = await syncCron(after);
      const { error } = await supabaseAdmin.from("recurring_reminders").update({ cron_job_id: jobId }).eq("id", after.id);
      if (error) console.error(`[recurring-reminders] cron reprogramado pero no se pudo guardar:`, error.message);
    },
    async beforeDelete(_userId, row) {
      await cancelReminderCron(row.cron_job_id ?? null);
    },
  },
});
