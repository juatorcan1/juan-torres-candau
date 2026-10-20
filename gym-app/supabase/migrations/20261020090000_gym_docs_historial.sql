-- App de gimnasio: historial de gym_docs. Cada vez que un documento se cambia o se borra, la versión de
-- antes se guarda aquí, así que ningún entreno, pesaje o plan se pierde por pisarlo o borrarlo (desde la
-- app, otro móvil o un entreno viejo que se quedó abierto). Para recuperar uno, ver gym-app/CLAUDE.md.
create table public.gym_docs_historial (
  hid bigint generated always as identity primary key,
  collection text not null,
  id text not null,
  athlete text not null,
  data jsonb not null,
  updated_at timestamptz not null,               -- cuándo se escribió esa versión
  op text not null check (op in ('UPDATE', 'DELETE')),
  cambiado_en timestamptz not null default now(), -- cuándo dejó de ser la buena
  cambiado_por uuid default auth.uid()
);
comment on table public.gym_docs_historial is 'App de gimnasio Juan vs Ignacio (no es de Senda). Versiones anteriores de gym_docs: la escribe solo el disparador gym_docs_historial.';
create index gym_docs_historial_doc_idx on public.gym_docs_historial (collection, id, cambiado_en desc);

alter table public.gym_docs_historial enable row level security;
revoke all on public.gym_docs_historial from anon, authenticated;
grant select on public.gym_docs_historial to authenticated;
create policy "gym: los dos leen el historial" on public.gym_docs_historial
  for select to authenticated
  using (exists (select 1 from public.gym_usuarios u where u.user_id = (select auth.uid())));

-- Un entreno guiado se sube serie a serie (enCurso): esas versiones intermedias, seguidas y de hace menos de
-- 30 minutos, no se guardan (serían decenas por entreno). Todo lo demás sí: cualquier borrado, cualquier
-- cambio de un documento terminado y cualquier entreno a medias pisado más tarde.
create or replace function public.gym_docs_guardar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
       old.data = new.data
    or (old.data->>'enCurso' = 'true' and new.data->>'enCurso' = 'true' and old.updated_at > now() - interval '30 minutes')
  ) then
    return new;
  end if;
  insert into public.gym_docs_historial (collection, id, athlete, data, updated_at, op)
  values (old.collection, old.id, old.athlete, old.data, old.updated_at, tg_op);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
comment on function public.gym_docs_guardar_historial() is 'App de gimnasio: guarda en gym_docs_historial la versión anterior de cada documento cambiado o borrado.';
revoke all on function public.gym_docs_guardar_historial() from public, anon, authenticated;

create trigger gym_docs_historial
  after update or delete on public.gym_docs
  for each row execute function public.gym_docs_guardar_historial();
