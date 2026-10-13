// Hablar con la telefonista escribiendo, sin teléfono ni Twilio: para probar la ficha de una empresa
// antes de ponerla a atender llamadas.
//   npm run probar -- empresas/moda-ejemplo [número desde el que "llamas"]
// Escribe como si hablaras; "/colgar" cuelga. Para hacer de responsable (como desde el panel):
//   "! texto"  -> indicación para su próxima respuesta;   "!! texto" -> que actúe ya.
// Con "--regla 'Pedro|No se le paga la factura 23, la obra tiene grietas'" llamas como un número con regla.
import { createInterface } from "node:readline/promises";
import { basename, dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { cargarEmpresas } from "./empresas.ts";
import { Conversacion, MODELO, type Claude } from "./agente.ts";
import { abrirRegistro } from "./registro.ts";

const carpeta = (process.argv[2] || "empresas/moda-ejemplo").replace(/\/$/, "");
const args = process.argv.slice(3);
const iRegla = args.indexOf("--regla");
const [nombreRegla, instruccionesRegla] = iRegla >= 0 ? String(args.splice(iRegla, 2)[1] ?? "").split("|") : [];
const desde = args[0] || "+34600000000";
const ficha = cargarEmpresas(dirname(carpeta)).find((f) => f.id === basename(carpeta));
if (!ficha) throw new Error(`No hay ficha.json en ${carpeta}`);

process.env.REGISTRO_FICHERO ??= "datos/pruebas.jsonl";
const registro = abrirRegistro();
const anthropic = new Anthropic();
const claude: Claude = {
  stream: (p, o) => anthropic.beta.messages.stream(p, o),
  create: (p) => anthropic.beta.messages.create(p),
};

let colgada = false;
const conv = new Conversacion({
  claude, ficha, llamada: `prueba-${Date.now()}`, desde, registro,
  anteriores: await registro.anteriores(ficha.id, desde, 3),
  regla: nombreRegla !== undefined ? { telefono: desde, nombre: nombreRegla, accion: "ia", instrucciones: instruccionesRegla ?? "" } : null,
  canal: {
    decir: (t, ultimo) => process.stdout.write(t + (ultimo ? "\n" : "")),
    cambiarIdioma: (c) => process.stdout.write(`\n   [idioma → ${c}]\n`),
    terminar: (fin) => {
      colgada = true;
      console.log(fin.tipo === "pasar" ? `\n   [se pasa la llamada a ${fin.destino} (${fin.numero}): ${fin.motivo}]` : `\n   [cuelga: ${fin.motivo}]`);
    },
  },
});

console.log(`${ficha.nombre} — ${ficha.asistente} (${MODELO}). Llamas desde ${desde}.\n`);
console.log(`${ficha.asistente.toUpperCase()}: ${ficha.saludo}`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
while (!colgada) {
  const linea = (await rl.question("\nTÚ: ")).trim();
  if (linea === "/colgar") break;
  if (linea.startsWith("!")) {
    const ya = linea.startsWith("!!");
    process.stdout.write(ya ? `${ficha.asistente.toUpperCase()}: ` : "   [indicación apuntada para su próxima respuesta]\n");
    conv.indicar(linea.replace(/^!+/, "").trim(), ya);
    await conv.esperar();
    continue;
  }
  process.stdout.write(`${ficha.asistente.toUpperCase()}: `);
  conv.escuchar(linea);
  await conv.esperar();
}
rl.close();
const resumen = await conv.cerrar();
if (resumen) console.log("\nResumen para el equipo:\n" + JSON.stringify(resumen, null, 2));
console.log(`\nLo apuntado está en ${process.env.REGISTRO_FICHERO}.`);
