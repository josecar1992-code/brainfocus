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
};
