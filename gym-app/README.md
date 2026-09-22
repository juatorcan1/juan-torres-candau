# Juan vs Ignacio

App de gimnasio compartida entre Juan e Ignacio, con una comparativa siempre visible para picarse.

- **Duelo**: marcador de métricas ganadas (semana, mes, año o todo), cara a cara por métrica, gráfico de las últimas 8 semanas, actividad reciente, rachas, peso y alcohol.
- **Apuntar**: *hablando con Claude* (dictado con el micrófono del teclado del móvil; Claude lo convierte en sesiones, series, repeticiones, kilos, pesajes y copas, y lo enseña para revisar antes de guardar) o formulario completo (series, reps, kg, RIR, descanso, calentamiento; cardio con distancia, ritmo, pulsaciones, inclinación, vatios…).
- **Historial** y **Récords** (mejor serie, 1RM estimado, máximo de repeticiones, récords de cardio).
- **Peso y copas**: pesaje semanal, contador de copas en UBE y kcal, evolución del peso y valoración de Claude.
- **Dieta**: objetivos de kcal y macros según peso, altura, edad, entreno y trabajo; menú de lunes a domingo con tres situaciones (obra con bocadillo o tortitas, bar o restaurante, oficina con cocina) y propuestas extra con Claude.
- **Ejercicios**: dibujo animado esquemático de cada ejercicio con el músculo que trabaja, pasos y errores típicos.

## Cómo está hecho

Es una página de Artifacts de Claude: los datos viven en la base de datos compartida del artifact (`sesiones`, `pesajes`, `bebidas`, `perfiles`) y Claude se usa con la capacidad `sample`.

El código está en `src/` y `./build.sh` lo junta en `index.html`, que es lo que se publica.
