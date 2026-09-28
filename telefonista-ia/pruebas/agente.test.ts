// Pruebas sin llamar a Anthropic ni a Twilio: un Claude de mentira que responde lo que le toca.
import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { cargarEmpresas, empresaDelNumero } from "../src/empresas.ts";
import { Conversacion, type Claude, type Opciones } from "../src/agente.ts";
import type { Apunte, Registro } from "../src/registro.ts";
import type { Fin } from "../src/herramientas.ts";
import { conectar, firmaLlamada } from "../src/twilio.ts";

const [ficha] = cargarEmpresas("empresas").filter((f) => f.id === "construccion-ejemplo");

type Paso = { trozos?: string[]; contenido?: unknown[]; stop?: string; sinFin?: boolean; falla?: boolean };

// Reglas de la API: la primera es del cliente y tras un mensaje de sistema sólo puede venir una respuesta.
function validar(mensajes: Anthropic.Beta.BetaMessageParam[]) {
  assert.equal(mensajes[0].role, "user");
  mensajes.forEach((m, i) => {
    if (m.role === "system") {
      assert.equal(mensajes[i - 1].role, "user", "el mensaje de sistema va tras uno del cliente");
      if (i < mensajes.length - 1) assert.equal(mensajes[i + 1].role, "assistant", "tras el de sistema, una respuesta");
    }
  });
}

function montar(guion: Paso[], alGuardar?: () => void, extra: Partial<Opciones> = {}) {
  const peticiones: Anthropic.Beta.BetaMessageParam[][] = [];
  const apuntes: Apunte[] = [];
  const dicho: string[] = [];
  const idiomas: string[] = [];
  let fin: Fin | null = null;
  const claude: Claude = {
    stream(p, { signal }) {
      peticiones.push(structuredClone(p.messages));
      validar(p.messages);
      const paso = guion.shift() ?? { trozos: ["(sin guion)"] };
      let alTexto: ((d: string) => void) | undefined;
      return {
        on(_evento, f) { alTexto = f; return this; },
        async finalMessage() {
          await Promise.resolve();
          if (paso.falla) throw new Error("API caída");
          for (const t of paso.trozos ?? []) alTexto?.(t);
          if (paso.sinFin) await new Promise((_, rechazar) => signal.addEventListener("abort", () => rechazar(new Error("abortado"))));
          const content = paso.contenido ?? [{ type: "text", text: (paso.trozos ?? []).join("") }];
          return { content, stop_reason: paso.stop ?? "end_turn" } as unknown as Anthropic.Beta.BetaMessage;
        },
      };
    },
    async create() {
      return { content: [{ type: "text", text: JSON.stringify({ resumen: "Pidió visita." }) }] } as unknown as Anthropic.Beta.BetaMessage;
    },
  };
  const registro: Registro = {
    guardar: async (a) => { apuntes.push(a); alGuardar?.(); }, anteriores: async () => [], recientes: async () => [],
    regla: async () => null, reglas: async () => [], guardarRegla: async () => {}, borrarRegla: async () => {},
  };
  const conv = new Conversacion({
    claude, ficha, llamada: "CA123", desde: "+34600111222", registro,
    canal: { decir: (t) => dicho.push(t), cambiarIdioma: (c) => idiomas.push(c), terminar: (f) => { fin = f; } },
    ...extra,
  });
  return { conv, peticiones, apuntes, dicho, idiomas, fin: () => fin };
}

const usar = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

test("responde y guarda el turno en el historial", async () => {
  const m = montar([{ trozos: ["Claro, ", "le cuento."] }]);
  m.conv.escuchar("¿Hacéis reformas de baño?");
  await m.conv.esperar();
  assert.equal(m.dicho.join(""), "Claro, le cuento.");
  assert.deepEqual(m.conv.historial.map((h) => h.role), ["user", "assistant"]);
});

test("apunta la cita con la herramienta y sigue hablando", async () => {
  const cita = { nombre: "Ana", telefono: "", email: "", motivo: "reforma de baño", cuando: "martes por la tarde", lugar: "Calle Mayor 3" };
  const m = montar([
    { trozos: ["Un momento, que lo apunto. "], contenido: [{ type: "text", text: "Un momento, que lo apunto. " }, usar("t1", "pedir_cita", cita)], stop: "tool_use" },
    { trozos: ["Listo, la oficina le confirma la visita."] },
  ]);
  m.conv.escuchar("Quiero que vengan a ver el baño");
  await m.conv.esperar();
  assert.equal(m.apuntes.length, 1);
  assert.equal(m.apuntes[0].tipo, "cita");
  assert.equal(m.apuntes[0].telefono, "+34600111222", "sin teléfono dado, se usa el de la llamada");
  const ultima = m.peticiones[1].at(-1)!;
  assert.equal(ultima.role, "user");
  assert.equal((ultima.content as { type: string }[])[0].type, "tool_result");
});

