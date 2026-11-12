// Prueba de las bolitas del entreno guiado (una por ejercicio, arriba): tocar una lleva directo a ese ejercicio,
// en su primera serie pendiente, desde una serie o desde el descanso; lo que queda atrás se pide después (nada
// se pierde ni se repite); un ejercicio saltado vuelve al tocarlo; uno completo no se mueve; y vale igual para
// nadar. Abre gym-app/index.html (de ./build.sh) en Chromium con una base de datos de mentira: sin red.
// Uso: gym-app/build.sh && node gym-app/pruebas/bolitas.mjs
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
async function nueva(entreno){
  const p = await browser.newPage({ viewport: { width: 360, height: 640 } }); p.errs = []; p.on("pageerror", e => p.errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  const sesiones = [{ id: "a", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Sentadilla", sets: [{ reps: 10, kg: 40 }] }] }];
  await p.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); localStorage.setItem("gym.voice", "false"); eval("(" + src + ")")(seed); }, [{ planes: [planDe(entreno)], sesiones }, mock.toString()]);
  await p.goto(APP); await p.waitForTimeout(500); await p.click(`[data-plan-open="${hoy}"]`); await p.click('[data-pl="start"]'); await p.waitForTimeout(100);
  return p;
}
const est = p => p.evaluate(() => { const run = JSON.parse(localStorage.getItem("gym.run")), st = run.steps[run.i]; return { ej: st && run.w.bloques[st.bi].items[st.ii].ejercicio, s: st && st.s, fase: run.phase, cur: run.cur, log: run.log }; });
const clic = async (p, sel) => { await p.click(sel); await p.waitForTimeout(80); };
const bolita = (p, k) => clic(p, `[data-jump="${k}"]`);
const hecha = async p => { await clic(p, '[data-pl="done"]'); const x = await est(p); if (x.fase === "rest") await clic(p, '[data-pl="skip"]'); };
const n = (log, k) => (log[k] || []).length;

