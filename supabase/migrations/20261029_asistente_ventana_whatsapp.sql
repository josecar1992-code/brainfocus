-- Política de ventana de 24 h de WhatsApp para los avisos del asistente (apps/assistant/src/dispatcher.ts):
-- cuándo se mandó la última plantilla (máx. una por ventana cerrada) y el último aviso de "mantén la ventana abierta".
alter table public.profiles
  add column if not exists whatsapp_template_sent_at timestamptz,
  add column if not exists whatsapp_keepalive_sent_at timestamptz;
