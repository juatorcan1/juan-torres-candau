-- App de gimnasio: copia de todo gym_docs tal y como estaba el 20/10/2026, antes de aplicar el historial.
create table public.gym_docs_copia_20261020 as select * from public.gym_docs;
comment on table public.gym_docs_copia_20261020 is 'App de gimnasio Juan vs Ignacio (no es de Senda). Copia de seguridad de gym_docs del 20/10/2026, antes de gym_docs_historial. No borrar.';
alter table public.gym_docs_copia_20261020 enable row level security;
revoke all on public.gym_docs_copia_20261020 from anon, authenticated;
