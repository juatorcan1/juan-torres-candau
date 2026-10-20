-- App de gimnasio: el disparador que llena gym_docs_historial (ver la migración gym_docs_historial).
create trigger gym_docs_historial
  after update or delete on public.gym_docs
  for each row execute function public.gym_docs_guardar_historial();
