/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const num = v => { if (typeof v === "number") return isFinite(v) ? v : 0; let s = String(v ?? "").trim().replace(/\s|€/g, ""); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); const n = parseFloat(s); return isFinite(n) ? n : 0; };
const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const NF2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const eur = v => NF2.format(r2(v || 0)) + " €";
const eur0 = v => NF0.format(Math.round(v || 0)) + " €";
const pct = v => NF0.format(Math.round(v || 0)) + " %";
const pad = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const TODAY = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESL = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIA = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const shortDate = iso => { const d = parseISO(iso); return `${d.getDate()} ${MES[d.getMonth()]}`; };
const longDate = iso => { const d = parseISO(iso); return `${cap(DIA[d.getDay()])} ${d.getDate()} de ${MESL[d.getMonth()]}`; };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }

/* ================= categorías por defecto ================= */
const DEF_CATS = {
  gasto: [
    { id: "casa", nombre: "Casa", cats: [["hipoteca","Hipoteca o alquiler"],["comunidad","Comunidad"],["ibi","IBI y basuras"],["luz","Luz"],["agua","Agua"],["gas","Gas"],["internet","Internet y móvil"],["seguro","Seguro de hogar"],["arreglos","Arreglos y mantenimiento"],["hogar","Muebles y cosas de casa"],["limpieza","Limpieza y droguería"]] },
    { id: "comida", nombre: "Comida", cats: [["super","Supermercado"],["mercado","Fruta, carne y pescado"],["panaderia","Panadería y cafés"]] },
    { id: "fuera", nombre: "Comer fuera y ocio", cats: [["restaurantes","Restaurantes"],["bares","Bares y copas"],["ocio","Ocio y espectáculos"],["viajes","Viajes y vacaciones"]] },
    { id: "coche", nombre: "Coche y transporte", cats: [["gasolina","Gasolina"],["taller","Taller e ITV"],["seguro","Seguro del coche"],["parking","Parking y peajes"],["impuesto","Impuesto de circulación"],["transporte","Taxi, tren y avión"]] },
    { id: "salud", nombre: "Salud y deporte", cats: [["medico","Médico y dentista"],["farmacia","Farmacia"],["deporte","Gimnasio y deporte"],["seguro","Seguro médico"]] },
    { id: "personal", nombre: "Ropa y cuidado", cats: [["ropa","Ropa y calzado"],["peluqueria","Peluquería y cuidado"]] },
    { id: "familia", nombre: "Familia", cats: [["colegio","Colegio y formación"],["actividades","Actividades de los niños"],["mascotas","Mascotas"],["ayudas","Ayudas a la familia"]] },
    { id: "compras", nombre: "Compras", cats: [["tecnologia","Tecnología"],["regalos","Regalos"],["internet","Compras por internet"],["otras","Otras compras"]] },
    { id: "suscr", nombre: "Suscripciones", cats: [["apps","Series, música y apps"],["cuotas","Cuotas y asociaciones"]] },
    { id: "finanzas", nombre: "Impuestos y banco", cats: [["irpf","IRPF y Hacienda"],["comisiones","Comisiones del banco"],["intereses","Intereses de préstamos y tarjetas"],["prestamos","Otros pagos de préstamos"],["seguros","Seguros de vida"]] },
    { id: "otros", nombre: "Otros gastos", cats: [["varios","Varios"],["efectivo","Efectivo sin justificar"]] }
  ],
  ingreso: [
    { id: "trabajo", nombre: "Trabajo", cats: [["nomina","Nómina"],["extra","Pagas extra y bonus"],["honorarios","Honorarios y facturas"]] },
    { id: "empresa", nombre: "Empresa", cats: [["dividendos","Dividendos"],["socio","Retribución de socio"]] },
    { id: "rentas", nombre: "Rentas", cats: [["alquileres","Alquileres"],["intereses","Intereses de depósitos"],["inversiones","Rendimientos de inversiones"]] },
    { id: "otrosi", nombre: "Otros ingresos", cats: [["hacienda","Devolución de Hacienda"],["ventas","Venta de cosas"],["regalos","Regalos recibidos"],["reembolsos","Reembolsos y devoluciones"],["varios","Varios"]] }
  ]
};
const ACC_TYPES = { banco: "Cuenta de banco", efectivo: "Efectivo", deposito: "Depósito a plazo", inversion: "Inversión", ahorro: "Cuenta de ahorro", prestamo: "Préstamo o hipoteca", credito: "Tarjeta de crédito" };
const DEBT = t => t === "prestamo" || t === "credito";
const BANKS = ["Santander","BBVA","CaixaBank","Sabadell","Unicaja","Cajasur","Bankinter","ING","Openbank","Kutxabank","Abanca","Ibercaja","Cajamar","Revolut","MyInvestor","Trade Republic"];
const EVERY = { 1: "cada mes", 2: "cada dos meses", 3: "cada trimestre", 6: "cada seis meses", 12: "una vez al año" };

