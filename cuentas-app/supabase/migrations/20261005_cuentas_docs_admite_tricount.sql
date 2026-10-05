-- cuentas_docs admite también la colección «tricount» (la sesión de Tricount y la copia de cada tricount leído).
alter table public.cuentas_docs drop constraint cuentas_docs_collection_check;
alter table public.cuentas_docs add constraint cuentas_docs_collection_check check (collection = any (array['movs'::text, 'config'::text, 'anios'::text, 'tricount'::text]));
