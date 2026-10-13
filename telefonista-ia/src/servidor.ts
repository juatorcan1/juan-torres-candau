// El servidor al que llama Twilio:
//   POST /twilio/llamada   -> entra una llamada: según quién llame, a la telefonista o antes a tu móvil
//   POST /twilio/susurro   -> descuelgas tu móvil: oyes quién es y pulsas 1 (hablas tú) o 2 (la telefonista)
//   POST /twilio/decision  -> la tecla que has pulsado
//   POST /twilio/tras-marcar -> terminó de sonar tu móvil: si no has hablado tú, a la telefonista
//   WS   /twilio/relay     -> la conversación: llega lo que dice quien llama, sale lo que dice la telefonista
//   WS   /twilio/audio     -> copia del sonido de la llamada, para oírla desde el panel
//   POST /twilio/fin       -> acabó la conversación: pasar la llamada a una persona o colgar
//   GET  /panel, WS /panel/ws -> el panel en directo (con PANEL_CLAVE)
//   GET  /salud            -> para que el alojamiento sepa que está vivo
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { WebSocketServer, type WebSocket } from "ws";
import { cargarEmpresas, empresaDelNumero, soloCifras, type Accion, type Ficha } from "./empresas.ts";
import { Conversacion, MODELO, type Canal, type Claude } from "./agente.ts";
import { abrirRegistro, type Regla } from "./registro.ts";
import { Centralita } from "./centralita.ts";
import {
  avisoYColgar, conectar, despues, firmaLlamada, firmaTwilio, iguales, llamarme, susurro, twiml,
} from "./twilio.ts";
import type { Fin } from "./herramientas.ts";

const PUERTO = Number(process.env.PORT || process.env.PUERTO || 8080);
const URL_PUBLICA = (process.env.URL_PUBLICA || "").replace(/\/$/, "");
const WSS_PUBLICA = URL_PUBLICA.replace(/^https:/, "wss:");
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const SIN_FIRMA = process.env.PERMITIR_SIN_FIRMA === "1"; // sólo para pruebas locales
const PANEL_CLAVE = process.env.PANEL_CLAVE || "";

if (!URL_PUBLICA.startsWith("https://")) throw new Error("Falta URL_PUBLICA (https://...): la dirección pública de este servidor");
if (!AUTH_TOKEN && !SIN_FIRMA) throw new Error("Falta TWILIO_AUTH_TOKEN (o PERMITIR_SIN_FIRMA=1 para pruebas)");
if (PANEL_CLAVE && PANEL_CLAVE.length < 10) throw new Error("PANEL_CLAVE tiene que tener al menos 10 caracteres");
const SECRETO = AUTH_TOKEN || "pruebas-sin-firma";

const empresas = cargarEmpresas(process.env.EMPRESAS_DIR || "empresas");
const registro = abrirRegistro();
const centralita = PANEL_CLAVE ? new Centralita(empresas, registro, PANEL_CLAVE) : null;
const panelHtml = readFileSync(new URL("./panel.html", import.meta.url), "utf8");
const anthropic = new Anthropic();
const claude: Claude = {
  stream: (p, o) => anthropic.beta.messages.stream(p, o),
  create: (p) => anthropic.beta.messages.create(p),
};
console.log(`Empresas: ${empresas.map((e) => `${e.id} (${e.telefonos.join(", ")})`).join("; ") || "ninguna"}`);
console.log(centralita ? `Panel en directo: ${URL_PUBLICA}/panel` : "Panel en directo desactivado (falta PANEL_CLAVE)");

// Llamadas que están sonando en tu móvil: quién es y qué has decidido. Se borran al terminar de sonar.
type EnEspera = { ficha: Ficha; desde: string; quien: string; modo: "pasar" | "preguntar"; decision: "hablar" | "ia" | null };
const enEspera = new Map<string, EnEspera>();

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

