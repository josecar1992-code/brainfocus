import { env } from "../env.js";

// Programa/cancela el aviso real de WhatsApp/Telegram como un cron job de
// disparo único (tool `cron` del gateway de OpenClaw, `POST /tools/invoke`)
// — llamada HTTP directa, no pasa por ningún agente de IA, así que no genera
// cargos de modelo sin importar cuántos recordatorios haya.
//
// OpenClaw corre nativo por systemd en el host (no en Docker), por eso
// OPENCLAW_GATEWAY_URL debe apuntar a host.docker.internal, no a 127.0.0.1
// (ver extra_hosts en docker-compose.yml, servicio `api`).
//
// Reglas del contrato (rompen el recordatorio en silencio si se ignoran):
// - sessionTarget siempre "isolated" (nunca "main" + systemEvent, depende del
//   heartbeat que está apagado).
// - schedule.at siempre con offset explícito (-06:00 para Costa Rica).
// - delivery.to sin prefijo de canal ("+50687686207", no "whatsapp:+...").
// - delivery.mode es obligatorio ("announce" = entrega fallback del texto
//   final a un chat) — sin él, cron.add responde 400 "must have required
//   property 'mode'". Confirmado creando un job de prueba con `openclaw cron
//   add --json` y mirando el shape real que guarda, ya que no está en la
//   documentación que nos pasaron.
// - un solo destinatario por job.

interface ReminderForCron {
  id: string;
  title: string;
  remind_at: string;
  channel: string | null;
}

function isConfigured(): boolean {
  return Boolean(env.openclawGatewayUrl && env.openclawGatewayToken && env.openclawReminderTo);
}

// `action`/`job` van anidados dentro de `args` — un {tool, action, job} de
// primer nivel responde "job required" aunque job venga en el body.
async function invoke(tool: string, action: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${env.openclawGatewayUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openclawGatewayToken}`,
    },
    body: JSON.stringify({ tool, args: { action, ...args } }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const errField = json && typeof json === "object" ? (json as any).error : null;
    const detail =
      errField && typeof errField === "object"
        ? (errField.message ?? JSON.stringify(errField))
        : (errField ?? res.statusText);
    throw new Error(`OpenClaw cron ${action} falló (${res.status}): ${detail}`);
  }
  return json;
}

/**
 * Si OpenClaw no está configurado (env vars vacías, típico en local), no se
 * programa nada y devuelve null — el recordatorio queda visible en la app
 * pero sin aviso automático. Si está configurado y la llamada falla, se
 * propaga el error tal cual (nada de reintentar variaciones del schema a
 * ciegas) para que quien creó el recordatorio se entere.
 */
export async function scheduleReminderCron(reminder: ReminderForCron): Promise<string | null> {
  if (!isConfigured()) return null;

  const result = await invoke("cron", "add", {
    job: {
      displayName: `brainfocus:reminder:${reminder.id}`,
      sessionTarget: "isolated",
      schedule: { at: reminder.remind_at },
      // kind: "agentTurn" significa que `message` no se entrega tal cual —
      // OpenClaw lo pasa como instrucción a Quicks, que redacta su propio
      // texto para WhatsApp. reminder.title (el que se ve en la app) ya trae
      // la hora del evento y la descripción, pero al ser solo el título el
      // agente a veces lo resumía y se comía la hora. Por eso el message que
      // sí viaja acá es explícito en pedir que lo repita literal.
      payload: {
        kind: "agentTurn",
        message: `Avisale esto al usuario por WhatsApp, tal cual, sin resumir ni cambiar la hora: "${reminder.title}"`,
      },
      // env.openclawReminderTo es un número de teléfono ("+506..."), formato
      // válido para WhatsApp — Telegram exige un chat ID numérico, así que
      // "telegram" como default aquí rompía la entrega en silencio (el cron
      // corría pero OpenClaw rechazaba el destinatario).
      delivery: { mode: "announce", channel: reminder.channel ?? "whatsapp", to: env.openclawReminderTo },
    },
  });

  // POST /tools/invoke devuelve el sobre completo: { ok, result: { content, details: { id } } }.
  const jobId = (result as { result?: { details?: { id?: string } } } | null)?.result?.details?.id;
  if (!jobId) throw new Error("OpenClaw no devolvió jobId al crear el cron");
  return jobId;
}

/** Cancelación best-effort: no debe bloquear que una tarea/evento se complete o se borre. */
export async function cancelReminderCron(jobId: string | null): Promise<void> {
  if (!jobId || !isConfigured()) return;
  try {
    await invoke("cron", "remove", { jobId });
  } catch (err) {
    console.error(`[openclawCron] No se pudo cancelar ${jobId}:`, err);
  }
}
