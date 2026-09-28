# Telefonista IA

Una IA que coge el teléfono de la empresa. Sirve para una marca de ropa, una constructora o cualquier
negocio: basta con escribirle una ficha con lo que tiene que saber.

- **Habla muchos idiomas**: contesta en el idioma de quien llama y cambia solo si el cliente cambia
  (español, inglés, francés, alemán, italiano, portugués, neerlandés, catalán, ruso, ucraniano, rumano,
  árabe, chino... los que se pongan en la ficha).
- **Vende**: pregunta qué busca, recomienda algo concreto del catálogo explicando por qué le conviene,
  responde a las pegas con la verdad y cierra siempre con un paso siguiente (pedido, reserva, visita,
  presupuesto). Convence con razones, nunca con presión ni con ofertas inventadas.
- **Resuelve**: dudas, pedidos, devoluciones, quejas. Lo que no puede resolver lo deja como incidencia,
  y a quien está muy enfadado o pide una persona se lo pasa.
- **Hace de secretaria**: horarios, direcciones, recados para cualquiera de la empresa, citas, y pasa
  llamadas a quien toque respetando su horario.
- **Avisa al equipo**: cada cliente interesado, recado, incidencia o cita queda apuntado al momento
  (y, si se quiere, llega por Slack, correo, WhatsApp... mediante un webhook). Al colgar, deja un resumen
  de la llamada con lo que queda pendiente y si hay oportunidad de venta.
- **Recuerda**: si vuelve a llamar alguien, sabe de qué habló la última vez.
- **Nunca se inventa nada**: sólo da por cierto lo que está en la ficha; si no lo sabe, lo dice y toma
  el recado. No pide tarjetas ni contraseñas. Si le preguntan, dice que es una asistente virtual.

## Cómo funciona

```
Cliente ──llama──► número de Twilio ──► ConversationRelay (voz ⇄ texto, en tiempo real)
                                                │  WebSocket
                                                ▼
                                   este servidor (src/servidor.ts)
                                   ├─ Claude (Anthropic): qué decir y qué hacer
                                   ├─ empresas/<empresa>/: lo que sabe de cada empresa
                                   └─ registro: Supabase o datos/registros.jsonl
```

Twilio pone el número de teléfono, convierte la voz del cliente en texto y el texto de la IA en voz.
El servidor le pasa ese texto a Claude con la ficha de la empresa, y va devolviendo la respuesta a
Twilio mientras Claude la escribe, para que no haya silencios. Si el cliente habla encima, la IA se
calla y le escucha.

Un solo servidor atiende a varias empresas: cada una tiene su número y su carpeta en `empresas/`.

## Probarla sin teléfono

Hace falta Node 22.18 o más nuevo y una clave de la API de Anthropic.

```bash
cd telefonista-ia
npm install
cp .env.example .env        # y poner ANTHROPIC_API_KEY
npm run probar -- empresas/moda-ejemplo
npm run probar -- empresas/construccion-ejemplo +34611222333   # "llamando" desde ese número
```

Se escribe como si se hablara, en el idioma que se quiera. `/colgar` termina y enseña el resumen que
recibiría el equipo. Lo apuntado queda en `datos/pruebas.jsonl`.

`npm run comprobar` pasa las pruebas automáticas (sin gastar llamadas a la IA).

## Dar de alta una empresa

Copiar una de las carpetas de ejemplo en `empresas/` y cambiarla:

**`ficha.json`**

| Campo | Qué es |
| --- | --- |
| `nombre`, `sector` | La empresa y a qué se dedica. |
| `asistente` | Cómo se llama la telefonista. |
| `telefonos` | El número o números de Twilio que atiende para esta empresa. |
| `idiomaPrincipal`, `idiomas` | Idioma de la casa y todos los que habla (`"es-ES"`, `"en-GB"`...). Cada uno puede ser `{ "codigo": "en-GB", "voz": "...", "proveedorVoz": "ElevenLabs" }` para elegir la voz. |
| `saludo` | Lo primero que se oye al descolgar. Debe decir que es una asistente virtual. |
| `horario`, `zonaHoraria`, `tono` | Cuándo hay personas, en qué hora vive la empresa y cómo habla. |
| `transferencias` | A quién puede pasar llamadas: `{ "ventas": { "numero": "+34...", "descripcion": "...", "horario": "..." } }`. Si falla la IA, la llamada va al primero. |
| `transcripcion` | Opcional. Por defecto Deepgram `nova-3-general` en modo multilingüe (`"multilingue": true`), que entiende todos los idiomas a la vez. Con `false`, entiende el idioma en que esté hablando la IA. |
| `avisos.webhook` | Opcional. URL a la que se manda en JSON cada cosa que se apunta. |

