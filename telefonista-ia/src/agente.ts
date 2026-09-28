// Una llamada con la telefonista. No sabe nada de Twilio: recibe lo que dice quien llama y habla por
// un Canal (Twilio en servidor.ts, la terminal en probar.ts).
//
// Lo delicado es el teléfono: la respuesta se va diciendo mientras Claude la escribe, quien llama
// puede interrumpir en cualquier momento, y el historial que se manda a Claude tiene que seguir
// siendo válido (sólo se añade al final, nunca se reescribe lo anterior).
import type Anthropic from "@anthropic-ai/sdk";
import type { Ficha } from "./empresas.ts";
import { herramientas, ejecutar, type Contexto, type Fin } from "./herramientas.ts";
import { instruccionesEmpresa, datosLlamada, type Anterior } from "./instrucciones.ts";
import { avisar, type Registro } from "./registro.ts";

type Mensaje = Anthropic.Beta.BetaMessageParam;
type Respuesta = Anthropic.Beta.BetaMessage;

// Lo único que se usa del cliente de Anthropic; en las pruebas se sustituye por uno de mentira.
export interface Claude {
  stream(p: Anthropic.Beta.MessageCreateParamsNonStreaming, o: { signal: AbortSignal }): {
    on(evento: "text", f: (delta: string) => void): unknown;
    finalMessage(): Promise<Respuesta>;
  };
  create(p: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Respuesta>;
}

export interface Canal {
  decir(texto: string, ultimo: boolean): void; // trozos de la respuesta, según llegan
  cambiarIdioma(codigo: string): void;
  terminar(fin: Fin, ultimaFrase: string): void; // colgar o pasar, cuando acabe de oírse ultimaFrase
}

export const MODELO = process.env.MODELO || "claude-opus-5-5";
// Al teléfono manda la rapidez: esfuerzo bajo por defecto. "medium" piensa más antes de hablar.
const ESFUERZO = (process.env.ESFUERZO || "low") as "low" | "medium" | "high";
const MAX_VUELTAS = 8; // herramienta -> respuesta -> herramienta... dentro de un mismo turno

export type Opciones = {
  claude: Claude;
  ficha: Ficha;
  llamada: string;
  desde: string;
  registro: Registro;
  canal: Canal;
  anteriores?: Anterior[];
  ahora?: Date;
};

export class Conversacion {
  readonly historial: Mensaje[] = [];
  readonly transcripcion: { quien: "cliente" | "asistente"; texto: string }[] = [];
  private o: Opciones;
  private ctx: Contexto;
  private sistema: Anthropic.Beta.BetaTextBlockParam[];
  private tools: Anthropic.Beta.BetaTool[];
  private cola: Promise<void> = Promise.resolve();
  private enCurso: AbortController | null = null;
  private oido: string | null = null; // lo que llegó a oír antes de interrumpir
  private cortar = false; // le han interrumpido durante este turno
  private ultimoDicho = "";
  private nota = ""; // aviso para Claude que va delante de lo siguiente que diga el cliente
  private terminada = false;
  private inicio = new Date();

  constructor(o: Opciones) {
    this.o = o;
    this.ctx = {
      ficha: o.ficha, llamada: o.llamada, desde: o.desde, registro: o.registro,
      idioma: o.ficha.idiomaPrincipal, fin: null,
      cambiarIdioma: (codigo) => { this.ctx.idioma = codigo; o.canal.cambiarIdioma(codigo); },
    };
    this.sistema = [
      { type: "text", text: instruccionesEmpresa(o.ficha), cache_control: { type: "ephemeral" } },
      { type: "text", text: datosLlamada(o.ficha, o.desde, o.ahora ?? new Date(), o.anteriores ?? []) },
    ];
    this.tools = herramientas(o.ficha);
    // El saludo lo dice Twilio al descolgar; así Claude sabe que ya se ha dicho.
    this.transcripcion.push({ quien: "asistente", texto: o.ficha.saludo });
  }

  get idioma() { return this.ctx.idioma; }

  // Lo que ha dicho quien llama (ya pasado a texto). Los turnos van en fila, uno detrás de otro.
  escuchar(texto: string) {
    if (this.terminada || !texto.trim()) return;
    this.cola = this.cola.then(() => this.turno(texto)).catch((e) => this.averia(e));
  }

