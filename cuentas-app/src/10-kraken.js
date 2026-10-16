/* ================= Kraken: las criptomonedas, sólo para mirar ================= */
// La Edge Function cuentas-kraken lee con una llave de "Consultar fondos" cuántas monedas hay y las
// pasa a euros con el precio de Kraken del momento. Se mira al abrir la app y al volver a ella
// (como mucho cada 10 minutos). Lo que sale se guarda como el saldo de hoy de la cuenta «Kraken».
let krApi = null, krBusy = false, krErr = "", krLast = 0;
const KR_CADA = 10 * 60 * 1000;
const NFQ = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 });
const NFP = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const krCuenta = () => cuentas().find(c => c.kraken);
const krErrTxt = e => ({ bad_key: "Kraken dice que esa llave no vale. Revisa que has copiado las dos enteras.", no_permission: "Esa llave no tiene permiso para «Consultar fondos». Créala otra vez marcando esa casilla.", not_connected: "Kraken no está conectado.", session_expired: "Se ha cerrado la sesión. Vuelve a entrar." }[e && e.code] || "Ahora mismo no puedo hablar con Kraken. Lo vuelvo a intentar luego.");

async function krApply(r){
  const hoy = toISO(NOW);
  const activos = (r.activos || []).map(a => ({ activo: a.activo, cantidad: num(a.cantidad), precio: a.precio == null ? null : num(a.precio), eur: a.eur == null ? null : r2(num(a.eur)) }));
  const base = cfg.cuentas && cfg.cuentas.length ? cfg.cuentas : cuentas();
  let list = base.map(c => ({ ...c }));
  let c = list.find(x => x.kraken) || list.find(x => x.id === "kraken");
  if (!c) { c = { id: "kraken", nombre: "Kraken", tipo: "inversion", entidad: "Kraken", ancla: null }; list.push(c); }
  const igual = c.kraken && c.ancla && c.ancla.fecha === hoy && Math.abs(num(c.ancla.saldo) - num(r.total)) < 0.01 && JSON.stringify(c.cripto || []) === JSON.stringify(activos);
  if (igual) return;
  Object.assign(c, { kraken: true, ancla: { fecha: hoy, saldo: r2(num(r.total)), ts: Date.now() }, cripto: activos, criptoHora: r.hora || new Date().toISOString() });
  await saveCfg("cuentas", { items: list });
}
async function krRefresh(force){
  if (!krApi || krBusy || !db || dbState !== "ready" || !krCuenta()) return;
  if (!force && Date.now() - krLast < KR_CADA) return;
  krBusy = true; krErr = ""; krLast = Date.now();
  if (tab === "dinero") renderView();
  try { await krApply(await krApi.saldo()); }
  catch (e) { krErr = krErrTxt(e); }
  finally { krBusy = false; if (tab === "dinero" && !typing()) renderView(); }
}
const krAuto = () => { krRefresh(false); };
window.addEventListener("focus", krAuto);

// Las monedas que hay dentro de la cuenta, debajo de su saldo
function criptoHTML(c){
  const as = (c.cripto || []).filter(a => a.cantidad > 0);
  if (!as.length) return "";
  const h = c.criptoHora ? new Date(c.criptoHora) : null;
  return as.map(a => a.activo === "EUR" ? `<div class="meta"><b class="num">${eur(a.cantidad)}</b> en euros, sin invertir</div>` : `<div class="meta"><b class="num">${NFQ.format(a.cantidad)} ${esc(a.activo)}</b>${a.precio != null ? ` a ${NFP.format(a.precio)} € = <b class="num">${eur(a.eur)}</b>` : " · sin precio en euros"}</div>`).join("")
    + (h ? `<div class="meta">Precio de Kraken del ${shortDate(toISO(h))} a las ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}</div>` : "")
    + (krApi && krApi.historico ? as.filter(a => a.activo !== "EUR").map(krHistHTML).join("") : "");
}