**`conocimiento.md`**: todo lo que tiene que saber, escrito como se le explicaría a alguien nuevo:
productos y precios, tallas, plazos, envíos, devoluciones, garantías, formas de pago, zona de trabajo,
preguntas frecuentes, qué hacer en cada caso y qué no puede prometer. Cuanto más completo, mejor atiende
y mejor vende. Después, probarla con `npm run probar` haciendo de cliente difícil.

## Ponerla a coger el teléfono

1. **Servidor**: cualquier alojamiento que mantenga conexiones WebSocket abiertas (Render, Railway,
   Fly.io, un VPS...). Hay `Dockerfile`. Variables: `ANTHROPIC_API_KEY`, `TWILIO_AUTH_TOKEN` y
   `URL_PUBLICA` (su dirección `https://`); opcionales en `.env.example`. `GET /salud` responde `ok`.
2. **Twilio**: comprar un número (con voz) y en *Voice Configuration → A call comes in* poner
   *Webhook* `https://<URL_PUBLICA>/twilio/llamada` (POST). Ese número va en `telefonos` de la ficha.
   Para conservar el número de siempre de la empresa, desviar las llamadas a este (todas, o sólo
   cuando no se contesta / fuera de horario).
3. **Supabase** (recomendado): ejecutar `supabase/tablas.sql` y poner `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY`. Todo queda en la tabla `telefonista_registros`, con una columna
   `atendido` para marcar lo ya resuelto. Sin Supabase se guarda en `datos/registros.jsonl`, que se
   pierde si el alojamiento borra el disco.

Seguridad: el servidor sólo atiende peticiones firmadas por Twilio (`X-Twilio-Signature`) y el
WebSocket exige una firma de un solo uso por llamada. Sólo pasa llamadas a los números de la ficha.

## Ajustes

- **Modelo**: `MODELO` (por defecto `claude-opus-5-5`). **Esfuerzo**: `ESFUERZO=low` por defecto para
  que conteste rápido; `medium` piensa más antes de hablar (más lenta, algo más fina en ventas difíciles).
- Si un filtro de seguridad de Anthropic rechazara una respuesta, la API la repite sola con el modelo de
  respaldo recomendado (`fallbacks: "default"`), para que la IA nunca se quede callada al teléfono.
- La ficha y las herramientas se guardan en la caché de Anthropic: las respuestas salen antes y más
  baratas desde el segundo turno.

## Legal (UE / España)

- Desde agosto de 2026 el Reglamento de IA obliga a avisar de que se habla con una IA: el `saludo`
  debe decirlo (los de ejemplo lo hacen) y la IA nunca lo niega.
- No se graba el audio, pero sí se guarda el texto de la conversación y los datos de contacto: la
  política de privacidad de la empresa debe mencionarlo, y conviene un aviso breve en el saludo o una
  opción para oír la política. Se pueden borrar registros en `telefonista_registros` cuando se pida.

## Archivos

- `src/servidor.ts`: servidor HTTP y WebSocket para Twilio.
- `src/agente.ts`: la conversación (turnos, interrupciones, herramientas, fallo de la IA, resumen).
- `src/instrucciones.ts`: cómo atiende, vende y resuelve.
- `src/herramientas.ts`: cambiar de idioma, apuntar cliente, recado, incidencia, cita, pasar y colgar.
- `src/empresas.ts`, `src/registro.ts`, `src/twilio.ts`: fichas, dónde se apunta y lo propio de Twilio.
- `src/probar.ts`: la prueba por escrito. `pruebas/`: pruebas automáticas.
