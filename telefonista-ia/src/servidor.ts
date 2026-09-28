// El servidor al que llama Twilio:
//   POST /twilio/llamada  -> entra una llamada: saludo y conexión con el WebSocket (ConversationRelay)
//   WS   /twilio/relay    -> la conversación: llega lo que dice quien llama, sale lo que dice la telefonista
//   POST /twilio/fin      -> acabó la conversación: pasar la llamada a una persona o colgar
//   GET  /salud           -> para que el alojamiento sepa que está vivo
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer, type WebSocket } from "ws";
import { cargarEmpresas, empresaDelNumero, type Ficha } from "./empresas.ts";
import { Conversacion, MODELO, type Canal, type Claude } from "./agente.ts";
import { abrirRegistro } from "./registro.ts";
import { avisoYColgar, conectar, despues, firmaLlamada, firmaTwilio, iguales, twiml } from "./twilio.ts";
import type { Fin } from "./herramientas.ts";

const PUERTO = Number(process.env.PORT || process.env.PUERTO || 8080);
const URL_PUBLICA = (process.env.URL_PUBLICA || "").replace(/\/$/, "");
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const SIN_FIRMA = process.env.PERMITIR_SIN_FIRMA === "1"; // sólo para pruebas locales

if (!URL_PUBLICA.startsWith("https://")) throw new Error("Falta URL_PUBLICA (https://...): la dirección pública de este servidor");
if (!AUTH_TOKEN && !SIN_FIRMA) throw new Error("Falta TWILIO_AUTH_TOKEN (o PERMITIR_SIN_FIRMA=1 para pruebas)");
const SECRETO = AUTH_TOKEN || "pruebas-sin-firma";

const empresas = cargarEmpresas(process.env.EMPRESAS_DIR || "empresas");
const registro = abrirRegistro();
const anthropic = new Anthropic();
const claude: Claude = {
  stream: (p, o) => anthropic.beta.messages.stream(p, o),
  create: (p) => anthropic.beta.messages.create(p),
};
console.log(`Empresas: ${empresas.map((e) => `${e.id} (${e.telefonos.join(", ")})`).join("; ") || "ninguna"}`);

async function formulario(req: IncomingMessage) {
  let cuerpo = "";
  for await (const trozo of req) {
    cuerpo += trozo;
    if (cuerpo.length > 100_000) throw new Error("Cuerpo demasiado grande");
  }
  return Object.fromEntries(new URLSearchParams(cuerpo)) as Record<string, string>;
}

const deTwilio = (req: IncomingMessage, params: Record<string, string>) =>
  SIN_FIRMA || iguales(String(req.headers["x-twilio-signature"] ?? ""), firmaTwilio(AUTH_TOKEN, URL_PUBLICA + req.url, params));

const xml = (res: ServerResponse, cuerpo: string) => res.writeHead(200, { "Content-Type": "text/xml" }).end(cuerpo);

const servidor = createServer(async (req, res) => {
  try {
    const ruta = new URL(req.url ?? "/", "http://x").pathname;
    if (req.method === "GET" && ruta === "/salud") return res.writeHead(200).end("ok");
    if (req.method !== "POST" || !["/twilio/llamada", "/twilio/fin"].includes(ruta)) return res.writeHead(404).end();
    const p = await formulario(req);
    if (!deTwilio(req, p)) return res.writeHead(403).end();

    if (ruta === "/twilio/llamada") {
      const ficha = empresaDelNumero(empresas, p.To ?? "");
      if (!ficha) {
        console.error(`Llamada a ${p.To}: ninguna empresa tiene ese número`);
        return xml(res, avisoYColgar("Lo sentimos, este número no está disponible en este momento."));
      }
      console.log(`[${p.CallSid}] ${ficha.id}: llamada de ${p.From || "número oculto"}`);
      return xml(res, conectar(ficha, {
        relay: URL_PUBLICA.replace(/^https:/, "wss:") + "/twilio/relay",
        fin: URL_PUBLICA + "/twilio/fin",
        parametros: { empresa: ficha.id, firma: firmaLlamada(SECRETO, p.CallSid ?? "") },
      }));
    }

    // /twilio/fin: HandoffData es lo que mandamos en el mensaje "end" del relay.
    let fin: Fin | null = null;
    try { fin = p.HandoffData ? JSON.parse(p.HandoffData) : null; } catch { /* sin datos: se cuelga */ }
    const ficha = empresaDelNumero(empresas, p.To ?? "");
    const permitido = fin?.tipo === "pasar" && ficha && Object.values(ficha.transferencias).some((d) => d.numero === fin.numero);
    if (permitido && fin?.tipo === "pasar") {
      console.log(`[${p.CallSid}] Se pasa a ${fin.destino}`);
      return xml(res, despues(fin.numero));
    }
    return xml(res, despues());
  } catch (e) {
    console.error("Error en la petición:", e);
    if (!res.headersSent) xml(res, twiml("<Hangup/>"));
  }
});

