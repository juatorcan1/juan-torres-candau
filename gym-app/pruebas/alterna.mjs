// Prueba de los bloques que alternan (superseries): el entreno guiado va serie a serie de un ejercicio al otro
// (A1, B1, A2, B2…), con 30 s para cambiar de máquina y el descanso entero cuando el otro ya acabó; «Saltar
// ejercicio», «+ Serie» y «Cambiar» a mitad de pareja no mezclan los números ni repiten series; lo apuntado se
// guarda bien; y con «Los subo yo» la app no sube los kilos. Abre gym-app/index.html (de ./build.sh) en
// Chromium con una base de datos de mentira: sin red. Uso: gym-app/build.sh && node gym-app/pruebas/alterna.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const APP = pathToFileURL(fileURLToPath(new URL("../index.html", import.meta.url))).href;
const pad = n => String(n).padStart(2, "0"), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = iso(new Date()), ayer = iso(new Date(Date.now() - 864e5));
const it = (ejercicio, series, reps, kg, descanso_s) => ({ ejercicio, modo: "reps", series, reps, kg, descanso_s });
const entreno = { titulo: "Empuje", tipo: "gym", objetivo: "x", bloques: [
  { nombre: "Pareja 1", alterna: true, items: [it("Press banca", 3, 8, 25, 120), it("Crunch", 2, 15, 0, 45)] },
  { nombre: "Pareja 2", alterna: true, items: [it("Press militar", 2, 8, 10, 90), it("Face pull", 2, 15, 20, 60)] },
  { nombre: "Final", items: [it("Extensión en polea", 2, 10, 17.5, 60)] }] };
