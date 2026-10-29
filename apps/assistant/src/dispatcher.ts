// Entrega de recordatorios de los usuarios del asistente (los del dueño siguen por los cron de OpenClaw).
//
// Política de la ventana de 24 h de WhatsApp (decidida con el dueño, 29-oct-2026):
//  - Ventana abierta (el usuario escribió hace < 24 h): el recordatorio sale como texto libre, gratis.
//  - Ventana cerrada: NO se manda el recordatorio; se manda UNA sola plantilla `recordatorio_general` por ventana
//    cerrada para incentivar que responda. Los recordatorios quedan pendientes y, cuando responde (la ventana se
//    abre), el siguiente ciclo los entrega como texto libre.
//  - Keep-alive: entre las 23 h y las 24 h del último mensaje del usuario se le pide que responda para no perder
//    la ventana (igual que el cron de 23 h que ya usa el dueño).
export const WINDOW_MS = 24 * 3600_000;
export const KEEPALIVE_AFTER_MS = 23 * 3600_000;
export const TEMPLATE_NAME = "recordatorio_general";
export const KEEPALIVE_TEXT =
  "Respondeme cualquier cosa para mantener abierta nuestra conversación y que tus recordatorios te lleguen sin interrupciones.";

export interface DueReminder {
  id: string;
  title: string;
  remindAt: string;
}

export interface DueUser {
  userId: string;
  phone: string;
  lastInboundAt: number | null;
  templateSentAt: number | null;
  reminders: DueReminder[]; // ordenados por remind_at
}

export interface KeepaliveCandidate {
  userId: string;
  phone: string;
  lastInboundAt: number;
}

export interface DispatchStore {
  dueUsers(nowMs: number): Promise<DueUser[]>;
  /** Marca enviado solo si seguía pendiente; false si otro ciclo ya lo tomó. */
  claimReminder(id: string, userId: string, nowMs: number): Promise<boolean>;
  releaseReminder(id: string, userId: string): Promise<void>;
  markTemplateSent(userId: string, nowMs: number): Promise<void>;
  keepaliveCandidates(nowMs: number): Promise<KeepaliveCandidate[]>;
  markKeepaliveSent(userId: string, nowMs: number): Promise<void>;
}

export interface DispatchDeps {
  store: DispatchStore;
  sendText: (to: string, text: string) => Promise<unknown>;
  sendTemplate: (to: string, name: string, params: string[]) => Promise<unknown>;
  now?: () => number;
  log?: (msg: string, extra?: unknown) => void;
}

export const windowOpen = (lastInboundAt: number | null, nowMs: number): boolean =>
  lastInboundAt !== null && nowMs - lastInboundAt < WINDOW_MS;

// Hora de Costa Rica explícita, nunca la del proceso (regla del proyecto).
export function formatCR(iso: string): string {
  return new Intl.DateTimeFormat("es-CR", {
    timeZone: "America/Costa_Rica",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function reminderText(r: DueReminder, nowMs: number): string {
  const late = nowMs - new Date(r.remindAt).getTime() > 5 * 60_000;
  return `⏰ Recordatorio: ${r.title}` + (late ? `\n(estaba programado para ${formatCR(r.remindAt)})` : "");
}

export function templateParams(reminders: DueReminder[]): [string, string] {
  const first = reminders[0];
  const more = reminders.length - 1;
  return [oneLine(first.title) + (more > 0 ? ` y ${more} más` : ""), formatCR(first.remindAt)];
}

export function createDispatcher(deps: DispatchDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  let running = false;

  async function deliverUser(u: DueUser, nowMs: number) {
    if (windowOpen(u.lastInboundAt, nowMs)) {
      for (const r of u.reminders) {
        if (!(await deps.store.claimReminder(r.id, u.userId, nowMs))) continue;
        try {
          await deps.sendText(u.phone, reminderText(r, nowMs));
        } catch (err) {
          await deps.store.releaseReminder(r.id, u.userId); // reintenta en el próximo ciclo
          throw err;
        }
      }
      return;
    }
    // Ventana cerrada: una plantilla por ventana. Ya se mandó si fue después del último mensaje del usuario.
    const alreadySent = u.templateSentAt !== null && (u.lastInboundAt === null || u.templateSentAt > u.lastInboundAt);
    if (alreadySent) return;
    await deps.sendTemplate(u.phone, TEMPLATE_NAME, templateParams(u.reminders));
    await deps.store.markTemplateSent(u.userId, nowMs);
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const nowMs = now();
      for (const u of await deps.store.dueUsers(nowMs)) {
        try {
          await deliverUser(u, nowMs);
        } catch (err) {
          log(`fallo entregando a ${u.userId}`, err instanceof Error ? err.message : err); // un usuario no frena a los demás
        }
      }
      for (const c of await deps.store.keepaliveCandidates(nowMs)) {
        try {
          await deps.sendText(c.phone, KEEPALIVE_TEXT);
          await deps.store.markKeepaliveSent(c.userId, nowMs);
        } catch (err) {
          log(`fallo keep-alive de ${c.userId}`, err instanceof Error ? err.message : err);
        }
      }
    } finally {
      running = false;
    }
  }
  return { tick };
}
