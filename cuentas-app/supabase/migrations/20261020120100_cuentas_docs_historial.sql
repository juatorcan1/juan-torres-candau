-- Las cuentas de Juan: historial de cuentas_docs. Cada vez que un documento pierde algo (se borra, se cambia
-- un movimiento, se quita uno, se toca una cuenta o el presupuesto) la versión de antes se guarda aquí, así que
-- un mes pisado desde otro móvil o con una copia vieja se puede recuperar. Para recuperar, ver cuentas-app/README.md.
-- No se guarda la versión de antes cuando la nueva la contiene entera (solo se ha añadido algo: un movimiento
-- nuevo, el enlace de Drive de un ticket), ni la colección tricount (es una copia de lo que dice Tricount).
create table public.cuentas_docs_historial (
  hid bigint generated always as identity primary key,
  owner uuid not null,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,               -- cuándo se escribió esa versión
  op text not null check (op in ('UPDATE', 'DELETE')),
  cambiado_en timestamptz not null default now(), -- cuándo dejó de ser la buena
  cambiado_por uuid default auth.uid()
);
comment on table public.cuentas_docs_historial is 'Cuentas personales de Juan (no es de Senda). Versiones anteriores de cuentas_docs: la escribe solo el disparador cuentas_docs_historial.';
create index cuentas_docs_historial_doc_idx on public.cuentas_docs_historial (owner, collection, id, cambiado_en desc);

alter table public.cuentas_docs_historial enable row level security;
revoke all on public.cuentas_docs_historial from anon, authenticated;
grant select on public.cuentas_docs_historial to authenticated;
create policy "cuentas: leo mi historial" on public.cuentas_docs_historial
  for select to authenticated
  using (owner = (select auth.uid()) and exists (select 1 from public.cuentas_usuarios u where u.user_id = (select auth.uid())));

create or replace function public.cuentas_docs_guardar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.collection = 'tricount' or (tg_op = 'UPDATE' and new.data @> old.data) then
    return null;
  end if;
  insert into public.cuentas_docs_historial (owner, collection, id, data, updated_at, op)
  values (old.owner, old.collection, old.id, old.data, old.updated_at, tg_op);
  return null;
end
$$;
comment on function public.cuentas_docs_guardar_historial() is 'Cuentas personales: guarda en cuentas_docs_historial la versión anterior de cada documento que pierde algo o se borra.';
revoke all on function public.cuentas_docs_guardar_historial() from public, anon, authenticated;

create trigger cuentas_docs_historial
  after update or delete on public.cuentas_docs
  for each row execute function public.cuentas_docs_guardar_historial();
