-- Módulo "Listas": listas con ítems que se marcan con check (ej. lista de compras).
-- Se llaman checklists/checklist_items porque `lists` ya es la tabla de categorías de tareas.
create table if not exists public.checklists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_by text not null default 'user' check (created_by in ('user','agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_by text not null default 'user' check (created_by in ('user','agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checklists_user on public.checklists(user_id);
create index if not exists idx_checklist_items_user on public.checklist_items(user_id);
create index if not exists idx_checklist_items_list on public.checklist_items(checklist_id);

alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['checklists','checklist_items'])
  loop
    execute format('create policy "owner_select_%1$s" on public.%1$s for select using (user_id = auth.uid());', t);
    execute format('create policy "owner_modify_%1$s" on public.%1$s for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;