  // Hasta que acabe de responder a lo último que se le ha dicho.
  esperar() { return this.cola; }

  // Quien llama ha hablado encima: se corta lo que se estaba diciendo.
  interrumpir(loQueOyo: string) {
    this.oido = loQueOyo;
    this.cortar = true;
    this.enCurso?.abort();
  }

  // Ha colgado (o se ha pasado la llamada): se espera al turno en marcha y se guarda el resumen.
  async cerrar() {
    this.terminada = true;
    this.enCurso?.abort();
    await this.cola;
    if (!this.transcripcion.some((t) => t.quien === "cliente")) return null;
    // Si no sale el resumen (la IA caída, por ejemplo), la llamada se apunta igual, con lo hablado.
    const resumen = await this.resumir().catch((e) => {
      console.error(`[${this.o.llamada}] Sin resumen:`, e instanceof Error ? e.message : e);
      return { resumen: "(No se pudo resumir: ver la transcripción.)" } as Record<string, unknown>;
    });
    const apunte = {
      empresa: this.o.ficha.id, llamada: this.o.llamada, tipo: "llamada" as const, telefono: this.o.desde,
      datos: {
        ...resumen, duracion_segundos: Math.round((Date.now() - this.inicio.getTime()) / 1000), fin: this.ctx.fin,
        transcripcion: this.transcripcion,
      },
    };
    try {
      await this.o.registro.guardar(apunte);
    } catch (e) {
      console.error(`[${this.o.llamada}] No se pudo guardar la llamada:`, e);
    }
    void avisar(this.o.ficha.avisos?.webhook, { ...apunte, empresaNombre: this.o.ficha.nombre });
    return resumen;
  }

  private parametros(): Anthropic.Beta.MessageCreateParamsNonStreaming {
    return {
      model: MODELO,
      max_tokens: 8000,
      output_config: { effort: ESFUERZO },
      // Si un filtro de seguridad rechaza la petición, la API la repite con el modelo de respaldo que
      // recomienda Anthropic en vez de devolver un rechazo: al teléfono no puede quedarse callada.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: this.sistema,
      tools: this.tools,
      messages: this.historial,
    };
  }

  private async turno(texto: string) {
    if (this.terminada) return;
    this.transcripcion.push({ quien: "cliente", texto });
    let prefijo = this.nota;
    this.nota = "";
    if (this.oido !== null) {
      // Terminó de escribir la respuesta pero le cortaron mientras se oía.
      if (this.oido.trim() !== this.ultimoDicho.trim()) {
        prefijo += `[Te ha interrumpido. De tu respuesta anterior sólo llegó a oír: «${this.oido.trim()}»]\n`;
      }
      this.oido = null;
    }
    this.historial.push({ role: "user", content: prefijo + texto });
    this.ultimoDicho = "";
    this.cortar = false;

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      // Interrumpido mientras se ejecutaban herramientas: no se sigue hablando encima.
      if (this.cortar) return this.cortado("");
      const ctrl = new AbortController();
      this.enCurso = ctrl;
      let dicho = "";
      let msg: Respuesta;
      try {
        const stream = this.o.claude.stream(this.parametros(), { signal: ctrl.signal });
        stream.on("text", (d) => {
          if (ctrl.signal.aborted) return;
          dicho += d;
          this.o.canal.decir(d, false);
        });
        msg = await stream.finalMessage();
      } catch (e) {
        if (ctrl.signal.aborted) return this.cortado(dicho);
        throw e;
      } finally {
        this.enCurso = null;
      }
      if (dicho) this.o.canal.decir("", true);
      this.ultimoDicho += dicho;

      if (msg.stop_reason === "refusal") {
        // Ni el modelo de respaldo ha querido: no se guarda la respuesta rechazada.
        const frase = "Perdone, con eso no puedo ayudarle. ¿Quiere que le tome un recado para que le llame una persona?";
        this.o.canal.decir(frase, true);
        this.historial.push({ role: "assistant", content: frase });
        this.transcripcion.push({ quien: "asistente", texto: frase });
        return;
      }
      this.historial.push({ role: "assistant", content: msg.content });
      if (dicho.trim()) this.transcripcion.push({ quien: "asistente", texto: dicho });

      const usos = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!usos.length) break;
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(usos.map(async (u) => {
        if (msg.stop_reason !== "tool_use") {
          return { type: "tool_result" as const, tool_use_id: u.id, content: "La respuesta se cortó antes de terminar; vuelve a intentarlo.", is_error: true };
        }
        try {
          return { type: "tool_result" as const, tool_use_id: u.id, content: await ejecutar(u.name, u.input as Record<string, unknown>, this.ctx) };
        } catch (e) {
          console.error(`[${this.o.llamada}] ${u.name}:`, e);
          return { type: "tool_result" as const, tool_use_id: u.id, content: `No se ha podido hacer: ${e}`, is_error: true };
        }
      }));
      this.historial.push({ role: "user", content: resultados });
    }

