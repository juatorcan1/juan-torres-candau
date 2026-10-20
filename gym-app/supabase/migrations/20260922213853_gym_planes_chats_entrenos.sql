-- App de gimnasio, fase 2: planes (entreno y dieta), chats con los agentes y entrenos generados.
alter table public.gym_docs drop constraint gym_docs_collection_check;
alter table public.gym_docs add constraint gym_docs_collection_check
  check (collection in ('sesiones', 'pesajes', 'bebidas', 'perfiles', 'planes', 'chats', 'entrenos'));
