-- El entreno de Juan: el plan de entreno guarda cada día con su entreno guiado y crece unos 40 kB por semana.
-- Con el tope de 256 kB no caben más de 9 semanas; se sube a 1 MB para poder seguir el plan semana a semana.
alter table public.entreno_docs drop constraint entreno_docs_data_check;
alter table public.entreno_docs add constraint entreno_docs_data_check
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 1048576);
