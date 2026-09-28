-- Lo que apunta la telefonista: clientes interesados, recados, incidencias, citas pedidas y el resumen
-- de cada llamada. Sólo escribe y lee el servidor (con la clave service_role); nadie más tiene acceso.
create table if not exists telefonista_registros (
  id        bigint generated always as identity primary key,
  creado    timestamptz not null default now(),
  empresa   text not null,            -- carpeta de empresas/
  llamada   text not null,            -- CallSid de Twilio
  tipo      text not null check (tipo in ('cliente', 'recado', 'incidencia', 'cita', 'llamada')),
  telefono  text not null default '', -- sólo cifras
  datos     jsonb not null,
  atendido  boolean not null default false -- para que el equipo marque lo ya resuelto
);
create index if not exists telefonista_registros_busqueda on telefonista_registros (empresa, telefono, tipo, creado desc);
create index if not exists telefonista_registros_pendientes on telefonista_registros (empresa, creado desc) where not atendido;

alter table telefonista_registros enable row level security;
-- Sin políticas: con RLS activado, las claves públicas (anon/authenticated) no ven ni tocan nada.
