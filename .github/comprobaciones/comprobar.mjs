// Comprueba las webs ya construidas (los index.html que sacan build.sh y build-web.sh):
//   1. que el JavaScript de cada una se lee sin errores (un fallo de sintaxis deja la app en blanco);
//   2. que cada una abre en Chromium sin errores de JavaScript al arrancar. Sin red: supabase-js se sirve
//      desde node_modules (npm i --no-save playwright @supabase/supabase-js@<la de build-web.sh>) y lo demás
//      (fuentes, Supabase) se corta, así que la prueba no depende de nada de fuera.
// Uso: node .github/comprobaciones/comprobar.mjs <index.html>...
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import vm from "node:vm";

const files = process.argv.slice(2);
if (!files.length) { console.error("Uso: node comprobar.mjs <index.html>..."); process.exit(2); }
let fallos = 0;
const mal = (f, msg) => { fallos++; console.log(`::error file=${f}::${msg}`); console.log(`✗ ${f}: ${msg}`); };

// 1. sintaxis: cada <script> sin src, tal y como va en la página
for (const f of files) {
  const html = readFileSync(f, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!scripts.length) { mal(f, "no tiene ningún <script>"); continue; }
  let bien = true;
  for (const code of scripts) {
    try { new vm.Script(code, { filename: f }); }
    catch (e) {
      // el número de línea, dentro del script; se busca el fichero de src/ en el que cae
      bien = false;
      const linea = Number((e.stack.match(/:(\d+)\n/) || [])[1]) || 0;
      const trozo = code.split("\n").slice(0, linea).reverse().map(l => l.match(/^\/\* ===== (.+) ===== \*\/$/)).find(Boolean);
      mal(f, `${e.message}${trozo ? ` (en ${trozo[1]})` : ""}`);
    }
  }
  if (bien) console.log(`✓ ${f}: el JavaScript se lee bien`);
}
if (fallos) process.exit(1);

// 2. arrancar en el navegador
const req = createRequire(import.meta.url);
const bases = [process.cwd() + "/", execSync("npm root -g").toString().trim() + "/"];
const busca = m => { for (const b of bases) { try { return req.resolve(m, { paths: [b] }); } catch {} } return null; };
const pwPath = busca("playwright"), sbPath = busca("@supabase/supabase-js/dist/umd/supabase.js");
if (!pwPath) { console.error("Falta playwright (npm i --no-save playwright)"); process.exit(2); }
const pw = req(pwPath);
const sbJs = sbPath ? readFileSync(sbPath, "utf8") : null;
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const f of files) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.startsWith("file:")) return r.continue();
    if (/\/@supabase\/supabase-js@[^/]+\/dist\/umd\/supabase\.js$/.test(u)) {
      if (sbJs) return r.fulfill({ contentType: "application/javascript", body: sbJs });
      errs.push("falta @supabase/supabase-js en node_modules para servir " + u);
    }
    return r.abort();
  });
  await page.goto(pathToFileURL(resolve(f)).href, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if (errs.length) for (const e of errs) mal(f, `error al arrancar: ${e}`);
  else console.log(`✓ ${f}: arranca sin errores`);
  await page.close();
}
await browser.close();
process.exit(fallos ? 1 : 0);
