import { supabaseAdmin } from "../supabaseClient.js";
import { scheduleReminderCron } from "./openclawCron.js";
import { firstOccurrenceDate, nextOccurrenceDate, type RecurrenceRule } from "./routineSchedule.js";

const CR_OFFSET = "-06:00"; // Costa Rica, sin horario de verano — offset fijo

export interface RoutineRow {
  id: string;
  user_id: string;
  title: string;
  list_id: string | null;
  frequency: "daily" | "weekly";
  interval_weeks: number;
  days_of_week: number[];
  time_of_day: string;
  start_date: string;
  crear_recordatorio: boolean;
  current_task_id: string | null;
  current_event_id: string | null;
  current_occurrence_date: string | null;
}

function ruleOf(routine: RoutineRow): RecurrenceRule {
  return {
    frequency: routine.frequency,
    intervalWeeks: routine.interval_weeks,
    daysOfWeek: routine.days_of_week,
    startDate: routine.start_date,
  };
}

/**
 * Crea la tarea + evento (+ recordatorio opcional) de una ocurrencia de rutina
 * y actualiza la rutina para apuntar a ellos como "la ocurrencia pendiente
 * actual". No crea ocurrencias futuras — eso pasa una por una, cuando se
 * cumple la actual (ver advanceRoutine).
 */
async function createOccurrence(routine: RoutineRow, occurrenceDate: string): Promise<void> {
  const startsAt = `${occurrenceDate}T${routine.time_of_day}:00${CR_OFFSET}`;

  const { data: task, error: taskError } = await supabaseAdmin
    .from("tasks")
    .insert({
      user_id: routine.user_id,
      title: routine.title,
      list_id: routine.list_id,
      routine_id: routine.id,
      due_date: startsAt,
    })
    .select()
    .single();
  if (taskError) throw taskError;

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .insert({ user_id: routine.user_id, title: routine.title, starts_at: startsAt, task_id: task.id })
    .select()
    .single();
  if (eventError) throw eventError;

  if (routine.crear_recordatorio) {
    const { data: reminder, error: reminderError } = await supabaseAdmin
      .from("reminders")
      .insert({
        user_id: routine.user_id,
        title: `Rutina: ${routine.title}`,
        remind_at: startsAt,
        task_id: task.id,
        event_id: event.id,
      })
      .select()
      .single();
    if (reminderError) throw reminderError;

    // La tarea y el evento reales sí deben quedar creados aunque falle el
    // aviso — no tiene sentido revertir la ocurrencia completa por esto. Pero
    // el recordatorio SÍ se borra si falla programarlo (igual que en
    // reminders.ts): antes quedaba una fila fantasma con cron_job_id null que
    // se veía como un recordatorio real en la UI pero nunca iba a sonar.
    try {
      const jobId = await scheduleReminderCron(reminder);
      if (jobId) {
        const { error } = await supabaseAdmin.from("reminders").update({ cron_job_id: jobId }).eq("id", reminder.id);
        if (error) console.error(`[routines] cron creado (${jobId}) pero no se pudo guardar:`, error.message);
      }
    } catch (err) {
      console.error(`[routines] no se pudo programar el aviso de "${routine.title}", se borra el recordatorio fantasma:`, err);
      await supabaseAdmin.from("reminders").delete().eq("id", reminder.id);
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("routines")
    .update({ current_task_id: task.id, current_event_id: event.id, current_occurrence_date: occurrenceDate })
    .eq("id", routine.id);
  if (updateError) throw updateError;
}

/** Se llama al crear una rutina nueva: genera su primera ocurrencia. */
export async function createFirstOccurrence(routine: RoutineRow): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const date = firstOccurrenceDate(ruleOf(routine), today);
  await createOccurrence(routine, date);
}

/**
 * Se llama cuando se marca como hecha la tarea de una rutina: registra la
 * ocurrencia en el historial y genera la siguiente (una sola, nunca todas las
 * futuras de una vez).
 */
export async function advanceRoutine(userId: string, routineId: string): Promise<void> {
  const { data: routine, error } = await supabaseAdmin
    .from("routines")
    .select("*")
    .eq("id", routineId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!routine) return; // la rutina se borró mientras tanto — nada que avanzar

  await supabaseAdmin.from("routine_completions").insert({
    user_id: userId,
    routine_id: routineId,
    occurrence_date: routine.current_occurrence_date,
    completed_at: new Date().toISOString(),
  });

  // Si la ocurrencia anterior se cumplió muy tarde (se saltó una o más), no
  // generamos las fechas ya vencidas: avanzamos hasta la próxima ocurrencia
  // igual o posterior a hoy. La cadena "se rompe" — no se recuperan los días
  // saltados, solo se retoma desde el día que toca.
  const today = new Date().toISOString().slice(0, 10);
  const rule = ruleOf(routine);
  let next = nextOccurrenceDate(rule, routine.current_occurrence_date ?? routine.start_date);
  while (next < today) {
    next = nextOccurrenceDate(rule, next);
  }
  await createOccurrence(routine, next);
}
