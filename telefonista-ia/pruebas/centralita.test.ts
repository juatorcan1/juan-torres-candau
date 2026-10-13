// El panel en directo, con un WebSocket de mentira.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { Centralita } from "../src/centralita.ts";
import { cargarEmpresas } from "../src/empresas.ts";
import type { Registro, Regla } from "../src/registro.ts";
import type { Conversacion } from "../src/agente.ts";

const empresas = cargarEmpresas("empresas");
const ficha = empresas.find((f) => f.id === "construccion-ejemplo")!;

function panel() {
  const ws = new EventEmitter() as EventEmitter & { OPEN: number; readyState: number; send(d: string): void; close(): void; recibidos: any[] };
  ws.OPEN = 1; ws.readyState = 1; ws.recibidos = [];
  ws.send = (d) => ws.recibidos.push(JSON.parse(d));
  ws.close = () => { ws.readyState = 3; };
  const decir = (m: unknown) => ws.emit("message", Buffer.from(JSON.stringify(m)));
  return { ws, decir };
}

function montar() {
  const reglas = new Map<string, Regla>();
  const registro = {
    reglas: async () => [...reglas.values()],
    guardarRegla: async (_: string, r: Regla) => { reglas.set(r.telefono, r); },
    borrarRegla: async (_: string, t: string) => { reglas.delete(t); },
    recientes: async () => [],
  } as unknown as Registro;
  const ordenes: string[] = [];
  const conv = {
    indicar: (t: string, ya: boolean) => ordenes.push(`indicar:${t}:${ya}`),
    pasarAlResponsable: () => { ordenes.push("pasar"); return true; },
    colgarYa: () => ordenes.push("colgar"),
  } as unknown as Conversacion;
  const c = new Centralita(empresas, registro, "clave-de-prueba");
  return { c, conv, ordenes, reglas };
}

const esperar = () => new Promise((r) => setTimeout(r, 5));

test("sin la clave no se ve nada", async () => {
  const { c, conv } = montar();
  const p = panel();
  c.conectarPanel(p.ws as unknown as WebSocket);
  p.decir({ tipo: "entrar", clave: "otra" });
  c.alta({ llamada: "CA1", ficha, desde: "+34600111222", nombre: "", conv });
  await esperar();
  assert.deepEqual(p.ws.recibidos, [{ tipo: "error", texto: "Clave incorrecta" }]);
});

test("con la clave ve la llamada, lo que se dice, y le da órdenes a la telefonista", async () => {
  const { c, conv, ordenes } = montar();
  const p = panel();
  c.conectarPanel(p.ws as unknown as WebSocket);
  p.decir({ tipo: "entrar", clave: "clave-de-prueba" });
  await esperar();
  c.alta({ llamada: "CA1", ficha, desde: "+34600111222", nombre: "Pedro", conv });
  c.evento("CA1", { tipo: "cliente", texto: "Quiero cobrar" });
  c.evento("CA1", { tipo: "asistente", texto: "Entiendo, " });
  c.evento("CA1", { tipo: "asistente", texto: "le explico." });
  const activas = p.ws.recibidos.filter((m) => m.tipo === "activas").at(-1);
  assert.equal(activas.llamadas[0].nombre, "Pedro");
  assert.equal(p.ws.recibidos.filter((m) => m.tipo === "evento").length, 3);

  p.decir({ tipo: "indicar", llamada: "CA1", texto: "No le pagues", ya: true });
  p.decir({ tipo: "pasarme", llamada: "CA1" });
  p.decir({ tipo: "colgar", llamada: "CA1" });
  await esperar();
  assert.deepEqual(ordenes, ["indicar:No le pagues:true", "pasar", "colgar"]);

  c.audio("CA1", "in", "AAAA");
  assert.equal(p.ws.recibidos.filter((m) => m.tipo === "audio").length, 0, "sin pedir escuchar, no llega sonido");
  p.decir({ tipo: "escuchar", llamada: "CA1" });
  await esperar();
  c.audio("CA1", "in", "AAAA");
  assert.equal(p.ws.recibidos.filter((m) => m.tipo === "audio").length, 1);
});

test("guarda y borra reglas por número", async () => {
  const { c, reglas } = montar();
  const p = panel();
  c.conectarPanel(p.ws as unknown as WebSocket);
  p.decir({ tipo: "entrar", clave: "clave-de-prueba" });
  p.decir({ tipo: "guardarRegla", empresa: ficha.id, regla: { telefono: "+34 600 111 222", nombre: "Pedro", accion: "preguntar", instrucciones: "Cordial" } });
  await esperar();
  assert.equal(reglas.get("+34 600 111 222")?.accion, "preguntar");
  p.decir({ tipo: "guardarRegla", empresa: ficha.id, regla: { telefono: "+34 600 111 333", accion: "lo-que-sea" } });
  await esperar();
  assert.equal(reglas.get("+34 600 111 333")?.accion, "ia", "una acción desconocida se queda en ia");
  p.decir({ tipo: "borrarRegla", empresa: ficha.id, telefono: "+34 600 111 222" });
  await esperar();
  assert.equal(reglas.has("+34 600 111 222"), false);
});
