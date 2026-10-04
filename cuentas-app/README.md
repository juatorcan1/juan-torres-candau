# Las cuentas de Juan

Las cuentas personales de Juan, ejercicio a ejercicio: gastos e ingresos por categorías, bancos,
efectivo, depósitos, deudas, objetivos y la previsión año a año hasta 2040. Los tickets se leen con
una foto y la IA reparte cada importe en su categoría, como las facturas en Senda 360.

Abajo hay cinco botones, y uno redondo (＋) para apuntar:

- **El año**: lo que ha entrado, salido y ahorrado; mes a mes; cómo acabarás el año; hasta 2040.
- **Movimientos**: todo lo apuntado, por días, con filtros.
- **＋** (el redondo): foto del ticket (o factura en PDF), contárselo con palabras, a mano o el extracto del banco.
- **En qué se va**: gastos e ingresos por grupos y categorías, presupuesto y la curva del año.
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
- Tricount se lee con la Edge Function `supabase/functions/cuentas-tricount`, que usa la API **no oficial**
  de la app de Tricount (api.tricount.bunq.com): sólo pide (GET) cada tricount por la clave de su enlace,
  nunca se une a él ni escribe. bunq la puede cambiar o cerrar. Los enlaces se guardan en `config/tricount`;
  la sesión de Tricount, en `tricount/sesion` (las dos en `cuentas_docs`).
- **Como una aplicación en el móvil**: la web lleva su ficha (`src/web/manifest.json`) y sus iconos
  (`src/web/icons/`), así que Chrome la instala con su icono y sin la barra del navegador.
- **Copia de seguridad**: en Dinero → Cuentas, «Descargar en Excel» y «Descargar la copia completa».
- `./build-web.sh` genera `web/index.html`; el workflow `.github/workflows/gym-web.yml` lo publica en
  `/cuentas/` junto a la web del gimnasio en cada push a `main`.

**Artifact de Claude**: `./build.sh` genera `index.html`, que se publica como Artifact
(base de datos del artifact, `sample` y `assets`). Guarda sus datos aparte de la web.

El código compartido está en `src/`; lo propio de la web (entrar y hablar con Supabase) en `src/web/`.
