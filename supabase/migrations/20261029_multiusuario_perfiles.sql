-- Multiusuario, fase 1: estado, administrador y módulos por usuario en `profiles`,
-- más el número de WhatsApp (para identificar al remitente en el servicio de
-- asistente, fase 2) y la hora de su último mensaje (ventana de 24 h de WhatsApp).
-- Correr UNA vez en el SQL Editor de Supabase. Es idempotente.

alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('pending', 'active', 'blocked')),
  add column if not exists is_admin boolean not null default false,
  add column if not exists enabled_modules text[],            -- null = todos los módulos
  add column if not exists whatsapp_phone text,                -- E.164, ej. +50688887777
  add column if not exists whatsapp_last_inbound_at timestamptz;

-- Los perfiles que YA existen quedan 'active' (default de arriba). Los nuevos
-- nacen 'pending' hasta que el administrador los active.
alter table public.profiles alter column status set default 'pending';

create unique index if not exists idx_profiles_whatsapp_phone
  on public.profiles(whatsapp_phone) where whatsapp_phone is not null;

-- Todo usuario que existe HOY es el dueño original: perfil activo y administrador.
-- (No hay trigger que cree el perfil al registrarse, por eso se inserta aquí.)
insert into public.profiles (id, status, is_admin)
select id, 'active', true from auth.users
on conflict (id) do update set status = 'active', is_admin = true;
