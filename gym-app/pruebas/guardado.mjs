// Pruebas de que el entreno guiado no pierde nada: sin conexión, con un entreno a medias y con uno olvidado
// hace días. Abre la versión Artifact (gym-app/index.html, de ./build.sh) en Chromium con una base de datos
// de mentira en memoria: no usa la red ni toca Supabase.
// Uso: gym-app/build.sh && node gym-app/pruebas/guardado.mjs   (necesita playwright: npm i --no-save playwright)
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const { chromium } = pw;
const APP = pathToFileURL(fileURLToPath(new URL("../index.html", import.meta.url))).href;
const iso = d => d.toISOString().slice(0, 10);
const hoy = new Date(); const manana = new Date(Date.now() + 864e5);
const entreno = t => ({ titulo: t, tipo: "gym", bloques: [{ nombre: "Principal", items: [{ ejercicio: "Press banca", modo: "reps", series: 3, reps: 10, kg: 40, descanso_s: 0 }] }] });
const plan = { id: "juan_entreno", athlete: "juan", semanas: [{ dias: [
  { fecha: iso(hoy), dia: "hoy", actividad: "gym", foco: "Prueba hoy", entreno: entreno("Entreno de hoy") },
  { fecha: iso(manana), dia: "mañana", actividad: "gym", foco: "Prueba mañana", entreno: entreno("Entreno de mañana") }] }] };

function mock(seed){
  // in-memory db with the same surface as window.claude.use("db"); window.__fail makes writes fail
  const cols = {}, ls = {};
  for (const [c, docs] of Object.entries(seed)) cols[c] = new Map(docs.map(d => [d.id, d]));
  const snap = c => ({ docs: [...(cols[c] || new Map()).values()].map(d => ({ id: d.id, data: () => d })) });
  const emit = c => setTimeout(() => (ls[c] || []).forEach(f => f(snap(c))), 0);
  const ref = (c, id) => ({ id, async set(o){ if (window.__fail) throw { code: "unavailable" }; const ms = (window.__delays || []).shift(); if (ms) await new Promise(r => setTimeout(r, ms)); (cols[c] ||= new Map()).set(id, { ...o, id }); window.__writes = (window.__writes || 0) + 1; emit(c); },
    async delete(){ if (window.__fail) throw { code: "unavailable" }; cols[c]?.delete(id); emit(c); } });
  const db = { collection: c => ({ doc: id => ref(c, id || crypto.randomUUID()), onSnapshot(n){ (ls[c] ||= []).push(n); setTimeout(() => n(snap(c)), 50); return () => {}; } }),
    doc: p => { const [c, i] = p.split("/"); return ref(c, i); } };
  window.__cols = cols;
  window.claude = { use: n => Promise.resolve(n === "db" ? db : null) };
}
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let fallos = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fallos++; };
async function abrir(local, seed){
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  page.on("dialog", d => d.accept());
  await page.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  await page.addInitScript(([local, seed, mockSrc]) => { for (const [k, v] of Object.entries(local)) localStorage.setItem(k, JSON.stringify(v)); eval("(" + mockSrc + ")")(seed); }, [local, seed, mock.toString()]);
  await page.goto(APP); await page.waitForTimeout(600);
  return { page, errs };
}
const toasts = page => page.evaluate(() => document.querySelector("#toast").textContent);
const sesiones = page => page.evaluate(() => [...(window.__cols.sesiones || new Map()).values()]);
const local = page => page.evaluate(() => JSON.parse(localStorage.getItem("gym.run")));