// Qué hacer con esta llamada: lo que diga su regla o, si no tiene, si el número es conocido o no.
async function decidir(ficha: Ficha, desde: string): Promise<{ accion: Accion; regla: Regla | null }> {
  const regla = await registro.regla(ficha.id, desde).catch(() => null);
  const f = ficha.filtro;
  if (!f) return { accion: "ia", regla };
  if (regla) return { accion: regla.accion, regla };
  if (!soloCifras(desde)) return { accion: f.desconocidos, regla };
  const conocido = (await registro.anteriores(ficha.id, desde, 1).catch(() => [])).length > 0;
  return { accion: conocido ? f.conocidos : f.desconocidos, regla };
}

// A la telefonista, con la escucha para el panel si está activado.
const aLaTelefonista = (ficha: Ficha, callSid: string, nota = "") =>
  conectar(ficha, {
    relay: WSS_PUBLICA + "/twilio/relay",
    fin: URL_PUBLICA + "/twilio/fin",
    audio: centralita ? WSS_PUBLICA + "/twilio/audio" : undefined,
    parametros: { empresa: ficha.id, firma: firmaLlamada(SECRETO, callSid), ...(nota ? { nota } : {}) },
  });

// Cifras de un teléfono dichas de dos en dos, para que se entiendan en el susurro.
const deletrear = (numero: string) => soloCifras(numero).slice(-9).replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, "$1, $2, $3, $4");

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const ruta = url.pathname;
    if (req.method === "GET" && ruta === "/salud") return res.writeHead(200).end("ok");
    if (req.method === "GET" && ruta === "/panel" && centralita) {
      return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY" }).end(panelHtml);
    }
    if (req.method !== "POST" || !ruta.startsWith("/twilio/")) return res.writeHead(404).end();
    const p = await formulario(req);
    if (!deTwilio(req, p)) return res.writeHead(403).end();
    const padre = url.searchParams.get("padre") ?? "";

    if (ruta === "/twilio/llamada") {
      const ficha = empresaDelNumero(empresas, p.To ?? "");
      if (!ficha) {
        console.error(`Llamada a ${p.To}: ninguna empresa tiene ese número`);
        return xml(res, avisoYColgar("Lo sentimos, este número no está disponible en este momento."));
      }
      const desde = p.From ?? "";
      const { accion, regla } = await decidir(ficha, desde);
      console.log(`[${p.CallSid}] ${ficha.id}: llamada de ${desde || "número oculto"}${regla ? ` (${regla.nombre})` : ""} -> ${accion}`);
      if (accion === "ia" || !ficha.filtro) return xml(res, aLaTelefonista(ficha, p.CallSid ?? ""));
      const quien = regla?.nombre || (soloCifras(desde) ? `el ${deletrear(desde)}` : "un número oculto");
      enEspera.set(p.CallSid ?? "", { ficha, desde, quien, modo: accion, decision: null });
      setTimeout(() => enEspera.delete(p.CallSid ?? ""), 10 * 60_000);
      const q = `?padre=${encodeURIComponent(p.CallSid ?? "")}`;
      return xml(res, llamarme({
        numero: ficha.filtro.miTelefono,
        segundos: ficha.filtro.segundosParaDecidir,
        trasMarcar: URL_PUBLICA + "/twilio/tras-marcar" + q,
        susurro: accion === "preguntar" ? URL_PUBLICA + "/twilio/susurro" + q : undefined,
      }));
    }

    if (ruta === "/twilio/susurro") {
      const e = enEspera.get(padre);
      if (!e) return xml(res, twiml("<Hangup/>"));
      e.decision = "ia"; // si no pulsas nada, se la queda la telefonista
      return xml(res, susurro(e.quien, URL_PUBLICA + "/twilio/decision?padre=" + encodeURIComponent(padre)));
    }

    if (ruta === "/twilio/decision") {
      const e = enEspera.get(padre);
      if (e && p.Digits === "1") {
        e.decision = "hablar";
        return xml(res, twiml("")); // se unen las dos llamadas
      }
      return xml(res, twiml("<Hangup/>"));
    }

    if (ruta === "/twilio/tras-marcar") {
      const e = enEspera.get(padre);
      enEspera.delete(padre);
      const ficha = e?.ficha ?? empresaDelNumero(empresas, p.To ?? "");
      if (!ficha) return xml(res, twiml("<Hangup/>"));
      const hablaste = p.DialCallStatus === "completed" && (e?.modo === "pasar" || e?.decision === "hablar");
      if (hablaste) return xml(res, twiml("<Hangup/>"));
      const nota = e?.decision === "ia"
        ? "El responsable ha preferido que atiendas tú esta llamada. El cliente ha esperado unos segundos oyendo tonos: si viene al caso, discúlpate brevemente por la espera."
        : "Se ha intentado pasar la llamada al responsable, pero no ha podido cogerla. El cliente ha esperado unos segundos oyendo tonos: discúlpate brevemente por la espera.";
      console.log(`[${padre}] ${e?.decision === "ia" ? "Prefieres que la atienda la telefonista" : "No la has cogido"} -> telefonista`);
      return xml(res, aLaTelefonista(ficha, padre || p.CallSid || "", nota));
    }

    if (ruta === "/twilio/fin") {
      // HandoffData es lo que mandamos en el mensaje "end" del relay.
      let fin: Fin | null = null;
      try { fin = p.HandoffData ? JSON.parse(p.HandoffData) : null; } catch { /* sin datos: se cuelga */ }
      const ficha = empresaDelNumero(empresas, p.To ?? "");
      const permitidos = ficha ? [...Object.values(ficha.transferencias).map((d) => d.numero), ficha.filtro?.miTelefono] : [];
      if (fin?.tipo === "pasar" && permitidos.includes(fin.numero)) {
        console.log(`[${p.CallSid}] Se pasa a ${fin.destino}`);
        return xml(res, despues(fin.numero));
      }
      return xml(res, despues());
    }
    return res.writeHead(404).end();
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
      const [anteriores, regla] = await Promise.all([
        registro.anteriores(ficha.id, desde, 3).catch((e) => { console.error(`[${llamada}] Historial:`, e); return []; }),
        registro.regla(ficha.id, desde).catch(() => null),
      ]);
      conv = new Conversacion({
        claude, ficha, llamada, desde, registro, canal, anteriores, regla,
        nota: String(m.customParameters?.nota ?? ""),
        responsable: ficha.filtro?.miTelefono,
        alEvento: centralita ? (e) => centralita.evento(llamada, e) : undefined,
      });
      centralita?.alta({ llamada, ficha, desde, nombre: regla?.nombre ?? "", conv });
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
    centralita?.baja(llamada);
    const resumen = await conv.cerrar();
    console.log(`[${llamada}] Fin de la llamada${resumen ? `: ${resumen.resumen}` : ""}`);
  });
}