// gimnasio: ir y volver entre ejercicios
let p = await nueva(gym);
ok(await p.evaluate(() => document.querySelectorAll("#pl-track button[data-jump]").length === 4), "cuatro bolitas, una por ejercicio, y se pueden tocar");
await p.fill("#pl-cur-kg", "42"); await p.dispatchEvent("#pl-cur-kg", "input");
await clic(p, '[data-pl="done"]'); // remo 1 a 42 kg, en el descanso
await bolita(p, "0.1"); let x = await est(p);
ok(x.fase === "set" && x.ej === "Jalón al pecho" && x.s === 1, `desde el descanso, la bolita de jalón lleva a jalón 1 sin esperar (${x.fase}, ${x.ej} ${x.s})`);
ok(await p.evaluate(() => document.querySelector("#pl-track .tk.now [data-jump]").dataset.jump === "0.1"), "y su bolita queda marcada");
await bolita(p, "1.1"); x = await est(p);
ok(x.fase === "set" && x.ej === "Extensión en polea" && x.s === 1, `desde una serie, salta a la otra pareja (${x.ej} ${x.s})`);
await bolita(p, "0.0"); x = await est(p);
ok(x.ej === "Remo con barra" && x.s === 2 && x.cur.kg === 42 && n(x.log, "0.0") === 1, `vuelve a remo, en la serie 2 y con los 42 kg de la 1 (${x.ej} ${x.s}, ${x.cur.kg} kg)`);
await hecha(p); // remo 2
x = await est(p); ok(x.ej === "Remo con barra" && x.s === 3, `luego sigue el orden: remo 3 (${x.ej} ${x.s})`);
await bolita(p, "1.0"); await hecha(p); // curl 1
x = await est(p); ok(x.ej === "Extensión en polea" && x.s === 1, `curl 1 y su pareja después (${x.ej} ${x.s})`);
await hecha(p); await hecha(p); await hecha(p); // extensión 1, curl 2, extensión 2
x = await est(p); ok(x.fase === "set" && x.ej === "Remo con barra" && x.s === 3, `al acabar el final, vuelve a lo que quedó atrás: remo 3 (${x.fase}, ${x.ej} ${x.s})`);
await hecha(p); x = await est(p); ok(x.ej === "Jalón al pecho" && x.s === 1, `y jalón 1 (${x.ej} ${x.s})`);
await bolita(p, "0.0"); x = await est(p);
ok(x.ej === "Jalón al pecho" && await p.evaluate(() => /ya están/.test(document.querySelector("#toast")?.textContent || document.body.textContent)), "un ejercicio completo no se mueve: avisa de que ya están sus series");
await hecha(p); await clic(p, '[data-pl="done"]'); await p.waitForTimeout(200); x = await est(p);
ok(x.fase === "done", `con todo hecho, termina (${x.fase})`);
await clic(p, '[data-pl="save"]'); await p.waitForTimeout(400);
let ses = await p.evaluate(() => [...window.__cols.sesiones.values()].filter(s => !s.enCurso && s.id !== "a").map(s => s.exercises.map(e => e.name + ":" + e.sets.map(z => z.kg).join("/")).join(", ")));
ok(ses.length === 1 && ses[0] === "Remo con barra:42/42/42, Jalón al pecho:35/35, Curl con barra:20/20, Extensión en polea:15/15", `se guarda cada serie una vez: ${ses.join(" | ")}`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// saltar un ejercicio y recuperarlo con su bolita
p = await nueva(gym);
await clic(p, '[data-pl="skipex"]'); x = await est(p);
ok(x.ej === "Jalón al pecho", `«Saltar ejercicio» pasa a jalón (${x.ej})`);
ok(await p.evaluate(() => document.querySelector('[data-jump="0.0"]').closest(".tk").classList.contains("skip")), "la bolita de remo queda como saltada");
for (let k = 0; k < 6; k++) await hecha(p); await p.waitForTimeout(150); x = await est(p);
ok(x.fase === "done", `lo saltado no se vuelve a pedir al final (${x.fase})`);
await p.close();
p = await nueva(gym);
await clic(p, '[data-pl="skipex"]'); await bolita(p, "0.0"); x = await est(p);
ok(x.ej === "Remo con barra" && x.s === 1, `tocar la bolita de un ejercicio saltado lo recupera (${x.ej} ${x.s})`);
await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="skip"]'); x = await est(p);
ok(x.ej === "Remo con barra" && x.s === 2, `y sigue con él (${x.ej} ${x.s})`);
// en una pareja: saltar curl y recuperarlo
await bolita(p, "1.0"); await clic(p, '[data-pl="skipex"]'); x = await est(p);
ok(x.ej === "Extensión en polea", `en la pareja, saltar curl pasa a extensión (${x.ej})`);
await bolita(p, "1.0"); x = await est(p);
ok(x.ej === "Curl con barra" && x.s === 1, `y su bolita lo recupera (${x.ej} ${x.s})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// nadar: igual con los largos
p = await nueva(nadar);
await clic(p, '[data-pl="done"]'); await bolita(p, "0.1"); x = await est(p);
ok(x.fase === "set" && x.ej === "Espalda" && x.s === 1, `nadando, de crol a espalda con la bolita (${x.ej} ${x.s})`);
await hecha(p); await bolita(p, "0.0"); x = await est(p);
ok(x.ej === "Crol" && x.s === 2, `y vuelta a crol 2 (${x.ej} ${x.s})`);
await hecha(p); await hecha(p); await hecha(p); await p.waitForTimeout(150); x = await est(p);
ok(x.fase === "done" && n(x.log, "0.0") === 3 && n(x.log, "0.1") === 2, `termina con 3 de crol y 2 de espalda (${x.fase})`);
await clic(p, '[data-pl="save"]'); await p.waitForTimeout(400);
ses = await p.evaluate(() => [...window.__cols.sesiones.values()].filter(s => !s.enCurso && s.id !== "a").map(s => s.sport + ":" + s.meters));
ok(ses.length === 1 && ses[0] === "natacion:400", `se guardan los 400 m (${ses.join(" | ")})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien"); process.exit(fallos ? 1 : 0);
