import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { scheduleReminderCron, cancelReminderCron } from "../services/openclawCron.js";

const baseSchema = z.object({
  title: z.string().min(1),
  task_id: z.string().uuid().optional().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  remind_at: z.string().datetime({ offset: true }),
  channel: z.enum(["telegram", "whatsapp", "email"]).optional(),
});

// Sin esto, un remind_at ya pasado (ej. "2h antes" de un evento que empieza en
// menos de 2h) llegaba hasta OpenClaw y volvía como 500 genérico ("tool
// execution failed") sin explicar por qué — acá se corta antes, con un 400 claro.
const notInPast = (data: { remind_at: string }) => new Date(data.remind_at).getTime() > Date.now();
const notInPastMessage = { message: "El recordatorio no puede programarse en el pasado", path: ["remind_at"] };

const createSchema = baseSchema.refine(notInPast, notInPastMessage);

export const remindersRouter = createResourceRouter({
  table: "reminders",
  resourceName: "reminders",
  createSchema,
  updateSchema: baseSchema
    .partial()
    .extend({ sent_at: z.string().datetime({ offset: true }).optional().nullable() })
    // Solo valida si remind_at viene en el body (ej. reprogramar) — un update
    // que solo toca sent_at u otro campo no debería fallar por esto.
    .refine((data) => !data.remind_at || notInPast(data as { remind_at: string }), notInPastMessage),
  orderBy: { column: "remind_at", ascending: true },
  trackCreatedBy: true,
  hooks: {
    // Guarda anti-duplicado: si el agente llama crear_recordatorio dos veces
    // con el mismo título y la misma hora en una ventana corta, la segunda
    // se rechaza (409) en vez de crear un segundo aviso real. Pasó en
    // producción el 08-ago-2026 ("Tomar la proteína" x2, 11s de diferencia
    // — dos llamadas reales del modelo dentro del mismo turno, no un retry
    // de red, así que no alcanza con deduplicar por request-id). Ventana de
    // 2 minutos: suficiente para el caso real (11s) con margen, sin bloquear
    // a alguien que de verdad quiere dos recordatorios iguales más separados.
    async beforeCreate(userId, input) {
      const { data, error } = await supabaseAdmin
        .from("reminders")
        .select("id")
        .eq("user_id", userId)
        .eq("title", input.title)
        .eq("remind_at", input.remind_at)
        .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return "Ya existe un recordatorio igual (mismo título y hora) creado hace menos de 2 minutos.";
    },
    // Se crea el registro tal cual (venga de la app o del MCP de Quicks) y acá
    // mismo se programa el disparo real — ya no depende de que Quicks recuerde
    // crear el cron en el chat. Si falla programar el aviso, se borra la fila
    // recién creada y se propaga el error: mejor que el caller se entere a que
    // quede un recordatorio "fantasma" sin aviso y sin que nadie lo sepa.
    async afterCreate(_userId, row) {
      let jobId: string | null;
      try {
        jobId = await scheduleReminderCron(row);
      } catch (err) {
        await supabaseAdmin.from("reminders").delete().eq("id", row.id);
        throw err;
      }
      if (jobId) {
        const { error } = await supabaseAdmin.from("reminders").update({ cron_job_id: jobId }).eq("id", row.id);
        // El cron ya quedó creado en OpenClaw — si no se puede guardar el jobId acá,
        // no hay forma de cancelarlo después (task/evento completado antes, etc.).
        // Mejor decírselo a quien creó el recordatorio que dejarlo huérfano en silencio.
        if (error) throw new Error(`Cron creado (${jobId}) pero no se pudo guardar cron_job_id: ${error.message}`);
      }
    },
    async afterUpdate(_userId, before, after) {
      // sent_at recién puesto = ya no hace falta el cron. Si remind_at cambió
      // y sigue pendiente, hay que cancelar el job viejo y crear uno nuevo (el
      // contrato de OpenClaw es add/remove, no un upsert por id).
      if (after.sent_at && !before.sent_at) {
        await cancelReminderCron(before.cron_job_id);
        return;
      }
      if (!after.sent_at && after.remind_at !== before.remind_at) {
        await cancelReminderCron(before.cron_job_id);
        const jobId = await scheduleReminderCron(after);
        if (jobId) {
          const { error } = await supabaseAdmin.from("reminders").update({ cron_job_id: jobId }).eq("id", after.id);
          if (error) console.error(`[reminders] cron reprogramado (${jobId}) pero no se pudo guardar:`, error.message);
        }
      }
    },
    async beforeDelete(_userId, row) {
      await cancelReminderCron(row.cron_job_id);
    },
  },
});