// Copia del sonido de la llamada (Media Streams de Twilio) para quien la escuche en el panel.
function escuchar(ws: WebSocket) {
  let llamada = "";
  ws.on("message", (bruto) => {
    let m: Record<string, any>;
    try { m = JSON.parse(String(bruto)); } catch { return; }
    if (m.event === "start") {
      const sid = String(m.start?.callSid ?? "");
      if (!iguales(String(m.start?.customParameters?.firma ?? ""), firmaLlamada(SECRETO, sid))) return ws.close();
      llamada = sid;
    } else if (m.event === "media" && llamada) {
      centralita?.audio(llamada, m.media?.track === "inbound" ? "in" : "out", String(m.media?.payload ?? ""));
    }
  });
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
servidor.on("upgrade", (req, socket, cabeza) => {
  const ruta = new URL(req.url ?? "/", "http://x").pathname;
  const atiende = ruta === "/twilio/relay" ? atender
    : ruta === "/twilio/audio" && centralita ? escuchar
    : ruta === "/panel/ws" && centralita ? (ws: WebSocket) => centralita.conectarPanel(ws)
    : null;
  if (!atiende) return socket.destroy();
  wss.handleUpgrade(req, socket, cabeza, atiende);
});

servidor.listen(PUERTO, () => console.log(`Telefonista (${MODELO}) escuchando en el puerto ${PUERTO} — ${URL_PUBLICA}`));
