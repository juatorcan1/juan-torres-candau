-- App de gimnasio: una copia entera de gym_docs cada semana (la hace el guardián los lunes con
-- select public.gym_copia_semanal()). No se borra ninguna: son pocos datos.
create table public.gym_docs_copias (
  copia date not null,
  collection text not null,
  id text not null,
  athlete text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (copia, collection, id)
);
comment on table public.gym_docs_copias is 'App de gimnasio Juan vs Ignacio (no es de Senda). Copias semanales de gym_docs; las escribe gym_copia_semanal(). No borrar.';
alter table public.gym_docs_copias enable row level security;
revoke all on public.gym_docs_copias from anon, authenticated;

create or replace function public.gym_copia_semanal()
returns integer
language sql
security definer
set search_path = ''
as $$
  with nuevas as (
    insert into public.gym_docs_copias (copia, collection, id, athlete, data, updated_at)
    select current_date, collection, id, athlete, data, updated_at from public.gym_docs
    on conflict (copia, collection, id) do update set data = excluded.data, athlete = excluded.athlete, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer from nuevas
$$;
comment on function public.gym_copia_semanal() is 'App de gimnasio: copia todo gym_docs en gym_docs_copias con la fecha de hoy y devuelve cuántos documentos copió.';
revoke all on function public.gym_copia_semanal() from public, anon, authenticated;
