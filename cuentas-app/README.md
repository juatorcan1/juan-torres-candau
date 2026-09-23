# Las cuentas de Juan

Las cuentas personales de Juan, ejercicio a ejercicio: gastos e ingresos por categorías, bancos,
efectivo, depósitos, deudas, objetivos y la previsión año a año hasta 2040. Los tickets se leen con
una foto y la IA reparte cada importe en su categoría, como las facturas en Senda 360.

Abajo hay cinco botones:

- **El año**: lo que ha entrado, salido y ahorrado; mes a mes; cómo acabarás el año; hasta 2040.
- **Movimientos**: todo lo apuntado, por días, con filtros.
- **＋**: foto del ticket (o factura en PDF), contárselo con palabras, a mano o el extracto del banco.
- **En qué se va**: gastos e ingresos por grupos y categorías, presupuesto y la curva del año.
- **Dinero**: cuentas, deudas, objetivos, fijos, presupuesto, categorías y copia de seguridad.

## Dos versiones, mismo código

**Web con contraseña** (la que se usa): https://juatorcan1.github.io/juan-torres-candau/cuentas/
- Entra con el usuario de Juan del gimnasio (misma contraseña; se cambia desde la app y cambia en las dos).
- Datos en Supabase (proyecto `senda-memoria`), aparte de Senda y del gimnasio:
  - `cuentas_usuarios`: quién puede entrar (sólo Juan).
  - `cuentas_docs`: documentos JSON — `movs/<AAAA-MM>` (los movimientos de cada mes), `config/cuentas`,
    `config/categorias`, `config/prefs`, `anios/<AAAA>` (fijos, presupuesto y objetivos de cada ejercicio).
    Row Level Security: cada uno ve y toca sólo lo suyo (`owner = auth.uid()`).
  - Carpeta privada `cuentas-tickets` para las fotos de los tickets (`<user_id>/<id>.jpg`).
  - `cuentas_claude_uso`: llamadas a la IA por día (tope de 150).
- La IA (tickets, dictado, extractos y preguntas) pasa por la Edge Function `supabase/functions/cuentas-claude`,
  con la misma clave de Anthropic que el gimnasio.
- **Copia de seguridad**: en Dinero → Cuentas, «Descargar en Excel» y «Descargar la copia completa».
- `./build-web.sh` genera `web/index.html`; el workflow `.github/workflows/gym-web.yml` lo publica en
  `/cuentas/` junto a la web del gimnasio en cada push a `main`.

**Artifact de Claude**: `./build.sh` genera `index.html`, que se publica como Artifact
(base de datos del artifact, `sample` y `assets`). Guarda sus datos aparte de la web.

El código compartido está en `src/`; lo propio de la web (entrar y hablar con Supabase) en `src/web/`.
