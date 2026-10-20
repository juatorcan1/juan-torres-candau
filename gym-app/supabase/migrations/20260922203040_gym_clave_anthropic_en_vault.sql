-- App de gimnasio: la Edge Function gym-claude lee la clave de Anthropic del Vault
-- (secreto 'gym_anthropic_api_key') cuando no está en los secretos de la función.
-- Solo la puede ejecutar service_role (la función); nadie desde la web.
create or replace function public.gym_anthropic_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'gym_anthropic_api_key' limit 1
$$;
comment on function public.gym_anthropic_key() is 'App de gimnasio (no es de Senda): clave de Anthropic guardada en el Vault. Solo service_role.';
revoke all on function public.gym_anthropic_key() from public, anon, authenticated;
grant execute on function public.gym_anthropic_key() to service_role;
