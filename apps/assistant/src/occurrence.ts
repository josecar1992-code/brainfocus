// Cuándo le toca disparar a un recordatorio recurrente / al aviso de kilometraje de un usuario del asistente.
// Replica las expresiones cron que usa OpenClaw para el dueño (apps/api routes/recurringReminders.ts y settings.ts)
// pero calculadas aquí, en hora de Costa Rica (UTC-6 fijo, sin horario de verano) y sin depender de la zona del proceso.
const CR_OFFSET_MS = 6 * 3600_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export interface RecurringRow {
  id: string;
  title: string;
  schedule_type: "once" | "recurring";
  scheduled_at: string | null;
  is_instruction: boolean;
  frequency: "every_n_hours" | "daily" | "weekly" | null;
  interval_hours: number | null;
  time_of_day: string | null;
  day_of_week: number | null;
  active: boolean;
  created_at: string;
  last_fired_at: string | null;
}

// Reloj de pared de Costa Rica expresado como una fecha UTC "corrida": se leen sus campos con getUTC*.
const wall = (ms: number) => new Date(ms - CR_OFFSET_MS);
const fromWall = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m, d, h, min) + CR_OFFSET_MS;

function hhmm(t: string | null): [number, number] {
  const [h, m] = (t ?? "09:00").split(":").map(Number);
  return [h, m];
}

/** Última ocurrencia programada que ya pasó (≤ now), o null. */
export function latestOccurrence(row: RecurringRow, nowMs: number): number | null {
  const w = wall(nowMs);
  const y = w.getUTCFullYear(), mo = w.getUTCMonth(), d = w.getUTCDate();

  if (row.frequency === "every_n_hours" && row.interval_hours) {
    const h = Math.floor(w.getUTCHours() / row.interval_hours) * row.interval_hours; // 0, N, 2N… igual que `0 */N * * *`
    return fromWall(y, mo, d, h);
  }
  const [h, m] = hhmm(row.time_of_day);
  const today = fromWall(y, mo, d, h, m);
  if (row.frequency === "daily") return today <= nowMs ? today : today - DAY;
  if (row.frequency === "weekly" && row.day_of_week !== null) {
    const back = (w.getUTCDay() - row.day_of_week + 7) % 7;
    const cand = today - back * DAY;
    return cand <= nowMs ? cand : cand - 7 * DAY;
  }
  return null;
}

/**
 * Ocurrencia pendiente de entregar (ms) o null. Solo cuenta lo posterior a la creación y a la última entrega.
 * Si hubo varias sin entregar (ventana cerrada), solo importa la última: no se acumulan avisos viejos.
 */
export function dueOccurrence(row: RecurringRow, nowMs: number): number | null {
  const lastFired = row.last_fired_at ? new Date(row.last_fired_at).getTime() : -Infinity;
  if (row.schedule_type === "once") {
    if (!row.scheduled_at) return null;
    const at = new Date(row.scheduled_at).getTime();
    return at <= nowMs && at > lastFired ? at : null;
  }
  if (!row.active) return null;
  const occ = latestOccurrence(row, nowMs);
  if (occ === null || occ <= lastFired || occ <= new Date(row.created_at).getTime()) return null;
  return occ;
}

/** Aviso de kilometraje: 9:00 de Costa Rica los días impares del mes (cron "0 9 cada-2-dias"). */
export function mileageOccurrence(nowMs: number, lastFiredIso: string | null): number | null {
  const lastFired = lastFiredIso ? new Date(lastFiredIso).getTime() : -Infinity;
  for (let back = 0; back <= 3; back++) {
    const w = wall(nowMs - back * DAY);
    if (w.getUTCDate() % 2 === 0) continue;
    const occ = fromWall(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), 9);
    if (occ > nowMs) continue;
    return occ > lastFired && nowMs - occ <= 2 * DAY ? occ : null;
  }
  return null;
}
