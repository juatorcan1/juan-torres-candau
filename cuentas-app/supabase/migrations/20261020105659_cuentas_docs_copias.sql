-- Las cuentas de Juan: una copia entera de cuentas_docs cada semana, sin tener que acordarse.
-- La pide la web al entrar (select public.cuentas_copia_semanal()): si la última copia de ese usuario tiene
-- 7 días o más, o no hay ninguna, copia todos sus documentos con la fecha de hoy; si no, no hace nada.
-- No se borra ninguna: son pocos datos (unos 350 kB por copia). Para recuperar, ver cuentas-app/README.md.
create table public.cuentas_docs_copias (
  copia date not null,
  owner uuid not null,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (owner, copia, collection, id)
);
comment on table public.cuentas_docs_copias is 'Cuentas personales de Juan (no es de Senda). Copias semanales de cuentas_docs; las escribe cuentas_copia_semanal(). No borrar.';
alter table public.cuentas_docs_copias enable row level security;
revoke all on public.cuentas_docs_copias from anon, authenticated;

create or replace function public.cuentas_copia_semanal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  n integer;
begin
  if yo is null or not exists (select 1 from public.cuentas_usuarios u where u.user_id = yo) then
    return 0;
  end if;
  if exists (select 1 from public.cuentas_docs_copias c where c.owner = yo and c.copia > current_date - 7) then
    return 0;
  end if;
  insert into public.cuentas_docs_copias (copia, owner, collection, id, data, updated_at)
  select current_date, d.owner, d.collection, d.id, d.data, d.updated_at
  from public.cuentas_docs d
  where d.owner = yo
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;
comment on function public.cuentas_copia_semanal() is 'Cuentas personales: si toca (7 días desde la última), copia los documentos del usuario en cuentas_docs_copias y devuelve cuántos copió.';
revoke all on function public.cuentas_copia_semanal() from public, anon;
grant execute on function public.cuentas_copia_semanal() to authenticated;

-- La primera copia, la de hoy, antes de poner el historial.
insert into public.cuentas_docs_copias (copia, owner, collection, id, data, updated_at)
select current_date, owner, collection, id, data, updated_at from public.cuentas_docs;
