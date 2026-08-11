import { z } from "zod";
import { createResourceRouter } from "./resourceRouter.js";
import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron, scheduleOnceCron, scheduleRecurringCron } from "../services/openclawCron.js";

const createSchema = z
  .object({
    title: z.string().min(1),
    schedule_type: z.enum(["once", "recurring"]).default("recurring"),
    is_instruction: z.boolean().optional(),
    // schedule_type: "once"
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    // schedule_type: "recurring"
    frequency: z.enum(["every_n_hours", "daily", "weekly"]).optional(),
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
      if (data.schedule_type === "once") return data.scheduled_at != null;
      if (data.frequency === "every_n_hours") return data.interval_hours != null;
      if (data.frequency === "daily") return data.time_of_day != null;
      if (data.frequency === "weekly") return data.time_of_day != null && data.day_of_week != null;
      return data.frequency != null;
    },
    { message: "Faltan campos para el tipo/frecuencia elegida (scheduled_at o interval_hours/time_of_day/day_of_week)" },
  );

type RecurringReminderRow = {
  id: string;
  title: string;
  schedule_type: "once" | "recurring";
  scheduled_at: string | null;
  is_instruction: boolean;
  frequency: "every_n_hours" | "daily" | "weekly" | null;
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

// El mensaje final que ve Quicks: si es_instruction, el texto es la orden
// tal cual (ej. "dame el tipo de cambio del bitcoin actual"); si no, se
// envuelve como aviso a relayar (comportamiento de siempre).
function buildMessage(row: RecurringReminderRow): string {
  if (row.is_instruction) return row.title;
  return (
    `Avisale esto al usuario: "${row.title}". Podés redactarlo con tus palabras, pero el contenido ` +
    `tiene que quedar claro en el mensaje final.`
  );
}

// Best-effort, igual que routines.ts/vehicles.ts: si falla programar el cron,
// no tiene sentido bloquear crear/editar el aviso por eso — queda guardado
// con cron_job_id null y sin aviso real hasta que se corrija (ej. OpenClaw
// no configurado en local).
// Una sesión de cron sin `toolsAllow` explícito cae al set mínimo (cron/
// message/web_search/web_fetch) — sin esto, una instrucción como "revisame
// si tengo tareas pendientes" fallaría en silencio igual que el bug real que
// tuvo el aviso de kilometraje (ver openclawCron.ts). Como el texto es libre
// (lo escribe el usuario, no se sabe de antemano qué necesita), se le da
// acceso de solo-lectura amplio en vez de intentar adivinar la tool exacta.
const ASISTENTE_INSTRUCTION_TOOLS = [
  "listar_tareas",
  "listar_proyectos",
  "listar_rutinas",
  "buscar_notas",
  "listar_vehiculos",
  "listar_kilometrajes",
  "listar_mantenimientos",
  "buscar_documentos",
  "listar_categorias",
];

async function syncCron(row: RecurringReminderRow): Promise<string | null> {
  const brainfocusTools = row.is_instruction ? ASISTENTE_INSTRUCTION_TOOLS : undefined;
  try {
    if (row.schedule_type === "once") {
      if (!row.scheduled_at) return null;
      return await scheduleOnceCron({
        displayName: `brainfocus:asistente:${row.id}`,
        at: row.scheduled_at,
        message: buildMessage(row),
        channel: row.channel,
        brainfocusTools,
      });
    }
    if (!row.active) return null;
    return await scheduleRecurringCron({
      displayName: `brainfocus:asistente:${row.id}`,
      cronExpr: buildCronExpr(row),
      message: buildMessage(row),
      channel: row.channel,
      brainfocusTools,
    });
  } catch (err) {
    console.error(`[asistente] no se pudo programar "${row.title}":`, err);
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
      if (error) console.error(`[asistente] cron creado pero no se pudo guardar:`, error.message);
    },
    async afterUpdate(_userId, before, after) {
      // Una vez ya disparada (pasado su scheduled_at), editar no debería
      // volver a programar nada — solo importa para las que siguen pendientes.
      if (after.schedule_type === "once" && after.scheduled_at && new Date(after.scheduled_at) <= new Date()) return;

      const relevant: (keyof RecurringReminderRow)[] = [
        "schedule_type",
        "scheduled_at",
        "is_instruction",
        "frequency",
        "interval_hours",
        "time_of_day",
        "day_of_week",
        "channel",
        "active",
        "title",
      ];
      if (!relevant.some((k) => before[k] !== after[k])) return;

      await cancelReminderCron(before.cron_job_id ?? null);
      const jobId = await syncCron(after);
      const { error } = await supabaseAdmin.from("recurring_reminders").update({ cron_job_id: jobId }).eq("id", after.id);
      if (error) console.error(`[asistente] cron reprogramado pero no se pudo guardar:`, error.message);
    },
    async beforeDelete(_userId, row) {
      await cancelReminderCron(row.cron_job_id ?? null);
    },
  },
});
