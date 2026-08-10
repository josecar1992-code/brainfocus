import { supabaseAdmin } from "../supabaseClient.js";
import { cancelReminderCron } from "./openclawCron.js";

// Si una tarea/evento se completa o se borra antes de que suene su
// recordatorio, el aviso ya no tiene sentido — se cancela el cron y se borra
// la fila de reminders para no dejar jobs huérfanos en OpenClaw.
export async function cancelPendingRemindersFor(userId: string, column: "task_id" | "event_id" | "vehicle_id", id: string) {
  const { data: pending, error } = await supabaseAdmin
    .from("reminders")
    .select("id, cron_job_id")
    .eq("user_id", userId)
    .eq(column, id)
    .is("sent_at", null);
  if (error) throw error;
  if (!pending?.length) return;

  await Promise.all(pending.map((r) => cancelReminderCron(r.cron_job_id)));
  await supabaseAdmin
    .from("reminders")
    .delete()
    .eq("user_id", userId)
    .in("id", pending.map((r) => r.id));
}
