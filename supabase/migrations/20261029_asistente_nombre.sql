-- Nombre con el que Quicks llama a cada persona. Lo pregunta Quicks en el primer mensaje y lo guarda el asistente.
alter table public.profiles add column if not exists display_name text;
