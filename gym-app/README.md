# Juan vs Ignacio

App de gimnasio compartida entre Juan e Ignacio, con una comparativa siempre visible para picarse.

- **Duelo**: marcador de métricas ganadas (semana, mes, año o todo), cara a cara por métrica, gráfico de las últimas 8 semanas, actividad reciente, rachas, peso y alcohol.
- **Apuntar**: *hablando con Claude* (dictado con el micrófono del teclado del móvil; Claude lo convierte en sesiones, series, repeticiones, kilos, pesajes y copas, y lo enseña para revisar antes de guardar) o formulario completo (series, reps, kg, RIR, descanso, calentamiento; cardio con distancia, ritmo, pulsaciones, inclinación, vatios…).
- **Historial** y **Récords** (mejor serie, 1RM estimado, máximo de repeticiones, récords de cardio).
- **Peso y copas**: pesaje semanal, contador de copas en UBE y kcal, evolución del peso y valoración de Claude.
- **Dieta**: objetivos de kcal y macros según peso, altura, edad, entreno y trabajo; menú de lunes a domingo con tres situaciones (obra con bocadillo o tortitas, bar o restaurante, oficina con cocina) y propuestas extra con Claude.
- **Ejercicios**: dibujo animado esquemático de cada ejercicio con el músculo que trabaja, pasos y errores típicos.

## Dos versiones, mismo código

**Web con usuarios** (la que se usa): https://juatorcan1.github.io/juan-torres-candau/
- Cada uno entra con su usuario (Juan o Ignacio) y su contraseña, que se cambia desde la propia app.
- Datos en Supabase (proyecto `senda-memoria`, tablas `gym_usuarios`, `gym_docs` y `gym_claude_uso`, separadas de Senda). Row Level Security: los dos leen todo y cada uno solo escribe lo suyo.
- Claude (dictado, valoración, menús) pasa por la Edge Function `supabase/functions/gym-claude`, que necesita el secreto `ANTHROPIC_API_KEY` en el proyecto. Tope de 80 llamadas por persona y día.
- `./build-web.sh` genera `web/index.html`; el workflow `.github/workflows/gym-web.yml` lo sube a la rama `gh-pages` (la que publica GitHub Pages) en cada push a `main`.

**Artifact de Claude**: `./build.sh` genera `index.html`, que se publica como Artifact (base de datos del artifact y capacidad `sample`).

El código compartido está en `src/`; lo propio de la web (inicio de sesión y conexión con Supabase) en `src/web/`.
