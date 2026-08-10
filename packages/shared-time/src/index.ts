// Utilidades de fecha/hora ancladas a Costa Rica (offset fijo -06:00, sin
// horario de verano) — compartidas entre apps/web (api.ts) y apps/mcp
// (index.ts), que hasta el 09-ago-2026 tenían implementaciones casi
// idénticas de esto por separado y ya habían empezado a divergir (ver
// PENDIENTES.md, sección 4). Sin dependencias — funciones puras sobre
// Date/Intl, usables tanto en browser (Vite) como en Node (tsc).

export const CR_OFFSET = "-06:00";
export const CR_TIMEZONE = "America/Costa_Rica";
export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * true si remindAt (ISO) todavía está en el futuro — un cron para una hora
 * ya pasada, OpenClaw lo rechaza (400 "recordatorio en el pasado"). Mejor
 * omitir el recordatorio automático que hacer fallar la creación de la
 * tarea/evento entero por esto.
 */
export function isFutureReminder(remindAt: string): boolean {
  return new Date(remindAt).getTime() > Date.now();
}

/**
 * El mensaje que llega por WhatsApp/Telegram es literalmente reminders.title
 * (ver openclawCron.ts) — sin esto, el aviso solo decía "Recordatorio:
 * <título>", sin ninguna hora, y quien lo recibía asumía que la hora de
 * LLEGADA del aviso (2h antes por defecto) era la hora del evento. Arma el
 * texto completo: título, hora real del evento (Costa Rica) y descripción.
 */
export function formatReminderTitle(title: string, startsAt: string, description?: string): string {
  const hora = new Date(startsAt).toLocaleTimeString("es-CR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: CR_TIMEZONE,
  });
  const base = `Recordatorio: ${title} a las ${hora}`;
  return description ? `${base}. ${description}` : base;
}

/**
 * Fecha y hora actuales en Costa Rica, en formato largo legible — ancla
 * explícita de "ahora" para las tools del MCP que reciben fechas (sin esto,
 * el agente tenía que inferir la fecha/hora actual solo de su propio
 * contexto de conversación, y confundía "hoy"/"mañana"/el offset con
 * bastante frecuencia).
 */
export function horaActualCR(): string {
  return new Date().toLocaleString("es-CR", {
    timeZone: CR_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "YYYY-MM-DD HH:MM" en hora de Costa Rica, a partir de un ISO en UTC — para
 * que el agente/la UI nunca tengan que convertir un timestamp UTC a mano
 * (fuente real de errores de fecha reportados antes de esto existir).
 */
export function isoACostaRica(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("en-CA", { timeZone: CR_TIMEZONE });
  const hora = d.toLocaleTimeString("en-GB", { timeZone: CR_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  return `${fecha} ${hora}`;
}

/**
 * true si fecha+hora (inputs de formulario, "YYYY-MM-DD"/"HH:MM") quedan a
 * más de 2h de ahora — para que el formulario oculte/desmarque el check de
 * "avisar 2h antes" cuando el evento queda demasiado cerca, evitando el 400
 * de "recordatorio en el pasado".
 */
export function canRemindTwoHoursBefore(fecha: string, hora: string): boolean {
  if (!fecha || !hora) return false;
  const startsAt = new Date(`${fecha}T${hora}:00${CR_OFFSET}`).getTime();
  return startsAt - TWO_HOURS_MS > Date.now();
}
