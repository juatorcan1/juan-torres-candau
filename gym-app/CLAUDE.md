# gym-app: Juan vs Ignacio

Qué hace la app: `README.md`. Aquí, lo que hace falta para tocarla sin perder datos.

## Piezas

- `src/*.js` se concatenan por orden de nombre dentro de un solo `<script>` (sin módulos: todo comparte ámbito).
  `build.sh` → `index.html` (Artifact de Claude); `build-web.sh` → `web/index.html` (la web que se usa, con
  `src/web/08-web.js` para el login y Supabase). `web/` no se sube: lo genera el workflow al publicar.
- El código habla con `window.claude.use("db" | "sample")`, como en un Artifact. En la web, `08-web.js` lo
  implementa sobre Supabase: `db` es la tabla `gym_docs` y `sample` la Edge Function `gym-claude`.
- Base de datos: `supabase/migrations/` (traídas de Supabase tal y como se aplicaron). Edge Functions:
  `supabase/functions/gym-claude` (la que usan los agentes). En Supabase hay además `gym-ping`, desactivada
  (devuelve 404), que se puede borrar.

## Datos (`gym_docs`)

Una fila por documento: `collection`, `id`, `athlete` (`juan` | `ignacio`), `data` (JSON), `updated_at`.
Row Level Security: los dos leen todo; cada uno solo escribe lo suyo.

| collection | id | qué es |
|---|---|---|
| `sesiones` | uuid, `run-<atleta>-<ms>` (entreno guiado), `copia-<id>` | un entreno: `date`, `sport`, `minutes`, `exercises[{name, sets[{kg, reps}]}]`, `guia` (el entreno del agente), `enCurso: true` mientras está a medias |
| `pesajes` | `<atleta>_<fecha>` | peso, cintura, grasa |
| `bebidas` | `<atleta>_<fecha>` | copas del día |
| `perfiles` | `<atleta>` | datos, preferencias, agarres, notas, series extra |
| `planes` | `<atleta>_entreno`, `<atleta>_dieta` | el plan del Entrenador (semanas con días y entreno) y del Dietista |
| `chats` | `<atleta>_coach`, `<atleta>_nutri` | los últimos 30 mensajes con cada agente |
| `comidas` | `<atleta>_<fecha>` | lo comido |

`gym_docs_historial` (migración `20261020090000`): cada versión anterior de un documento cambiado o borrado.

## Cómo se guarda un entreno guiado (`src/11-player.js`)

1. El entreno vive en el móvil (`localStorage["gym.run"]`) y se sube **serie a serie** (`syncRun`) como
   `sesiones/run-<atleta>-<inicio>` con `enCurso: true`.
2. Si no hay conexión, `run.unsynced` queda marcado y se reintenta al volver la conexión, al volver a la app y
   cada 30 s (`retrySync`). Se avisa una vez al quedarse sin conexión y otra al subirlo.
3. «Guardar entreno» escribe la versión final (sin `enCurso`) en el mismo id.
4. Nunca se tira un entreno con series apuntadas: empezar otro lo guarda antes tal cual (`parkRun`), y uno
   olvidado hace más de 6 h se guarda solo al abrir la app (`parkOldRun`) en vez de quedarse días en el móvil.
5. Los minutos acaban en la última serie si se dejó abierto más de 20 min (`idleEnd`), no al guardar.
6. Una sesión a medias se continúa desde el plan o Hoy (`src/21-continuar.js`) con el mismo id.

Si cambias algo de esto: `./build.sh && node pruebas/guardado.mjs` (Chromium, base de datos de mentira, sin red).

## Revisar los datos (MCP de Supabase, proyecto `eqwhiguptakmuuihpjpu`)

```sql
-- últimas sesiones de los dos
select id, athlete, data->>'date' fecha, data->>'sport' deporte, data->>'enCurso' a_medias,
       jsonb_array_length(coalesce(data->'exercises','[]')) ejercicios, data->>'minutes' minutos, updated_at
from gym_docs where collection = 'sesiones' order by data->>'date' desc, athlete limit 30;
```

¿Se intentó guardar algo un día? Los logs de la API (`query_logs`, ventanas de 24 h, fuente `edge_logs`)
guardan cada GET/POST/DELETE a `/rest/v1/gym_docs` con el navegador: Android es Juan, iPhone es Ignacio.

Recuperar una versión anterior (solo con el visto bueno de quien sea el dueño del dato):

```sql
select hid, op, cambiado_en, data from gym_docs_historial
where collection = 'sesiones' and id = '<id>' order by cambiado_en desc;
-- y se vuelve a escribir esa data en gym_docs con un upsert
```

Copias: Supabase Pro hace una copia diaria de toda la base de datos (7 días); el historial guarda cada versión;
y el botón «Copia» de la cabecera descarga todo en un JSON.
