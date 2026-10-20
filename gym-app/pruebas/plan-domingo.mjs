// Prueba de las semanas del plan con dos versiones: «dias» y «diasDomingo» (si nadaste el domingo de antes,
// la semana se adelanta un día). Abre gym-app/index.html (de ./build.sh) en Chromium con una base de datos de
// mentira: sin red. Uso: gym-app/build.sh && node gym-app/pruebas/plan-domingo.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const APP = pathToFileURL(fileURLToPath(new URL("../index.html", import.meta.url))).href;
const pad = n => String(n).padStart(2, "0"), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lunes = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; })();
const dia = n => { const d = new Date(lunes); d.setDate(d.getDate() + n); return iso(d); };
const NOM = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const semana = acts => acts.map(([actividad, foco], i) => ({ fecha: dia(i), dia: NOM[i], actividad, foco, detalle: "", duracion_min: actividad === "descanso" ? 0 : 60 }));
const plan = { id: "juan_entreno", athlete: "juan", titulo: "Plan de prueba", tipo: "mes", penalizaDesde: "2000-01-01", semanas: [{ objetivo: "Prueba",
  dias: semana([["natacion", "Natación normal"], ["gym", "Gimnasio martes"], ["gym", "Gimnasio miércoles"], ["natacion", "Natación jueves"], ["gym", "Gimnasio viernes"], ["descanso", "Descanso"], ["natacion", "Natación (opcional)"]]),
  diasDomingo: semana([["gym", "Torso adelantado"], ["gym", "Pierna adelantada"], ["natacion", "Natación miércoles"], ["gym", "Torso jueves"], ["gym", "Pierna viernes"], ["descanso", "Descanso"], ["natacion", "Natación (opcional)"]]) }] };
function mock(seed){
  const cols = {};
  for (const [c, docs] of Object.entries(seed)) cols[c] = new Map(docs.map(d => [d.id, d]));
  const snap = c => ({ docs: [...(cols[c] || new Map()).values()].map(d => ({ id: d.id, data: () => d })) });
  const ref = (c, id) => ({ id, async set(o){ (cols[c] ||= new Map()).set(id, { ...o, id }); }, async delete(){ cols[c]?.delete(id); } });
  const db = { collection: c => ({ doc: id => ref(c, id || crypto.randomUUID()), onSnapshot(n){ setTimeout(() => n(snap(c)), 50); return () => {}; } }), doc: p => { const [c, i] = p.split("/"); return ref(c, i); } };
  window.claude = { use: n => Promise.resolve(n === "db" ? db : null) };
}
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let fallos = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fallos++; };
async function planVisto(sesiones){
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  await page.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); eval("(" + src + ")")(seed); }, [{ planes: [plan], sesiones }, mock.toString()]);
  await page.goto(APP); await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('[data-top="entrenador"]').click(); document.querySelector('[data-leaf="plan"]').click(); });
  await page.waitForTimeout(200);
  const txt = await page.evaluate(() => document.querySelector("#view-plan").innerText);
  await page.close(); return { txt, errs };
}
const domingo = (() => { const d = new Date(lunes); d.setDate(d.getDate() - 1); return iso(d); })();
{
  const { txt, errs } = await planVisto([{ id: "x", athlete: "juan", date: "2000-01-01", sport: "gym" }]);
  ok(txt.includes("Natación normal") && !txt.includes("Torso adelantado"), "sin natación el domingo: la semana normal");
  ok(!/se adelanta/i.test(txt), "y sin aviso de que se adelanta");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
}
{
  const { txt, errs } = await planVisto([{ id: "n", athlete: "juan", date: domingo, sport: "natacion", meters: 1500 }]);
  ok(txt.includes("Torso adelantado") && txt.includes("Natación miércoles") && !txt.includes("Natación normal"), "con natación el domingo: la semana adelantada");
  ok(/se adelanta un día/i.test(txt), "y lo dice en la semana");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
}
{
  const { txt } = await planVisto([{ id: "n", athlete: "ignacio", date: domingo, sport: "natacion", meters: 1500 }]);
  ok(txt.includes("Natación normal"), "la natación del domingo de Ignacio no cambia la semana de Juan");
}
await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien"); process.exit(fallos ? 1 : 0);
