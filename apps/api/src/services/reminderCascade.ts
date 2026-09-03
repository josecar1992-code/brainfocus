import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron, scheduleReminderCron, scheduleReminderBackupCron } from "./openclawCron.js";

// Si una tarea/evento se completa o se borra antes de que suene su
// recordatorio, el aviso ya no tiene sentido — se cancela el cron y se borra
// la fila de reminders para no dejar jobs huérfanos en OpenClaw.
export async function cancelPendingRemindersFor(userId: string, column: "task_id" | "event_id" | "vehicle_id", id: string) {
  const { data: pending, error } = await supabaseAdmin
    .from("reminders")
    .select("id, cron_job_id, backup_cron_job_id")
    .eq("user_id", userId)
    .eq(column, id)
    .is("sent_at", null);
  if (error) throw error;
  if (!pending?.length) return;

  await Promise.all(pending.map((r) => cancelReminderCron(r.cron_job_id)));
  await Promise.all(pending.map((r) => cancelReminderCron(r.backup_cron_job_id)));
  await supabaseAdmin
    .from("reminders")
    .delete()
    .eq("user_id", userId)
    .in("id", pending.map((r) => r.id));
}

/**
 * Cuando se mueve la fecha de un evento (o de la tarea espejo, que a su vez
 * mueve el evento — ver events.ts/tasks.ts), los recordatorios ya creados
 * ("2h antes", "a la hora") quedaban apuntando a la hora vieja: el cron en
 * OpenClaw seguía sonando en el momento original, no en el nuevo. Reportado
 * por el usuario 17-ago-2026 junto con el cascade de borrado.
 *
 * Reprograma cada recordatorio pendiente de `eventId` conservando su offset
 * respecto al evento (ej. el que estaba "2h antes" sigue 2h antes, ahora de
 * la hora nueva) — no hay una columna que diga "es el de 2h antes" o "el de
 * la hora exacta", así que el offset se recalcula desde `oldStartsAt`.
 * Si el nuevo horario ya quedó en el pasado, no se puede reprogramar: se
 * cancela el cron viejo y el recordatorio queda sin cron (mismo estado que
 * ya maneja `ReminderBadge` como "sin aviso"), en vez de fallar el PATCH del
 * evento/tarea por esto.
 */
export async function rescheduleRemindersForEvent(
  userId: string,
  eventId: string,
  oldStartsAt: string,
  newStartsAt: string,
) {
  const { data: pending, error } = await supabaseAdmin
    .from("reminders")
    .select("id, title, remind_at, channel, cron_job_id, backup_cron_job_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .is("sent_at", null);
  if (error) throw error;
  if (!pending?.length) return;

  const oldStartMs = new Date(oldStartsAt).getTime();
  const newStartMs = new Date(newStartsAt).getTime();

  for (const r of pending) {
    const offsetMs = new Date(r.remind_at).getTime() - oldStartMs;
    const newRemindAt = new Date(newStartMs + offsetMs).toISOString();

    await cancelReminderCron(r.cron_job_id);
    await cancelReminderCron(r.backup_cron_job_id);

    if (new Date(newRemindAt).getTime() <= Date.now()) {
      await supabaseAdmin
        .from("reminders")
        .update({ remind_at: newRemindAt, cron_job_id: null, backup_cron_job_id: null })
        .eq("id", r.id);
      continue;
    }

    const reminderForCron = { id: r.id, title: r.title, remind_at: newRemindAt, channel: r.channel };
    const jobId = await scheduleReminderCron(reminderForCron);
    let backupJobId: string | null = null;
    try {
      backupJobId = await scheduleReminderBackupCron(reminderForCron);
    } catch (err) {
      console.error(`[reminderCascade] no se pudo reprogramar el respaldo por Telegram de ${r.id}:`, err);
    }
    const { error: updateError } = await supabaseAdmin
      .from("reminders")
      .update({ remind_at: newRemindAt, cron_job_id: jobId, backup_cron_job_id: backupJobId })
      .eq("id", r.id);
    if (updateError) console.error(`[reminderCascade] recordatorio ${r.id} reprogramado pero no se pudo guardar:`, updateError.message);
  }
}
