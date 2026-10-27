-- Cuentas personales: lo que gasta cada llamada a Claude (tokens y dólares), para saber cuánto cuesta
-- leer un ticket, un dictado o un extracto. Solo la escribe la Edge Function cuentas-claude (service_role).
create table public.cuentas_claude_gasto (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  tarea text not null default 'otra',          -- ticket, dictado, extracto, pregunta, medias, tricount…
  modelo text not null,                        -- el que contestó (puede ser el de reserva)
  effort text,
  fotos smallint not null default 0,
  entrada integer not null default 0,          -- tokens de entrada sin caché
  salida integer not null default 0,           -- tokens de salida, contando lo que piensa
  cache_escrita integer not null default 0,
  cache_leida integer not null default 0,
  coste_usd numeric(10, 6) not null default 0
);
comment on table public.cuentas_claude_gasto is 'Cuentas personales: tokens y coste en dólares de cada llamada a Claude. Solo la escribe la Edge Function cuentas-claude (service_role).';
create index cuentas_claude_gasto_user_creado on public.cuentas_claude_gasto (user_id, creado);

alter table public.cuentas_claude_gasto enable row level security;
revoke all on public.cuentas_claude_gasto from anon, authenticated;
