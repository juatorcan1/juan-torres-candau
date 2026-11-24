// Prueba de quitar series en el entreno guiado: el «−» de «− Serie +» quita una de las que quedan por hacer (sin tocar lo
// apuntado) o, si ya están todas hechas, borra la última apuntada; una serie abierta para corregirla se borra con
// «Borrar esta serie»; en el resumen, la × de cada serie la borra; en una pareja, el otro ejercicio sigue; nunca
// se borra la única serie del entreno; y la base de datos se queda con lo mismo que el móvil. Abre
// gym-app/index.html (de ./build.sh) en Chromium con una base de datos de mentira: sin red.
// Uso: gym-app/build.sh && node gym-app/pruebas/quitar-series.mjs
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
async function nueva(entreno, previas = []){
  const p = await browser.newPage({ viewport: { width: 360, height: 640 } }); p.errs = []; p.dialogs = 0; p.on("pageerror", e => p.errs.push(e.message));
  p.on("dialog", d => { p.dialogs++; d.accept(); });
  await p.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  const sesiones = [{ id: "a", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Sentadilla", sets: [{ reps: 10, kg: 40 }] }] }, ...previas];
  await p.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); localStorage.setItem("gym.voice", "false"); eval("(" + src + ")")(seed); }, [{ planes: [planDe(entreno)], sesiones }, mock.toString()]);
  await p.goto(APP); await p.waitForTimeout(500); await p.click(`[data-plan-open="${hoy}"]`); await p.click('[data-pl="start"]'); await p.waitForTimeout(100);
  return p;
}
const est = p => p.evaluate(() => { const run = JSON.parse(localStorage.getItem("gym.run")), st = run.steps[run.i];
  return { ej: st && run.w.bloques[st.bi].items[st.ii].ejercicio, s: st && st.s, fase: run.phase, cur: run.cur, next: run.nextCur, log: run.log, series: run.w.bloques.map(b => b.items.map(x => x.series)) }; });
const clic = async (p, sel) => { await p.click(sel); await p.waitForTimeout(80); };
const kg = async (p, v) => { await p.fill("#pl-cur-kg", String(v)); await p.dispatchEvent("#pl-cur-kg", "input"); };
const hecha = async p => { await clic(p, '[data-pl="done"]'); const x = await est(p); if (x.fase === "rest") await clic(p, '[data-pl="skip"]'); };
const kgs = (log, k) => (log[k] || []).map(z => z.kg).join("/");
const enBase = p => p.evaluate(() => { const s = [...window.__cols.sesiones.values()].find(z => z.id !== "a" && z.id !== "b"); return s ? (s.exercises || []).map(e => e.name + ":" + e.sets.map(z => z.kg).join("/")).join(", ") : ""; });
const boton = p => p.evaluate(() => (document.querySelector('[data-pl="subset"]')?.getAttribute("aria-label") || "").replace(/ de .*/, ""));

