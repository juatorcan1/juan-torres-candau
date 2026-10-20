// Pruebas de que la web de las cuentas no pisa un mes entero de movimientos con lo que tiene el móvil: otro
// móvil apunta algo que aquí no ha llegado (sin el aviso del cambio), y luego se guarda aquí. Abre la versión
// web (cuentas-app/web/index.html, de ./build-web.sh) en Chromium con un Supabase de mentira en memoria: no usa
// la red ni toca el Supabase de verdad.
// Uso: cuentas-app/build-web.sh && node cuentas-app/pruebas/guardado.mjs   (necesita playwright: npm i --no-save playwright)
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const pw = (() => { for (const b of [process.cwd(), execSync("npm root -g").toString().trim()]) { try { return require(require.resolve("playwright", { paths: [b] })); } catch {} } throw new Error("Falta playwright (npm i --no-save playwright)"); })();
const { chromium } = pw;
const APP = pathToFileURL(fileURLToPath(new URL("../web/index.html", import.meta.url))).href;
const UID = "11111111-1111-1111-1111-111111111111";
const mes = new Date().toISOString().slice(0, 7);
const mov = (id, total, comercio) => ({ id, tipo: "gasto", fecha: mes + "-01", total, cuenta: "banco", comercio, lineas: [{ concepto: "", cat: "", importe: total }], origen: "mano" });