test("cambia de idioma cuando se lo pide Claude", async () => {
  const m = montar([
    { contenido: [usar("t1", "cambiar_idioma", { idioma: "en-GB" })], stop: "tool_use" },
    { trozos: ["Of course, how can I help?"] },
  ]);
  m.conv.escuchar("Hello, do you speak English?");
  await m.conv.esperar();
  assert.deepEqual(m.idiomas, ["en-GB"]);
  assert.equal(m.conv.idioma, "en-GB");
});

test("si le interrumpen, apunta sólo lo que se llegó a oír y sigue", async () => {
  const m = montar([
    { trozos: ["Le explico cómo trabajamos: primero ", "hacemos una visita"], sinFin: true },
    { trozos: ["Sí, la visita es gratis."] },
  ]);
  m.conv.escuchar("¿Cómo funciona?");
  await new Promise((r) => setTimeout(r, 10));
  m.conv.interrumpir("Le explico cómo trabajamos");
  m.conv.escuchar("¿La visita es gratis?");
  await m.conv.esperar();
  assert.deepEqual(m.conv.historial.map((h) => h.role), ["user", "assistant", "user", "assistant"]);
  assert.equal(m.conv.historial[1].content, "Le explico cómo trabajamos…");
  assert.equal(m.conv.historial[2].content, "¿La visita es gratis?");
});

test("si le cortan mientras se oye una respuesta ya escrita, se lo dice a Claude", async () => {
  const m = montar([{ trozos: ["Los baños cuestan desde seis mil quinientos euros y tardan dos semanas."] }, { trozos: ["Perdone, dígame."] }]);
  m.conv.escuchar("¿Cuánto cuesta un baño?");
  await m.conv.esperar();
  m.conv.interrumpir("Los baños cuestan");
  m.conv.escuchar("Espere, espere");
  await m.conv.esperar();
  assert.match(String(m.conv.historial[2].content), /sólo llegó a oír: «Los baños cuestan»\]\nEspere, espere$/);
});

test("cuelga después de despedirse", async () => {
  const m = montar([
    { trozos: ["Gracias por llamar, que tenga buen día."], contenido: [{ type: "text", text: "Gracias por llamar, que tenga buen día." }, usar("t1", "colgar", { motivo: "fin" })], stop: "tool_use" },
    { trozos: [] , contenido: [] },
  ]);
  m.conv.escuchar("Nada más, gracias");
  await m.conv.esperar();
  assert.equal(m.fin()?.tipo, "colgar");
  m.conv.escuchar("¿Hola?");
  await m.conv.esperar();
  assert.equal(m.conv.historial.filter((h) => h.role === "user" && typeof h.content === "string").length, 1, "colgada, ya no escucha");
});

test("si falla la IA, pasa la llamada a una persona", async () => {
  const m = montar([{ falla: true }]);
  m.conv.escuchar("Hola");
  await m.conv.esperar();
  const fin = m.fin();
  assert.equal(fin?.tipo, "pasar");
  assert.equal(fin?.tipo === "pasar" && fin.numero, ficha.transferencias.oficina.numero);
  assert.match(m.dicho.join(""), /problema técnico/);
});

test("al colgar guarda el resumen de la llamada", async () => {
  const m = montar([{ trozos: ["Dígame."] }]);
  m.conv.escuchar("Hola");
  await m.conv.esperar();
  const resumen = await m.conv.cerrar();
  assert.equal(resumen?.resumen, "Pidió visita.");
  assert.equal(m.apuntes.at(-1)?.tipo, "llamada");
});

test("cada número va a su empresa", () => {
  const todas = cargarEmpresas("empresas");
  assert.equal(empresaDelNumero(todas, "+34960000002")?.id, "construccion-ejemplo");
  assert.equal(empresaDelNumero(todas, "+34 910 00 00 01")?.id, "moda-ejemplo");
  assert.equal(empresaDelNumero(todas, "+34999999999"), undefined);
});

test("el TwiML conecta con el relay, con sus idiomas y escapado", () => {
  const xml = conectar({ ...ficha, saludo: 'Hola "vecino" & <compañía>' }, {
    relay: "wss://x.example/twilio/relay", fin: "https://x.example/twilio/fin",
    parametros: { empresa: ficha.id, firma: firmaLlamada("s", "CA1") },
  });
  assert.match(xml, /<Connect action="https:\/\/x\.example\/twilio\/fin"><ConversationRelay url="wss:\/\/x\.example\/twilio\/relay"/);
  assert.match(xml, /welcomeGreeting="Hola &quot;vecino&quot; &amp; &lt;compañía&gt;"/);
  assert.match(xml, /transcriptionLanguage="multi"/);
  assert.equal(xml.match(/<Language /g)?.length, ficha.idiomas.length);
  assert.match(xml, /<Parameter name="empresa" value="construccion-ejemplo"\/>/);
});

