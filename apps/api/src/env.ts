import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  // App de un solo dueño por ahora: solo estos correos pueden autenticarse como
  // usuario (JWT), sin importar que Supabase les deje crear una cuenta. Vacío = sin
  // restricción (útil el día que se abra a multiusuario de verdad).
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Credencial servicio-a-servicio del asistente multiusuario (apps/assistant): permite actuar EN NOMBRE de
  // un usuario ya identificado por el servicio (X-On-Behalf-Of). Vacía = esa vía de acceso queda cerrada.
  assistantServiceKey: process.env.ASSISTANT_SERVICE_KEY ?? "",
  // Gateway de OpenClaw (tool `cron` sobre POST /tools/invoke) para el aviso
  // real de WhatsApp/Telegram. Opcionales a propósito: sin ellos, los
  // recordatorios se siguen guardando y viendo en la app, solo que sin
  // disparo automático (ver openclawCron.ts). openclawReminderTo es el único
  // destinatario (app de un solo dueño), sin prefijo de canal, ej. "+50687686207".
  openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL,
  openclawGatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
  openclawReminderTo: process.env.OPENCLAW_REMINDER_TO,
  // Telegram exige un chat ID numérico como destinatario, no el número de
  // teléfono que usa WhatsApp (confirmado 05-ago-2026, ver openclawCron.ts) —
  // por eso es una variable separada, opcional (sin ella, canal "telegram"
  // simplemente no se puede usar).
  openclawReminderToTelegram: process.env.OPENCLAW_REMINDER_TO_TELEGRAM,
  // Único usuario cuyos avisos salen por OpenClaw (su WhatsApp/Telegram). Los demás usuarios se entregan por el
  // asistente (apps/assistant). Si está definido y el usuario no coincide (o no se sabe), NO se programa cron:
  // sin esto el aviso de otro usuario llegaría al teléfono del dueño. Vacío = comportamiento anterior (un solo dueño).
  // Precios por millón de tokens (USD) para ESTIMAR el consumo por usuario en Consumos. Opcionales: sin ellos solo se
  // muestran tokens. Tomarlos de la tarifa de Alibaba Cloud del modelo en uso (no están en el repo a propósito).
  qwenPriceInputPerMillionUsd: process.env.QWEN_PRICE_INPUT_PER_M_USD ? Number(process.env.QWEN_PRICE_INPUT_PER_M_USD) : null,
  qwenPriceOutputPerMillionUsd: process.env.QWEN_PRICE_OUTPUT_PER_M_USD ? Number(process.env.QWEN_PRICE_OUTPUT_PER_M_USD) : null,
  // Solo para mostrarlo en la pantalla de Usuarios: el que aplica de verdad lo lee el asistente de SU propio .env.
  // Si se cambia allá, hay que poner el mismo valor aquí (mismo nombre de variable, mismo 50 por defecto).
  dailyMessageLimit: Number(process.env.DAILY_MESSAGE_LIMIT) > 0 ? Number(process.env.DAILY_MESSAGE_LIMIT) : 50,
  openclawOwnerUserId: process.env.OPENCLAW_OWNER_USER_ID ?? "",
};
