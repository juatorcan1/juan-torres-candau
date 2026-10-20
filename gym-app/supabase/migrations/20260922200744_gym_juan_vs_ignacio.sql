-- App de gimnasio "Juan vs Ignacio". Aparte de Senda: solo tablas gym_*.
create table public.gym_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete text not null unique check (athlete in ('juan', 'ignacio')),
  nombre text not null,
  created_at timestamptz not null default now()
);
comment on table public.gym_usuarios is 'App de gimnasio Juan vs Ignacio (no es de Senda). Qué usuario de Supabase Auth es Juan y cuál es Ignacio.';

create table public.gym_docs (
  collection text not null check (collection in ('sesiones', 'pesajes', 'bebidas', 'perfiles')),
  id text not null check (id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  athlete text not null check (athlete in ('juan', 'ignacio')),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  updated_at timestamptz not null default now(),
  primary key (collection, id),
  check (collection <> 'perfiles' or id = athlete),
  check (collection = 'perfiles' or data->>'athlete' = athlete)
);
comment on table public.gym_docs is 'App de gimnasio Juan vs Ignacio (no es de Senda). Entrenos, pesajes, copas y perfiles como documentos JSON; cada uno solo escribe los suyos.';
alter table public.gym_docs replica identity full;

create table public.gym_claude_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  n integer not null default 0,
  primary key (user_id, dia)
);
comment on table public.gym_claude_uso is 'App de gimnasio: llamadas a Claude por usuario y día, para poner tope al gasto. Solo la escribe la Edge Function gym-claude (service_role).';

alter table public.gym_usuarios enable row level security;
alter table public.gym_docs enable row level security;
alter table public.gym_claude_uso enable row level security;

revoke all on public.gym_usuarios, public.gym_docs, public.gym_claude_uso from anon;
revoke all on public.gym_claude_uso from authenticated;

create policy "gym: veo mi usuario" on public.gym_usuarios
  for select to authenticated using (user_id = (select auth.uid()));

create policy "gym: los dos leen todo" on public.gym_docs
  for select to authenticated
  using (exists (select 1 from public.gym_usuarios u where u.user_id = (select auth.uid())));
create policy "gym: apunto lo mío" on public.gym_docs
  for insert to authenticated
  with check (athlete = (select u.athlete from public.gym_usuarios u where u.user_id = (select auth.uid())));
create policy "gym: cambio lo mío" on public.gym_docs
  for update to authenticated
  using (athlete = (select u.athlete from public.gym_usuarios u where u.user_id = (select auth.uid())))
  with check (athlete = (select u.athlete from public.gym_usuarios u where u.user_id = (select auth.uid())));
create policy "gym: borro lo mío" on public.gym_docs
  for delete to authenticated
  using (athlete = (select u.athlete from public.gym_usuarios u where u.user_id = (select auth.uid())));

alter publication supabase_realtime add table public.gym_docs;