// una de las que quedan: en la serie, y luego la que tienes en pantalla
let p = await nueva(gym);
await kg(p, 40); await hecha(p); let x = await est(p);
ok(x.ej === "Remo con barra" && x.s === 2 && await boton(p) === "Una serie menos", `en remo 2 está el «−» (una serie menos) (${x.ej} ${x.s}, «${await boton(p)}»)`);
await clic(p, '[data-pl="subset"]'); x = await est(p);
ok(x.series[0][0] === 2 && x.ej === "Remo con barra" && x.s === 2 && kgs(x.log, "0.0") === "40" && p.dialogs === 0, `quita la 3 sin preguntar: remo con 2, sigues en remo 2 y la 1 sigue apuntada (${x.series[0][0]} series, ${x.ej} ${x.s}, ${kgs(x.log, "0.0")})`);
await clic(p, '[data-pl="subset"]'); x = await est(p);
ok(x.series[0][0] === 1 && x.fase === "set" && x.ej === "Jalón al pecho" && x.s === 1 && kgs(x.log, "0.0") === "40", `otra vez: remo con 1 (la que ya hiciste) y pasas a jalón 1 (${x.series[0][0]}, ${x.ej} ${x.s})`);
ok(await p.evaluate(() => document.querySelector('[data-jump="0.0"]').closest(".tk").classList.contains("full")), "la bolita de remo queda completa (1/1)");
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// en el descanso: primero una que queda (lo siguiente no cambia), luego con todas hechas borra la última, preguntando
p = await nueva(gym);
await kg(p, 40); await clic(p, '[data-pl="done"]'); x = await est(p);
ok(x.fase === "rest", `en el descanso de remo 1 (${x.fase})`);
await clic(p, '[data-pl="subset"]'); x = await est(p);
ok(x.fase === "rest" && x.series[0][0] === 2 && x.next && x.next.kg === 40 && p.dialogs === 0, `quita remo 3, sigue el descanso y la siguiente (remo 2) conserva sus 40 kg (${x.fase}, ${x.series[0][0]} series)`);
await clic(p, '[data-pl="skip"]'); await kg(p, 42); await clic(p, '[data-pl="done"]'); x = await est(p);
ok(x.fase === "rest" && kgs(x.log, "0.0") === "40/42", `remo 2 hecha a 42, en el descanso (${kgs(x.log, "0.0")})`);
await clic(p, '[data-pl="subset"]'); x = await est(p);
ok(p.dialogs === 1 && kgs(x.log, "0.0") === "40" && x.series[0][0] === 1 && x.fase === "set" && x.ej === "Jalón al pecho" && x.s === 1, `con las dos hechas, pregunta y borra la 2 (42 kg): remo con 1 y pasas a jalón 1 (${kgs(x.log, "0.0")}, ${x.ej} ${x.s})`);
await p.waitForTimeout(300);
ok(await enBase(p) === "Remo con barra:40", `la base de datos también se queda con remo 40 (${await enBase(p)})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// una serie abierta para corregirla (el cuadro de series) se borra con «Borrar esta serie»: vuelve a estar por hacer
p = await nueva(gym, [{ id: "b", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Remo con barra", sets: [{ reps: 10, kg: 38 }, { reps: 10, kg: 38 }, { reps: 10, kg: 38 }] }] }]);
await kg(p, 40); await hecha(p); await kg(p, 41); await hecha(p); x = await est(p);
ok(x.ej === "Remo con barra" && x.s === 3 && kgs(x.log, "0.0") === "40/41", `en remo 3 con 40/41 (${x.ej} ${x.s})`);
await clic(p, '[data-reopen="0.0:1"]');
ok(await boton(p) === "Borrar esta serie", `al abrir la S1 el «−» es «Borrar esta serie» («${await boton(p)}»)`);
await clic(p, '[data-pl="subset"]'); x = await est(p);
ok(p.dialogs === 1 && kgs(x.log, "0.0") === "41" && x.series[0][0] === 3 && x.ej === "Remo con barra" && x.s === 2, `borra la 1 (40 kg), deja la de 41, remo sigue con 3 y vas a su serie 2 (${kgs(x.log, "0.0")}, ${x.series[0][0]} series, ${x.ej} ${x.s})`);
await hecha(p); await hecha(p); x = await est(p);
ok(x.ej === "Jalón al pecho" && x.s === 1 && (x.log["0.0"] || []).length === 3, `haces las dos que quedan y pasas a jalón (${(x.log["0.0"] || []).length} de remo)`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// en una pareja: quitar una de curl, la extensión sigue con las suyas
p = await nueva(gym);
await clic(p, '[data-jump="1.0"]'); await clic(p, '[data-pl="subset"]'); x = await est(p);
ok(x.series[1][0] === 1 && x.ej === "Curl con barra" && x.s === 1, `curl con 1 serie y sigues en curl 1 (${x.series[1][0]}, ${x.ej} ${x.s})`);
ok(await boton(p) === "", "con una sola serie, el «−» no sale");
await hecha(p); x = await est(p); ok(x.ej === "Extensión en polea" && x.s === 1, `luego extensión 1 (${x.ej} ${x.s})`);
await hecha(p); x = await est(p); ok(x.ej === "Extensión en polea" && x.s === 2, `y extensión 2, sin curl 2 (${x.ej} ${x.s})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// en el resumen: la × borra esa serie, y se guarda sin ella
p = await nueva(gym);
for (const v of [40, 41, 42]) { await kg(p, v); await hecha(p); }
await kg(p, 35); await hecha(p);
await clic(p, '[data-pl="finish"]'); await p.waitForTimeout(150);
await p.evaluate(() => document.querySelector(".pl-fix").setAttribute("open", ""));
ok(await p.evaluate(() => document.querySelectorAll("[data-delset]").length === 4), "en «Revisa y corrige las series» cada serie tiene su ×");
await clic(p, '[data-delset="0.0:1"]'); x = await est(p);
ok(p.dialogs === 1 && kgs(x.log, "0.0") === "40/42" && x.fase === "done" && x.series[0][0] === 2, `borra la S2 de remo (41): queda 40/42 y remo pasa a 2 series (${kgs(x.log, "0.0")})`);
ok(await p.evaluate(() => document.querySelector(".pl-fix").open && document.querySelectorAll("[data-delset]").length === 3), "el resumen sigue abierto, con 3 series");
await p.waitForTimeout(300);
ok(await enBase(p) === "Remo con barra:40/42, Jalón al pecho:35", `la base de datos ya no la tiene (${await enBase(p)})`);
await clic(p, '[data-pl="save"]'); await p.waitForTimeout(400);
const fin = await p.evaluate(() => { const s = [...window.__cols.sesiones.values()].find(z => z.id !== "a" && z.id !== "b"); return { en: !!s.enCurso, ex: s.exercises.map(e => e.name + ":" + e.sets.map(z => z.kg).join("/")).join(", ") }; });
ok(!fin.en && fin.ex === "Remo con barra:40/42, Jalón al pecho:35", `se guarda terminado y sin ella (${fin.ex})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

// la única serie del entreno no se borra (para eso, «Descartar»)
p = await nueva(gym);
await kg(p, 40); await hecha(p); await clic(p, '[data-pl="finish"]'); await p.waitForTimeout(150);
await p.evaluate(() => document.querySelector(".pl-fix").setAttribute("open", ""));
await clic(p, '[data-delset="0.0:0"]'); x = await est(p);
ok(p.dialogs === 0 && kgs(x.log, "0.0") === "40", `la × de la única serie no la borra ni pregunta (${kgs(x.log, "0.0")})`);
ok(!p.errs.length, `sin errores ${p.errs.join(" | ")}`); await p.close();

await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien"); process.exit(fallos ? 1 : 0);
