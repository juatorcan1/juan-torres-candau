// Prueba de los abdominales al final: en un entreno con parejas que alternan, los ejercicios de abdomen van en
// las últimas parejas y, dentro de su pareja, los últimos. Si al cambiarlos de pareja todo choca (día de empuje:
// todo es pecho, hombro o tríceps), salen de su pareja a un bloque «Abdomen» al final. No toca el calentamiento
// ni la vuelta a la calma, ni un entreno sin abdominales. Abre entreno-app/index.html (de ./build.sh) en Chromium con
// una base de datos de mentira: sin red.
// Uso: entreno-app/build.sh && node entreno-app/pruebas/abdomen.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const APP = pathToFileURL(fileURLToPath(new URL("../index.html", import.meta.url))).href;
const pad = n => String(n).padStart(2, "0"), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = iso(new Date()), ayer = iso(new Date(Date.now() - 864e5));
const it = (ejercicio, series, reps, kg, descanso_s) => ({ ejercicio, modo: "reps", series, reps, kg, descanso_s });
const gym = { titulo: "Tirón", tipo: "gym", objetivo: "x", bloques: [
  { nombre: "Trabajo", items: [it("Remo con barra", 3, 10, 40, 90), it("Jalón al pecho", 2, 10, 35, 90)] },
  { nombre: "Pareja", alterna: true, items: [it("Curl con barra", 2, 10, 20, 60), it("Extensión en polea", 2, 12, 15, 60)] }] };
const nadar = { titulo: "Piscina", tipo: "natacion", objetivo: "x", bloques: [
  { nombre: "Series", items: [{ ejercicio: "Crol", modo: "distancia", series: 3, metros: 100, descanso_s: 30 }, { ejercicio: "Espalda", modo: "distancia", series: 2, metros: 50, descanso_s: 30 }] }] };
