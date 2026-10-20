alter table public.gym_docs drop constraint gym_docs_collection_check;
alter table public.gym_docs add constraint gym_docs_collection_check check (collection = any (array['sesiones','pesajes','bebidas','perfiles','planes','chats','entrenos','comidas']));
