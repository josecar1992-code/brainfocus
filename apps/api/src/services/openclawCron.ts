import { env } from "../env.js";

// Programa/cancela el aviso real de WhatsApp/Telegram como un cron job de
// disparo único (tool `cron` del gateway de OpenClaw, `POST /tools/invoke`)
// — llamada HTTP directa, no pasa por ningún agente de IA, así que no genera
// cargos de modelo sin importar cuántos recordatorios haya.
//
// Reglas del contrato (rompen el recordatorio en silencio si se ignoran):
// - sessionTarget siempre "isolated" (nunca "main" + systemEvent, depende del
//   heartbeat que está apagado).
// - schedule.at siempre con offset explícito (-06:00 para Costa Rica).
// - delivery.to sin prefijo de canal ("+50687686207", no "whatsapp:+...").
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

async function invoke(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${env.openclawGatewayUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openclawGatewayToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json && typeof json === "object" && "error" in (json as any) ? (json as any).error : res.statusText;
    throw new Error(`OpenClaw cron ${body.action} falló (${res.status}): ${detail}`);
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

  const result = await invoke({
    tool: "cron",
    action: "add",
    job: {
      displayName: `brainfocus:reminder:${reminder.id}`,
      sessionTarget: "isolated",
      schedule: { at: reminder.remind_at },
      payload: { kind: "agentTurn", message: reminder.title },
      delivery: { channel: reminder.channel ?? "telegram", to: env.openclawReminderTo },
    },
  });

  const jobId = (result as { jobId?: string } | null)?.jobId;
  if (!jobId) throw new Error("OpenClaw no devolvió jobId al crear el cron");
  return jobId;
}

/** Cancelación best-effort: no debe bloquear que una tarea/evento se complete o se borre. */
export async function cancelReminderCron(jobId: string | null): Promise<void> {
  if (!jobId || !isConfigured()) return;
  try {
    await invoke({ tool: "cron", action: "remove", jobId });
  } catch (err) {
    console.error(`[openclawCron] No se pudo cancelar ${jobId}:`, err);
  }
}
