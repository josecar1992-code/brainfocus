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
// - Fallback a Telegram (10-ago-2026, pedido explícito del usuario): WhatsApp
//   (Kapso/Meta) falla si el usuario no interactúa con Quicks dentro de una
//   ventana de 24h — sin eso, la plantilla de reapertura de conversación no
//   se puede mandar y el envío se pierde en silencio. Todo `cron.add` de
//   recordatorios manda `delivery.failureDestination` para que el propio
//   gateway avise por Telegram si la entrega falla del todo — ver
//   `buildFailureDestination` (nombre de campo corregido 01-sep-2026, ver el
//   comentario ahí — antes vivía en el campo equivocado y nunca se disparaba).
//   (Retirado 13-ago-2026: pedirle a Quicks que
//   reintentara por Telegram con la tool `message` dentro del mismo mensaje
//   — el gateway bloquea ese reintento en todos los casos, ver
//   `withTelegramFallback` para el detalle.)

const TELEGRAM_FALLBACK_TO = "7843485332";

// `delivery.failureDestination`: mecanismo del gateway (no de Quicks) — si la
// entrega vía `delivery` falla, el gateway mismo avisa por este canal, sin
// depender de que el agente razone sobre el fallo. `accountId: "default"` es
// el shape confirmado por el usuario para este campo.
//
// [CORREGIDO 01-sep-2026] Este objeto se mandaba como campo `failureAlert` a
// nivel de job (sibling de `delivery`), no como `delivery.failureDestination`
// — confirmado en el fuente del gateway instalado
// (`cron-DOnNmbFN.js`/`delivery-plan-DKK9kKBx.js`, VPS 169.58.62.116) que son
// DOS campos distintos con rutas de código separadas: `job.failureAlert` solo
// se valida al crear el job (`assertValidCronFailureAlert`, pensado para el
// flag `--failure-alert-channel` del CLI), pero la notificación real de falla
// en tiempo de ejecución (`dispatchCronFailureDestinationNotifications` en
// `server-cron-CU_Xcc9_.js`) lee únicamente `job.delivery.failureDestination`
// — `failureAlert` a nivel de job nunca se lee ahí. Resultado: el job se
// creaba sin error (el shape se valida igual) pero el fallback a Telegram
// jamás se disparaba — confirmado con `grep failureAlert` sobre los logs de
// OpenClaw en producción, cero apariciones en ningún día. Detectado porque el
// recordatorio de las 8:30am (01-sep-2026) falló por ventana de WhatsApp
// cerrada (`OutboundDeliveryError: Cannot send non-template messages outside
// the 24-hour window`, job deshabilitado permanentemente tras el error) y no
// llegó ni por WhatsApp ni por el supuesto fallback de Telegram.
function buildFailureDestination() {
  return { channel: "telegram", to: TELEGRAM_FALLBACK_TO, accountId: "default" };
}

// Retirado el 13-ago-2026: se probó pedirle a Quicks, dentro del propio
// mensaje, que reintentara por Telegram con la tool `message` si fallaba
// WhatsApp — resultó estructuralmente imposible, no un bug de texto. Los
// logs de OpenClaw (`journalctl -u openclaw`) muestran que el gateway
// rechaza cualquier intento de la tool `message` hacia un canal distinto del
// que quedó "bound" a la sesión del cron (acá, `kapso-whatsapp`, por ser el
// `delivery.channel` del job):
//   Cross-context messaging denied: action=send target provider "whatsapp"
//   while bound to "kapso-whatsapp"
//   Cross-context messaging denied: action=send target provider "telegram"
//   while bound to "kapso-whatsapp"
// Es una restricción de seguridad del propio gateway, no depende de si el
// nombre del parámetro es "to" o "target" (eso ya estaba bien) ni del canal
// pedido — bloquea cross-context sin excepción. Cada disparo generaba dos
// fallos garantizados, y Quicks terminaba agregando una nota de advertencia
// confusa al mensaje final ("no pude enviar por error de permisos...")
// aunque la entrega real (vía `delivery: {mode:"announce"}`, que no pasa por
// la tool `message` del agente y sí llega bien) ya se había completado.
// `failureAlert` (más abajo) es el único fallback real y sigue activo: es un
// campo de `cron.add` que maneja el gateway mismo, no la tool `message`.
function withTelegramFallback(message: string): string {
  return message;
}

