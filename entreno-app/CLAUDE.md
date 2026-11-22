# entreno-app: El entreno de Juan

Copia de `gym-app/` para una sola persona. Se toca igual que `gym-app/CLAUDE.md` (piezas, cómo se guarda un entreno
guiado, qué prueba pasar en cada caso), con estas diferencias:

- **Datos aparte:** tabla `entreno_docs` (mismas columnas que `gym_docs` más `owner`, el usuario de Supabase).
  Row Level Security «solo lo mío»: solo el usuario de `entreno_usuarios` (Juan) lee y escribe. Ignacio no está
  ahí y no ve nada. No se mezcla nunca con `gym_docs`.
- Historial: `entreno_docs_historial` (disparador). Copia semanal: `select public.entreno_copia_semanal()`.
- Claude: Edge Function `supabase/functions/entreno-claude` (tope `entreno_claude_uso`; la clave, la misma de
  Anthropic: secreto de las funciones o Vault vía `entreno_anthropic_key`).
- En el móvil las claves guardadas empiezan por `entreno.` (la web comparte origen con la de `gym-app`, así que
  nunca se leen el entreno a medias la una a la otra).
- Sin duelo: no hay `OTHER`, `KEYS = ["juan"]`, y la pestaña «Progreso» sustituye a «Duelo».
- Pruebas: `for t in entreno-app/pruebas/*.mjs; do node "$t"; done` (todas tienen que salir «todo bien»).

```sql
-- últimas sesiones
select id, data->>'date' fecha, data->>'sport' deporte, data->>'enCurso' a_medias, updated_at
from entreno_docs where collection = 'sesiones' order by data->>'date' desc limit 30;
```
