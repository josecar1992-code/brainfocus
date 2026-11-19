-- Recordatorios periódicos del módulo Salud (peso semanal, presión arterial configurable)
-- reusando el mecanismo de cron recurrente de OpenClaw (scheduleRecurringCron), igual que
-- el resto de la app. No usa recurring_reminders (tabla genérica de "Asistente") porque estos
-- recordatorios están atados a un health_profiles.id y su ciclo de vida (crear/pausar/borrar)
-- lo maneja apps/api/src/routes/healthProfiles.ts directo, igual que vehicles.ts con next_maintenance_date.

alter table public.health_profiles
  add column if not exists weight_reminder_enabled boolean not null default false,
  add column if not exists weight_reminder_day_of_week int check (weight_reminder_day_of_week between 0 and 6),
  add column if not exists weight_reminder_time text check (weight_reminder_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  add column if not exists weight_reminder_cron_job_id text,
  add column if not exists bp_reminder_enabled boolean not null default false,
  add column if not exists bp_reminder_frequency text check (bp_reminder_frequency in ('daily','weekly')),
  add column if not exists bp_reminder_day_of_week int check (bp_reminder_day_of_week between 0 and 6),
  add column if not exists bp_reminder_time text check (bp_reminder_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  add column if not exists bp_reminder_cron_job_id text;