/* ---------- Cómo va cada moneda frente al euro ---------- */
// El precio de cierre de cada día (o de cada semana, para «Todo») lo da Kraken a cualquiera, sin llave.
// Se pide al ver la cuenta, como mucho una vez cada hora, y se queda sólo en memoria.
const KR_RANGOS = [["1m", "Mes", 30], ["3m", "3 meses", 91], ["1a", "Año", 365], ["2a", "2 años", 730], ["todo", "Todo", 0]];
// Los precios de menos de un euro, siempre con cuatro decimales para que se puedan comparar
const NFP4 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const krP = v => (Math.abs(v) < 1 ? NFP4 : NFP).format(v);
let krRango = store.get("cj.krrango", "1a");
if (!KR_RANGOS.some(r => r[0] === krRango)) krRango = "1a";
const krHist = {};   // activo → {dias, semanas, at, busy, err}
const krFecha = (t, semana) => { const d = new Date(t); return (semana ? "Semana del " : "") + d.getDate() + " " + MES[d.getMonth()] + " " + d.getFullYear(); };
function krPuntos(activo){
  const h = krHist[activo] || {}, r = KR_RANGOS.find(x => x[0] === krRango);
  if (krRango === "todo" || !(h.dias || []).length) return h.semanas || [];
  const desde = Date.now() - r[2] * 864e5;
  return h.dias.filter(p => p[0] >= desde);
}
async function krHistLoad(activo){
  const h = krHist[activo] || (krHist[activo] = {});
  if (!krApi || !krApi.historico || h.busy || (h.at && Date.now() - h.at < 3600e3)) return;
  h.busy = true; h.err = "";
  try { const r = await krApi.historico(activo); Object.assign(h, { dias: r.dias || [], semanas: r.semanas || [], at: Date.now() }); }
  catch (e) { h.err = "Ahora mismo no puedo traer de Kraken el precio de otros días. Lo vuelvo a intentar en unos minutos."; h.at = Date.now() - 3300e3; }
  finally { h.busy = false; if (tab === "dinero" && !typing()) renderView(); }
}
function krHistHTML(a){
  const h = krHist[a.activo] || {}, pts = krPuntos(a.activo), r = KR_RANGOS.find(x => x[0] === krRango);
  let s = `<div class="kr-hist"><div class="kr-hist-h"><b>Cómo va el ${esc(a.activo)} frente al euro</b><div class="seg" role="group" aria-label="Periodo">${KR_RANGOS.map(([k, n]) => `<button data-krr="${k}" aria-pressed="${k === krRango}">${n}</button>`).join("")}</div></div>`;
  if (pts.length > 1) {
    const p0 = pts[0][1], p1 = pts[pts.length - 1][1], d = (p1 - p0) / p0 * 100;
    const cuando = krRango === "todo" ? "Desde el " + krFecha(pts[0][0]).toLowerCase() : { "1m": "En el último mes", "3m": "En los últimos 3 meses", "1a": "En los últimos 12 meses", "2a": "En los últimos 2 años" }[krRango];
    s += `<p class="small">${cuando}, cada ${esc(a.activo)} ha pasado de <b class="num">${krP(p0)} €</b> a <b class="num">${krP(p1)} €</b>: ${Math.abs(d) < 0.05 ? "<b>igual</b>" : `<b>${d > 0 ? "sube" : "baja"} un ${NF1.format(Math.abs(d))} %</b>`}.`
      + (a.cantidad > 0 ? ` Tus ${NFQ.format(a.cantidad)} ${esc(a.activo)} valían <b class="num">${eur(a.cantidad * p0)}</b> y hoy <b class="num">${eur(a.cantidad * p1)}</b>.` : "") + `</p>`;
    s += `<div class="chart kr-chart" data-activo="${esc(a.activo)}"></div>`;
    s += `<p class="small muted">Precio de cierre de cada ${krRango === "todo" ? "semana" : "día"} en Kraken. Lo de tus monedas está calculado con las que tienes hoy.</p>`;
  } else if (h.err) s += `<p class="small muted">${esc(h.err)}</p>`;
  else if (h.at && !h.busy) s += `<p class="small muted">Kraken no tiene precios en euros de otros días para el ${esc(a.activo)}.</p>`;
  else s += `<p class="small muted" style="display:flex;gap:8px;align-items:center"><span class="spin"></span> Trayendo el precio de cada día…</p>`;
  return s + `</div>`;
}
// Se llama después de pintar la pantalla de Dinero: dibuja las gráficas y pide lo que falte
function krDrawCharts(){
  const c = krCuenta(); if (!c || !krApi || !krApi.historico) return;
  for (const a of (c.cripto || []).filter(x => x.activo !== "EUR" && x.cantidad > 0)) krHistLoad(a.activo);
  for (const el of $$(".kr-chart")) {
    const activo = el.dataset.activo, pts = krPuntos(activo), a = (c.cripto || []).find(x => x.activo === activo) || {}, semana = krRango === "todo";
    if (pts.length > 1) timeLine(el, pts, { unit: "€", label: "Precio de 1 " + activo + " en euros", tip: i => `<b>${krP(pts[i][1])} €</b> cada ${esc(activo)}<div>${krFecha(pts[i][0], semana)}</div>` + (a.cantidad > 0 ? `<div>Tus ${esc(activo)}: ${eur(a.cantidad * pts[i][1])}</div>` : "") });
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-krr]"); if (!b) return;
  krRango = b.dataset.krr; store.set("cj.krrango", krRango); renderView();
});