test("si le interrumpen mientras apunta, no sigue hablando encima", async () => {
  const recado = { nombre: "Luis", telefono: "", email: "", para: "oficina", mensaje: "Que le llamen", urgente: false };
  // Habla encima justo mientras se guarda el recado.
  const m = montar([
    { trozos: ["Se lo apunto. "], contenido: [{ type: "text", text: "Se lo apunto. " }, usar("t1", "tomar_recado", recado)], stop: "tool_use" },
    { trozos: ["Claro, dígame el otro número."] },
  ], () => {
    m.conv.interrumpir("Se lo apunto.");
    m.conv.escuchar("Mejor a otro número");
  });
  m.conv.escuchar("Que me llamen, por favor");
  await m.conv.esperar();
  await m.conv.esperar();
  assert.equal(m.apuntes.length, 1, "lo apuntado se queda apuntado");
  assert.equal(m.peticiones.length, 2, "tras apuntar no vuelve a hablar: atiende a lo nuevo");
  assert.equal(m.dicho.join(""), "Se lo apunto. Claro, dígame el otro número.");
  assert.deepEqual(m.conv.historial.map((h) => h.role), ["user", "assistant", "user", "assistant", "user", "assistant"]);
  assert.equal(m.conv.historial[3].content, "Se lo apunto…");
});


const roles = (c: Conversacion) => c.historial.map((h) => h.role);

test("las indicaciones del responsable van como mensaje de sistema antes de la siguiente respuesta", async () => {
  const m = montar([{ trozos: ["Entiendo su postura."] }]);
  m.conv.indicar("No se le paga: la obra tiene grietas sin reparar. Tono cordial.");
  m.conv.escuchar("Quiero cobrar la factura ya");
  await m.conv.esperar();
  assert.deepEqual(roles(m.conv), ["user", "system", "assistant"]);
  assert.match(String(m.conv.historial[1].content), /grietas sin reparar/);
  assert.match(String(m.conv.historial[1].content), /el cliente no las oye/);
});

test("con 'que actúe ya' corta lo que dice y responde sin esperar al cliente", async () => {
  const m = montar([
    { trozos: ["Claro, le cuento las condiciones de pago: "], sinFin: true },
    { trozos: ["Perdone, le corrijo: ese pago no procede hasta que se reparen las grietas."] },
  ]);
  m.conv.escuchar("¿Cuándo me pagáis?");
  await new Promise((r) => setTimeout(r, 10));
  m.conv.indicar("No le prometas ningún pago", true);
  await m.conv.esperar();
  assert.deepEqual(roles(m.conv), ["user", "assistant", "user", "system", "assistant"]);
  assert.match(String(m.conv.historial[2].content), /no ha dicho nada nuevo/);
  assert.match(m.dicho.join(""), /no procede/);
});

test("si le interrumpen justo después de una indicación, el historial sigue siendo válido", async () => {
  const m = montar([{ trozos: [], sinFin: true }, { trozos: ["Dígame."] }]);
  m.conv.indicar("Sé breve");
  m.conv.escuchar("Hola");
  await new Promise((r) => setTimeout(r, 10));
  m.conv.interrumpir("");
  m.conv.escuchar("¿Me oye?");
  await m.conv.esperar();
  assert.deepEqual(roles(m.conv), ["user", "system", "assistant", "user", "assistant"]);
});

test("pásamela: se despide en una frase y pasa la llamada a tu móvil", async () => {
  const m = montar([{ trozos: ["Le paso ahora mismo con el responsable."] }], undefined, { responsable: "+34699000000" });
  m.conv.pasarAlResponsable();
  await m.conv.esperar();
  const fin = m.fin();
  assert.equal(fin?.tipo, "pasar");
  assert.equal(fin?.tipo === "pasar" && fin.numero, "+34699000000");
});

test("colgar desde el panel aunque el cliente siga hablando", async () => {
  const m = montar([{ trozos: ["Bueno, "], sinFin: true }, { trozos: ["Tengo que dejarle, que tenga buen día."] }]);
  m.conv.escuchar("Y otra cosa más");
  await new Promise((r) => setTimeout(r, 10));
  m.conv.colgarYa();
  await m.conv.esperar();
  assert.equal(m.fin()?.tipo, "colgar");
});

test("las reglas del número llegan a la telefonista", async () => {
  let sistema = "";
  const m = montar([{ trozos: ["Hola, Pedro."] }], undefined, {
    regla: { telefono: "34600111222", nombre: "Pedro, Hormigones Pérez", accion: "ia", instrucciones: "No se le paga la factura 23." },
    nota: "El responsable ha preferido que atiendas tú esta llamada.",
  });
  const original = m.conv["o"].claude.stream;
  m.conv["o"].claude.stream = (p, o) => { sistema = (p.system as { text: string }[]).map((b) => b.text).join("\n"); return original(p, o); };
  m.conv.escuchar("Hola, soy Pedro");
  await m.conv.esperar();
  assert.match(sistema, /Pedro, Hormigones Pérez/);
  assert.match(sistema, /No se le paga la factura 23/);
  assert.match(sistema, /ha preferido que atiendas tú/);
});
