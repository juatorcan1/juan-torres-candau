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

-- Lo que decides para cada número: quién es, qué hacer cuando llame (ia, pasar, preguntar) y cómo
-- tratarle. Se edita desde el panel (/panel).
create table if not exists telefonista_contactos (
  empresa       text not null,
  telefono      text not null,               -- sólo cifras
  nombre        text not null default '',
  accion        text not null check (accion in ('ia', 'pasar', 'preguntar')),
  instrucciones text not null default '',
  actualizado   timestamptz not null default now(),
  primary key (empresa, telefono)
);
alter table telefonista_contactos enable row level security;
