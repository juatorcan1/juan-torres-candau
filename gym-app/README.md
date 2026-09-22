# Juan vs Ignacio

App de gimnasio compartida entre Juan e Ignacio, con una comparativa siempre visible para picarse.

Abajo hay cinco botones:

- **Hoy**: lo que toca hoy según tu plan, "Hazme el entreno" (gimnasio, calistenia, en casa, natación, cinta o bici; de 20 a 90 min), el menú de hoy según dónde comas y apuntar rápido.
- **Entrenador** (agente con Claude): chat para pedir entrenos, un plan semanal o mensual y cómo superar la última sesión o al otro; pestaña **Plan** con los días; **Ejercicios** con los dibujos animados.
- **＋ Apuntar**: dictando (micrófono de la app en la web, o el del teclado) y Claude lo ordena; o formulario completo.
- **Dietista** (agente con Claude): chat y **Menú** semanal con tres versiones de la comida (obra con bocadillo o tortitas, bar o restaurante, oficina con cocina), ajustado a peso, objetivo y copas.
- **Duelo**: resumen comparativo, historial, récords, y peso y copas.

**Entreno guiado**: cada entreno del entrenador se abre a pantalla completa: dibujo del ejercicio, objetivo y reto de la serie, tu mejor marca y la del otro, kilos y repeticiones con botones +/−, descanso con cuenta atrás, vibración, pitido y voz, pantalla siempre encendida. Al terminar calcula el volumen, detecta récords y guarda la sesión.

## Dos versiones, mismo código

**Web con usuarios** (la que se usa): https://juatorcan1.github.io/juan-torres-candau/
- Cada uno entra con su usuario (Juan o Ignacio) y su contraseña, que se cambia desde la propia app.
- Datos en Supabase (proyecto `senda-memoria`, tablas `gym_usuarios`, `gym_docs` — sesiones, pesajes, bebidas, perfiles, planes, chats — y `gym_claude_uso`, separadas de Senda). Row Level Security: los dos leen todo y cada uno solo escribe lo suyo.
- Claude (dictado, valoración, menús) pasa por la Edge Function `supabase/functions/gym-claude`, que necesita la clave de Anthropic: el secreto `ANTHROPIC_API_KEY` de las Edge Functions o, si no está, el secreto `gym_anthropic_api_key` del Vault (lo lee la función SQL `gym_anthropic_key`, solo para `service_role`). Tope de 80 llamadas por persona y día.
- `./build-web.sh` genera `web/index.html`; el workflow `.github/workflows/gym-web.yml` lo sube a la rama `gh-pages` (la que publica GitHub Pages) en cada push a `main`.

**Artifact de Claude**: `./build.sh` genera `index.html`, que se publica como Artifact (base de datos del artifact y capacidad `sample`).

El código compartido está en `src/`; lo propio de la web (inicio de sesión y conexión con Supabase) en `src/web/`.
