-- Recordatorios recurrentes y aviso de kilometraje de usuarios del asistente (apps/assistant/src/dispatcher.ts):
-- última ocurrencia entregada, para no repetir ni perder avisos. Los del dueño siguen por cron de OpenClaw.
alter table public.recurring_reminders add column if not exists last_fired_at timestamptz;
alter table public.profiles add column if not exists mileage_reminder_last_fired_at timestamptz;