// supabase-js de mentira (lo que usa src/web/09-web.js), con cuentas_docs en memoria. Sin avisos en tiempo real,
// como un móvil que no se ha enterado de un cambio. window.__antesDeCambiar(n) se llama antes de cada update, y
// con window.__fallaEscritura = n falla la escritura número n (sin conexión a mitad).
function fakeSupabase(UID, seed){
  const rows = window.__rows = seed.map(r => ({ owner: UID, ...r }));
  window.__rpc = [];
  const clone = o => JSON.parse(JSON.stringify(o));
  const key = r => [r.owner, r.collection, r.id].join("/");
  let updates = 0;
  class Q {
    constructor(t){ this.t = t; this.f = []; this.op = null; }
    select(){ this.op ||= "select"; return this; }
    eq(k, v){ this.f.push([k, v]); return this; }
    maybeSingle(){ this.one = true; return this; }
    insert(v){ this.op = "insert"; this.v = v; return this; }
    upsert(v){ this.op = "upsert"; this.v = v; return this; }
    update(v){ this.op = "update"; this.v = v; return this; }
    delete(){ this.op = "delete"; return this; }
    then(ok, ko){ return Promise.resolve().then(() => this.run()).then(ok, ko); }
    run(){
      if (this.t === "cuentas_usuarios") return { data: { nombre: "Juan" }, error: null };
      if (["insert", "upsert", "update"].includes(this.op) && window.__fallaEscritura && --window.__fallaEscritura === 0) return { data: null, error: { code: "08006", message: "sin conexión" } };
      const hit = r => this.f.every(([k, v]) => r[k] === v);
      if (this.op === "select") { const d = rows.filter(hit).map(clone); return { data: this.one ? d[0] || null : d, error: null }; }
      if (this.op === "insert") {
        if (rows.some(r => key(r) === key(this.v))) return { data: null, error: { code: "23505", message: "duplicate key" } };
        rows.push(clone(this.v)); return { data: null, error: null };
      }
      if (this.op === "upsert") { const i = rows.findIndex(r => key(r) === key(this.v)); if (i >= 0) rows[i] = clone(this.v); else rows.push(clone(this.v)); return { data: null, error: null }; }
      if (this.op === "update") {
        if (window.__antesDeCambiar) window.__antesDeCambiar(++updates);
        const d = rows.filter(hit); for (const r of d) Object.assign(r, clone(this.v));
        return { data: d.map(r => ({ id: r.id })), error: null };
      }
      if (this.op === "delete") { for (const r of rows.filter(hit)) rows.splice(rows.indexOf(r), 1); return { data: null, error: null }; }
    }
  }
  const session = { user: { id: UID }, access_token: "x" };
  window.supabase = { createClient: () => ({
    from: t => new Q(t),
    rpc: n => { window.__rpc.push(n); return Promise.resolve({ data: 0, error: null }); },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange(){}, signOut: async () => {}, updateUser: async () => ({}) },
    storage: { from: () => ({ upload: async () => ({ error: { message: "sin red" } }), createSignedUrl: async () => ({ data: null }), remove: async () => ({}) }) }
  }) };
}
// lo que hace otro móvil: escribe directamente en la base, sin que este se entere
const otroMovil = (page, id, total, comercio) => page.evaluate(([mes, m]) => {
  const r = window.__rows.find(r => r.collection === "movs" && r.id === mes);
  if (r) { r.data.items[m.id] = m; r.updated_at = new Date().toISOString(); }
  else window.__rows.push({ owner: window.__rows[0]?.owner || "11111111-1111-1111-1111-111111111111", collection: "movs", id: mes, data: { mes, items: { [m.id]: m } }, updated_at: new Date().toISOString() });
}, [mes, mov(id, total, comercio)]);
const items = page => page.evaluate(m => { const r = window.__rows.find(r => r.collection === "movs" && r.id === m); return r ? r.data.items : {}; }, mes);
const doc = (page, col, id) => page.evaluate(([c, i]) => { const r = window.__rows.find(r => r.collection === c && r.id === i); return r ? r.data : null; }, [col, id]);
// otro móvil cambia un documento directamente en la base
const otroCambia = (page, col, id, fn) => page.evaluate(([c, i, f]) => { const r = window.__rows.find(r => r.collection === c && r.id === i); (0, eval)("(" + f + ")")(r.data); r.updated_at = new Date().toISOString(); }, [col, id, fn.toString()]);
const mesSig = (() => { const d = new Date(mes + "-15"); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })();

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let fallos = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) fallos++; };
async function abrir(seed){
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.startsWith("file:")) return r.continue();
    if (/supabase-js@[^/]+\/dist\/umd\/supabase\.js$/.test(u)) return r.fulfill({ contentType: "application/javascript", body: `(${fakeSupabase})(${JSON.stringify(UID)}, ${JSON.stringify(seed)});` });
    return r.abort();
  });
  await page.goto(APP); await page.waitForTimeout(500);
  return { page, errs };
}
async function apuntarAMano(page, total, comercio){
  await page.click('.bnav [data-tab="apuntar"], .fab'); await page.click('[data-way="mano"]');
  await page.fill('[data-k="total"]', String(total)); await page.fill('[data-k="comercio"]', comercio);
  await page.click("[data-edsave]"); await page.waitForTimeout(300);
}
const base = [
  { collection: "config", id: "cuentas", data: { items: [{ id: "banco", nombre: "Banco", tipo: "banco", saldo: 0 }] }, updated_at: "2026-10-05T10:44:13.956331+00:00" },
  { collection: "movs", id: mes, data: { mes, items: { a: mov("a", 10, "Mercadona") } }, updated_at: "2026-10-19T15:41:36.752+00:00" }
];

