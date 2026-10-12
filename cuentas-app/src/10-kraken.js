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
    + (h ? `<div class="meta">Precio de Kraken del ${shortDate(toISO(h))} a las ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}</div>` : "");
}

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
