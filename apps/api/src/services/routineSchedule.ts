// Cálculo puro de fechas de ocurrencia de una rutina — sin tocar la base de
// datos, para poder probarlo/razonarlo aislado del resto del sistema.

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly";
  intervalWeeks: number; // 1 = todas las semanas, 2 = de por medio, etc. (solo aplica a "weekly")
  daysOfWeek: number[]; // 0 (domingo) .. 6 (sábado) — solo aplica a "weekly"
  dayOfMonth: number | null; // 1..31 — solo aplica a "monthly"
  startDate: string; // YYYY-MM-DD, ancla para contar la paridad de semanas
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEARCH_DAYS = 3650; // ~10 años, tope de seguridad para no loopear para siempre

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

// Semana empieza domingo (día 0), para alinear directo con Date#getDay().
function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() - r.getUTCDay());
  r.setUTCHours(0, 0, 0, 0);
  return r;
}

function weeksBetween(anchor: Date, d: Date): number {
  return Math.round((startOfWeek(d).getTime() - startOfWeek(anchor).getTime()) / (7 * DAY_MS));
}

// Días reales del mes de `d` — para "el 31 de cada mes" en un mes de 30 días
// (o febrero), se cae en el último día del mes en vez de saltárselo o
// desbordar al mes siguiente. Mismo criterio que usan Google/Apple Calendar.
function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

function matches(rule: RecurrenceRule, d: Date, anchor: Date): boolean {
  if (rule.frequency === "daily") return true;
  if (rule.frequency === "monthly") {
    const target = Math.min(rule.dayOfMonth ?? 1, daysInMonth(d));
    return d.getUTCDate() === target;
  }
  if (!rule.daysOfWeek.includes(d.getUTCDay())) return false;
  return weeksBetween(anchor, d) % rule.intervalWeeks === 0;
}

/**
 * Primera ocurrencia al crear la rutina: busca desde hoy (o start_date si es
 * futuro) hacia adelante — start_date es el ancla para la paridad de semanas,
 * no necesariamente el día en que aparece la primera tarea (si quedó en el
 * pasado, no queremos una tarea "vencida" desde el día uno).
 */
export function firstOccurrenceDate(rule: RecurrenceRule, today: string): string {
  const anchor = parseDateOnly(rule.startDate);
  const from = rule.startDate > today ? rule.startDate : today;
  let d = parseDateOnly(from);
  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    if (matches(rule, d, anchor)) return toDateStr(d);
    d = new Date(d.getTime() + DAY_MS);
  }
  throw new Error("No se pudo calcular la primera ocurrencia de la rutina");
}

/** Próxima ocurrencia después de una fecha ya cumplida (estrictamente posterior). */
export function nextOccurrenceDate(rule: RecurrenceRule, afterDateStr: string): string {
  const anchor = parseDateOnly(rule.startDate);
  let d = new Date(parseDateOnly(afterDateStr).getTime() + DAY_MS);
  for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
    if (matches(rule, d, anchor)) return toDateStr(d);
    d = new Date(d.getTime() + DAY_MS);
  }
  throw new Error("No se pudo calcular la siguiente ocurrencia de la rutina");
}

const DAY_LABELS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function describeRecurrence(rule: RecurrenceRule): string {
  if (rule.frequency === "daily") return "Todos los días";
  if (rule.frequency === "monthly") return `El día ${rule.dayOfMonth} de cada mes`;
  const days = [...rule.daysOfWeek].sort().map((d) => DAY_LABELS[d]).join(", ");
  return rule.intervalWeeks > 1 ? `Cada ${rule.intervalWeeks} semanas: ${days}` : `Cada semana: ${days}`;
}
