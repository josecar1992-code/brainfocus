-- Asistente multiusuario (apps/assistant): historial de conversación y consumo por usuario.
-- Solo el servicio (service role) toca estas tablas: RLS activo y sin políticas = ningún acceso desde el cliente.
create table if not exists assistant_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  wa_message_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_assistant_messages_wa_id on assistant_messages (wa_message_id) where wa_message_id is not null;
create index if not exists idx_assistant_messages_user_created on assistant_messages (user_id, created_at desc);
alter table assistant_messages enable row level security;

create table if not exists assistant_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  llm_calls integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_assistant_usage_user_created on assistant_usage (user_id, created_at desc);
alter table assistant_usage enable row level security;