// El recuadro para conectar Kraken (o ver que ya lo está)
function krakenHTML(){
  const c = krCuenta();
  let h = `<div class="panel"><div class="panel-head"><div><h2>Kraken</h2><p>${c ? "Conectado sólo para mirar: cuántas monedas tienes y cuánto valen hoy. No puede comprar, vender ni sacar nada." : "Conecta tu cuenta de Kraken y te digo cuántas monedas tienes y cuánto valen en euros cada vez que abras la app. Sólo para mirar: no puede comprar, vender ni sacar nada."}</p></div>${c ? `<button class="btn sm" id="kr-refresh"${krApi && !krBusy ? "" : " disabled"}>${krBusy ? `<span class="spin"></span> Mirando…` : "Actualizar"}</button>` : ""}</div>`;
  if (krErr) h += `<div class="banner warn" style="margin-bottom:10px">${esc(krErr)}</div>`;
  if (c) {
    h += `<div class="row"><button class="btn sm ghost" id="kr-off"${krApi ? "" : " disabled"}>Desconectar</button></div>`;
  } else {
    h += `<ol class="small" style="margin:0 0 10px;padding-left:20px;line-height:1.6">
      <li>En kraken.com entra en tu cuenta y ve a <b>Ajustes → API</b>.</li>
      <li>Pulsa <b>Crear clave API</b> y marca <b>sólo</b> «Consultar fondos» (Query Funds). Nada más.</li>
      <li>Copia la <b>clave API</b> y la <b>clave privada</b> y pégalas aquí.</li></ol>
      <div class="fgrid"><div class="f"><label for="kr-key">Clave API</label><input id="kr-key" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
      <div class="f"><label for="kr-sec">Clave privada</label><input id="kr-sec" type="password" autocomplete="off" autocapitalize="none" spellcheck="false"></div></div>
      <div class="row"><button class="btn primary" id="kr-save"${krApi && !krBusy ? "" : " disabled"}>${krBusy ? `<span class="spin"></span> Conectando…` : "Conectar"}</button></div>
      <p class="small muted" style="margin:6px 0 0">La llave se guarda en el servidor, donde la app no la puede volver a leer. Si algún día quieres cortar, bórrala en Kraken y ya no sirve.</p>`;
  }
  return h + `</div>`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("#kr-save, #kr-refresh, #kr-off"); if (!t || !krApi) return;
  if (t.id === "kr-refresh") return krRefresh(true);
  if (t.id === "kr-save") {
    const key = ($("#kr-key") || {}).value || "", sec = ($("#kr-sec") || {}).value || "";
    if (!key.trim() || !sec.trim()) { krErr = "Pega las dos claves: la clave API y la clave privada."; return renderView(); }
    krBusy = true; krErr = ""; renderView();
    try { const r = await krApi.guardar(key, sec); krLast = Date.now(); await krApply(r); toast("Kraken conectado"); }
    catch (err) { krErr = krErrTxt(err); }
    finally { krBusy = false; renderView(); }
    return;
  }
  if (t.id === "kr-off") {
    if (!confirm("¿Desconectar Kraken? La cuenta se queda con el último saldo, pero ya no se actualiza sola.")) return;
    try {
      await krApi.quitar();
      const list = (cfg.cuentas || []).map(c => c.kraken ? { ...c, kraken: false } : c);
      await saveCfg("cuentas", { items: list });
      toast("Kraken desconectado");
    } catch (err) { krErr = krErrTxt(err); renderView(); }
  }
});
