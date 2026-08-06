-- FocusbrainCR — esquema inicial
-- Diseñado para single-user hoy, multi-tenant mañana: toda tabla de datos lleva user_id
-- y una policy de RLS "user_id = auth.uid()". La API usa la service_role key (bypassa RLS
-- a propósito, es la única puerta de entrada), pero RLS queda activo como defensa en
-- profundidad para cualquier acceso futuro directo desde el cliente.

create extension if not exists "uuid-ossp";

-- ============================================================
-- Planes (para comercialización futura, no bloquea el uso hoy)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free', -- free | pro | ... (futuro)
  created_at timestamptz not null default now()
);

-- ============================================================
-- API keys de agentes (OpenClaw / Quicks)
-- ============================================================
create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_hash text not null unique, -- sha256 de la key real; la key en claro nunca se guarda
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Auditoría de acciones de agentes
-- ============================================================
create table if not exists public.agent_actions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  action text not null,       -- ej. "tasks.create"
  resource_table text,
  resource_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Listas / proyectos (agrupan tareas)
-- ============================================================
create table if not exists public.lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Tareas
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.lists(id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'pending', -- pending | in_progress | done
  priority text not null default 'normal', -- low | normal | high
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Subtareas (checklist dentro de una tarea) — el % completado de la tarea
-- principal se calcula en el cliente a partir de estas filas, no se guarda.
-- ============================================================
create table if not exists public.subtasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Recordatorios (pueden o no estar ligados a una tarea o a un evento)
-- ============================================================
create table if not exists public.reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  channel text default 'telegram', -- telegram | whatsapp | email (temporal: WhatsApp bloqueado hasta 13-ago-2026, ver openclawCron.ts)
  sent_at timestamptz,
  -- jobId real que devuelve OpenClaw al crear el cron (tool `cron`, action
  -- `add` sobre POST /tools/invoke) — hace falta para poder cancelarlo
  -- después (action `remove`); el displayName no alcanza para eso. Null =
  -- OpenClaw no está configurado en este entorno, o ya se canceló.
  cron_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Eventos / agenda
-- ============================================================
create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reminders.event_id se agrega acá (con alter) porque events se declara después
-- de reminders arriba, y la FK necesita que la tabla destino ya exista.
alter table public.reminders
  add column if not exists event_id uuid references public.events(id) on delete cascade;

-- Vínculo evento -> tarea: permite que el check de "hecho" sea el mismo botón
-- desde Tareas, Agenda y Rutinas (marcar la tarea marca el evento, y si es de
-- una rutina, dispara advanceRoutine y queda en el historial).
alter table public.events
  add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists idx_events_task on public.events(task_id);

-- ============================================================
-- Documentos (PDFs/imágenes que Quicks guarda y reenvía por nombre) —
-- bucket privado "documentos" en Supabase Storage, acceso solo vía URL
-- firmada de vencimiento corto que genera la API (service-role), nunca
-- directo desde el cliente.
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, -- nombre único por el que se busca/recupera, no el filename original
  storage_path text not null, -- ruta opaca dentro del bucket, ej. "<user_id>/<uuid>"
  mime_type text,
  size bigint,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Notas / información libre
-- ============================================================
create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  content text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Nutrición
-- ============================================================
create table if not exists public.nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_type text, -- breakfast | lunch | dinner | snack
  description text not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  water_ml numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Ejercicio
-- ============================================================
create table if not exists public.exercise_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  activity text not null, -- ej. "pesas", "correr"
  duration_min numeric,
  sets integer,
  reps integer,
  weight_kg numeric,
  distance_km numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Vehículos
-- ============================================================
create table if not exists public.vehicles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  model text not null,
  year integer,
  vehicle_type text,
  plate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_maintenance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  date timestamptz not null,
  description text not null, -- ej. "cambio de aceite"
  mileage numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Rutinas (tareas repetitivas) — solo existe UNA ocurrencia pendiente
-- (current_task_id/current_event_id) a la vez; al completarse esa tarea,
-- el hook afterUpdate de tasks.ts llama a advanceRoutine(), que registra el
-- historial y crea la siguiente ocurrencia. No se generan todas las futuras
-- de una vez.
-- ============================================================
create table if not exists public.routines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  list_id uuid references public.lists(id) on delete set null,
  frequency text not null, -- daily | weekly
  interval_weeks integer not null default 1, -- solo weekly: 1 = toda semana, 2 = de por medio, etc.
  days_of_week integer[] not null default '{}', -- 0 (domingo) .. 6 (sábado), solo weekly
  time_of_day text not null, -- HH:MM
  start_date date not null, -- ancla para la paridad de semanas, no necesariamente la 1ra tarea
  crear_recordatorio boolean not null default true,
  current_task_id uuid references public.tasks(id) on delete set null,
  current_event_id uuid references public.events(id) on delete set null,
  current_occurrence_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_completions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  occurrence_date date,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- tasks.routine_id se agrega acá (con alter) porque routines se declara
-- después de tasks arriba, y la FK necesita que la tabla destino ya exista.
alter table public.tasks
  add column if not exists routine_id uuid references public.routines(id) on delete set null;

-- ============================================================
-- Índices
-- ============================================================
create index if not exists idx_tasks_user on public.tasks(user_id);
create index if not exists idx_tasks_due on public.tasks(user_id, due_date);
create index if not exists idx_subtasks_task on public.subtasks(task_id);
create index if not exists idx_subtasks_user on public.subtasks(user_id);
create index if not exists idx_reminders_remind_at on public.reminders(user_id, remind_at);
create index if not exists idx_reminders_event on public.reminders(event_id);
create index if not exists idx_events_starts on public.events(user_id, starts_at);
create index if not exists idx_notes_user on public.notes(user_id);
create unique index if not exists idx_documents_user_name on public.documents(user_id, name);
create index if not exists idx_documents_user on public.documents(user_id);
create index if not exists idx_nutrition_user on public.nutrition_logs(user_id, logged_at);
create index if not exists idx_exercise_user on public.exercise_logs(user_id, logged_at);
create index if not exists idx_agent_actions_user on public.agent_actions(user_id, created_at);
create index if not exists idx_vehicles_user on public.vehicles(user_id);
create index if not exists idx_vehicle_maintenance_vehicle on public.vehicle_maintenance(vehicle_id, date);
create index if not exists idx_routines_user on public.routines(user_id);
create index if not exists idx_routine_completions_routine on public.routine_completions(routine_id, completed_at);
create index if not exists idx_tasks_routine on public.tasks(routine_id);

-- ============================================================
-- RLS — activo en todas las tablas de datos
-- ============================================================
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.agent_actions enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.reminders enable row level security;
alter table public.events enable row level security;
alter table public.documents enable row level security;
alter table public.notes enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_maintenance enable row level security;
alter table public.routines enable row level security;
alter table public.routine_completions enable row level security;

create policy "owner_select_profiles" on public.profiles for select using (id = auth.uid());
create policy "owner_modify_profiles" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'api_keys','agent_actions','lists','tasks','subtasks',
    'reminders','events','notes','documents','nutrition_logs','exercise_logs',
    'vehicles','vehicle_maintenance','routines','routine_completions'
  ])
  loop
    execute format(
      'create policy "owner_select_%1$s" on public.%1$s for select using (user_id = auth.uid());', t
    );
    execute format(
      'create policy "owner_modify_%1$s" on public.%1$s for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t
    );
  end loop;
end $$;

-- ============================================================
-- Storage: bucket "documentos" (privado) para el módulo Documentos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Defensa en profundidad: el primer segmento de la ruta del objeto es el
-- user_id (ver storage_path en public.documents), aunque en la práctica solo
-- la API con service-role toca este bucket.
create policy "owner_select_documentos_objects" on storage.objects for select
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner_modify_documentos_objects" on storage.objects for all
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
