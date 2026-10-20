-- App de cuentas personales "Las cuentas de Juan". Aparte de Senda y del gimnasio: solo tablas cuentas_*.
create table public.cuentas_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);
comment on table public.cuentas_usuarios is 'Cuentas personales de Juan (no es de Senda). Qué usuarios de Supabase Auth pueden entrar.';

create table public.cuentas_docs (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null check (collection in ('movs', 'config', 'anios')),
  id text not null check (id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 1048576),
  updated_at timestamptz not null default now(),
  primary key (owner, collection, id)
);
comment on table public.cuentas_docs is 'Cuentas personales de Juan (no es de Senda): movimientos por mes, cuentas, categorías y cada ejercicio, como documentos JSON. Cada uno solo ve lo suyo.';
alter table public.cuentas_docs replica identity full;

create table public.cuentas_claude_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  n integer not null default 0,
  primary key (user_id, dia)
);
comment on table public.cuentas_claude_uso is 'Cuentas personales: llamadas a Claude por usuario y día, para poner tope al gasto. Solo la escribe la Edge Function cuentas-claude (service_role).';

alter table public.cuentas_usuarios enable row level security;
alter table public.cuentas_docs enable row level security;
alter table public.cuentas_claude_uso enable row level security;
revoke all on public.cuentas_usuarios, public.cuentas_docs, public.cuentas_claude_uso from anon;
revoke all on public.cuentas_claude_uso from authenticated;

create policy "cuentas: veo mi usuario" on public.cuentas_usuarios
  for select to authenticated using (user_id = (select auth.uid()));

create policy "cuentas: solo lo mío" on public.cuentas_docs
  for all to authenticated
  using (owner = (select auth.uid()) and exists (select 1 from public.cuentas_usuarios u where u.user_id = (select auth.uid())))
  with check (owner = (select auth.uid()) and exists (select 1 from public.cuentas_usuarios u where u.user_id = (select auth.uid())));

alter publication supabase_realtime add table public.cuentas_docs;

-- Fotos de los tickets: carpeta privada, cada uno en su subcarpeta (<user_id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cuentas-tickets', 'cuentas-tickets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "cuentas: veo mis tickets" on storage.objects for select to authenticated
  using (bucket_id = 'cuentas-tickets' and (storage.foldername(name))[1] = (select auth.uid())::text
         and exists (select 1 from public.cuentas_usuarios u where u.user_id = (select auth.uid())));
create policy "cuentas: subo mis tickets" on storage.objects for insert to authenticated
  with check (bucket_id = 'cuentas-tickets' and (storage.foldername(name))[1] = (select auth.uid())::text
              and exists (select 1 from public.cuentas_usuarios u where u.user_id = (select auth.uid())));
create policy "cuentas: borro mis tickets" on storage.objects for delete to authenticated
  using (bucket_id = 'cuentas-tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Juan entra con su mismo usuario del gimnasio.
insert into public.cuentas_usuarios (user_id, nombre)
select user_id, 'Juan' from public.gym_usuarios where athlete = 'juan'
on conflict do nothing;
