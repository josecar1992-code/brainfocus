-- Módulo "Salud": perfiles (Yo / Mamá...) con bitácora de peso, presión arterial
-- (tensiómetro Rossmax CH155f) y composición corporal (báscula/reloj inteligente).
-- Ver especificación completa en PENDIENTES.md (19-nov-2026).

create table if not exists public.health_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  birth_date date not null,
  is_medicated boolean not null default false,
  target_weight_kg numeric,
  current_weight_kg numeric,
  watch_calibration_enabled boolean not null default false,
  last_watch_calibration timestamptz,
  created_by text not null default 'user' check (created_by in ('user','agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weight_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.health_profiles(id) on delete cascade,
  weight_kg numeric not null,
  logged_at timestamptz not null default now(),
  created_by text not null default 'user' check (created_by in ('user','agent')),
  created_at timestamptz not null default now()
);

-- map/pulse_pressure/classification se calculan en la API (nunca confiados al
-- cliente, igual que tasks.completed_at) — ver packages/focusbrain-health.
create table if not exists public.bp_readings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.health_profiles(id) on delete cascade,
  "timestamp" timestamptz not null default now(),
  systolic numeric not null check (systolic between 60 and 260),
  diastolic numeric not null check (diastolic between 30 and 160),
  pulse numeric not null check (pulse between 30 and 220),
  irregular_heartbeat boolean not null default false,
  arm_movement boolean not null default false,
  map numeric not null,
  pulse_pressure numeric not null,
  classification text not null,
  context text not null,
  is_averaged_reading boolean not null default false,
  weight_snapshot_kg numeric,
  symptoms text[],
  notes text,
  created_by text not null default 'user' check (created_by in ('user','agent')),
  created_at timestamptz not null default now(),
  constraint bp_readings_dia_lt_sys check (diastolic < systolic)
);

-- Composición corporal (báscula Xiaomi, Galaxy Watch/Fitbit, etc.) — snapshot propio
-- del evento de medición, no reemplaza weight_logs (que puede venir de una báscula simple).
create table if not exists public.body_composition_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.health_profiles(id) on delete cascade,
  logged_at timestamptz not null default now(),
  source text,
  weight_kg numeric,
  body_fat_pct numeric,
  muscle_mass_kg numeric,
  bone_mass_kg numeric,
  body_water_pct numeric,
  visceral_fat_level numeric,
  bmr_kcal numeric,
  bmi numeric,
  created_by text not null default 'user' check (created_by in ('user','agent')),
  created_at timestamptz not null default now()
);

create index if not exists idx_health_profiles_user on public.health_profiles(user_id);
create index if not exists idx_weight_logs_profile on public.weight_logs(profile_id, logged_at);
create index if not exists idx_weight_logs_user on public.weight_logs(user_id);
create index if not exists idx_bp_readings_profile on public.bp_readings(profile_id, "timestamp");
create index if not exists idx_bp_readings_user on public.bp_readings(user_id);
create index if not exists idx_body_composition_logs_profile on public.body_composition_logs(profile_id, logged_at);
create index if not exists idx_body_composition_logs_user on public.body_composition_logs(user_id);

alter table public.health_profiles enable row level security;
alter table public.weight_logs enable row level security;
alter table public.bp_readings enable row level security;
alter table public.body_composition_logs enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['health_profiles','weight_logs','bp_readings','body_composition_logs'])
  loop
    execute format('create policy "owner_select_%1$s" on public.%1$s for select using (user_id = auth.uid());', t);
    execute format('create policy "owner_modify_%1$s" on public.%1$s for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;
