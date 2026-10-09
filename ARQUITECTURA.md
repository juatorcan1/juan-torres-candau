# Arquitectura

Este repositorio guarda dos aplicaciones personales de Juan que comparten la misma manera de hacerse:
**Juan vs Ignacio** (`gym-app/`, el gimnasio) y **Las cuentas de Juan** (`cuentas-app/`). Las dos son
páginas web de un solo fichero, sin framework ni empaquetador, con los datos en Supabase y la IA
(Claude) detrás de una Edge Function. Este documento explica cómo encajan las piezas; el detalle de lo que
hace cada app está en su `README.md`.

## De un vistazo

```
                 ┌──────────────── repositorio (rama main) ────────────────┐
                 │  gym-app/src/        cuentas-app/src/                    │
                 │  build.sh            build.sh        → index.html        │  Artifact de Claude
                 │  build-web.sh        build-web.sh    → web/index.html    │  (no se versiona web/)
                 └───────────────────────────┬─────────────────────────────┘
                                             │ push a main
                                             ▼
                        .github/workflows/gym-web.yml  (GitHub Actions)
                                             │ construye las dos y sube la rama gh-pages
                                             ▼
        GitHub Pages  ──  https://juatorcan1.github.io/juan-torres-candau/          (gimnasio)
                          https://juatorcan1.github.io/juan-torres-candau/cuentas/  (cuentas)
                                             │
                 navegador (móvil) ──────────┤  supabase-js  +  fetch a las Edge Functions
                                             ▼
                 Supabase, proyecto senda-memoria  (eqwhiguptakmuuihpjpu.supabase.co)
                 ├─ Auth (correo + contraseña; "juan" → juan@gym.example.com)
                 ├─ Postgres con Row Level Security
                 │    gym_usuarios, gym_docs, gym_claude_uso
                 │    cuentas_usuarios, cuentas_docs, cuentas_claude_uso
                 ├─ Storage: carpeta privada cuentas-tickets
                 └─ Edge Functions (Deno)
                      gym-claude ─────────┐
                      cuentas-claude ─────┼─→ API de Anthropic (clave en secretos o Vault)
                      cuentas-drive ──────────→ Google Drive (OAuth de Juan, carpeta «01 Tickets»)
                      cuentas-tricount ───────→ api.tricount.bunq.com (no oficial, solo lectura)
```

## Una misma app, dos salidas

Cada app tiene su código en `src/` y dos scripts que lo juntan en un único HTML:

| Script | Salida | Para qué |
|---|---|---|
| `build.sh` | `index.html` (versionado) | El **Artifact de Claude**. Fragmento HTML sin `<html>` ni `<head>`: el visor de Artifacts lo envuelve y le da `window.claude` (base de datos, `sample`, `assets`). |
| `build-web.sh` | `web/index.html` (ignorado por git) | La **web independiente** en GitHub Pages. Documento completo, carga `supabase-js` desde jsDelivr, mete la URL y la clave publicable de Supabase en `window.GYM_WEB` / `window.CJ_WEB` y añade el módulo `src/web/`. |

Los dos scripts hacen lo mismo: pegan `style.css`, `body.html` y los módulos `src/NN-*.js` por orden
numérico dentro de una única IIFE en modo estricto. No hay `import`/`export`: cada módulo deja sus
funciones y variables en el ámbito compartido de esa función, y el orden de los ficheros es el orden de
dependencia. `99-boot.js` siempre va el último porque es el que arranca.

La única diferencia entre las dos salidas es `src/web/`: en la web, ese módulo se inserta justo antes de
`99-boot.js`, y en el Artifact no existe. La app sabe en cuál está mirando si existe la configuración
global (`WEB = !!window.GYM_WEB` en el gimnasio) y ajusta los textos y botones (entrar/salir, cambiar
contraseña) según el caso.

## El contrato `window.claude.use(...)`

