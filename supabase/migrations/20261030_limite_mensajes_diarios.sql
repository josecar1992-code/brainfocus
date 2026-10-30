-- Límite de mensajes diarios del asistente por persona. null = el valor general (DAILY_MESSAGE_LIMIT del asistente).
alter table public.profiles add column if not exists daily_message_limit integer check (daily_message_limit is null or daily_message_limit > 0);