// 1. sin conexión las series se quedan en el móvil y se suben al volver
{
  const { page, errs } = await abrir({ "gym.me": "juan", "gym.voice": false }, { planes: [plan], sesiones: [{ id: "x", athlete: "juan", date: "2026-01-01", sport: "natacion", meters: 1000 }] });
  await page.click(`[data-plan-open="${iso(hoy)}"]`); await page.click('[data-pl="start"]');
  await page.evaluate(() => window.__fail = true);
  await page.click('[data-pl="done"]'); await page.waitForTimeout(100);
  ok(/Sin conexión/.test(await toasts(page)), "avisa de que no hay conexión: " + await toasts(page));
  await page.click('[data-pl="done"]'); await page.waitForTimeout(100);
  ok((await local(page)).unsynced === true, "el entreno queda marcado como pendiente de subir en el móvil");
  ok((await sesiones(page)).length === 1, "no se ha subido nada todavía");
  await page.evaluate(() => { window.__fail = false; window.dispatchEvent(new Event("online")); }); await page.waitForTimeout(300);
  const s = (await sesiones(page)).find(x => x.enCurso);
  ok(s && s.exercises[0].sets.length === 2, "al volver la conexión se suben las 2 series");
  ok((await local(page)).unsynced === false, "y deja de estar pendiente");

  // 2. empezar otro entreno con uno a medias: el de medias se guarda, no se pisa
  await page.click('[data-pl="close"]'); await page.waitForTimeout(200);
  await page.evaluate(() => window.__fail = true);
  await page.click(`[data-plan-open="${iso(manana)}"]`); await page.waitForTimeout(300);
  ok((await local(page)).w.titulo === "Entreno de hoy", "sin conexión no se tira el entreno a medias al empezar otro");
  await page.evaluate(() => { window.__fail = false; document.querySelector("#player").hidden = true; });
  await page.click(`[data-plan-open="${iso(manana)}"]`); await page.waitForTimeout(300);
  const r = await local(page);
  ok(r.w.titulo === "Entreno de mañana" && r.phase === "preview", "con conexión empieza el nuevo");
  ok((await sesiones(page)).some(x => x.enCurso && x.exercises[0].sets.length === 2), "y el de antes sigue guardado como «sin terminar»");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 3. un entreno olvidado hace 10 días: no abre el reproductor, se guarda con sus minutos de verdad y deja el móvil
{
  const t0 = Date.now() - 10 * 864e5;
  const viejo = { w: entreno("Entreno viejo"), steps: [{ bi: 0, ii: 0, s: 1 }, { bi: 0, ii: 0, s: 2 }, { bi: 0, ii: 0, s: 3 }], i: 2, phase: "set", startedAt: t0, lastAt: t0 + 40 * 60000,
    until: null, log: { "0.0": [{ reps: 10, kg: 40 }, { reps: 8, kg: 42.5 }] }, cur: null, athlete: "juan", rpe: null, extra: "", swapped: [], tuned: 0, unsynced: true };
  const { page, errs } = await abrir({ "gym.me": "juan", "gym.voice": false, "gym.run": viejo }, { planes: [plan], sesiones: [] });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.querySelector("#player").hidden), "no abre el reproductor con un entreno de hace 10 días");
  const s = (await sesiones(page))[0];
  ok(s && s.minutes === 40 && s.enCurso && s.exercises[0].sets.length === 2, `se guarda con 40 min (no 240) y sus 2 series: ${s && s.minutes} min`);
  ok((await local(page)) === null, "y sale del móvil");
  ok(/quedó abierto/.test(await toasts(page)), "avisa: " + await toasts(page));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 4. una escritura lenta que acaba bien después de otra que falla no da por subido lo que falta
{
  const { page, errs } = await abrir({ "gym.me": "juan", "gym.voice": false }, { planes: [plan], sesiones: [] });
  await page.click(`[data-plan-open="${iso(hoy)}"]`); await page.click('[data-pl="start"]');
  await page.evaluate(() => window.__delays = [400]);
  await page.click('[data-pl="done"]');
  await page.evaluate(() => window.__fail = true);
  await page.click('[data-pl="done"]'); await page.waitForTimeout(700);
  ok((await local(page)).unsynced === true, "la serie que no se subió sigue pendiente aunque la anterior acabara bien después");
  await page.evaluate(() => { window.__fail = false; window.dispatchEvent(new Event("online")); }); await page.waitForTimeout(300);
  ok((await sesiones(page))[0].exercises[0].sets.length === 2, "y al volver la conexión se suben las 2");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 5 y 6. otro móvil cambió el entreno después: nunca se pisa
for (const [enLaBase, nombre] of [[4, "con más series allí, lo del móvil no se sube encima"], [1, "con menos series allí, tampoco: se avisa y lo del móvil se queda"]]) {
  const t0 = Date.now() - 30 * 60000, sid = `run-juan-${t0}`;
  const movil = { w: entreno("Entreno de hoy"), steps: [1, 2, 3].map(s => ({ bi: 0, ii: 0, s })), i: 2, phase: "set", startedAt: t0, lastAt: Date.now() - 60000,
    until: null, log: { "0.0": [{ reps: 10, kg: 40 }, { reps: 10, kg: 40 }] }, cur: null, athlete: "juan", rpe: null, extra: "", swapped: [], tuned: 0,
    sid, syncedAt: t0 + 60000, unsynced: true };
  const base = { id: sid, athlete: "juan", date: iso(hoy), sport: "gym", enCurso: true, updatedAt: Date.now() - 120000,
    exercises: [{ name: "Press banca", sets: Array.from({ length: enLaBase }, () => ({ reps: 10, kg: 50 })) }] };
  const { page, errs } = await abrir({ "gym.me": "juan", "gym.voice": false, "gym.run": movil }, { planes: [plan], sesiones: [base] });
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForTimeout(400);
  const s = (await sesiones(page))[0];
  ok(s.exercises[0].sets.length === enLaBase && s.exercises[0].sets[0].kg === 50, nombre);
  if (enLaBase < 2) ok(/otro móvil/.test(await toasts(page)) && (await local(page)).log["0.0"].length === 2, "aviso: " + await toasts(page));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 7. el camino normal: tres series, «Guardar entreno», sesión terminada y nada en el móvil
{
  const { page, errs } = await abrir({ "gym.me": "juan", "gym.voice": false }, { planes: [plan], sesiones: [] });
  await page.click(`[data-plan-open="${iso(hoy)}"]`); await page.click('[data-pl="start"]');
  for (let i = 0; i < 3; i++) { await page.click('[data-pl="done"]'); await page.waitForTimeout(80); }
  await page.click('[data-pl="save"]'); await page.waitForTimeout(300);
  const ss = await sesiones(page);
  ok(ss.length === 1 && !ss[0].enCurso && ss[0].exercises[0].sets.length === 3, "se guarda terminada, con sus 3 series y sin duplicar");
  ok((await local(page)) === null && await page.evaluate(() => document.querySelector("#player").hidden), "y se cierra el reproductor");
  ok(/Guardado|guardado/.test(await toasts(page)), "aviso: " + await toasts(page));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 8. los kilos van de uno en uno: lo propuesto sube 1 kg sobre la última vez y − / + mueven 1 kg
{
  const ayer = iso(new Date(Date.now() - 864e5));
  const { page, errs } = await abrir({ "gym.me": "juan", "gym.voice": false }, { planes: [plan], sesiones: [
    { id: "antes", athlete: "juan", date: ayer, sport: "gym", exercises: [{ name: "Press banca", sets: [{ reps: 10, kg: 40 }, { reps: 10, kg: 42 }, { reps: 8, kg: 44 }] }] }] });
  await page.click(`[data-plan-open="${iso(hoy)}"]`); await page.click('[data-pl="start"]'); await page.waitForTimeout(100);
  const kg = () => page.evaluate(() => document.querySelector("#pl-cur-kg")?.value);
  ok(await kg() === "41", "propone 41 kg (40 de la última vez + 1): " + await kg());
  await page.click('#player [data-step="kg"][data-d="1"]');
  ok(await kg() === "42", "el + sube 1 kg: " + await kg());
  await page.click('#player [data-step="kg"][data-d="-1"]'); await page.click('#player [data-step="kg"][data-d="-1"]');
  ok(await kg() === "40", "el − baja 1 kg: " + await kg());
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien"); process.exit(fallos ? 1 : 0);