/* ================= estado ================= */
// WEB = la web suelta (GitHub Pages + Supabase, con usuario y contraseña); si no, el Artifact de Claude.
const WEB = !!window.CJ_WEB;
let db = null, sample = null, assets = null, imgCaps = null;
// Dirección de la foto de un ticket: en Claude sale directa; en la web se pide un enlace
// temporal a la carpeta privada y se repinta cuando llega.
const TK = {};
function ticketSrc(id, onReady){
  if (!id) return "";
  if (!WEB) return "/_blob/" + id;
  if (TK[id]) return TK[id] === "…" ? "" : TK[id];
  TK[id] = "…";
  if (assets && assets.signedUrl) assets.signedUrl(id).then(u => { TK[id] = u || ""; if (u && onReady) onReady(); }).catch(() => { delete TK[id]; });
  else delete TK[id];
  return "";
}
let dbState = "loading";           // loading | ready | none
let meses = {};                    // "2026-09" -> doc data
let cfg = { cuentas: null, cats: null, prefs: {} };
let anios = {};                    // "2026" -> {recurrentes, presupuesto, objetivos}
let MOVS = [];                     // todos los movimientos, más nuevos primero
const NOW = TODAY();
const CUR_Y = NOW.getFullYear();
const MAX_Y = Math.max(2040, CUR_Y + 1);   // hasta dónde se puede mirar
let Y = Math.min(MAX_Y, Math.max(CUR_Y - 15, parseInt(store.get("cj.year", CUR_Y)) || CUR_Y));
let tab = store.get("cj.tab", "anio");

// Las categorías guardadas antes de existir las deudas no traen la de intereses: se añade al vuelo.
let _catsSrc = null, _catsOut = null;
function cats(){
  const src = cfg.cats || DEF_CATS;
  if (src !== _catsSrc) {
    _catsSrc = src;
    const c = JSON.parse(JSON.stringify(src));
    const f = c.gasto.find(g => g.id === "finanzas");
    if (!f) c.gasto.push({ id: "finanzas", nombre: "Impuestos y banco", cats: [["intereses", "Intereses de préstamos y tarjetas"]] });
    else if (!f.cats.some(x => x[0] === "intereses")) f.cats.unshift(["intereses", "Intereses de préstamos y tarjetas"]);
    _catsOut = c;
  }
  return _catsOut;
}
function cuentas(){ return (cfg.cuentas && cfg.cuentas.length ? cfg.cuentas : [{ id: "efectivo", nombre: "Efectivo", tipo: "efectivo", entidad: "", ancla: null }]).filter(c => c && !c.borrada); }
function cuenta(id){ return cuentas().find(c => c.id === id) || null; }
// Subida de precios al año que se aplica a los gastos de los años que vienen (Juan la puede cambiar)
const subida = () => { const v = cfg.prefs && cfg.prefs.subida; return v == null || v === "" ? 3 : num(v); };
// Los fijos de un año que viene sin fijos propios son los del último año que los tenga
function recsFor(y){
  const own = anio(y).recurrentes;
  if (own.length || y <= CUR_Y) return { list: own, from: y };
  for (let k = y - 1; k >= CUR_Y - 1; k--) { const l = anio(k).recurrentes; if (l.length) return { list: l, from: k }; }
  return { list: [], from: y };
}
function anio(y){ const a = anios[String(y)] || {}; return { recurrentes: a.recurrentes || [], presupuesto: a.presupuesto || {}, objetivos: a.objetivos || [] }; }

