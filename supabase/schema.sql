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
-- Recordatorios (pueden o no estar ligados a una tarea o a un evento)
-- ============================================================
create table if not exists public.reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  channel text default 'telegram', -- telegram | whatsapp | email
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
-- Índices
-- ============================================================
create index if not exists idx_tasks_user on public.tasks(user_id);
create index if not exists idx_tasks_due on public.tasks(user_id, due_date);
create index if not exists idx_reminders_remind_at on public.reminders(user_id, remind_at);
create index if not exists idx_reminders_event on public.reminders(event_id);
create index if not exists idx_events_starts on public.events(user_id, starts_at);
create index if not exists idx_notes_user on public.notes(user_id);
create index if not exists idx_nutrition_user on public.nutrition_logs(user_id, logged_at);
create index if not exists idx_exercise_user on public.exercise_logs(user_id, logged_at);
create index if not exists idx_agent_actions_user on public.agent_actions(user_id, created_at);
create index if not exists idx_vehicles_user on public.vehicles(user_id);
create index if not exists idx_vehicle_maintenance_vehicle on public.vehicle_maintenance(vehicle_id, date);

-- ============================================================
-- RLS — activo en todas las tablas de datos
-- ============================================================
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.agent_actions enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_maintenance enable row level security;

create policy "owner_select_profiles" on public.profiles for select using (id = auth.uid());
create policy "owner_modify_profiles" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'api_keys','agent_actions','lists','tasks',
    'reminders','events','notes','nutrition_logs','exercise_logs',
    'vehicles','vehicle_maintenance'
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
