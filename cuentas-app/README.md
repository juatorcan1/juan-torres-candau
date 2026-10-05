# Las cuentas de Juan

Las cuentas personales de Juan, ejercicio a ejercicio: gastos e ingresos por categorías, bancos,
efectivo, depósitos, deudas, objetivos y la previsión año a año hasta 2040. Los tickets se leen con
una foto y la IA reparte cada importe en su categoría, como las facturas en Senda 360.

Abajo hay cinco botones, y uno redondo (＋) para apuntar:

- **El año**: lo que ha entrado, salido y ahorrado; mes a mes; cómo acabarás el año; hasta 2040.
- **Movimientos**: todo lo apuntado, por días, con filtros.
- **＋** (el redondo): foto del ticket (o factura en PDF), contárselo con palabras, a mano o el extracto del banco.
  Si del ticket sólo es tuya una parte, pon «Mi parte» (o toca cuál de los pagos fue el tuyo, si se pagó en varias
  veces): el gasto es tu parte, cada línea en proporción, y el ticket entero se archiva igual.
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
  Tricount sólo da de golpe los gastos recientes: los anteriores se piden por tandas hacia atrás.
- **Como una aplicación en el móvil**: la web lleva su ficha (`src/web/manifest.json`) y sus iconos
  (`src/web/icons/`), así que Chrome la instala con su icono y sin la barra del navegador.
- **Copia de seguridad**: en Dinero → Cuentas, «Descargar en Excel» y «Descargar la copia completa».
- `./build-web.sh` genera `web/index.html`; el workflow `.github/workflows/gym-web.yml` lo publica en
  `/cuentas/` junto a la web del gimnasio en cada push a `main`.

**Artifact de Claude**: `./build.sh` genera `index.html`, que se publica como Artifact
(base de datos del artifact, `sample` y `assets`). Guarda sus datos aparte de la web.

El código compartido está en `src/`; lo propio de la web (entrar y hablar con Supabase) en `src/web/`.