// Índice de categorías: "grupo.cat" -> {tipo, grupo, gNombre, nombre}
let CATIDX = {};
function buildCatIdx(){
  CATIDX = {};
  for (const tipo of ["gasto", "ingreso"]) for (const g of cats()[tipo] || []) for (const [cid, nombre] of g.cats || []) CATIDX[g.id + "." + cid] = { tipo, grupo: g.id, gNombre: g.nombre, nombre };
}
const catName = id => CATIDX[id] ? CATIDX[id].nombre : "Sin categoría";
const catGroup = id => CATIDX[id] ? CATIDX[id].grupo : "_sin";
const groupName = (tipo, gid) => gid === "_sin" ? "Sin categoría" : ((cats()[tipo] || []).find(g => g.id === gid) || {}).nombre || gid;
function catOptions(tipo, sel){
  let h = `<option value="">— Elige categoría —</option>`;
  for (const g of cats()[tipo] || []) {
    h += `<optgroup label="${esc(g.nombre)}">`;
    for (const [cid, nombre] of g.cats || []) { const id = g.id + "." + cid; h += `<option value="${id}"${id === sel ? " selected" : ""}>${esc(nombre)}</option>`; }
    h += `</optgroup>`;
  }
  return h;
}
function accOptions(sel, withNone){
  let h = withNone ? `<option value="">— Sin decir —</option>` : "";
  for (const c of cuentas()) h += `<option value="${c.id}"${c.id === sel ? " selected" : ""}>${esc(c.nombre)}</option>`;
  return h;
}

/* ================= movimientos ================= */
// Un movimiento: {id, fecha, tipo gasto|ingreso|traspaso, cuenta, destino, comercio, nota, total, lineas[{concepto,cat,importe}], origen, ticket, revisar, creado, banco}
function cleanMov(m){
  const tipo = ["gasto","ingreso","traspaso"].includes(m.tipo) ? m.tipo : "gasto";
  const lineas = tipo === "traspaso" ? [] : (m.lineas || []).filter(l => l && (num(l.importe) || l.concepto)).map(l => ({ concepto: String(l.concepto || "").slice(0, 120), cat: l.cat || "", importe: r2(num(l.importe)) }));
  return {
    id: m.id || uid(), fecha: m.fecha, tipo, cuenta: m.cuenta || "", destino: tipo === "traspaso" ? (m.destino || "") : "",
    comercio: String(m.comercio || "").slice(0, 80), nota: String(m.nota || "").slice(0, 400),
    total: r2(Math.abs(num(m.total))), lineas, origen: m.origen || "mano", ticket: m.ticket || null,
    revisar: !!m.revisar, creado: m.creado || Date.now(), banco: m.banco || null, deuda: m.deuda || null
  };
}
function rebuild(){
  const all = [];
  for (const [k, d] of Object.entries(meses)) for (const m of Object.values((d && d.items) || {})) if (m && m.fecha && m.id) all.push(m);
  all.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
  MOVS = all;
  STATS = {}; FC = {};
}
// Reparto de un movimiento por categoría; lo que no cuadra con el total va a "sin categoría".
function splits(m){
  if (m.tipo === "traspaso") return [];
  const out = []; let s = 0;
  for (const l of m.lineas || []) { const v = num(l.importe); if (!v) continue; out.push({ cat: CATIDX[l.cat] ? l.cat : "", v }); s += v; }
  const rest = r2(num(m.total) - s);
  if (Math.abs(rest) >= 0.01) out.push({ cat: "", v: rest });
  return out;
}
// Efecto de un movimiento en una cuenta
function eff(m, cid){
  const t = num(m.total);
  if (m.tipo === "gasto") return m.cuenta === cid ? -t : 0;
  if (m.tipo === "ingreso") return m.cuenta === cid ? t : 0;
  return (m.destino === cid ? t : 0) - (m.cuenta === cid ? t : 0);
}
// Saldo de una cuenta al final del día `iso`. El ancla es el saldo que Juan dijo en una fecha.
function saldo(c, iso){
  const a = c.ancla || { fecha: "1900-01-01", saldo: 0, ts: 0 };
  const after = m => m.fecha > a.fecha || (m.fecha === a.fecha && (m.creado || 0) > (a.ts || 0));
  let s = num(a.saldo);
  for (const m of MOVS) {
    const e = eff(m, c.id); if (!e) continue;
    const isAfter = after(m);
    if (isAfter && m.fecha <= iso) s += e;
    else if (!isAfter && m.fecha > iso) s -= e;
  }
  return r2(s);
}
const LIQUID = t => t === "banco" || t === "efectivo" || t === "ahorro";
// Lo que debes hoy (en positivo) en una deuda, y si la cuota de un mes ya está apuntada
const debe = (c, iso) => Math.max(0, -saldo(c, iso));
const cuotaPagada = (c, y, mo) => MOVS.some(m => m.tipo === "traspaso" && m.destino === c.id && m.fecha.startsWith(y + "-" + pad(mo + 1)));
// Reparto de una cuota: intereses del mes sobre lo que queda, y el resto a devolver
function repartoCuota(c, total, iso){
  const pend = debe(c, iso);
  const interes = c.tipo === "prestamo" ? r2(pend * num(c.tin) / 1200) : 0;
  const capital = r2(Math.min(pend || total, Math.max(0, total - interes)));
  return { capital, interes: r2(total - capital) };
}
// Cuándo acabas de pagar un préstamo al ritmo de su cuota
function finPrestamo(c){
  let pend = debe(c, toISO(NOW)); const cu = num(c.cuota), t = num(c.tin) / 1200;
  if (!pend) return null; if (!cu || cu <= pend * t) return false;
  let n = 0, int = 0;
  while (pend > 0.005 && n < 720) { const i = pend * t; int += i; pend -= Math.min(pend, cu - i); n++; }
  return { meses: n, fecha: new Date(NOW.getFullYear(), NOW.getMonth() + n - (cuotaPagada(c, NOW.getFullYear(), NOW.getMonth()) ? 0 : 1), 1), intereses: int };
}