Es el punto clave del diseño. El código compartido de `src/` nunca habla con Supabase ni con Anthropic:
pide sus piezas con `window.claude.use("db")`, `use("sample")`, `use("assets")`, etc., con la misma
interfaz que ofrece el visor de Artifacts de Claude.

- **Dentro del Artifact**, `window.claude` lo pone el visor: la base de datos es la del artifact y
  `sample` llama a Claude a través de él.
- **En la web**, `src/web/08-web.js` (gimnasio) y `src/web/09-web.js` (cuentas) construyen un
  `window.claude` propio que no se resuelve hasta que el usuario entra, y detrás de cada pieza hay Supabase:

| Pieza | Gimnasio (web) | Cuentas (web) |
|---|---|---|
| `db` | tabla `gym_docs` | tabla `cuentas_docs` |
| `sample` | Edge Function `gym-claude` | Edge Function `cuentas-claude` (admite hasta 4 imágenes) |
| `assets` | — | carpeta privada `cuentas-tickets` de Storage |
| `tricount` | — | Edge Function `cuentas-tricount` |
| `drive` | — | Edge Function `cuentas-drive` |

Así, cualquier función de `src/` funciona igual en los dos sitios, y lo que es propio de la web (login,
contraseña, conexión) queda aislado en un solo fichero por app.

### Cómo funciona `db` en la web

Las dos apps usan el mismo patrón, una base de documentos sobre una tabla relacional:

- Una sola tabla por app (`gym_docs`, `cuentas_docs`) con columnas `collection`, `id`, `data` (JSON),
  `updated_at` y la de propiedad (`athlete` en el gimnasio, `owner` en las cuentas).
- El puente mantiene una caché en memoria por colección, carga cada colección la primera vez que alguien se
  suscribe (`onSnapshot`) y escribe con `upsert`.
- Se suscribe al canal `postgres_changes` de Supabase Realtime: cuando otro dispositivo cambia una fila,
  recarga esa colección y avisa a los suscriptores. Además refresca al volver a la pestaña y, en el
  gimnasio, cada minuto.
- En `cuentas_docs` el puente también implementa `update(patch)` con la misma semántica de mezcla que el
  `update` de Claude (objetos se mezclan, `null` borra la clave).

La seguridad está en la base de datos, no en el cliente. Las políticas de Row Level Security dicen:

- Gimnasio: los dos atletas leen todo, y cada uno escribe solo las filas de su `athlete`.
- Cuentas: cada usuario ve y toca solo lo suyo (`owner = auth.uid()`).

La clave que va en la web es la **publicable** (`gym-app/src/web/supabase-publishable-key.txt`, la misma
para las dos webs); con ella no se puede hacer nada que el RLS no permita.

### Modelo de datos

**Gimnasio** (`gym_docs`, colecciones): `sesiones`, `pesajes`, `bebidas`, `comidas` (una fila por
apunte, con `athlete` y `date`), `perfiles` y `planes` (una fila por atleta, `id` = atleta) y `chats`.

**Cuentas** (`cuentas_docs`, colecciones y claves):

| Colección | Id | Contenido |
|---|---|---|
| `movs` | `AAAA-MM` | todos los movimientos de un mes |
| `config` | `cuentas`, `categorias`, `prefs`, `tricount` | cuentas bancarias y deudas, árbol de categorías, preferencias, enlaces y estado de Tricount |
| `anios` | `AAAA` | fijos, presupuesto y objetivos del ejercicio |
| `tricount` | `sesion`, `datos-<clave>` | sesión del aparato anónimo de Tricount y la última copia leída de cada tricount |

La colección `tricount` la admite la migración de `cuentas-app/supabase/migrations/`, que amplía la
restricción `check` de la columna `collection`. Las fotos de los tickets no van en la tabla: van a Storage
(`cuentas-tickets/<user_id>/<id>.jpg`) y el movimiento guarda el id.

## Edge Functions