const plan = { id: "juan_entreno", athlete: "juan", titulo: "Plan", tipo: "mes", semanas: [{ objetivo: "x", dias: [{ fecha: hoy, dia: "martes", actividad: "gym", foco: "Empuje", detalle: "", duracion_min: 60, entreno }] }] };
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
const page = await browser.newPage({ viewport: { width: 390, height: 664 } }); const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
await page.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); localStorage.setItem("gym.voice", "false"); eval("(" + src + ")")(seed); }, [{ planes: [plan], sesiones: [{ id: "a", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Sentadilla", sets: [{ reps: 10, kg: 40 }] }] }] }, mock.toString()]);
await page.goto(APP); await page.waitForTimeout(500);
await page.click(`[data-plan-open="${hoy}"]`);
ok(await page.evaluate(() => /alternando/.test(document.querySelector("#player").textContent)), "la vista previa dice que la pareja va alternando");
const orden = await page.evaluate(() => { const run = JSON.parse(localStorage.getItem("gym.run")); return run.steps.map(s => run.w.bloques[s.bi].items[s.ii].ejercicio + " " + s.s).join(", "); });
ok(orden === "Press banca 1, Crunch 1, Press banca 2, Crunch 2, Press banca 3, Press militar 1, Face pull 1, Press militar 2, Face pull 2, Extensión en polea 1, Extensión en polea 2", `orden: ${orden}`);
await page.click('[data-pl="start"]'); await page.waitForTimeout(100);
const estado = () => page.evaluate(() => { const run = JSON.parse(localStorage.getItem("gym.run")), st = run.steps[run.i]; return { ej: run.w.bloques[st.bi].items[st.ii].ejercicio, s: st.s, fase: run.phase, desc: run.phase === "rest" ? Math.round((run.until - Date.now()) / 1000) : null, kg: run.cur && run.cur.kg }; });
const hecha = async () => { await page.click('[data-pl="done"]'); await page.waitForTimeout(80); };
const sigue = async () => { await page.click('[data-pl="skip"]'); await page.waitForTimeout(80); };
// press banca 1 at 27 kg: then 30 s to change to crunch
await page.fill("#pl-cur-kg", "27"); await page.dispatchEvent("#pl-cur-kg", "input");
await hecha(); let e = await estado();
ok(e.fase === "rest" && e.desc <= 30 && e.desc >= 28, `de press banca a crunch, 30 s de cambio (${e.desc} s)`);
ok(await page.evaluate(() => /Cambia a/.test(document.querySelector(".pl-next").textContent)), "en el descanso dice a qué cambias");
await sigue(); e = await estado(); ok(e.ej === "Crunch" && e.s === 1, `luego crunch 1 (${e.ej} ${e.s})`);
await hecha(); await sigue(); e = await estado();
ok(e.ej === "Press banca" && e.s === 2 && e.kg === 27, `vuelve a press banca 2 con los 27 kg de la serie 1 (${e.ej} ${e.s}, ${e.kg} kg)`);
await hecha(); await sigue(); await hecha(); await sigue(); // crunch 2
e = await estado(); ok(e.ej === "Press banca" && e.s === 3, `press banca 3 sola (${e.ej} ${e.s})`);
await hecha(); e = await estado(); ok(e.fase === "rest" && e.desc >= 118, `acabado el crunch, press banca descansa entero antes del bloque siguiente (${e.desc} s)`);
await sigue(); e = await estado(); ok(e.ej === "Press militar" && e.s === 1, `pareja 2: press militar 1 (${e.ej} ${e.s})`);
// skip press militar: face pull keeps going
await page.click('[data-pl="skipex"]'); await page.waitForTimeout(80); e = await estado();
ok(e.ej === "Face pull" && e.s === 1, `saltar press militar lleva a face pull 1 (${e.ej} ${e.s})`);
await hecha(); e = await estado(); ok(e.fase === "rest" && e.desc >= 58, `sin pareja, face pull descansa entero (${e.desc} s)`);
await sigue(); e = await estado(); ok(e.ej === "Face pull" && e.s === 2, `face pull 2, sin volver a press militar (${e.ej} ${e.s})`);
await hecha(); await sigue(); e = await estado(); ok(e.ej === "Extensión en polea", `bloque normal después (${e.ej})`);
await hecha(); await sigue(); await hecha(); await page.waitForTimeout(200);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("gym.run")).phase === "done"), "termina el entreno");
await page.click('[data-pl="save"]'); await page.waitForTimeout(400);
const ses = await page.evaluate(() => [...window.__cols.sesiones.values()].filter(s => !s.enCurso && s.id !== "a").map(s => s.exercises.map(x => x.name + ":" + x.sets.length).join(", ")));
ok(ses.length === 1 && ses[0] === "Press banca:3, Crunch:2, Face pull:2, Extensión en polea:2", `se guarda todo: ${ses.join(" | ")}`);
ok(!errs.length, `sin errores de JavaScript ${errs.join(" | ")}`);
await page.close();

// each case on a fresh page: the plan opened and started
async function nueva(perfil){
  const p = await browser.newPage({ viewport: { width: 390, height: 664 } }); p.errs = []; p.on("pageerror", e => p.errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  const sesiones = [{ id: "a", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Sentadilla", sets: [{ reps: 10, kg: 40 }] }, ...(perfil ? [{ name: "Press banca", sets: [{ reps: 8, kg: 30 }, { reps: 6, kg: 30 }, { reps: 8, kg: 32 }] }] : [])] }];
  await p.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); localStorage.setItem("gym.voice", "false"); eval("(" + src + ")")(seed); }, [{ planes: [plan], sesiones, perfiles: perfil ? [{ id: "juan", ...perfil }] : [] }, mock.toString()]);
  await p.goto(APP); await p.waitForTimeout(500); await p.click(`[data-plan-open="${hoy}"]`); await p.click('[data-pl="start"]'); await p.waitForTimeout(100);
  return p;
}
const est = p => p.evaluate(() => { const run = JSON.parse(localStorage.getItem("gym.run")), st = run.steps[run.i]; return { ej: run.w.bloques[st.bi].items[st.ii].ejercicio, s: st.s, fase: run.phase, cur: run.cur, next: run.nextCur, log: run.log, w: run.w }; });
const clic = async (p, sel) => { await p.click(sel); await p.waitForTimeout(80); };

// skipping an exercise of a pair from its 2nd set: the partner keeps its own numbers
let p = await nueva();
await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="skip"]'); await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="skip"]'); // press banca 1, crunch 1
await clic(p, '[data-pl="skipex"]'); let x = await est(p);
ok(x.ej === "Crunch" && x.s === 2 && x.cur.kg === 0 && x.cur.reps === 15, `saltar press banca en la serie 2 deja crunch 2 con sus números (${x.ej} ${x.s}: ${x.cur.reps} × ${x.cur.kg} kg)`);
await clic(p, '[data-pl="done"]'); x = await est(p);
ok(JSON.stringify(x.log["0.1"]) === JSON.stringify([{ reps: 15, kg: 0, secs: null, meters: null }, { reps: 15, kg: 0, secs: null, meters: null }]), "crunch se apunta 2 × 15 sin kilos");
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// "+ Serie" in the rest of a pair: the partner, next, keeps its numbers
p = await nueva();
await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="addset"]'); x = await est(p);
ok(x.w.bloques[0].items[0].series === 4 && x.next && x.next.kg === 0 && x.next.reps === 15, `«+ Serie» en el descanso: press banca con 4 series y lo siguiente sigue siendo crunch con 15 × 0 kg (${x.next && x.next.reps} × ${x.next && x.next.kg})`);
await clic(p, '[data-pl="skip"]'); x = await est(p); ok(x.ej === "Crunch" && x.s === 1, `luego crunch 1 (${x.ej} ${x.s})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// swapping an exercise halfway in a pair: the new one goes on alternating, nothing done is asked again
p = await nueva();
await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="skip"]'); await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="skip"]'); // press banca 1, crunch 1
await clic(p, '[data-swap-item="0.0"]'); await clic(p, "[data-swap-pick]"); x = await est(p);
const nuevo = x.w.bloques[0].items[1].ejercicio;
ok(x.ej === nuevo && x.s === 1, `tras cambiar press banca sigues con ${nuevo} 1 (${x.ej} ${x.s})`);
const vistos = [];
for (let k = 0; k < 6; k++) { x = await est(p); if (x.fase === "done") break; vistos.push(x.ej + " " + x.s); await clic(p, '[data-pl="done"]'); x = await est(p); if (x.fase === "rest") await clic(p, '[data-pl="skip"]'); }
ok(vistos.slice(0, 4).join(", ") === `${nuevo} 1, Crunch 2, ${nuevo} 2, Press militar 1`, `y alterna con crunch sin repetir crunch 1: ${vistos.join(", ")}`);
x = await est(p); ok(x.log["0.1"].length === 2 && x.log["0.0"].length === 1 && x.log["0.2"].length === 2, "press banca 1 serie, el nuevo 2 y crunch 2");
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// the same from the rest before it ("Cambiar el siguiente"): you stay in crunch 1's rest, and «◀ Anterior» goes back to crunch 1
p = await nueva();
await clic(p, '[data-pl="done"]'); await clic(p, '[data-pl="skip"]'); await clic(p, '[data-pl="done"]'); // press banca 1, crunch 1, in the rest
await clic(p, '[data-swap-item="0.0"]'); await clic(p, "[data-swap-pick]"); x = await est(p);
ok(x.fase === "rest" && x.ej === "Crunch" && x.s === 1, `sigues en el descanso de crunch 1 (${x.fase}, ${x.ej} ${x.s})`);
await clic(p, '[data-pl="back"]'); x = await est(p);
ok(x.ej === "Crunch" && x.s === 1 && x.log["0.0"].length === 1 && !(x.log["0.2"] || []).length, `«◀ Anterior» vuelve a crunch 1 y press banca 1 se queda apuntada (${x.ej} ${x.s})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// "Los subo yo": the weights start where you left them, never more
p = await nueva({ subirPeso: "yo" }); x = await est(p);
const pb = x.w.bloques[0].items[0];
ok(JSON.stringify(pb.plan.map(s => s.kg)) === "[30,30,32]" && x.cur.kg === 30 && pb.plan.every(s => s.reps === 8), `con «Los subo yo», press banca empieza con los kilos de la última vez (${pb.plan.map(s => s.kg + "×" + s.reps).join(" · ")})`);
ok(/súbelos tú/.test(pb.reto), "y lo dice: súbelos tú");
await p.close();
p = await nueva({ subirPeso: "app" }); x = await est(p);
ok(JSON.stringify(x.w.bloques[0].items[0].plan.map(s => s.kg)) === "[31,30,33]", `con «Me los sube la app», como siempre (${x.w.bloques[0].items[0].plan.map(s => s.kg).join(" · ")})`);
await p.close();
await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien"); process.exit(fallos ? 1 : 0);
