import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron, scheduleRecurringCron } from "../services/openclawCron.js";

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");

const createSchema = z.object({
  name: z.string().min(1),
  birth_date: z.string().date(),
  is_medicated: z.boolean().optional(),
  target_weight_kg: z.number().positive().optional().nullable(),
  current_weight_kg: z.number().positive().optional().nullable(),
  watch_calibration_enabled: z.boolean().optional(),
  last_watch_calibration: z.string().datetime({ offset: true }).optional().nullable(),
  weight_reminder_enabled: z.boolean().optional(),
  weight_reminder_day_of_week: z.number().int().min(0).max(6).optional().nullable(),
  weight_reminder_time: timeOfDay.optional().nullable(),
  bp_reminder_enabled: z.boolean().optional(),
  bp_reminder_frequency: z.enum(["daily", "weekly"]).optional().nullable(),
  bp_reminder_day_of_week: z.number().int().min(0).max(6).optional().nullable(),
  bp_reminder_time: timeOfDay.optional().nullable(),
});

type ProfileRow = {
  id: string;
  name: string;
  weight_reminder_enabled: boolean;
  weight_reminder_day_of_week: number | null;
  weight_reminder_time: string | null;
  weight_reminder_cron_job_id: string | null;
  bp_reminder_enabled: boolean;
  bp_reminder_frequency: "daily" | "weekly" | null;
  bp_reminder_day_of_week: number | null;
  bp_reminder_time: string | null;
  bp_reminder_cron_job_id: string | null;
};

function buildCronExpr(timeStr: string, dayOfWeek: number | null): string {
  const [hour, minute] = timeStr.split(":").map(Number);
  return dayOfWeek == null ? `${minute} ${hour} * * *` : `${minute} ${hour} * * ${dayOfWeek}`;
}

// Mismo patrón que syncMaintenanceReminder en vehicles.ts: recrea el cron desde cero
// (cancela el viejo si había, programa uno nuevo si corresponde) — más simple y sin
// estado intermedio inconsistente que diffear campo por campo.
//
// Bug real confirmado el 23-nov-2026 (reportado por el usuario, Quicks le pasó el
// error textual): el mensaje original le pedía a Quicks "preguntale... y guardalo
// con registrar_presion/registrar_peso en cuanto te responda" — exactamente el mismo
// bug ya documentado para el aviso de kilometraje (ver MILEAGE_CRON_MESSAGE en
// settings.ts): esta sesión de cron es `sessionTarget: "isolated"`, de un solo turno,
// sin forma de esperar la respuesta real del usuario dentro de esa misma ejecución —
// instrucción estructuralmente imposible de cumplir. Mismo fix aplicado acá: el
// mensaje solo pregunta, nunca intenta guardar, y se le quita la tool de escritura
// (`registrar_peso`/`registrar_presion`) de `brainfocusTools` para este job, para que
// ni siquiera pueda intentar guardar un valor inventado aunque el mensaje fallara. El
// guardado real pasa en la conversación normal cuando el usuario responda de verdad.
async function syncWeightReminder(userId: string, profile: ProfileRow): Promise<string | null> {
  await cancelReminderCron(profile.weight_reminder_cron_job_id);
  if (!profile.weight_reminder_enabled || !profile.weight_reminder_time) return null;
  try {
    return await scheduleRecurringCron({
      userId,
      displayName: `brainfocus:salud:peso:${profile.id}`,
      cronExpr: buildCronExpr(profile.weight_reminder_time, profile.weight_reminder_day_of_week ?? null),
      message:
        `Es el aviso periódico de peso de Focusbrain para el perfil de salud "${profile.name}": preguntale al ` +
        `usuario su peso de hoy — nada más. No llames registrar_peso en este turno bajo ninguna circunstancia, ` +
        `ni inventes un valor: no hay forma de recibir la respuesta real del usuario dentro de esta misma ` +
        `ejecución. El guardado real pasa después, en la conversación normal cuando el usuario responda.`,
      channel: null,
      brainfocusTools: ["listar_perfiles_salud"],
    });
  } catch (err) {
    console.error(`[health_profiles] no se pudo programar el recordatorio de peso de "${profile.name}":`, err);
    return null;
  }
}

async function syncBpReminder(userId: string, profile: ProfileRow): Promise<string | null> {
  await cancelReminderCron(profile.bp_reminder_cron_job_id);
  if (!profile.bp_reminder_enabled || !profile.bp_reminder_time) return null;
  const dayOfWeek = profile.bp_reminder_frequency === "weekly" ? (profile.bp_reminder_day_of_week ?? 0) : null;
  try {
    return await scheduleRecurringCron({
      userId,
      displayName: `brainfocus:salud:presion:${profile.id}`,
      cronExpr: buildCronExpr(profile.bp_reminder_time, dayOfWeek),
      message:
        `Es el aviso periódico de presión arterial de Focusbrain para el perfil de salud "${profile.name}": ` +
        `preguntale al usuario la lectura de hoy (sistólica, diastólica y pulso del tensiómetro) — nada más. ` +
        `No llames registrar_presion en este turno bajo ninguna circunstancia, ni inventes valores: no hay ` +
        `forma de recibir la respuesta real del usuario dentro de esta misma ejecución. El guardado real pasa ` +
        `después, en la conversación normal cuando el usuario responda (ahí sí incluí como síntoma si menciona ` +
        `mareo, visión borrosa o dolor de cabeza).`,
      channel: null,
      brainfocusTools: ["listar_perfiles_salud"],
    });
  } catch (err) {
    console.error(`[health_profiles] no se pudo programar el recordatorio de presión de "${profile.name}":`, err);
    return null;
  }
}

async function syncReminders(userId: string, profile: ProfileRow) {
  const [weightJobId, bpJobId] = await Promise.all([syncWeightReminder(userId, profile), syncBpReminder(userId, profile)]);
  const { error } = await supabaseAdmin
    .from("health_profiles")
    .update({ weight_reminder_cron_job_id: weightJobId, bp_reminder_cron_job_id: bpJobId })
    .eq("user_id", userId)
    .eq("id", profile.id);
  if (error) console.error(`[health_profiles] crons creados pero no se pudieron guardar:`, error.message);
}

const RELEVANT_REMINDER_FIELDS: (keyof ProfileRow)[] = [
  "name",
  "weight_reminder_enabled",
  "weight_reminder_day_of_week",
  "weight_reminder_time",
  "bp_reminder_enabled",
  "bp_reminder_frequency",
  "bp_reminder_day_of_week",
  "bp_reminder_time",
];

export const healthProfilesRouter = createResourceRouter({
  table: "health_profiles",
  resourceName: "health_profiles",
  createSchema,
  updateSchema: createSchema.partial(),
  orderBy: { column: "created_at", ascending: true },
  trackCreatedBy: true,
  hooks: {
    async afterCreate(userId, row) {
      await syncReminders(userId, row);
    },
    async afterUpdate(userId, before, after) {
      if (!RELEVANT_REMINDER_FIELDS.some((k) => before[k] !== after[k])) return;
      await syncReminders(userId, after);
    },
    async beforeDelete(_userId, row) {
      await Promise.all([cancelReminderCron(row.weight_reminder_cron_job_id), cancelReminderCron(row.bp_reminder_cron_job_id)]);
    },
  },
});
