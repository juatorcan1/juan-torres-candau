-- App «El entreno de Juan»: el gimnasio de Juan, solo suyo. Aparte de Senda y aparte de «Juan vs Ignacio»:
-- solo tablas y funciones entreno_*. Nadie más que el usuario de entreno_usuarios lee ni escribe nada.
create table public.entreno_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete text not null unique check (athlete = 'juan'),
  nombre text not null,
  created_at timestamptz not null default now()
);
comment on table public.entreno_usuarios is 'El entreno de Juan (no es de Senda): el único usuario de Supabase Auth que entra en la app.';

create table public.entreno_docs (
  collection text not null check (collection = any (array['sesiones','pesajes','bebidas','perfiles','planes','chats','entrenos','comidas'])),
  id text not null check (id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  athlete text not null default 'juan' check (athlete = 'juan'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  updated_at timestamptz not null default now(),
  primary key (collection, id),
  check (collection <> 'perfiles' or id = athlete)
);
comment on table public.entreno_docs is 'El entreno de Juan (no es de Senda): entrenos, pesajes, copas, perfil, planes, chats y comidas como documentos JSON. Solo los ve y los cambia su dueño.';
alter table public.entreno_docs replica identity full;

create table public.entreno_claude_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  n integer not null default 0,
  primary key (user_id, dia)
);
comment on table public.entreno_claude_uso is 'El entreno de Juan: llamadas a Claude por día, para poner tope al gasto. Solo la escribe la Edge Function entreno-claude (service_role).';

alter table public.entreno_usuarios enable row level security;
alter table public.entreno_docs enable row level security;
alter table public.entreno_claude_uso enable row level security;

revoke all on public.entreno_usuarios, public.entreno_docs, public.entreno_claude_uso from anon;
revoke all on public.entreno_claude_uso from authenticated;

create policy "entreno: veo mi usuario" on public.entreno_usuarios
  for select to authenticated using (user_id = (select auth.uid()));
create policy "entreno: solo lo mío" on public.entreno_docs
  for all to authenticated
  using (owner = (select auth.uid()) and exists (select 1 from public.entreno_usuarios u where u.user_id = (select auth.uid())))
  with check (owner = (select auth.uid()) and exists (select 1 from public.entreno_usuarios u where u.user_id = (select auth.uid())));

alter publication supabase_realtime add table public.entreno_docs;

-- Historial: cada versión anterior de un documento cambiado o borrado (igual que gym_docs_historial).
create table public.entreno_docs_historial (
  hid bigint generated always as identity primary key,
  collection text not null,
  id text not null,
  owner uuid not null,
  athlete text not null,
  data jsonb not null,
  updated_at timestamptz not null,               -- cuándo se escribió esa versión
  op text not null check (op in ('UPDATE', 'DELETE')),
  cambiado_en timestamptz not null default now(), -- cuándo dejó de ser la buena
  cambiado_por uuid default auth.uid()
);
comment on table public.entreno_docs_historial is 'El entreno de Juan (no es de Senda). Versiones anteriores de entreno_docs: la escribe solo el disparador entreno_docs_historial.';
create index entreno_docs_historial_doc_idx on public.entreno_docs_historial (collection, id, cambiado_en desc);
alter table public.entreno_docs_historial enable row level security;
revoke all on public.entreno_docs_historial from anon, authenticated;
grant select on public.entreno_docs_historial to authenticated;
create policy "entreno: leo mi historial" on public.entreno_docs_historial
  for select to authenticated
  using (owner = (select auth.uid()) and exists (select 1 from public.entreno_usuarios u where u.user_id = (select auth.uid())));

create or replace function public.entreno_docs_series(d jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_array_elements(case when jsonb_typeof(d->'exercises') = 'array' then d->'exercises' else '[]'::jsonb end) e,
       jsonb_array_elements(case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end) s
$$;
comment on function public.entreno_docs_series(jsonb) is 'El entreno de Juan: cuántas series tiene una sesión de entreno_docs.';

-- Un entreno guiado a medias pisado por otro a medias con las mismas series o más no se guarda (serían decenas
-- por entreno); todo lo demás sí.
create or replace function public.entreno_docs_guardar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
       old.data = new.data
    or (old.data->>'enCurso' = 'true' and new.data->>'enCurso' = 'true'
        and public.entreno_docs_series(new.data) >= public.entreno_docs_series(old.data))
  ) then
    return new;
  end if;
  insert into public.entreno_docs_historial (collection, id, owner, athlete, data, updated_at, op)
  values (old.collection, old.id, old.owner, old.athlete, old.data, old.updated_at, tg_op);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
comment on function public.entreno_docs_guardar_historial() is 'El entreno de Juan: guarda en entreno_docs_historial la versión anterior de cada documento cambiado o borrado.';
revoke all on function public.entreno_docs_guardar_historial() from public, anon, authenticated;

create trigger entreno_docs_historial
  after update or delete on public.entreno_docs
  for each row execute function public.entreno_docs_guardar_historial();

-- Copia entera cada semana (select public.entreno_copia_semanal()). No se borra ninguna.
create table public.entreno_docs_copias (
  copia date not null,
  collection text not null,
  id text not null,
  owner uuid not null,
  athlete text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (copia, collection, id)
);
comment on table public.entreno_docs_copias is 'El entreno de Juan (no es de Senda). Copias semanales de entreno_docs; las escribe entreno_copia_semanal(). No borrar.';
alter table public.entreno_docs_copias enable row level security;
revoke all on public.entreno_docs_copias from anon, authenticated;

create or replace function public.entreno_copia_semanal()
returns integer
language sql
security definer
set search_path = ''
as $$
  with nuevas as (
    insert into public.entreno_docs_copias (copia, collection, id, owner, athlete, data, updated_at)
    select current_date, collection, id, owner, athlete, data, updated_at from public.entreno_docs
    on conflict (copia, collection, id) do update set data = excluded.data, owner = excluded.owner, athlete = excluded.athlete, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer from nuevas
$$;
comment on function public.entreno_copia_semanal() is 'El entreno de Juan: copia todo entreno_docs en entreno_docs_copias con la fecha de hoy y devuelve cuántos documentos copió.';
revoke all on function public.entreno_copia_semanal() from public, anon, authenticated;

-- La Edge Function entreno-claude lee la clave de Anthropic del Vault cuando no está en sus secretos
-- (el mismo secreto del Vault que ya existe). Solo service_role.
create or replace function public.entreno_anthropic_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gym_anthropic_api_key' limit 1
$$;
comment on function public.entreno_anthropic_key() is 'El entreno de Juan (no es de Senda): clave de Anthropic guardada en el Vault. Solo service_role.';
revoke all on function public.entreno_anthropic_key() from public, anon, authenticated;
grant execute on function public.entreno_anthropic_key() to service_role;