// 1. otro móvil apunta «b» y aquí no llega; al apuntar «c» aquí, «b» sigue en la base
{
  const { page, errs } = await abrir(base);
  ok(await page.evaluate(() => window.__rpc.includes("cuentas_copia_semanal")), "al entrar pide la copia semanal");
  await otroMovil(page, "b", 20, "Repsol");
  await apuntarAMano(page, 30, "Carrefour");
  const it = await items(page);
  ok(it.a && it.b, "no se pierde lo apuntado en el otro móvil (a y b siguen): " + Object.keys(it).join(", "));
  ok(Object.values(it).some(m => m.comercio === "Carrefour" && m.total === 30), "y se guarda lo nuevo");
  ok(Object.keys(it).length === 3, "tres movimientos, ni más ni menos");

  // 2. dos móviles guardan a la vez: el otro escribe justo entre la lectura y la escritura de este
  await page.evaluate(() => { window.__antesDeCambiar = n => { if (n === 1) { const r = window.__rows.find(r => r.collection === "movs"); r.data.items.d = { id: "d", tipo: "gasto", fecha: r.id + "-02", total: 5, cuenta: "banco", comercio: "Bar", lineas: [], origen: "mano" }; r.updated_at = new Date(Date.now() + 5).toISOString(); } }; });
  await page.evaluate(async m => { const db = await window.claude.use("db"); await db.doc("movs/" + m).update({ items: { e: { id: "e", tipo: "gasto", fecha: m + "-03", total: 7, cuenta: "banco", comercio: "Kiosco", lineas: [], origen: "mano" } } }); }, mes);
  const it2 = await items(page);
  ok(it2.d && it2.e && it2.a && it2.b, "a la vez: se vuelve a leer y se quedan los dos (d y e): " + Object.keys(it2).join(", "));

  // 3. borrar uno solo quita ese
  await page.evaluate(() => { window.__antesDeCambiar = null; });
  await page.evaluate(async m => { const db = await window.claude.use("db"); await db.doc("movs/" + m).update({ items: { e: null } }); }, mes);
  const it3 = await items(page);
  ok(!it3.e && it3.a && it3.b && it3.d, "borrar «e» deja los demás");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 4. el mes no existe al abrir y otro móvil lo crea antes de guardar aquí: no se pisa
{
  const { page, errs } = await abrir([base[0]]);
  await otroMovil(page, "b", 20, "Repsol");
  await apuntarAMano(page, 30, "Carrefour");
  const it = await items(page);
  ok(it.b && Object.values(it).some(m => m.comercio === "Carrefour"), "mes nuevo creado a la vez en otro móvil: están los dos: " + Object.keys(it).join(", "));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 5. mes nuevo de verdad: se crea
{
  const { page, errs } = await abrir([base[0]]);
  await apuntarAMano(page, 30, "Carrefour");
  const it = await items(page);
  ok(Object.keys(it).length === 1 && Object.values(it)[0].comercio === "Carrefour", "un mes que no existía se crea con lo apuntado");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 6. el mismo movimiento cambiado a la vez: en otro móvil la nota, aquí el importe; se quedan los dos
{
  const { page, errs } = await abrir(base);
  await otroCambia(page, "movs", mes, d => { d.items.a.nota = "del otro móvil"; });
  await page.click('.bnav [data-tab="movs"]'); await page.click('[data-mov="a"]');
  await page.fill("#edit-total", "15"); await page.click('[data-edsave="edit"]'); await page.waitForTimeout(300);
  const a = (await items(page)).a;
  ok(a && a.total === 15 && a.nota === "del otro móvil", "mismo movimiento a la vez: se quedan el importe de aquí y la nota del otro: " + JSON.stringify(a && { total: a.total, nota: a.nota }));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 7. pasarlo a otro mes y que la conexión falle a mitad: no se pierde (como mucho queda en los dos meses)
{
  const { page, errs } = await abrir(base);
  await page.click('.bnav [data-tab="movs"]'); await page.click('[data-mov="a"]');
  await page.fill("#edit-fecha", mesSig + "-02");
  await page.evaluate(() => { window.__fallaEscritura = 2; });
  await page.click('[data-edsave="edit"]'); await page.waitForTimeout(300);
  const viejo = await items(page), nuevo = (await doc(page, "movs", mesSig)) || { items: {} };
  ok(!!(viejo.a || nuevo.items.a), "cambio de mes con un fallo entre medias: el movimiento sigue en algún mes");
  await page.evaluate(() => { window.__fallaEscritura = 0; });
  await page.click('[data-edsave="edit"]'); await page.waitForTimeout(300);
  const v2 = await items(page), n2 = (await doc(page, "movs", mesSig)) || { items: {} };
  ok(!v2.a && n2.items.a && n2.items.a.fecha === mesSig + "-02", "al volver a darle a Guardar queda solo en el mes nuevo");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 8. preferencias: en otro móvil se elige la cuenta habitual y aquí se cambia la subida de precios; se quedan las dos
{
  const { page, errs } = await abrir(base.concat([{ collection: "config", id: "prefs", data: { subida: 2 }, updated_at: "2026-10-05T10:44:13.956331+00:00" }]));
  await otroCambia(page, "config", "prefs", d => { d.cuentaHabitual = "banco"; });
  await page.click('.bnav [data-tab="prevision"]'); await page.click('[data-psub="fijos"]');
  await page.fill("#pref-subida", "3"); await page.dispatchEvent("#pref-subida", "change"); await page.waitForTimeout(300);
  const pr = await doc(page, "config", "prefs");
  ok(pr && pr.subida === 3 && pr.cuentaHabitual === "banco", "preferencias de los dos móviles: " + JSON.stringify(pr));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 9. la lista de cuentas mezclada elemento a elemento
{
  const cs = { collection: "config", id: "cuentas", data: { items: [{ id: "banco", nombre: "Banco", tipo: "banco", saldo: 0 }, { id: "viejo", nombre: "Vieja", tipo: "banco" }, { id: "caja", nombre: "Caja", tipo: "efectivo" }] }, updated_at: "2026-10-05T10:44:13.956331+00:00" };
  const { page, errs } = await abrir([cs, base[1]]);
  // el otro: añade una cuenta, cambia el nombre del banco y toca «caja»
  await otroCambia(page, "config", "cuentas", d => { d.items.push({ id: "kraken", nombre: "Kraken", tipo: "inversion" }); d.items[0].nombre = "Banco Uno"; d.items[2].nota = "la del cajón"; });
  // aquí: el saldo del banco, quitar «viejo» y quitar «caja» (que el otro acaba de cambiar)
  await page.evaluate(async () => {
    const db = await window.claude.use("db"), ref = db.doc("config/cuentas"), base = ref.snapshot();
    const mine = { items: base.items.filter(c => c.id !== "viejo" && c.id !== "caja").map(c => c.id === "banco" ? { ...c, saldo: 100 } : c) };
    await ref.save(base, mine);
  });
  const it = (await doc(page, "config", "cuentas")).items, by = Object.fromEntries(it.map(c => [c.id, c]));
  ok(by.banco && by.banco.saldo === 100 && by.banco.nombre === "Banco Uno", "la misma cuenta: el saldo de aquí y el nombre del otro");
  ok(by.kraken && !by.viejo, "la cuenta nueva del otro se queda y la que quité aquí se va");
  ok(by.caja && by.caja.nota === "la del cajón", "una cuenta quitada aquí pero cambiada en el otro se queda");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 10. lo de otro móvil llega con la hoja del movimiento abierta: al guardar no se deshace
{
  const { page, errs } = await abrir(base);
  await page.click('.bnav [data-tab="movs"]'); await page.click('[data-mov="a"]');
  await otroCambia(page, "movs", mes, d => { d.items.a.nota = "llegó con la hoja abierta"; d.items.a.drive = { fileId: "f1", nombre: "x.pdf", ruta: "r" }; });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await page.waitForTimeout(300);
  await page.fill("#edit-total", "12"); await page.click('[data-edsave="edit"]'); await page.waitForTimeout(300);
  const a = (await items(page)).a;
  ok(a && a.total === 12 && a.nota === "llegó con la hoja abierta" && a.drive && a.drive.fileId === "f1", "lo llegado con la hoja abierta se queda (nota y Drive): " + JSON.stringify(a && { total: a.total, nota: a.nota, drive: !!a.drive }));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 11. las líneas guardadas con las claves en otro orden (como las devuelve Postgres) no cuentan como cambiadas
{
  const pg = { ...mov("a", 10, "Mercadona"), lineas: [{ cat: "", importe: 10, concepto: "" }] };
  const { page, errs } = await abrir([base[0], { ...base[1], data: { mes, items: { a: pg } } }]);
  await page.click('.bnav [data-tab="movs"]'); await page.click('[data-mov="a"]');
  await otroCambia(page, "movs", mes, d => { d.items.a.lineas[0].concepto = "Compra de la semana"; });
  await page.fill("#edit-nota", "aquí solo la nota"); await page.click('[data-edsave="edit"]'); await page.waitForTimeout(300);
  const a = (await items(page)).a;
  ok(a && a.nota === "aquí solo la nota" && a.lineas[0].concepto === "Compra de la semana", "cambiar la nota no deshace la línea cambiada en el otro: " + JSON.stringify(a && a.lineas));
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
// 12. tricounts (con key), categorías ([id, nombre]), conjuntos, el ancla entera y un documento que aquí no estaba
{
  const tc = { collection: "config", id: "tricount", data: { items: [{ key: "t1", titulo: "Viaje", fuera: ["1"], pasados: [] }] }, updated_at: "2026-10-05T10:44:13.956331+00:00" };
  const cat = { collection: "config", id: "categorias", data: { gasto: [{ id: "casa", nombre: "Casa", cats: [["luz", "Luz"]] }], ingreso: [] }, updated_at: "2026-10-05T10:44:13.956331+00:00" };
  const cs = { collection: "config", id: "cuentas", data: { items: [{ id: "banco", nombre: "Banco", tipo: "banco", ancla: { fecha: "2026-10-20", saldo: 50, ts: 1 } }] }, updated_at: "2026-10-05T10:44:13.956331+00:00" };
  const { page, errs } = await abrir([tc, cat, cs, base[1]]);
  await otroCambia(page, "config", "tricount", d => { d.items.push({ key: "t2", titulo: "Cena" }); d.items[0].fuera.push("2"); });
  await otroCambia(page, "config", "categorias", d => { d.gasto[0].cats.push(["agua", "Agua"]); });
  await otroCambia(page, "config", "cuentas", d => { d.items[0].ancla = { fecha: "2026-09-01", saldo: 10, ts: 2 }; });
  const r = await page.evaluate(async () => {
    const db = await window.claude.use("db");
    const go = async (path, f) => { const ref = db.doc(path), b = ref.snapshot(), m = JSON.parse(JSON.stringify(b)); f(m); await ref.save(b, m); };
    await go("config/tricount", d => { d.items[0].pasados.push("3"); d.items[0].fuera = d.items[0].fuera.filter(x => x !== "1"); });
    await go("config/categorias", d => { d.gasto[0].cats.push(["gas", "Gas"]); });
    await go("config/cuentas", d => { d.items[0].ancla = { fecha: "2026-10-20", saldo: 99, ts: 3 }; });
    // un año que aquí no estaba y otro móvil acaba de crear con un fijo
    window.__rows.push({ owner: window.__rows[0].owner, collection: "anios", id: "2027", data: { recurrentes: [{ id: "r1", nombre: "Luz" }], presupuesto: {}, objetivos: [] }, updated_at: new Date().toISOString() });
    const ref = db.doc("anios/2027"); await ref.save(ref.snapshot(), { recurrentes: [{ id: "r2", nombre: "Agua" }], presupuesto: {}, objetivos: [] });
    const g = (c, i) => window.__rows.find(x => x.collection === c && x.id === i).data;
    return { tc: g("config", "tricount"), cat: g("config", "categorias"), cs: g("config", "cuentas"), an: g("anios", "2027") };
  });
  ok(r.tc.items.map(x => x.key).join() === "t1,t2", "tricounts por su key: se quedan los dos");
  ok(r.tc.items[0].fuera.join() === "2" && r.tc.items[0].pasados.join() === "3", "«fuera» y «pasados» como conjuntos: " + JSON.stringify(r.tc.items[0]));
  ok(r.cat.gasto[0].cats.map(x => x[0]).join() === "luz,agua,gas", "categorías del mismo grupo en los dos: " + r.cat.gasto[0].cats.map(x => x[0]).join());
  ok(r.cs.items[0].ancla.fecha === "2026-10-20" && r.cs.items[0].ancla.saldo === 99, "el ancla va entera (fecha y saldo de aquí): " + JSON.stringify(r.cs.items[0].ancla));
  ok(r.an.recurrentes.map(x => x.id).join() === "r1,r2", "un año creado a la vez en otro móvil: se quedan los dos fijos");
  ok(!errs.length, "sin errores de JavaScript " + errs.join(" | "));
  await page.close();
}
await browser.close();
console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo bien");
process.exit(fallos ? 1 : 0);
