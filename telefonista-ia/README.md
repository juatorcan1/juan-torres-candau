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
- **Tú decides con quién habla**: los desconocidos los atiende ella; con clientes o números concretos
  puede sonarte antes el móvil ("te llama Pedro: pulsa 1 para hablar tú, 2 para la asistente").
- **La sigues en directo**: desde el panel en el móvil ves y oyes la llamada mientras habla, y le das
  indicaciones con tu voz sin que el otro las oiga ("no le prometas el pago", "pásamela", "cuelga").
- **Sabe decir que no**: con quien pide algo que no le corresponde, explica los hechos con tono imparcial y
  cordial, se mantiene firme y ofrece la salida justa si la hay. Nunca miente ni falta al respeto.
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

Para ensayar lo del panel: una línea que empieza por `!` es una indicación tuya (la sigue en su próxima
respuesta) y `!!` hace que actúe ya. Y para ensayar a alguien con regla:

```bash
npm run probar -- empresas/construccion-ejemplo +34622000002 --regla "Pedro, Hormigones Pérez|Reclama la factura 23, pero la obra quedó con grietas sin reparar. No se le paga hasta que lo repare. Tono imparcial y cordial."
```

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
| `filtro` | Opcional. Qué hacer según quién llame (ver abajo). Sin filtro, todo lo atiende ella. |

**`conocimiento.md`**: todo lo que tiene que saber, escrito como se le explicaría a alguien nuevo:
productos y precios, tallas, plazos, envíos, devoluciones, garantías, formas de pago, zona de trabajo,
preguntas frecuentes, qué hacer en cada caso y qué no puede prometer. Cuanto más completo, mejor atiende
y mejor vende. Después, probarla con `npm run probar` haciendo de cliente difícil.

## Filtro de llamadas y panel en directo

### Quién va a quién

En la ficha:

```json
"filtro": {
  "miTelefono": "+34 6XX XXX XXX",
  "desconocidos": "ia",
  "conocidos": "preguntar",
  "segundosParaDecidir": 20
}
```

Cada llamada tiene una de estas tres salidas:

| Acción | Qué pasa |
| --- | --- |
| `ia` | La atiende la asistente. |
| `preguntar` | Suena tu móvil. Al descolgar oyes "Te llama Pedro Hormigones: pulsa 1 para hablar tú, 2 para que le atienda la asistente". Si pulsas 2, no pulsas nada o no lo coges, la atiende ella (y se disculpa por la espera). |
| `pasar` | Suena tu móvil; si no lo coges, la atiende ella. |

- `desconocidos`: números que nunca han llamado. `conocidos`: números que ya han llamado alguna vez.
- Para números concretos (Pedro, un cliente, un proveedor...) se pone una **regla** en el panel,
  pestaña *Contactos*: quién es, qué acción y **cómo tiene que tratarle** la asistente. Por ejemplo:
  *"Reclama el pago de la factura 23, pero la obra quedó con grietas que no ha reparado. No se le paga
  hasta que lo repare. Tono imparcial y cordial."* La asistente lo sigue en toda la llamada.
- **`miTelefono` no puede ser un número que desvía a Twilio**: si tu Digi desvía todas sus llamadas a
  Twilio y Twilio te llama a ese mismo Digi, la llamada daría vueltas. Pon otro de tus números, o desvía
  el Digi sólo cuando no contestes (`**61*número#`), comunicas (`**67*número#`) o no tienes cobertura
  (`**62*número#`) en vez de siempre (`**21*número#`).

### El panel

Con la variable `PANEL_CLAVE` (10 caracteres o más), el panel está en `https://<URL_PUBLICA>/panel`.
Se abre en el móvil, se entra con esa clave y se queda recordada.