// Una sesión de cron `isolated` sin `payload.toolsAllow` explícito cae a un
// set mínimo (`cron`, `message`, `web_search`, `web_fetch`) — ninguna tool de
// `brainfocus-api__*`, aunque el agente esté registrado con ellas fuera de
// cron. Bug real confirmado el 10-ago-2026: el aviso mensual de kilometraje
// (que necesita llamar `listar_vehiculos`/`listar_kilometrajes`/
// `registrar_kilometraje` de verdad, no solo relayar texto) fallaba en
// silencio porque el job nunca pedía esas tools. `message` siempre se incluye
// (hace falta para poder avisar por WhatsApp/Telegram); las de
// `brainfocus-api__*` se agregan solo si el job las necesita — pasarlas de
// más no es gratis, cada tool extra se infla en el prompt del agente.
function buildToolsAllow(brainfocusTools: string[] = []): string[] {
  return ["cron", "message", "web_search", "web_fetch", ...brainfocusTools.map((t) => `brainfocus-api__${t}`)];
}

interface ReminderForCron {
  id: string;
  title: string;
  remind_at: string;
  channel: string | null;
}

function isConfigured(): boolean {
  return Boolean(env.openclawGatewayUrl && env.openclawGatewayToken);
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

// Default "whatsapp" (07-ago-2026, confirmado con test de entrega en vivo):
// tras migrar la integración de OpenClaw a Kapso (API oficial de Meta), un
// primer intento de revertir a WhatsApp pareció fallar en vivo — pero la
// causa real era que el cron de prueba usaba el string viejo "whatsapp" en
// vez de "kapso-whatsapp" (el gateway lo rechaza con 400 antes de intentar
// entregar nada; no es un problema de conexión/salud del canal, ese ruido
// de health-monitor cada ~10min es normal en Kapso porque no mantiene
// conexión persistente como Baileys — recibe por webhook). Con el string
// correcto, un segundo cron de prueba sí llegó, confirmado por el usuario.
// Ver infra/DEPLOY.md para el historial completo.
function resolveDelivery(channel: string | null): { to: string; gatewayChannel: string } {
  const ch = channel ?? "whatsapp";
  // env.openclawReminderTo es un número de teléfono ("+506..."), formato
  // válido para WhatsApp — Telegram exige un chat ID numérico (probado
  // 05-ago-2026: "+506..." como `to` de Telegram falla con "recipient must
  // be a numeric chat ID"), por eso usa su propia variable
  // (openclawReminderToTelegram).
  const to = ch === "telegram" ? env.openclawReminderToTelegram : env.openclawReminderTo;
  if (!to) throw new Error(`No hay destinatario configurado para el canal "${ch}"`);
  // El gateway de OpenClaw, tras migrar WhatsApp a Kapso (07-ago-2026), sólo
  // acepta "kapso-whatsapp" | "telegram" como delivery.channel (confirmado en
  // vivo: cron.add con "whatsapp" responde 400 "delivery.channel must be one
  // of: kapso-whatsapp, telegram"). Adentro de Focusbrain seguimos guardando
  // "whatsapp" (valor simple, estable de cara al usuario/UI); este mapeo es
  // la única capa que conoce el nombre real que espera el gateway.
  const gatewayChannel = ch === "whatsapp" ? "kapso-whatsapp" : ch;
  return { to, gatewayChannel };
}

function extractJobId(result: unknown): string {
  // POST /tools/invoke devuelve el sobre completo: { ok, result: { content, details: { id } } }.
  const jobId = (result as { result?: { details?: { id?: string } } } | null)?.result?.details?.id;
  if (!jobId) throw new Error("OpenClaw no devolvió jobId al crear el cron");
  return jobId;
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
  const { to, gatewayChannel } = resolveDelivery(reminder.channel);

  const result = await invoke("cron", "add", {
    job: {
      displayName: `brainfocus:reminder:${reminder.id}`,
      sessionTarget: "isolated",
      schedule: { at: reminder.remind_at },
      // kind: "agentTurn" significa que `message` no se entrega tal cual —
      // OpenClaw lo pasa como instrucción a Quicks, que redacta su propio
      // texto. reminder.title (el que se ve en la app) ya trae la hora del
      // evento y la descripción, pero el agente puede resumir el resto
      // libremente — lo único no negociable es que la hora exacta quede en
      // el mensaje final, así que se lo pedimos explícito.
      payload: {
        kind: "agentTurn",
        message: withTelegramFallback(
          `Avisale esto al usuario: "${reminder.title}". Podés redactarlo con tus palabras, pero ` +
            `la hora del evento que aparece ahí tiene que quedar sí o sí en el mensaje final, textual, ` +
            `sin cambiarla ni omitirla.`,
        ),
        // Solo relaya texto, no necesita llamar ninguna tool de brainfocus-api.
        toolsAllow: buildToolsAllow(),
      },
      delivery: { mode: "announce", channel: gatewayChannel, to, failureDestination: buildFailureDestination() },
    },
  });

  return extractJobId(result);
}

// Minutos después de la hora del recordatorio en que se manda el respaldo.
const BACKUP_DELAY_MINUTES = 4;

/**
 * Respaldo incondicional por Telegram, unos minutos después del recordatorio
 * real — NO es una verificación (no existe ninguna señal real de si el
 * WhatsApp llegó: `reminders.sent_at` nunca se llena en la práctica, y el
 * gateway de OpenClaw no expone estado de entrega consultable). Se manda
 * siempre, incondicional, igual que el patrón que ya funciona en la
 * automatización de n8n del Poder Judicial (dos canales en paralelo, no una
 * cadena de fallback que dependa de que algo detecte el error).
 *
 * Reemplaza a `delivery.failureDestination` como mecanismo real de respaldo
 * (01-sep-2026, primer intento) — que resultó ser una vía muerta para este
 * caso: confirmado leyendo el fuente del gateway instalado
 * (`isolated-agent-*.js`) que para jobs `payload.kind:"agentTurn"` (los que
 * usan los recordatorios) el gateway DOWNGRADEA a propósito el `status` del
 * job de vuelta a `"ok"` cuando la entrega falla mientras el turno del
 * agente en sí no falló (`errorKind !== "delivery-target"`, es decir,
 * cualquier falla que no sea una config inválida del destino) — así que
 * `failureDestination` (que solo se dispara con `status:"error"`)
 * estructuralmente nunca se activa para una falla real de entrega como la
 * ventana de WhatsApp cerrada. Detectado el 02-sep-2026: un segundo
 * recordatorio (`Rutina: Hacerme la barba`, 8pm) no llegó por ningún canal,
 * y el job no quedó marcado como error pese a que la entrega sí falló. Solo
 * se programa cuando el canal principal no es ya Telegram (si el usuario
 * pidió Telegram como canal, el respaldo sería el mismo canal, sin sentido).
 */
export async function scheduleReminderBackupCron(reminder: ReminderForCron): Promise<string | null> {
  if (!isConfigured()) return null;
  const { gatewayChannel } = resolveDelivery(reminder.channel);
  if (gatewayChannel === "telegram") return null;
  const telegramTo = env.openclawReminderToTelegram;
  if (!telegramTo) return null;

  const backupAt = new Date(new Date(reminder.remind_at).getTime() + BACKUP_DELAY_MINUTES * 60_000).toISOString();

  const result = await invoke("cron", "add", {
    job: {
      displayName: `brainfocus:reminder-backup:${reminder.id}`,
      sessionTarget: "isolated",
      schedule: { at: backupAt },
      payload: {
        kind: "agentTurn",
        message:
          `Avisale esto al usuario por Telegram, como respaldo (puede que ya le haya llegado por ` +
          `WhatsApp, no pasa nada si es repetido): "${reminder.title}". Podés redactarlo con tus ` +
          `palabras, pero la hora que aparece ahí tiene que quedar sí o sí en el mensaje final, textual, ` +
          `sin cambiarla ni omitirla. Aclará que es un respaldo por si no le llegó el de WhatsApp.`,
        toolsAllow: buildToolsAllow(),
      },
      delivery: { mode: "announce", channel: "telegram", to: telegramTo },
    },
  });

  return extractJobId(result);
}

interface RecurringCronInput {
  displayName: string;
  // 5 o 6 campos (con segundos), formato estándar de cron.
  cronExpr: string;
  message: string;
  channel: string | null;
  // Nombres cortos de tools de brainfocus-api que este job necesita llamar de
  // verdad (ej. ["listar_vehiculos", "registrar_kilometraje"]), sin el
  // prefijo `brainfocus-api__` — se agrega solo. Vacío/omitido si el job solo
  // relaya texto.
  brainfocusTools?: string[];
}

// Único job recurrente real de la app hoy (el resto de los "recordatorios"
// son one-shot, ver scheduleReminderCron) — confirmado en vivo el
// 09-ago-2026 que el gateway acepta schedule.kind:"cron" con expr + tz
// (ver `openclaw cron add --cron ... --tz ... --json` para inspeccionar el
// shape real; no está documentado, solo lo devuelve el propio comando).
export async function scheduleRecurringCron(input: RecurringCronInput): Promise<string | null> {
  if (!isConfigured()) return null;
  const { to, gatewayChannel } = resolveDelivery(input.channel);

  const result = await invoke("cron", "add", {
    job: {
      displayName: input.displayName,
      sessionTarget: "isolated",
      schedule: { kind: "cron", expr: input.cronExpr, tz: "America/Costa_Rica" },
      payload: {
        kind: "agentTurn",
        message: withTelegramFallback(input.message),
        toolsAllow: buildToolsAllow(input.brainfocusTools),
      },
      delivery: { mode: "announce", channel: gatewayChannel, to, failureDestination: buildFailureDestination() },
    },
  });

  return extractJobId(result);
}

interface OnceCronInput {
  displayName: string;
  // ISO con offset explícito (-06:00 para Costa Rica), mismo requisito que
  // scheduleReminderCron.
  at: string;
  message: string;
  channel: string | null;
  // Ver RecurringCronInput.brainfocusTools.
  brainfocusTools?: string[];
}

// One-shot con mensaje libre — a diferencia de scheduleReminderCron, no
// envuelve el mensaje en "Avisale esto al usuario: ...": lo manda tal cual,
// para el caso "instrucción para Quicks" del módulo Asistente (ej. "dame el
// tipo de cambio del bitcoin actual"), donde el texto ya es la orden final,
// no un dato para relayar.
export async function scheduleOnceCron(input: OnceCronInput): Promise<string | null> {
  if (!isConfigured()) return null;
  const { to, gatewayChannel } = resolveDelivery(input.channel);

  const result = await invoke("cron", "add", {
    job: {
      displayName: input.displayName,
      sessionTarget: "isolated",
      schedule: { at: input.at },
      payload: {
        kind: "agentTurn",
        message: withTelegramFallback(input.message),
        toolsAllow: buildToolsAllow(input.brainfocusTools),
      },
      delivery: { mode: "announce", channel: gatewayChannel, to, failureDestination: buildFailureDestination() },
    },
  });

  return extractJobId(result);
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
