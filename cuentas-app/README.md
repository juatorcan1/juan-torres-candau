# Las cuentas de Juan

Las cuentas personales de Juan, ejercicio a ejercicio: gastos e ingresos por categorías, bancos,
efectivo, depósitos, deudas, objetivos y la previsión año a año hasta 2040. Los tickets se leen con
una foto y la IA reparte cada importe en su categoría, como las facturas en Senda 360.

Abajo hay cinco botones, y uno redondo (＋) para apuntar:

- **El año**: lo que ha entrado, salido y ahorrado; mes a mes; cómo acabarás el año; hasta 2040.
- **Movimientos**: todo lo apuntado, por días, con filtros.
- **＋** (el redondo): foto del ticket (o factura en PDF), contárselo con palabras, a mano o el extracto del banco.
  Si del ticket sólo es tuya una parte, pon «Mi parte» en euros o, con el botón **%**, en tanto por ciento del total
  (con atajos para la mitad, un tercio y un cuarto; se recuerda cómo la pusiste la última vez). También puedes tocar
  cuál de los pagos fue el tuyo, si se pagó en varias veces. El gasto es tu parte, cada línea en proporción, y el
  ticket entero se archiva igual.
- **En qué se va**: gastos e ingresos por grupos y categorías, presupuesto y la curva del año. La caza va en su
  propio grupo (cartuchos, licencias, coto y monterías, armero, ropa y equipo, perros, viajes), y las bodas a las
  que vas también (regalo o sobre, traje y complementos, viaje y alojamiento, despedidas, peluquería).
- **Previsión**: cómo acabarás el año, la previsión de gastos y de ingresos por categorías, lo que viene
  los próximos seis meses, hasta 2040, y los fijos y el presupuesto de cada ejercicio.
- **A medias**: dividir la cuenta en el bar. Foto del ticket + dictar qué ha tomado cada uno → cuánto paga
  cada uno (lo compartido a partes iguales; el descuadre con el total y la propina, en proporción). Se puede
  mandar por WhatsApp y apuntar: tu parte es un gasto y lo de los demás va a «Lo que te deben».
  En la pestaña **Tricount** se ven tus tricounts (sólo leer): saldos, quién paga a quién para quedar en
  paz y los últimos movimientos, con tu parte de cada uno.
  **Pasar a mis cuentas** mete tu parte de cada gasto como gasto tuyo (la IA pone la categoría y deja sin
  marcar los préstamos y ajustes, y lo que ya tenías apuntado), contra la cuenta «Tricount: …» de Lo que te
  deben, que lleva el saldo que dice Tricount. Cada gasto entra una sola vez (id `tc-<id>`); lo que se queda
  fuera y lo ya pasado se recuerda en `config/tricount` (`fuera`, `pasados`).
- **Dinero**: cuentas, deudas, lo que te deben, objetivos, categorías y copia de seguridad.

**Lo que te deben** (Dinero → Cuentas): cada deudor es una cuenta de tipo `prestado` con saldo a tu favor.
Prestar es un traspaso de tu banco a su cuenta y que te devuelva es el traspaso al revés; «Darlo por perdido»
apunta lo que queda como gasto en «Dinero prestado que no vuelve». Lo que te deben no cuenta en «Dinero hoy»
ni en la previsión hasta que vuelve, pero sí en «lo tuyo de verdad». El saldo va en los dos sentidos: si una
persona paga algo por ti (p. ej. la cuenta del bar), queda en negativo y aparece como «Le debes».

## Dos versiones, mismo código

**Web con contraseña** (la que se usa): https://juatorcan1.github.io/juan-torres-candau/cuentas/
- Usuario y contraseña: los mismos del gimnasio (usuario `juan`). La contraseña se cambia desde la app y cambia en las dos.
- Datos en Supabase (proyecto `senda-memoria`), aparte de Senda y del gimnasio:
  - `cuentas_usuarios`: quién puede entrar (sólo Juan).
  - `cuentas_docs`: documentos JSON — `movs/<AAAA-MM>` (los movimientos de cada mes), `config/cuentas`,
    `config/categorias`, `config/prefs`, `anios/<AAAA>` (fijos, presupuesto y objetivos de cada ejercicio).
    Row Level Security: cada uno ve y toca sólo lo suyo (`owner = auth.uid()`).
  - Carpeta privada `cuentas-tickets` para las fotos de los tickets (`<user_id>/<id>.jpg`).
  - `cuentas_claude_uso`: llamadas a la IA por día (tope de 150).
  - `cuentas_claude_gasto`: lo que gasta cada llamada a la IA (tokens y dólares), para saber cuánto cuesta un ticket.