Viven en `<app>/supabase/functions/<nombre>/index.ts`, corren en Deno dentro de Supabase y las cuatro
siguen la misma plantilla:

1. Responder al `OPTIONS` de CORS y aceptar solo `POST`.
2. Crear un cliente de Supabase con la `service_role` y validar el `Bearer` del usuario con
   `auth.getUser`. Si no hay sesión, `401`.
3. Comprobar que el usuario está en la tabla de socios de esa app (`gym_usuarios` o `cuentas_usuarios`).
   Si no, `403`. Las funciones del gimnasio y de las cuentas no se cruzan.
4. Hacer el trabajo y devolver JSON con `{ code, error }` en los fallos, códigos que el cliente traduce
   a mensajes (`session_expired`, `rate_limited`, `no_key`, `prompt_too_large`, `upstream_error`...).

| Función | Qué hace | Secretos que necesita |
|---|---|---|
| `gym-claude` | Manda el prompt a Claude. Tope de 80 llamadas por persona y día, contadas en `gym_claude_uso`. | `ANTHROPIC_API_KEY`, o el secreto `gym_anthropic_api_key` del Vault vía la función SQL `gym_anthropic_key` (solo `service_role`) |
| `cuentas-claude` | Igual, con hasta 4 imágenes en base64 (tickets, extractos). Tope de 150 al día en `cuentas_claude_uso`. | La misma clave de Anthropic que el gimnasio |
| `cuentas-drive` | Archiva cada ticket como PDF en Drive con la nomenclatura de Senda (`AAAAMMDD_PROVEEDOR_IMPORTE€_NUMERO.pdf`) en `01 Tickets/<año>/<trimestre>`. El id de la carpeta está fijo en el código y antes de subir comprueba que sigue siendo `02 - JUAN / 04 - FACTURAS / 01 Tickets`. Renombra o mueve si se corrige el gasto. | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` |
| `cuentas-tricount` | Lee tricounts por la clave de su enlace con la API no oficial de bunq. Registra un aparato anónimo y guarda su sesión en `cuentas_docs`. Nunca se une a un tricount ni escribe. | Ninguno |

Las dos funciones de Claude usan el SDK oficial (`@anthropic-ai/sdk`) con el modelo `claude-opus-5` y los
fallbacks del lado del servidor. El cliente recibe `{ text, truncated }` y, cuando espera JSON, lo
extrae de forma tolerante (`parseLoose`: busca el bloque ```` ``` ```` o el primer `{`/`[`).

La IA se llama desde la Edge Function y no desde el navegador por tres razones: la clave de Anthropic no
puede ir en una web pública, el tope diario se controla en un sitio que el cliente no puede saltarse, y la
función ya sabe quién pide gracias al token de Supabase.

## Despliegue

- **Rama `main`**: el código. Nadie edita `web/`; está en `.gitignore` de cada app.
- **GitHub Actions** (`.github/workflows/gym-web.yml`): en cada push a `main` que toque `gym-app/**`,
  `cuentas-app/**` o el propio workflow, ejecuta los dos `build-web.sh`, copia la web de cuentas dentro de
  la del gimnasio en `cuentas/` y hace un `push -f` de esa carpeta a la rama `gh-pages` con `.nojekyll`.
  La rama `gh-pages` se reescribe entera cada vez, por eso las dos webs se construyen siempre juntas.
- **GitHub Pages** publica `gh-pages`. La de cuentas lleva además `manifest.json` e iconos para
  instalarse como app en el móvil.
- **Supabase**: las Edge Functions y las migraciones se despliegan por separado, con la CLI de Supabase o
  desde el panel; el workflow no las toca.
- **Artifact**: `build.sh` genera `index.html`, que se publica a mano como Artifact de Claude. Guarda sus
  datos en la base del artifact, separados de los de la web.

## Dentro de `src/`: cómo está organizado el código

Las dos apps siguen el mismo esquema de capas, en el orden en que se concatenan:

1. **Núcleo** (`01-core.js`): utilidades (`$`, `esc`, `fmt`, fechas), `store` sobre `localStorage`
   para preferencias de dispositivo, constantes del dominio y el estado global (`db`, `sample`, listas de
   datos ya cargados).
2. **Dominio y cálculo**: en el gimnasio, dibujos de ejercicios (`02-figuras.js`), mapa de músculos
   (`02b-musculos.js`), dieta (`03-dieta.js`); en las cuentas, gráficos (`02-graficos.js`).
3. **Pantallas**: una función `renderX()` por vista que pinta su `<section>` con plantillas de cadena
   (`innerHTML`) y escapa siempre con `esc`. Cada pantalla es un módulo: `12-hoy.js`, `06-dinero.js`,
   `08-medias.js`...
4. **Integraciones puntuales**: cámara propia (`04-camara.js`), extracto bancario (`05-extracto.js`),
   agentes de Claude (`10-agentes.js`), reproductor de entreno guiado (`11-player.js`).
5. **Arranque** (`99-boot.js`): navegación por pestañas (botones con `data-top`/`data-leaf` o `data-tab`,
   la pestaña recordada en `localStorage`), delegación global de eventos sobre `document` y el bloque que
   pide `window.claude.use(...)`, se suscribe a cada colección y vuelve a pintar cuando llegan datos.

Convenciones que se repiten en todo el código:

- **Sin dependencias de build**: JavaScript moderno sin transpilar, CSS con variables para el tema claro
  y oscuro, tipografías de Google Fonts.
- **Renderizado completo por vista**: ante un cambio de datos se vuelve a pintar la vista entera, salvo
  que el usuario esté escribiendo en un campo (`typing()`); entonces se marca como pendiente y se pinta al
  soltar el foco.
- **Estados explícitos** para las piezas asíncronas: `dbState` y `sampleState` valen `loading`, `ready` o
  `none`, y las pantallas muestran avisos o deshabilitan botones según eso.
- **Lo local se queda local**: borradores, pestaña activa, última persona que entró y la cuenta a medio
  dividir van a `localStorage`; lo que importa va a `db`.
- **Prompts como texto**: cada función de IA construye su prompt en el cliente, pide JSON y lo valida
  antes de usarlo.

## Qué comparten las dos apps

- El proyecto de Supabase (`senda-memoria`), el usuario `juan` y su contraseña, la clave publicable y la
  clave de Anthropic.
- El workflow de publicación y la rama `gh-pages`.
- El patrón de código (`src/` + `build.sh` + `build-web.sh` + `src/web/`) y la plantilla de las Edge
  Functions.

Y lo que no comparten, a propósito: tablas, políticas RLS, contadores de uso de IA y funciones, para que un
fallo o un cambio en una no toque a la otra. Ninguna de las dos lee ni escribe las tablas ni las carpetas
de Senda.

## Dónde tocar según lo que se quiera hacer

| Quiero... | Toco |
|---|---|
| Cambiar una pantalla o un cálculo | el módulo `src/NN-*.js` de esa pantalla; se nota en el Artifact y en la web |
| Cambiar el login, la conexión o cómo se guardan los datos en la web | `src/web/08-web.js` o `src/web/09-web.js` |
| Cambiar qué se le pide a la IA | el prompt en el módulo del cliente; la Edge Function solo reenvía |
| Cambiar límites, modelo o claves de la IA | `supabase/functions/*-claude/index.ts` y los secretos de Supabase |
| Añadir una colección a `cuentas_docs` | una migración en `cuentas-app/supabase/migrations/` que amplíe el `check` |
| Cambiar cómo se publica | `.github/workflows/gym-web.yml` y los `build-web.sh` |
| Añadir una tercera app | copiar el esquema (`src/`, los dos scripts, `src/web/`), añadirla al workflow y darle sus propias tablas y funciones |