/* ================= números del año ================= */
let STATS = {};
function yearStats(y){
  if (STATS[y]) return STATS[y];
  const z = () => Array(12).fill(0);
  const st = { ing: z(), gas: z(), I: 0, G: 0, byCat: { gasto: {}, ingreso: {} }, byCatMonth: { gasto: {}, ingreso: {} }, byGroupMonth: { gasto: {}, ingreso: {} }, n: 0, revisar: 0, lastDate: null };
  for (const m of MOVS) {
    if (!m.fecha.startsWith(y + "-")) continue;
    st.n++; if (m.revisar) st.revisar++;
    if (!st.lastDate || m.fecha > st.lastDate) st.lastDate = m.fecha;
    if (m.tipo === "traspaso") continue;
    const mo = parseISO(m.fecha).getMonth();
    const t = num(m.total);
    if (m.tipo === "gasto") { st.gas[mo] += t; st.G += t; } else { st.ing[mo] += t; st.I += t; }
    for (const sp of splits(m)) {
      const ck = sp.cat || "_sin";
      const bc = st.byCat[m.tipo]; bc[ck] = (bc[ck] || 0) + sp.v;
      (st.byCatMonth[m.tipo][ck] ||= z())[mo] += sp.v;
      const g = sp.cat ? catGroup(sp.cat) : "_sin";
      const bg = st.byGroupMonth[m.tipo]; (bg[g] ||= z())[mo] += sp.v;
    }
  }
  STATS[y] = st;
  return st;
}
const sum = a => a.reduce((s, v) => s + v, 0);

// Qué meses están cerrados para la previsión: en el año en curso, los anteriores al mes de hoy.
function yearPhase(y){ return y < CUR_Y ? "pasado" : y > CUR_Y ? "futuro" : "actual"; }

// Ocurrencias de un fijo en un mes (0-11) del año
function recHits(r, mo){
  const every = Math.max(1, parseInt(r.cada) || 1);
  const start = Math.min(12, Math.max(1, parseInt(r.mes) || 1)) - 1;
  const end = r.hasta ? Math.min(12, Math.max(1, parseInt(r.hasta))) - 1 : 11;
  if (mo < start || mo > end) return false;
  return (mo - start) % every === 0;
}