- La IA (tickets, dictado, extractos y preguntas) pasa por la Edge Function `supabase/functions/cuentas-claude`,
  con la misma clave de Anthropic que el gimnasio.
- **Tickets en Google Drive**, como en Senda: cada ticket que se guarda se archiva también en
  `G:\Mi unidad\02 - JUAN\04 - FACTURAS\01 Tickets\<año>\<Nº TRIMESTRE>` en PDF (las fotos se pasan a PDF) y
  con el nombre de Senda `AAAAMMDD_PROVEEDOR_IMPORTE€_NUMERO.pdf` (las reglas de `factura_nombre.py`). Lo hace la
  Edge Function `supabase/functions/cuentas-drive`, con el mismo permiso de Google que la Tía Senda: secretos
  `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y `GOOGLE_OAUTH_REFRESH_TOKEN` en las Edge Functions de
  Supabase. En Dinero → «Tickets en Drive» se ve cuántos están subidos y se suben los que falten. Si corriges
  un gasto ya subido (fecha, importe o dónde), el PDF de Drive cambia de nombre y, si toca, de carpeta.
  **Sin repetidos**: al guardar un ticket que parece ya apuntado (mismo número, o mismo día, importe y sitio) la
  web avisa y sólo lo guarda si se confirma; en Drive no se sube un fichero si en la carpeta ya hay uno con ese
  nombre o con ese número de ticket. Los que no llegaron a subir se suben solos al abrir la web.
  **No se mezcla con Senda**: la función sólo escribe dentro de «01 Tickets» (id fijo en el código) y antes de
  subir comprueba que esa carpeta sigue en 02 - JUAN / 04 - FACTURAS; si no, no sube nada. La carpeta no está
  compartida con la cuenta de servicio de Senda, así que la Tía Senda tampoco la lee.
- Tricount se lee con la Edge Function `supabase/functions/cuentas-tricount`, que usa la API **no oficial**
  de la app de Tricount (api.tricount.bunq.com): sólo pide (GET) cada tricount por la clave de su enlace,
  nunca se une a él ni escribe. bunq la puede cambiar o cerrar. Los enlaces se guardan en `config/tricount`;
  la sesión de Tricount, en `tricount/sesion`, y una copia de lo último leído, en `tricount/datos-<clave>`
  (todo en `cuentas_docs`; la colección `tricount` la admite la migración de `supabase/migrations/`).
- Kraken (criptomonedas) se lee con la Edge Function `supabase/functions/cuentas-kraken`: con una llave de
  **sólo «Consultar fondos»** llama a `Balance` (privado) y a `Ticker` (público, precio en euros). Nunca a nada
  que compre, venda o saque. La llave la pega Juan en Dinero → Kraken y se guarda en la tabla
  `cuentas_secretos`, sin políticas (la web no la puede leer; sólo la función con service_role). El valor en
  euros se guarda como saldo de hoy de la cuenta «Kraken» (`kraken: true`, con `cripto` y `criptoHora`) al
  abrir la app y al volver a ella, como mucho cada 10 minutos.
  Debajo, «Cómo va el ALGO frente al euro»: la misma función, con `accion: "historico"`, trae de `OHLC`
  (público, sin llave) el cierre de cada día (unos dos años) y de cada semana (para «Todo»). Se pide al ver la
  cuenta, como mucho una vez por hora, y no se guarda en la base: sólo en memoria. Lo de «tus monedas» se
  calcula con las que hay hoy, y así lo dice la pantalla.
- **Como una aplicación en el móvil**: la web lleva su ficha (`src/web/manifest.json`) y sus iconos
  (`src/web/icons/`), así que Chrome la instala con su icono y sin la barra del navegador.
- **Guardar sin pisar** (lo que hay en `src/web/09-web.js` y `putItems`/`saveMovs`/`saveDoc` de `src/04-apuntar.js`):
  - Todo se escribe contra lo que hay en Supabase, no contra lo que tiene el móvil (que puede no tener aún lo hecho
    en otro): se lee, se cambia y se escribe solo si nadie lo ha tocado desde que se leyó (mismo `updated_at`); si
    lo han tocado, se vuelve a leer. Un mes nuevo se crea solo si no existe.
  - Un movimiento que ya estaba se manda como lo que ha cambiado, campo a campo: si en otro móvil se cambia otra
    cosa del mismo movimiento a la vez, se quedan las dos. Un retoque (el enlace de Drive) de un movimiento que ya
    no está no se escribe; uno editado aquí y borrado en otro sitio vuelve entero, como antes.
  - Al pasar un movimiento a otro mes, primero se guarda en el nuevo y luego se quita del viejo: si se corta a
    mitad, sale repetido, no se pierde.
  - `config/*` y `anios/*` se guardan enteros pero mezclados a tres bandas (lo que tenía el móvil, lo nuevo y lo que
    hay en la base): lo cambiado en otro móvil (una cuenta nueva, el saldo que pone Kraken o Tricount) se queda, y
    en las listas con `id` (cuentas, fijos, objetivos, categorías) se mezcla elemento a elemento. Si los dos
    cambian lo mismo, gana el último.
  - Lo prueba `node pruebas/guardado.mjs` (después de `./build-web.sh`), que también corre en «Comprobaciones».
  - El Artifact de Claude guarda como siempre (su base de datos es aparte y de un solo sitio).
- **Copias de seguridad**:
  - En Dinero → Cuentas, «Descargar en Excel» y «Descargar la copia completa», a mano.
  - `cuentas_docs_historial`: cada vez que un documento pierde algo (se borra, o se cambia o quita un movimiento,
    una cuenta, el presupuesto…), la versión de antes se guarda ahí. No se guarda cuando solo se añade algo, ni
    la colección `tricount`. Lo hace un disparador (migración `…_cuentas_docs_historial.sql`).
  - `cuentas_docs_copias`: una copia entera cada semana. La pide la web al entrar
    (`cuentas_copia_semanal()`), y solo copia si la última tiene 7 días o más. No se borra ninguna. La primera,
    del 20/10/2026, se hizo al aplicar la migración (62 de 62 documentos, idénticos). El aviso de Supabase
    «authenticated puede ejecutar una función SECURITY DEFINER» por esta función es a propósito: solo copia lo
    de quien está en `cuentas_usuarios`.
  - Las copias diarias de Supabase son de todo el proyecto (Senda incluida): no sirven para volver atrás solo
    las cuentas.
- **Recuperar algo** (antes de cambiar nada, enseñar a Juan qué se va a cambiar):
  ```sql
  -- versiones guardadas de un mes
  select hid, op, updated_at, cambiado_en from cuentas_docs_historial
  where collection = 'movs' and id = '2026-10' order by cambiado_en desc;
  -- devolver un movimiento (<mov>) tal y como estaba en una versión (<hid>), sin tocar el resto del mes
  update cuentas_docs d set data = jsonb_set(d.data, '{items,<mov>}', h.data->'items'->'<mov>'), updated_at = now()
  from cuentas_docs_historial h
  where h.hid = <hid> and d.owner = h.owner and d.collection = h.collection and d.id = h.id;
  -- o un documento entero desde una copia semanal
  update cuentas_docs d set data = c.data, updated_at = now() from cuentas_docs_copias c
  where c.copia = '<AAAA-MM-DD>' and d.owner = c.owner and d.collection = c.collection and d.id = c.id
    and d.collection = 'movs' and d.id = '2026-10';
  ```
- **Migraciones**: `supabase/migrations/`, con el número que les dio Supabase al aplicarlas
  (`supabase_migrations.schema_migrations`). Si se aplica una nueva, el fichero se renombra con su número.
- `./build-web.sh` genera `web/index.html`; el workflow `.github/workflows/gym-web.yml` lo publica en
  `/cuentas/` junto a la web del gimnasio en cada push a `main`, sólo si pasan las comprobaciones
  (`.github/workflows/comprobaciones.yml`: el JavaScript se lee bien y la web arranca sin errores), que también
  corren en cada pull request.

**Artifact de Claude**: `./build.sh` genera `index.html`, que se publica como Artifact
(base de datos del artifact, `sample` y `assets`). Guarda sus datos aparte de la web.

El código compartido está en `src/`; lo propio de la web (entrar y hablar con Supabase) en `src/web/`.