    if (this.ctx.fin) {
      this.terminada = true;
      this.o.canal.terminar(this.ctx.fin, this.ultimoDicho);
    }
  }

  // Le han cortado a mitad de respuesta: se apunta sólo lo que llegó a decir, como texto, para que
  // Claude sepa hasta dónde se oyó. Si iba a colgar o pasar la llamada, ya no.
  private cortado(dicho: string) {
    const oido = (this.oido ?? dicho).trim();
    this.oido = null;
    if (oido) {
      const texto = oido.replace(/[.…]+$/, "") + "…";
      this.historial.push({ role: "assistant", content: texto });
      this.transcripcion.push({ quien: "asistente", texto });
    }
    this.ultimoDicho = oido;
    if (this.ctx.fin) {
      this.nota += "[Te ha interrumpido antes de colgar o pasar la llamada, así que la llamada sigue contigo.]\n";
      this.ctx.fin = null;
    }
  }

  // Si falla la IA (caída, sin saldo...), no se deja a nadie colgado del teléfono: se le pasa con
  // una persona si hay a quién, y si no se le pide que vuelva a llamar.
  private averia(e: unknown) {
    console.error(`[${this.o.llamada}] Error:`, e instanceof Error ? e.message : e);
    if (this.terminada) return;
    this.terminada = true;
    const [destino, d] = Object.entries(this.o.ficha.transferencias)[0] ?? [];
    const frase = d
      ? "Perdone, estoy teniendo un problema técnico. Le paso ahora mismo con un compañero."
      : "Perdone, estoy teniendo un problema técnico. Por favor, vuelva a llamar en unos minutos. Disculpe las molestias.";
    this.o.canal.decir(frase, true);
    this.transcripcion.push({ quien: "asistente", texto: frase });
    this.ctx.fin = d ? { tipo: "pasar", destino, numero: d.numero, motivo: "Fallo técnico de la asistente" } : { tipo: "colgar", motivo: "Fallo técnico" };
    this.o.canal.terminar(this.ctx.fin, frase);
  }

  private async resumir() {
    const texto = this.transcripcion.map((t) => `${t.quien === "cliente" ? "CLIENTE" : "ASISTENTE"}: ${t.texto}`).join("\n");
    const cadena = (description: string) => ({ type: "string", description });
    const msg = await this.o.claude.create({
      model: MODELO,
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["venta", "atencion_cliente", "informacion", "recado", "incidencia", "cita", "otro"] },
              nombre_cliente: cadena("Vacío si no lo dijo."),
              idioma: cadena("Idioma en que habló el cliente."),
              motivo: cadena("Por qué llamó, en una frase."),
              resultado: cadena("Cómo acabó la llamada, en una frase."),
              pendiente: cadena("Qué tiene que hacer el equipo ahora. Vacío si nada."),
              sentimiento: { type: "string", enum: ["contento", "neutro", "molesto"] },
              oportunidad_venta: { type: "string", enum: ["alta", "media", "baja", "ninguna"] },
              resumen: cadena("Resumen para el equipo en tres o cuatro frases."),
            },
            required: ["tipo", "nombre_cliente", "idioma", "motivo", "resultado", "pendiente", "sentimiento", "oportunidad_venta", "resumen"],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: "user",
        content: `Resume en español, para el equipo de ${this.o.ficha.nombre}, esta llamada que ha atendido su asistente telefónica. La transcripción viene del reconocimiento de voz y puede tener errores.\n\n<transcripcion>\n${texto}\n</transcripcion>`,
      }],
    });
    const json = msg.content.find((b) => b.type === "text");
    return JSON.parse(json && json.type === "text" ? json.text : "{}") as Record<string, unknown>;
  }
}
