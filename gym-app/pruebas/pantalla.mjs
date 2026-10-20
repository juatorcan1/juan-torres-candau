// Prueba de que el entreno guiado cabe en una pantalla de móvil sin hacer scroll: la serie y el descanso, en
// un iPhone (390 × 664 visibles) y en un Samsung pequeño (360 × 640). Abre gym-app/index.html (de ./build.sh) en
// Chromium con una base de datos de mentira: sin red. Uso: gym-app/build.sh && node gym-app/pruebas/pantalla.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const APP = pathToFileURL(fileURLToPath(new URL("../index.html", import.meta.url))).href;
const pad = n => String(n).padStart(2, "0"), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = iso(new Date()), ayer = iso(new Date(Date.now() - 864e5));
const it = (ejercicio, series, reps, kg) => ({ ejercicio, modo: "reps", series, reps, kg, descanso_s: 90, indicacion: "Baja a la parte alta del pecho en 2 s, codos a 45°." });
const entreno = { titulo: "Torso A · semana 5", tipo: "gym", objetivo: "Protagonista el pecho", bloques: [
  { nombre: "Trabajo", items: [it("Press inclinado con barra", 3, 10, 25), it("Cruce de poleas", 3, 12, 9), it("Jalón al pecho", 2, 10, 45)] },
  { nombre: "Abdominales", items: [it("Rueda abdominal", 3, 10, 0)] }] };
const plan = { id: "juan_entreno", athlete: "juan", titulo: "Plan", tipo: "mes", semanas: [{ objetivo: "x", dias: [{ fecha: hoy, dia: "martes", actividad: "gym", foco: "Torso A", detalle: "", duracion_min: 85, entreno }] }] };
const sesiones = [
  { id: "a", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Press inclinado con barra", sets: [{ reps: 10, kg: 10 }, { reps: 10, kg: 20 }, { reps: 10, kg: 25 }] }] },
  { id: "b", athlete: "ignacio", date: ayer, sport: "gym", exercises: [{ name: "Press inclinado con barra", sets: [{ reps: 10, kg: 20 }, { reps: 10, kg: 25 }] }] }];
function mock(seed){
  const cols = {}; for (const [c, docs] of Object.entries(seed)) cols[c] = new Map(docs.map(d => [d.id, d]));
  const snap = c => ({ docs: [...(cols[c] || new Map()).values()].map(d => ({ id: d.id, data: () => d })) });
  const ref = (c, id) => ({ id, async set(o){ (cols[c] ||= new Map()).set(id, { ...o, id }); }, async delete(){ cols[c]?.delete(id); } });
  const db = { collection: c => ({ doc: id => ref(c, id || "x"), onSnapshot(n){ setTimeout(() => n(snap(c)), 50); return () => {}; } }), doc: p => { const [c, i] = p.split("/"); return ref(c, i); } };
  window.claude = { use: n => Promise.resolve(n === "db" ? db : null) };
}
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let fallos = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fallos++; };
// lo que hay que desplazar dentro del reproductor (0 = cabe entero)
const sobra = page => page.evaluate(() => { const p = document.querySelector("#player"); return Math.max(0, ...[p, ...p.querySelectorAll("*")].map(e => /auto|scroll/.test(getComputedStyle(e).overflowY) ? e.scrollHeight - e.clientHeight : 0)); });
for (const [movil, width, height] of [["iPhone", 390, 664], ["Samsung", 360, 640]]) {
  const page = await browser.newPage({ viewport: { width, height } }); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  await page.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); localStorage.setItem("gym.voice", "false"); eval("(" + src + ")")(seed); }, [{ planes: [plan], sesiones }, mock.toString()]);
  await page.goto(APP); await page.waitForTimeout(500);
  await page.click(`[data-plan-open="${hoy}"]`); await page.click('[data-pl="start"]'); await page.waitForTimeout(150);
  let s = await sobra(page); ok(s === 0, `${movil}: la serie cabe sin scroll${s ? ` (sobran ${s} px)` : ""}`);
  ok(await page.evaluate(() => { const r = document.querySelector('[data-pl="done"]').getBoundingClientRect(), k = document.querySelector("#pl-cur-kg").getBoundingClientRect(); return r.bottom <= innerHeight && k.bottom <= innerHeight && k.top >= 0; }), `${movil}: los kilos y «Serie hecha» se ven sin moverse`);
  await page.click('[data-pl="done"]'); await page.waitForTimeout(150);
  s = await sobra(page); ok(s === 0, `${movil}: el descanso cabe sin scroll${s ? ` (sobran ${s} px)` : ""}`);
  ok(!errs.length, `${movil}: sin errores de JavaScript ${errs.join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien"); process.exit(fallos ? 1 : 0);
