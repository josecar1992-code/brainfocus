import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 3002),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  apiBaseUrl: process.env.API_BASE_URL ?? "http://api:3001",
  serviceKey: required("ASSISTANT_SERVICE_KEY"),
  kapso: { apiKey: required("KAPSO_API_KEY"), phoneNumberId: required("KAPSO_PHONE_NUMBER_ID") },
  webhookSecret: required("KAPSO_WEBHOOK_SECRET"),
  qwen: { apiKey: required("DASHSCOPE_API_KEY"), baseUrl: process.env.DASHSCOPE_BASE_URL, model: process.env.QWEN_MODEL },
  // Números que se reenvían a OpenClaw (el dueño, mientras sigue en Quicks de OpenClaw) y los que se descartan (personal de QuickWash).
  forwardNumbers: process.env.FORWARD_NUMBERS,
  dropNumbers: process.env.DROP_NUMBERS,
  openclawWebhookUrl: process.env.OPENCLAW_WEBHOOK_URL ?? "http://host.docker.internal:18789/kapso/webhook",
};
