// Lo propio de Twilio: la respuesta TwiML que conecta la llamada con nuestro servidor (ConversationRelay:
// Twilio pasa la voz a texto y el texto a voz) y la comprobación de que las peticiones vienen de Twilio.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Ficha } from "./empresas.ts";

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const atributos = (a: Record<string, string | undefined>) =>
  Object.entries(a).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => ` ${k}="${escapar(v!)}"`).join("");

export const twiml = (cuerpo: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${cuerpo}</Response>`;

const parametrosXml = (p: Record<string, string>) =>
  Object.entries(p).map(([name, value]) => `<Parameter${atributos({ name, value })}/>`).join("");

// Descolgar: saludo y, a partir de ahí, la conversación va por el WebSocket de relay. Con audio, además,
// Twilio manda una copia del sonido de la llamada (lo que dice cada uno) para escucharla desde el panel.
export function conectar(f: Ficha, o: { relay: string; fin: string; parametros: Record<string, string>; audio?: string }) {
  const principal = f.idiomas.find((i) => i.codigo === f.idiomaPrincipal)!;
  const t = f.transcripcion;
  const relay = atributos({
    url: o.relay,
    welcomeGreeting: f.saludo,
    welcomeGreetingInterruptible: "any",
    interruptible: "any",
    dtmfDetection: "true",
    ttsLanguage: f.idiomaPrincipal,
    ttsProvider: principal.proveedorVoz,
    voice: principal.voz,
    // Multilingüe: entiende cualquiera de sus idiomas aunque se cambie a mitad de frase, sin esperar a
    // que la IA cambie de idioma. Si no, se entiende el idioma en que se está hablando.
    transcriptionLanguage: t.multilingue ? "multi" : f.idiomaPrincipal,
    transcriptionProvider: t.proveedor,
    speechModel: t.modelo,
  });
  const idiomas = f.idiomas.map((i) =>
    `<Language${atributos({ code: i.codigo, ttsProvider: i.proveedorVoz, voice: i.voz })}/>`
  ).join("");
  const escucha = o.audio
    ? `<Start><Stream${atributos({ url: o.audio, track: "both_tracks" })}>${parametrosXml(o.parametros)}</Stream></Start>`
    : "";
  return twiml(`${escucha}<Connect${atributos({ action: o.fin })}><ConversationRelay${relay}>${idiomas}${parametrosXml(o.parametros)}</ConversationRelay></Connect>`);
}

// Al terminar la conversación: pasar a una persona o colgar.
export const despues = (pasarA?: string) => twiml(pasarA ? `<Dial>${escapar(pasarA)}</Dial>` : "<Hangup/>");

// Llamar a tu móvil antes que a la telefonista. Con susurro, al descolgar oyes quién es y decides.
export function llamarme(o: { numero: string; segundos: number; trasMarcar: string; susurro?: string }) {
  const numero = `<Number${atributos({ url: o.susurro })}>${escapar(o.numero)}</Number>`;
  return twiml(`<Dial${atributos({ timeout: String(o.segundos), action: o.trasMarcar })}>${numero}</Dial>`);
}

// Lo que oyes tú al descolgar: quién llama y qué tecla pulsar. Si no pulsas nada, se la queda la telefonista.
export const susurro = (quien: string, decision: string) =>
  twiml(`<Gather${atributos({ numDigits: "1", timeout: "6", action: decision })}><Say language="es-ES">${escapar(
    `Te llama ${quien}. Pulsa 1 para hablar tú. Pulsa 2 para que le atienda la asistente.`,
  )}</Say></Gather><Hangup/>`);

export const avisoYColgar = (texto: string, idioma = "es-ES") =>
  twiml(`<Say${atributos({ language: idioma })}>${escapar(texto)}</Say><Hangup/>`);

// Firma de Twilio (cabecera X-Twilio-Signature): HMAC-SHA1 con el Auth Token de la URL completa
// seguida de cada parámetro del formulario, ordenados por nombre, como nombre+valor.
export function firmaTwilio(authToken: string, url: string, params: Record<string, string>) {
  const datos = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(datos, "utf8").digest("base64");
}

export const iguales = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Contraseña de un solo uso para el WebSocket: sólo quien ha recibido nuestro TwiML (Twilio) la conoce.
export const firmaLlamada = (secreto: string, callSid: string) =>
  createHmac("sha256", secreto).update(`relay:${callSid}`).digest("hex");