const planDe = entreno => ({ id: "juan_entreno", athlete: "juan", titulo: "Plan", tipo: "mes", semanas: [{ objetivo: "x", dias: [{ fecha: hoy, dia: "martes", actividad: entreno.tipo, foco: "x", detalle: "", duracion_min: 60, entreno }] }] });
function mock(seed){
  const cols = {}; for (const [c, docs] of Object.entries(seed)) cols[c] = new Map(docs.map(d => [d.id, d]));
  window.__cols = cols;
  const snap = c => ({ docs: [...(cols[c] || new Map()).values()].map(d => ({ id: d.id, data: () => d })) });
  const ref = (c, id) => ({ id, async set(o){ (cols[c] ||= new Map()).set(id, { ...o, id }); }, async delete(){ cols[c]?.delete(id); } });
  const db = { collection: c => ({ doc: id => ref(c, id || "x"), onSnapshot(n){ setTimeout(() => n(snap(c)), 50); return () => {}; } }), doc: p => { const [c, i] = p.split("/"); return ref(c, i); } };
  window.claude = { use: n => Promise.resolve(n === "db" ? db : null) };
}
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let fallos = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fallos++; };
async function nueva(entreno, empezar = true){
  const p = await browser.newPage({ viewport: { width: 360, height: 640 } }); p.errs = []; p.on("pageerror", e => p.errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  const sesiones = [{ id: "a", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Sentadilla", sets: [{ reps: 10, kg: 40 }] }] }];
  await p.addInitScript(([seed, src]) => { localStorage.setItem("entreno.me", '"juan"'); localStorage.setItem("entreno.voice", "false"); eval("(" + src + ")")(seed); }, [{ planes: [planDe(entreno)], sesiones }, mock.toString()]);
  await p.goto(APP); await p.waitForTimeout(500); await p.click(`[data-plan-open="${hoy}"]`); if (empezar) await p.click('[data-pl="start"]'); await p.waitForTimeout(100);
  return p;
}
const P = (nombre, ...items) => ({ nombre, alterna: true, items });
// un día de empuje con los abdominales en medio: crunch en la pareja 2 y rueda en la 3 (pesos inventados)
const empuje = { titulo: "Empuje", tipo: "gym", objetivo: "x", bloques: [
  { nombre: "Calentamiento", items: [{ ejercicio: "Carrera en cinta", modo: "tiempo", series: 1, segundos: 300, descanso_s: 60 }] },
  P("Pareja 1", it("Press inclinado con barra", 3, 10, 40, 120), it("Face pull", 3, 15, 20, 60)),
  P("Pareja 2", it("Press banca", 3, 8, 50, 120), it("Crunch", 2, 15, 0, 45)),
  P("Pareja 3", it("Press militar", 3, 8, 25, 90), it("Rueda abdominal", 2, 10, 0, 60)),
  P("Pareja 4", it("Cruce de poleas", 3, 12, 10, 60), it("Extensión en polea", 3, 12, 20, 60)),
  P("Pareja 5", it("Elevaciones laterales", 3, 15, 6, 60), it("Press francés", 3, 12, 15, 60))] };
// pierna y bíceps: el abdominal se cambia con uno que no choca
const pierna = { titulo: "Pierna", tipo: "gym", objetivo: "x", bloques: [
  P("Pareja 1", it("Crunch", 2, 15, 0, 45), it("Sentadilla", 3, 8, 60, 120)),
  P("Pareja 2", it("Peso muerto rumano", 3, 10, 50, 120), it("Curl con barra", 3, 10, 20, 60)),
  { nombre: "Vuelta a la calma", items: [{ ejercicio: "Plancha", modo: "tiempo", series: 1, segundos: 30, descanso_s: 0 }] }] };
const sinAbs = { titulo: "Tirón", tipo: "gym", objetivo: "x", bloques: [
  P("Pareja 1", it("Remo con barra", 3, 10, 40, 90), it("Curl con barra", 2, 10, 20, 60))] };
const soloAbs = { titulo: "Mixto", tipo: "gym", objetivo: "x", bloques: [
  P("Pareja 1", it("Crunch", 2, 15, 0, 45), it("Rueda abdominal", 2, 10, 0, 60)),
  P("Pareja 2", it("Remo con barra", 3, 10, 40, 90), it("Curl con barra", 2, 10, 20, 60))] };

const orden = w => w.bloques.map(b => `${b.nombre}${b.alterna ? "*" : ""}: ${b.items.map(x => x.ejercicio).join(" + ")}`).join(" | ");
// abre el entreno guiado con ese entreno y lee cómo queda (run.w) antes de la primera serie
const errores = [];
const prueba = async (w, empezar) => { const q = await nueva(w, empezar); const run = await q.evaluate(() => JSON.parse(localStorage.getItem("entreno.run")));
  run.txt = await q.evaluate(() => document.querySelector("#player").textContent); errores.push(...q.errs); await q.close();
  return { n: run.absMoved, w: run.w, run }; };

let r = await prueba(empuje);
console.log("  empuje → " + orden(r.w));
ok(r.n === 1, "en el empuje se mueven los abdominales");
const abs = ["Crunch", "Rueda abdominal"], plano = r.w.bloques.flatMap(b => b.items.map(x => x.ejercicio));
ok(plano.slice(-2).every(x => abs.includes(x)), `los dos abdominales son los últimos ejercicios (${plano.slice(-2).join(", ")})`);
ok(r.w.bloques[0].nombre === "Calentamiento", "el calentamiento se queda el primero");
ok(plano.filter(x => !abs.includes(x)).join(",") === "Carrera en cinta,Press inclinado con barra,Face pull,Press banca,Press militar,Cruce de poleas,Extensión en polea,Elevaciones laterales,Press francés", "el resto, en su orden de siempre");
ok(plano.length === 11, "no se pierde ni se repite ningún ejercicio");

r = await prueba(pierna);
console.log("  pierna → " + orden(r.w));
ok(orden(r.w) === "Pareja 1*: Sentadilla + Curl con barra | Pareja 2*: Peso muerto rumano + Crunch | Vuelta a la calma: Plancha", "en pierna, crunch se cambia con el curl, va el último de la última pareja y la plancha de la vuelta a la calma no se toca");

r = await prueba(sinAbs); ok(!r.n && orden(r.w) === orden(sinAbs), "un entreno sin abdominales no cambia");
r = await prueba(soloAbs);
ok(orden(r.w) === "Pareja 2*: Remo con barra + Curl con barra | Pareja 1*: Crunch + Rueda abdominal", `una pareja solo de abdominales pasa al final entera (${orden(r.w)})`);
r = await prueba({ ...soloAbs, bloques: [{ nombre: "Calentamiento", items: [{ ejercicio: "Carrera en cinta", modo: "tiempo", series: 1, segundos: 300, descanso_s: 60 }] }, soloAbs.bloques[0], { nombre: "Principal", items: [it("Remo con barra", 3, 10, 40, 90)] }] });
ok(orden(r.w) === "Calentamiento: Carrera en cinta | Principal: Remo con barra | Pareja 1*: Crunch + Rueda abdominal", `sin otras parejas, la de abdominales va al final y nunca antes del calentamiento (${orden(r.w)})`);
r = await prueba({ ...pierna, bloques: [pierna.bloques[1], P("Pareja 1", it("Sentadilla", 3, 8, 60, 120), it("Crunch", 2, 15, 0, 45))] });
ok(!r.n, "si ya están al final, no se toca nada");

// el entreno guiado lo avisa y el orden de las series sigue al nuevo
r = await prueba(empuje, false);
ok(/Abdominales al final/.test(r.run.txt), "la vista previa del entreno guiado lo avisa");
const ult = r.run.steps.slice(-2).map(s => r.w.bloques[s.bi].items[s.ii].ejercicio);
ok(ult.every(e => abs.includes(e)), `y las últimas series son de abdominales (${ult.join(", ")})`);
r = await prueba(sinAbs, false); ok(!/Abdominales al final/.test(r.run.txt), "sin abdominales, sin aviso");
ok(!errores.length, `sin errores ${errores.join(" | ")}`);
await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien");
process.exit(fallos ? 1 : 0);
