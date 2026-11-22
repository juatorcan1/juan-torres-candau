-- El entreno de Juan: se trae todo lo de Juan de «Juan vs Ignacio» (gym_docs y su historial), tal cual.
-- Solo copia: en gym_docs no se cambia ni se borra nada. Si se vuelve a ejecutar, no repite ni pisa nada.
insert into public.entreno_usuarios (user_id, athlete, nombre)
select user_id, 'juan', 'Juan' from public.gym_usuarios where athlete = 'juan'
on conflict (user_id) do nothing;

insert into public.entreno_docs (collection, id, owner, athlete, data, updated_at)
select d.collection, d.id, u.user_id, 'juan', d.data, d.updated_at
from public.gym_docs d
cross join (select user_id from public.gym_usuarios where athlete = 'juan') u
where d.athlete = 'juan'
on conflict (collection, id) do nothing;

-- Las versiones anteriores también, para poder recuperarlas desde la app nueva.
insert into public.entreno_docs_historial (collection, id, owner, athlete, data, updated_at, op, cambiado_en, cambiado_por)
select h.collection, h.id, u.user_id, 'juan', h.data, h.updated_at, h.op, h.cambiado_en, h.cambiado_por
from public.gym_docs_historial h
cross join (select user_id from public.gym_usuarios where athlete = 'juan') u
where h.athlete = 'juan'
  and not exists (select 1 from public.entreno_docs_historial e
                  where e.collection = h.collection and e.id = h.id and e.cambiado_en = h.cambiado_en);