// La previsión: lo real hasta hoy + lo fijo que queda + la media de lo variable, categoría a categoría.
let FC = {};
function forecast(y){
  if (FC[y]) return FC[y];
  const st = yearStats(y);
  const phase = yearPhase(y);
  const rf = recsFor(y);
  const upG = f => Math.pow(1 + subida() / 100, Math.max(0, f));   // factor de subida de los gastos
  const recs = rf.list.filter(r => rf.from === y || !r.hasta).map(r => r.tipo === "ingreso" || rf.from === y ? r : { ...r, importe: num(r.importe) * upG(y - rf.from) });
  const firstPrev = phase === "pasado" ? 12 : phase === "futuro" ? 0 : NOW.getMonth();
  const curMo = phase === "actual" ? NOW.getMonth() : -1;

  // meses de referencia para la media: los 3 anteriores al mes en curso que tengan algo apuntado
  const ref = phase === "actual" ? new Date(y, NOW.getMonth(), 1) : new Date(CUR_Y, NOW.getMonth(), 1);
  const back = [];
  for (let k = 1; k <= 3; k++) { const d = new Date(ref.getFullYear(), ref.getMonth() - k, 1); back.push([d.getFullYear(), d.getMonth()]); }
  const withData = back.filter(([yy, mo]) => yearStats(yy).gas[mo] > 0 || yearStats(yy).ing[mo] > 0);
  const varBase = withData.length ? `la media de ${withData.length === 1 ? "el último mes" : "los últimos " + withData.length + " meses"}` : (phase === "actual" ? "lo que llevas este mes, estirado al mes entero" : "");

  const ing = st.ing.slice(), gas = st.gas.slice();
  const pIng = Array(12).fill(0), pGas = Array(12).fill(0), pCap = Array(12).fill(0);
  const hayPrestamo = cuentas().some(c => c.tipo === "prestamo" && c.ancla && num(c.cuota) > 0);
  const catPrev = { gasto: {}, ingreso: {} };
  let varAvg = 0;
  if (phase !== "pasado") {
    for (const tipo of ["gasto", "ingreso"]) {
      const P = tipo === "gasto" ? pGas : pIng;
      const keys = new Set(Object.keys(CATIDX).filter(k => CATIDX[k].tipo === tipo)); keys.add("_sin");
      const recT = recs.filter(r => (r.tipo === "ingreso" ? "ingreso" : "gasto") === tipo);
      for (const cat of keys) {
        const mine = recT.filter(r => (r.cat && CATIDX[r.cat] ? r.cat : "_sin") === cat);
        const fixed = mine.length > 0 && cat !== "_sin";
        let avg = 0;
        if (tipo === "gasto" && !fixed && !(cat === "finanzas.intereses" && hayPrestamo)) {
          if (withData.length) avg = sum(withData.map(([yy, mo]) => ((yearStats(yy).byCatMonth.gasto[cat] || [])[mo] || 0))) / withData.length;
          else if (phase === "actual") avg = ((st.byCatMonth.gasto[cat] || [])[curMo] || 0) / NOW.getDate() * daysIn(y, curMo);
          if (avg < 0) avg = 0;
          if (phase === "futuro") avg *= upG(y - CUR_Y);
          varAvg += avg;
        }
        const real = st.byCatMonth[tipo][cat] || [];
        let tot = 0;
        for (let mo = firstPrev; mo < 12; mo++) {
          let fx = 0; for (const r of mine) if (recHits(r, mo)) fx += num(r.importe);
          const exp = fx + avg;
          const p = mo === curMo ? Math.max(0, exp - (real[mo] || 0)) : exp;
          P[mo] += p; tot += p;
        }
        if (tot) catPrev[tipo][cat] = tot;
      }
    }
  }
  // intereses de depósitos a plazo que quedan por cobrar este año
  let intereses = 0;
  if (phase !== "pasado") {
    for (const c of cuentas()) {
      if (c.tipo !== "deposito" || !num(c.tae)) continue;
      const from = phase === "actual" ? NOW : new Date(y, 0, 1);
      const endY = new Date(y, 11, 31);
      const vence = c.vence ? parseISO(c.vence) : endY;
      const until = vence < endY ? vence : endY;
      if (until <= from) continue;
      const v = saldo(c, toISO(from)) * num(c.tae) / 100 * ((until - from) / 864e5) / 365;
      if (v > 0) { pIng[until.getMonth()] += v; intereses += v; catPrev.ingreso["rentas.intereses"] = (catPrev.ingreso["rentas.intereses"] || 0) + v; }
    }
  }
  // préstamos: de cada cuota, los intereses son gasto y el resto es deuda que devuelves
  const deudaFin = {};
  let interesesDeuda = 0;
  for (const c of cuentas()) {
    if (!DEBT(c.tipo) || !c.ancla) continue;
    let pend = phase === "futuro" && y - 1 >= CUR_Y && forecast(y - 1).deudaFin[c.id] != null ? forecast(y - 1).deudaFin[c.id] : -saldo(c, phase === "pasado" ? `${y}-12-31` : toISO(NOW));
    if (phase !== "pasado" && c.tipo === "prestamo" && num(c.cuota) > 0) {
      const fin = c.termina ? parseISO(c.termina) : null;
      for (let mo = firstPrev; mo < 12 && pend > 0.005; mo++) {
        if (fin && new Date(y, mo, 1) > fin) break;
        if (mo === curMo && cuotaPagada(c, y, mo)) continue;
        const int = pend * num(c.tin) / 1200, capi = Math.min(pend, Math.max(0, num(c.cuota) - int));
        pGas[mo] += int; interesesDeuda += int; pCap[mo] += capi; pend -= capi;
        if (int) catPrev.gasto["finanzas.intereses"] = (catPrev.gasto["finanzas.intereses"] || 0) + int;
      }
    }
    deudaFin[c.id] = r2(Math.max(0, pend));
  }
  const I = st.I + sum(pIng), G = st.G + sum(pGas);

  // dinero a fin de cada mes, sumando todas las cuentas
  const all = cuentas().filter(c => !DEBT(c.tipo));
  const hayCuentas = all.some(c => c.ancla);
  const saldoMes = [];
  let last = null;
  for (let mo = 0; mo < 12; mo++) {
    if (mo < firstPrev) {
      last = sum(all.map(c => saldo(c, toISO(new Date(y, mo + 1, 0)))));
      saldoMes.push({ v: r2(last), prev: false });
    } else if (mo === curMo) {
      last = sum(all.map(c => saldo(c, toISO(NOW)))) + pIng[mo] - pGas[mo] - pCap[mo];
      saldoMes.push({ v: r2(last), prev: "parcial" });
    } else {
      if (last == null) last = y > CUR_Y ? forecast(y - 1).saldoFin : sum(all.map(c => saldo(c, toISO(new Date(y, mo, 0)))));
      last += pIng[mo] - pGas[mo] - pCap[mo];
      saldoMes.push({ v: r2(last), prev: true });
    }
  }
  FC[y] = { phase, ing, gas, pIng, pGas, I, G, ahorro: I - G, firstPrev, varAvg, varBase, intereses, saldoMes, saldoFin: saldoMes[11].v, hayCuentas, recs, recsFrom: rf.from, catPrev, pCap, deudaFin, deudaFinTotal: r2(sum(Object.values(deudaFin))), interesesDeuda, hayDeudas: cuentas().some(c => DEBT(c.tipo) && c.ancla) };
  return FC[y];
}

// Previsión de fin de año de un grupo de categorías (para el presupuesto)
function groupForecast(y, tipo, gid){
  const f = forecast(y), st = yearStats(y);
  const real = st.byGroupMonth[tipo][gid] ? sum(st.byGroupMonth[tipo][gid]) : 0;
  let prev = 0;
  for (const [cat, v] of Object.entries(f.catPrev[tipo])) if ((cat === "_sin" ? "_sin" : catGroup(cat)) === gid) prev += v;
  return { real, fin: real + prev };
}

// Ahorro medio al mes de los últimos meses con datos (para los objetivos)
function ahorroMedio(){
  const out = [];
  for (let k = 1; k <= 6; k++) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - k, 1);
    const key = d.getFullYear() + "-" + pad(d.getMonth() + 1);
    let i = 0, g = 0, any = false;
    for (const m of MOVS) if (m.fecha.startsWith(key) && m.tipo !== "traspaso") { any = true; if (m.tipo === "ingreso") i += num(m.total); else g += num(m.total); }
    if (any) out.push(i - g);
  }
  return out.length ? { v: sum(out) / out.length, n: out.length } : null;
}
