# Repositorio de Juan Torres Candau

Dos apps web personales, cada una en su carpeta, que comparten el proyecto de Supabase `senda-memoria`
(id `eqwhiguptakmuuihpjpu`, plan Pro). Ese proyecto es también el de Senda (la empresa): **solo se tocan las
tablas, funciones y Edge Functions con el prefijo de cada app** (`gym_*`, `cuentas_*`).

| Carpeta | App | Web | Guía |
|---|---|---|---|
| `gym-app/` | Juan vs Ignacio (gimnasio) | https://juatorcan1.github.io/juan-torres-candau/ | `gym-app/CLAUDE.md` |
| `cuentas-app/` | Las cuentas de Juan | https://juatorcan1.github.io/juan-torres-candau/cuentas/ | `cuentas-app/README.md` |

## Cómo se trabaja

1. Cada cambio en una rama `claude/...` y un pull request en borrador contra `main`. Nunca directo a `main`.
2. Antes de subir: `<app>/build.sh` y `<app>/build-web.sh`, y que el JavaScript se lea sin errores. Si el cambio
   toca cómo se guardan los entrenos, `node gym-app/pruebas/guardado.mjs` tiene que salir «todo bien»; si toca
   cómo se guardan las cuentas, `node cuentas-app/pruebas/guardado.mjs`.
3. Revisión: el agente `revisor-datos` (`.claude/agents/`) revisa el diff antes de pedir la fusión, y el workflow
   «Comprobaciones» corre en cada pull request y antes de publicar (incluida la prueba del guardado).
4. Al fusionar en `main`, `.github/workflows/gym-web.yml` construye las dos webs y las publica en `gh-pages`.
5. Cambios en la base de datos: siempre como fichero en `<app>/supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`
   en el mismo pull request, y se aplican en Supabase (MCP `apply_migration`) solo cuando Juan da el visto bueno.
   Lo que está en Supabase y no en el repo es deuda: se trae al repo.
6. Commits, pull requests, textos de la app y comentarios para Juan: en español. Comentarios del código, como
   el código que los rodea.

## Reglas que no se saltan

- **Los datos de Juan e Ignacio no se pierden.** Nada de borrar o sobrescribir documentos en Supabase sin que
  Juan lo pida; antes de arreglar datos, se enseña qué se va a cambiar. Los datos de Ignacio solo los cambia
  Ignacio (o Juan con su permiso explícito).
- **El repositorio es público** (GitHub Pages): ni datos personales (pesos, entrenos, comidas, chats), ni
  claves secretas. La clave publicable de Supabase sí puede estar (`src/web/supabase-publishable-key.txt`).
- La clave de Anthropic vive en los secretos de las Edge Functions o en el Vault, nunca en el código.

## Correos que Claude manda en nombre de Juan

Misma norma que en `senda-cerebro` (`criterios/correos-con-la-firma-de-juan.md`, repositorio privado; aquí solo
va el resumen, porque este repositorio es público). Vale para cualquier correo, sea del tema que sea (drones,
proveedores, abogado, etc.):

- Salen siempre del Outlook de empresa (`juantorrescandau@sendacc.com`) con su firma entera: tarjeta de Senda,
  los tres sellos de AENOR y los cuatro avisos. El Gmail personal solo si Juan lo dice para ese correo.
- Pasos: 1) Juan pide el correo y Claude lo escribe en la conversación; 2) lo repasan juntos; 3) cuando Juan dice
  «envíalo», Claude lo apunta en la bandeja de salida de Senda 360; 4) el vigía del correo lo envía desde el Outlook
  de Juan y le pone la firma (si no hay firma, no lo envía); 5) Claude comprueba que ha salido y se lo dice.
- Nunca se envía ni se deja en borradores con la conexión de Outlook de Claude (no lleva imágenes, saldría sin
  tarjeta ni sellos), ni se copia la firma a mano en el cuerpo. Esa conexión solo sirve para leer.
- El texto acaba con la despedida de Juan («Muchas gracias X, un saludo y buena semana.») y no lleva firma.
- Si el correo lleva un papel, se sube al Drive y se pone el enlace: la bandeja no adjunta.
- Sin el «envíalo» de Juan no se escribe nada en la bandeja. Nada de nombres de clientes, abogados o importes
  en este repositorio.

## Agentes de Claude Code (`.claude/agents/`)

- `guardian-gym`: revisa que los datos del gimnasio estén bien guardados (sesiones a medias, días sin apuntar,
  duplicados, números raros, historial, uso de Claude) y da un informe. Solo lee, salvo la copia semanal. Corre
  solo los lunes a las 7:53 (tarea programada «Guardián del gimnasio (lunes)»).
- `guardian-cuentas`: lo mismo para «Las cuentas de Juan» (copias, historial, movimientos rotos o repetidos, tickets
  sin Drive, cuentas que no existen). Solo lee. Corre solo los lunes a las 7:47 (tarea programada «Guardián de las
  cuentas (lunes)»).
- `revisor-datos`: revisa un diff buscando formas de perder o pisar datos antes de fusionar.
