# Auditoría de la app del gimnasio · 20 de octubre de 2026

Juan tenía la sensación de que los últimos entrenos no se habían guardado. Se ha revisado la base de datos
(`gym_docs`), los logs de la API de Supabase día a día, el código del guardado y cómo está montado el repositorio.

## Qué hay guardado

| Fecha | Juan | Ignacio |
|---|---|---|
| lun 6 oct | Cuerpo completo A · completo | Cuerpo completo A · completo |
| mié 8 oct | Cuerpo completo B · completo | Cuerpo completo B · completo, y otro empezado y abandonado (duplicado) |
| **vie 9 oct** | **Cuerpo completo B · completo, 8 ejercicios** | a medias: 3 de 10 ejercicios, «sin terminar» |
| 12–18 oct | nada | nada |
| **vie 16 oct** | **nada: ese día la app no se abrió** (cero peticiones a Supabase) | igual |
| lun 19 oct | Cuerpo completo A (descarga) · completo | a medias: «sin terminar», sin guardar al final |

- El viernes 9 de Juan está entero. El viernes 16 no hay nada que recuperar: no hubo ni una lectura ni una
  escritura en todo el día, así que no se perdió al guardar; no llegó a apuntarse (o se apuntó sin conexión en
  un entreno que luego se sustituyó en el móvil, el fallo 2).
- Del 10 al 18 de octubre solo hubo lecturas (se abrió la app el 10, el 14 y el 15), ninguna escritura.
- Las escrituras de ayer salieron todas bien (respuestas 200/201, ningún error).
- No hay ningún pesaje corporal guardado nunca (`pesajes` vacío).

## Fallos encontrados en el código (arreglados en este pull request)

1. **Sin conexión, las series no se volvían a intentar subir.** `syncRun` se tragaba el error (`catch {}`) y no
   reintentaba hasta la siguiente serie. Con el iPhone en segundo plano o sin cobertura, ahí se quedaba.
   → Ahora se marca como pendiente, se reintenta al volver la conexión, al volver a la app y cada 30 s, y avisa.
2. **Empezar un entreno nuevo pisaba en el móvil el que estaba a medias**, con lo que no se hubiera subido.
   → Ahora primero lo guarda tal cual («sin terminar», se puede continuar); sin conexión no deja empezar otro.
3. **Un entreno a medias se quedaba días en el móvil** y se subía de golpe más tarde: el del 9 de Ignacio se
   reescribió el 19 con 240 minutos (el tope), al abrir la app para el entreno de ese día.
   → Al abrir la app, uno de hace más de 6 h se guarda solo y sale del móvil; no abre el reproductor.
4. **Minutos**: se contaban hasta el momento de guardar. → Ahora acaban en la última serie si pasaron más de 20 min.
5. **«Descartar» borra lo ya subido sin vuelta atrás** (el 9 a las 21:18 se descartó un entreno de Ignacio
   empezado a las 20:51, con lo que llevaba). → Con el historial (abajo) se puede recuperar.

`gym-app/pruebas/guardado.mjs` reproduce 1–4 en Chromium: la versión anterior falla 9 de 14 comprobaciones y
esta las pasa todas.

## Lo que faltaba en el montaje

- **Copias de seguridad**: solo la copia diaria de Supabase Pro (7 días). Nada guardaba versiones anteriores:
  un borrado o una sobrescritura eran definitivos. → Tabla `gym_docs_historial` con disparador (migración
  `20261020090000`, **pendiente de aplicar**) y botón «Copia» que descarga todo en JSON.
- **Esquema fuera del repositorio**: las cuatro migraciones del gimnasio solo estaban en Supabase. → Traídas a
  `gym-app/supabase/migrations/`.
- **Sin guía para Claude ni revisores**: no había `CLAUDE.md` ni agentes. → `CLAUDE.md`, `gym-app/CLAUDE.md` y
  dos agentes en `.claude/agents/`: `guardian-gym` (revisa los datos) y `revisor-datos` (revisa cada cambio).
- **Sin comprobaciones en los pull requests**: lo resuelve el pull request #69 («Comprobaciones»), aún sin fusionar.
- **Agentes de la app** (Entrenador y Dietista, por la Edge Function `gym-claude`): funcionan; la última llamada
  fue el 9 de octubre. El plan de entreno de los dos **se acaba el domingo 25 de octubre**.
- `gym-ping`: Edge Function de una prueba antigua, desactivada; se puede borrar.

## Plan de acción

- [x] Arreglar el guardado del entreno guiado (fallos 1–4) con su prueba.
- [x] Esquema en el repositorio, `CLAUDE.md`, agentes guardián y revisor.
- [x] Botón «Copia» (descarga JSON de todo).
- [ ] **Aplicar la migración del historial** en Supabase (necesita el visto bueno de Juan).
- [ ] Fusionar #69 y añadir `gym-app/pruebas/guardado.mjs` a «Comprobaciones»; marcarla como obligatoria en `main`.
- [ ] Datos de Ignacio, con su permiso: cerrar o continuar las sesiones del 9 y del 19 (a medias), borrar el
      duplicado del 8 y corregir un peso mal tecleado del 29 de septiembre en elevaciones laterales.
- [ ] Juan: si entrenaste el viernes 16, apúntalo desde el plan («Te falta apuntar» → con el formulario).
- [ ] Pedir al Entrenador el plan nuevo antes del 25 de octubre.
- [ ] Programar el `guardian-gym` cada semana (lunes) con un informe y una copia a Google Drive.
- [ ] Borrar la Edge Function `gym-ping`.