- **En directo**: las llamadas que está atendiendo la asistente. Al tocar una ves lo que dice cada uno,
  palabra a palabra, y lo que va apuntando.
  - **🎧 Escuchar**: oyes la llamada en el móvil (ponte cascos).
  - **🎙 Mantén pulsado y dale una indicación**: hablas, sueltas, y le llega a la asistente. Quien
    llama no la oye. La sigue en su siguiente respuesta; con **Que actúe ya**, corta lo que estaba
    diciendo y actúa en ese momento. También se puede escribir.
  - **📞 Pásamela**: la asistente se despide en una frase y te suena el móvil (`miTelefono`).
  - **Colgar**: se despide con educación y cuelga.
  - **Guardar como regla**: lo que le has indicado queda como regla para ese número la próxima vez.
- **Contactos**: las reglas de cada número (también se pueden dictar con la voz).
- **Recientes**: las últimas llamadas con su resumen, y un botón para poner regla a ese número.

Dictar usa el reconocimiento de voz del navegador (Chrome en Android, Safari en iPhone). Mientras
mantienes pulsado, el sonido de la llamada se silencia para que no se cuele en el micrófono.

## Ponerla a coger el teléfono

1. **Servidor**: cualquier alojamiento que mantenga conexiones WebSocket abiertas (Render, Railway,
   Fly.io, un VPS...). Hay `Dockerfile`. Variables: `ANTHROPIC_API_KEY`, `TWILIO_AUTH_TOKEN` y
   `URL_PUBLICA` (su dirección `https://`); opcionales en `.env.example`. `GET /salud` responde `ok`.
2. **Twilio**: comprar un número (con voz) y en *Voice Configuration → A call comes in* poner
   *Webhook* `https://<URL_PUBLICA>/twilio/llamada` (POST). Ese número va en `telefonos` de la ficha.
   Para conservar el número de siempre de la empresa, desviar las llamadas a este (todas, o sólo
   cuando no se contesta / fuera de horario).
3. **Supabase** (recomendado): ejecutar `supabase/tablas.sql` y poner `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY`. Las llamadas y lo apuntado quedan en `telefonista_registros` (con una
   columna `atendido` para marcar lo ya resuelto) y las reglas de cada número en `telefonista_contactos`.
   Sin Supabase se guarda en `datos/`, que se pierde si el alojamiento borra el disco.
4. **Panel**: poner `PANEL_CLAVE`.

Seguridad: el servidor sólo atiende peticiones firmadas por Twilio (`X-Twilio-Signature`) y los
WebSocket de Twilio exigen una firma de un solo uso por llamada. El panel pide la clave. Sólo pasa
llamadas a los números de la ficha. Las llamadas que están sonando en tu móvil se recuerdan en memoria:
el servidor tiene que ser una sola instancia.

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
- Si vas a escuchar o dirigir llamadas desde el panel, dilo también en el saludo o en la política de
  privacidad ("esta llamada puede ser atendida y supervisada por nuestro equipo").
- No se graba el audio (el panel sólo lo retransmite en directo), pero sí se guarda el texto de la conversación y los datos de contacto: la
  política de privacidad de la empresa debe mencionarlo, y conviene un aviso breve en el saludo o una
  opción para oír la política. Se pueden borrar registros en `telefonista_registros` cuando se pida.

## Archivos

- `src/servidor.ts`: servidor HTTP y WebSocket para Twilio (y el filtro de quién va a quién).
- `src/centralita.ts`, `src/panel.html`: el panel en directo.
- `src/agente.ts`: la conversación (turnos, interrupciones, indicaciones, herramientas, fallo de la IA, resumen).
- `src/instrucciones.ts`: cómo atiende, vende y resuelve.
- `src/herramientas.ts`: cambiar de idioma, apuntar cliente, recado, incidencia, cita, pasar y colgar.
- `src/empresas.ts`, `src/registro.ts`, `src/twilio.ts`: fichas, dónde se apunta y lo propio de Twilio.
- `src/probar.ts`: la prueba por escrito. `pruebas/`: pruebas automáticas.
