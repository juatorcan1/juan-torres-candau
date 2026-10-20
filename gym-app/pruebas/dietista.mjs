// Prueba del Dietista: lo que no te gusta comer se guarda en el perfil sin pisar el resto, se le pasa a Claude
// y se puede quitar desde la Dieta. Abre gym-app/index.html (de ./build.sh) en Chromium con una base de datos y
// un Claude de mentira: sin red. Uso: gym-app/build.sh && node gym-app/pruebas/dietista.mjs
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const APP = pathToFileURL(fileURLToPath(new URL("../index.html", import.meta.url))).href;
const perfil = { id: "juan", athlete: "juan", goal: "ganar", height: 178, age: 35, comidas: 3, notas: { "Press banca": "agarre cerrado" }, noGusta: ["Burpee"] };
function mock(seed){
  const cols = {};
  for (const [c, docs] of Object.entries(seed)) cols[c] = new Map(docs.map(d => [d.id, d]));
  const snap = c => ({ docs: [...(cols[c] || new Map()).values()].map(d => ({ id: d.id, data: () => d })) });
  const ref = (c, id) => ({ id, async set(o){ (cols[c] ||= new Map()).set(id, { ...o, id }); }, async delete(){ cols[c]?.delete(id); } });
  const db = { collection: c => ({ doc: id => ref(c, id || crypto.randomUUID()), onSnapshot(n){ setTimeout(() => n(snap(c)), 50); return () => {}; } }), doc: p => { const [c, i] = p.split("/"); return ref(c, i); } };
  // Claude de mentira: devuelve en orden las respuestas de window.__replies y apunta los prompts
  window.__cols = cols; window.__prompts = []; window.__replies = [];
  const sample = async p => { window.__prompts.push(p); return JSON.stringify(window.__replies.shift() || { respuesta: "Hecho." }); };
  sample.json = async p => { window.__prompts.push(p); return window.__replies.shift() || { respuesta: "Hecho." }; };
  window.claude = { use: n => Promise.resolve(n === "db" ? db : n === "sample" ? sample : null) };
}
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let fallos = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fallos++; };
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
await page.addInitScript(([seed, src]) => { localStorage.setItem("gym.me", '"juan"'); eval("(" + src + ")")(seed); }, [{ perfiles: [perfil] }, mock.toString()]);
await page.goto(APP); await page.waitForTimeout(500);
const doc = () => page.evaluate(() => window.__cols.perfiles.get("juan"));
// habla con el Dietista como un botón de sugerencia (data-say) y espera a que conteste
async function say(text, reply){
  await page.evaluate(([text, reply]) => { window.__replies.push(reply); const b = document.createElement("button"); b.dataset.say = "nutri"; b.dataset.text = text; document.body.append(b); b.click(); b.remove(); }, [text, reply]);
  await page.waitForTimeout(300);
}

await say("No me gusta el atún ni la coliflor", { respuesta: "Apuntado, nada de atún.", plan: null, no_gusta: ["Atún", "coliflor"] });
let p = await doc();
ok(JSON.stringify(p.noComida) === JSON.stringify(["atún", "coliflor"]), "lo que no le gusta comer se guarda en el perfil");
ok(p.goal === "ganar" && p.comidas === 3 && p.notas && p.notas["Press banca"] === "agarre cerrado" && p.noGusta?.[0] === "Burpee", "el resto del perfil sigue igual");

await say("Hazme el menú de la semana", { respuesta: "Menú listo." });
const prompt = await page.evaluate(() => window.__prompts.at(-1));
ok(/nunca se los pongas\): atún, coliflor/.test(prompt), "el Dietista recibe lo que no le gusta");
ok(prompt.includes("no se repite dos días seguidos") && prompt.includes("Los días de gimnasio, más hidratos"), "el Dietista recibe las reglas de variedad y de días de entreno");
ok(prompt.includes('"no_gusta"') && !prompt.includes("Ejercicios que no le gustan"), "el prompt del Dietista es el suyo, no el del Entrenador");

await page.evaluate(() => { document.querySelector('[data-top="dietista"]').click(); document.querySelector('[data-leaf="dieta"]')?.click(); });
await page.waitForTimeout(200);
ok(await page.evaluate(() => !!document.querySelector('[data-unfood="atún"]')), "la Dieta enseña lo que no le gusta");
await page.evaluate(() => document.querySelector('[data-unfood="atún"]').click()); await page.waitForTimeout(200);
p = await doc();
ok(JSON.stringify(p.noComida) === JSON.stringify(["coliflor"]) && p.goal === "ganar" && p.noGusta?.[0] === "Burpee", "tocarlo lo quita y deja el resto");

await say("Ya me gusta la coliflor", { respuesta: "Vuelve la coliflor.", si_gusta: ["Coliflor"] });
ok(JSON.stringify((await doc()).noComida) === "[]", "si vuelve a quererlo, sale de la lista");
ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
await browser.close();
console.log(fallos ? `${fallos} fallos` : "todo bien");
process.exit(fallos ? 1 : 0);