// Lo que tarda en oírse una frase, para no cortar la despedida al colgar o pasar la llamada.
const tardaEnDecirse = (frase: string) => Math.min(20_000, 1200 + frase.length * 70);

function atender(ws: WebSocket) {
  let conv: Conversacion | null = null;
  let llamada = "";
  const enviar = (m: Record<string, unknown>) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

  ws.on("message", async (bruto) => {
    let m: Record<string, any>;
    try { m = JSON.parse(String(bruto)); } catch { return; }

    if (m.type === "setup") {
      llamada = String(m.callSid ?? "");
      const ficha: Ficha | undefined = empresas.find((e) => e.id === m.customParameters?.empresa);
      if (!ficha || !iguales(String(m.customParameters?.firma ?? ""), firmaLlamada(SECRETO, llamada))) {
        console.error(`[${llamada}] Relay rechazado: firma o empresa no válidas`);
        return ws.close();
      }
      const desde = String(m.from ?? "");
      const canal: Canal = {
        decir: (token, last) => enviar({ type: "text", token, last }),
        cambiarIdioma: (codigo) => {
          console.log(`[${llamada}] Idioma: ${codigo}`);
          enviar({ type: "language", ttsLanguage: codigo, ...(ficha.transcripcion.multilingue ? {} : { transcriptionLanguage: codigo }) });
        },
        terminar: (fin, frase) => setTimeout(() => enviar({ type: "end", handoffData: JSON.stringify(fin) }), tardaEnDecirse(frase)),
      };
      const anteriores = await registro.anteriores(ficha.id, desde, 3).catch((e) => {
        console.error(`[${llamada}] No se pudo leer el historial:`, e);
        return [];
      });
      conv = new Conversacion({ claude, ficha, llamada, desde, registro, canal, anteriores });
      return;
    }
    if (!conv) return;
    if (m.type === "prompt" && m.last !== false) conv.escuchar(String(m.voicePrompt ?? ""));
    else if (m.type === "interrupt") conv.interrumpir(String(m.utteranceUntilInterrupt ?? ""));
    else if (m.type === "dtmf") conv.escuchar(`[Ha pulsado la tecla ${m.digit}]`);
    else if (m.type === "error") console.error(`[${llamada}] Twilio:`, m.description);
  });

  ws.on("close", async () => {
    if (!conv) return;
    const resumen = await conv.cerrar();
    console.log(`[${llamada}] Fin de la llamada${resumen ? `: ${resumen.resumen}` : ""}`);
  });
}

const wss = new WebSocketServer({ noServer: true });
servidor.on("upgrade", (req, socket, cabeza) => {
  if (new URL(req.url ?? "/", "http://x").pathname !== "/twilio/relay") return socket.destroy();
  wss.handleUpgrade(req, socket, cabeza, atender);
});

servidor.listen(PUERTO, () => console.log(`Telefonista (${MODELO}) escuchando en el puerto ${PUERTO} — ${URL_PUBLICA}`));
