-- Llaves de servicios externos de "Las cuentas de Juan" (p. ej. Kraken, sólo lectura).
-- Sin políticas: la web no puede leerlas ni escribirlas; sólo las Edge Functions con service_role.
create table if not exists public.cuentas_secretos (
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  valor jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, nombre)
);
alter table public.cuentas_secretos enable row level security;
revoke all on public.cuentas_secretos from anon, authenticated;
comment on table public.cuentas_secretos is 'Llaves externas de Las cuentas de Juan. Sin políticas a propósito: sólo service_role (Edge Functions).';
