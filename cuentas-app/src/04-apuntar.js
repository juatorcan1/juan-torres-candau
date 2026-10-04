/* ================= editor de un movimiento ================= */
const DRAFTS = {};   // clave -> borrador
function newDraft(extra = {}){
  return Object.assign({ tipo: "gasto", fecha: toISO(NOW), total: "", cuenta: defaultAccount(), destino: "", comercio: "", nota: "", lineas: [{ concepto: "", cat: "", importe: "" }], ticket: null, origen: "mano", revisar: false }, extra);
}
function defaultAccount(){
  const p = cfg.prefs && cfg.prefs.cuentaHabitual;
  if (p && cuenta(p)) return p;
  const b = cuentas().find(c => c.tipo === "banco"); return (b || cuentas()[0] || {}).id || "";
}
function cashAccount(){ const c = cuentas().find(c => c.tipo === "efectivo"); return c ? c.id : ""; }
// ¿Este ticket ya está apuntado? Mismo número de factura o ticket, o mismo día, mismo importe y mismo sitio.
const numNorm = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function repetido(d){
  if (d.tipo === "traspaso") return null;
  const tot = r2(Math.abs(num(d.total))), n = numNorm(d.factura && d.factura.numero);
  const sitio = norm(d.comercio).split(" ")[0] || "";
  return MOVS.find(m => m.id !== d.id && m.tipo === d.tipo && (
    (n.length >= 4 && numNorm(m.factura && m.factura.numero) === n) ||
    (m.fecha === d.fecha && tot > 0 && Math.abs(num(m.ticketTotal || m.total) - tot) < 0.01 && (!sitio || !m.comercio || norm(m.comercio).split(" ")[0] === sitio))
  )) || null;
}
function linesSum(d){ return r2(sum((d.lineas || []).map(l => num(l.importe)))); }
function editorHTML(key){
  const d = DRAFTS[key]; if (!d) return "";
  const t = d.tipo;
  const img = d.ticketUrl || (d.ticket ? ticketSrc(d.ticket, () => repaintEditor(key)) : "");
  let h = `<div class="ed" data-ed="${key}">`;
  if (d.iaNote) h += `<div class="ia-note">${esc(d.iaNote)}</div>`;
  if (d.pregunta) {
    const l = d.lineas[d.pregunta.linea];
    h += `<div class="ia-ask"><b>La IA te pregunta:</b> ${esc(d.pregunta.texto)}${l && l.concepto ? ` <span class="muted">(${esc(l.concepto)})</span>` : ""}<div class="chips" style="margin-top:8px">${d.pregunta.opciones.map(o => `<button type="button" data-pregcat="${esc(o.cat)}">${esc(o.etiqueta)} <small class="muted">· ${esc(catName(o.cat))}</small></button>`).join("")}</div></div>`;
  }
  const rep = d.id ? null : repetido(d);
  if (rep) h += `<div class="ia-note" style="background:var(--warn-bg);color:var(--ink)"><b>Ojo: parece que este ticket ya está apuntado</b> — ${esc(rep.comercio || "sin sitio")}, ${shortDate(rep.fecha)}${parseISO(rep.fecha).getFullYear() !== CUR_Y ? " de " + parseISO(rep.fecha).getFullYear() : ""}, ${eur(rep.total)}${rep.drive ? ", ya en Drive" : ""}. Si es el mismo, descártalo. Si es otro distinto, guárdalo.</div>`;
  h += `<div class="${img ? "ed-top" : ""}">${img ? `<button type="button" class="thumb" data-zoom="${esc(img)}" aria-label="Ver el ticket en grande"><img src="${esc(img)}" alt="Ticket"></button>` : ""}
    <div class="fgrid">
      <div class="f wide"><span class="lab">Qué es</span><div class="seg" role="group"><button type="button" data-edtipo="gasto" aria-pressed="${t === "gasto"}">Gasto</button><button type="button" data-edtipo="ingreso" aria-pressed="${t === "ingreso"}">Ingreso</button><button type="button" data-edtipo="traspaso" aria-pressed="${t === "traspaso"}">Paso entre mis cuentas</button></div></div>
      <div class="f"><label for="${key}-fecha">Fecha</label><input type="date" id="${key}-fecha" data-k="fecha" value="${esc(d.fecha || "")}"></div>
      <div class="f"><label for="${key}-total">Total €</label><input id="${key}-total" data-k="total" inputmode="decimal" value="${esc(d.total === "" ? "" : String(d.total).replace(".", ","))}" placeholder="0,00"></div>
      <div class="f"><label for="${key}-cuenta">${t === "traspaso" ? "Sale de" : t === "ingreso" ? "Entra en" : "Pagado con"}</label><select id="${key}-cuenta" data-k="cuenta">${accOptions(d.cuenta, true)}</select></div>
      ${t === "traspaso" ? `<div class="f"><label for="${key}-destino">Va a</label><select id="${key}-destino" data-k="destino">${accOptions(d.destino, true)}</select></div>` : `<div class="f"><label for="${key}-comercio">${t === "ingreso" ? "De quién" : "Dónde"}</label><input id="${key}-comercio" data-k="comercio" value="${esc(d.comercio)}" placeholder="${t === "ingreso" ? "Empresa, Hacienda…" : "Mercadona, Repsol…"}"></div>`}
    </div></div>`;
  if (t !== "traspaso") {
    h += `<div class="lines"><div class="ln-row hd"><span>Concepto</span><span class="c">Categoría</span><span style="text-align:right">Importe €</span><span></span></div>`;
    d.lineas.forEach((l, i) => {
      h += `<div class="ln-row"><input data-li="${i}" data-lk="concepto" value="${esc(l.concepto)}" placeholder="Qué" aria-label="Concepto"><select class="c" data-li="${i}" data-lk="cat" aria-label="Categoría">${catOptions(t, l.cat)}</select><input class="n" data-li="${i}" data-lk="importe" inputmode="decimal" value="${esc(l.importe === "" ? "" : String(l.importe).replace(".", ","))}" placeholder="${d.lineas.length === 1 ? "todo" : "0,00"}" aria-label="Importe"><button type="button" class="x" data-lidel="${i}" aria-label="Quitar línea">×</button></div>`;
    });
    h += `</div><div class="row"><button type="button" class="btn sm" data-liadd="1">+ Otra categoría</button></div><div class="sumcheck" id="${key}-sum"></div>`;
  }
  if (t !== "traspaso" && !d.id) {
    const tot = r2(Math.abs(num(d.total))), parte = r2(Math.abs(num(d.parte)));
    h += `<div class="f parte"><label for="${key}-parte">Mi parte (€) <small>(si sólo pagaste o tomaste una parte del ticket)</small></label><input id="${key}-parte" data-k="parte" inputmode="decimal" value="${esc(d.parte === "" || d.parte == null ? "" : typeof d.parte === "number" ? NF2.format(d.parte) : d.parte)}" placeholder="todo">`;
    if (d.pagos && d.pagos.length > 1) h += `<div class="small" style="margin-top:6px">Se pagó en varias veces. ¿Cuál fue lo tuyo?</div><div class="chips sm" style="margin-top:4px">${d.pagos.map(p => `<button type="button" data-parte="${p.importe}" aria-pressed="${Math.abs(parte - p.importe) < 0.005}">${esc(cap(p.forma || "pago"))} ${esc(NF2.format(p.importe))} €</button>`).join("")}</div>`;
    if (parte > 0 && tot > 0 && parte < tot - 0.005) h += `<div class="small muted" style="margin-top:6px">Guardo ${eur(parte)} como gasto tuyo (cada línea en proporción, el ${pct(parte / tot * 100)}). El ticket entero se archiva igual.</div>`;
    h += `</div>`;
  } else if (d.ticketTotal) h += `<p class="small muted" style="margin:0">Es tu parte de un ticket de ${eur(d.ticketTotal)}.</p>`;
  h += `<div class="f"><label for="${key}-nota">Nota <small>(opcional)</small></label><input id="${key}-nota" data-k="nota" value="${esc(d.nota)}"></div>`;
  h += `<div class="ed-foot"><button type="button" class="btn primary" data-edsave="${key}">${d.id ? "Guardar cambios" : "Guardar"}</button>${d.id ? `<span class="sp"></span><button type="button" class="btn danger" data-eddel="${key}">${d.confirmDel ? "Sí, bórralo" : "Borrar"}</button>` : `<button type="button" class="btn ghost" data-eddrop="${key}">Descartar</button>`}<span class="err" id="${key}-err"></span></div>`;
  return h + `</div>`;
}
function paintSum(key){
  const d = DRAFTS[key], box = document.getElementById(key + "-sum"); if (!d || !box) return;
  const tot = num(d.total), s = linesSum(d), empties = d.lineas.filter(l => l.importe === "" || l.importe == null).length;
  if (empties === 1 && tot) { box.className = "sumcheck ok"; box.innerHTML = `<span>La línea sin importe se lleva lo que falta: <b class="num">${eur(tot - s)}</b></span>`; return; }
  const diff = r2(tot - s);
  if (!tot && s) { box.className = "sumcheck bad"; box.innerHTML = `<span>Las líneas suman <b class="num">${eur(s)}</b>.</span><button type="button" class="btn sm" data-fixtotal="${key}">Poner ese total</button>`; return; }
  if (Math.abs(diff) < 0.01) { box.className = "sumcheck ok"; box.innerHTML = tot ? `<span>Cuadra: las líneas suman el total.</span>` : `<span>Pon el total.</span>`; return; }
  box.className = "sumcheck bad";
  box.innerHTML = `<span>${diff > 0 ? "Faltan" : "Sobran"} <b class="num">${eur(Math.abs(diff))}</b> para llegar al total.</span><button type="button" class="btn sm" data-fixrest="${key}">${diff > 0 ? "Añadir lo que falta" : "Ajustar la última línea"}</button>`;
}
function readEd(key, el){
  const d = DRAFTS[key]; if (!d || !el) return;
  if (el.dataset.k) d[el.dataset.k] = el.value;
  else if (el.dataset.li != null) {
    const l = d.lineas[+el.dataset.li]; if (l) l[el.dataset.lk] = el.value;
    if (el.dataset.lk === "cat" && d.pregunta && +el.dataset.li === d.pregunta.linea) d.pregunta = null;   // elegida a mano: ya está contestada
  }
}
function repaintEditor(key){
  const box = document.querySelector(`.ed[data-ed="${key}"]`); if (!box) return;
  const wrap = document.createElement("div"); wrap.innerHTML = editorHTML(key);
  box.replaceWith(wrap.firstElementChild); paintSum(key);
}
// Borrador -> movimiento listo para guardar (o un error en palabras llanas)
function draftToMov(d){
  if (!d.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return { err: "Falta la fecha." };
  let total = r2(Math.abs(num(d.total)));
  const lineas = (d.lineas || []).map(l => ({ concepto: l.concepto || "", cat: l.cat || "", importe: l.importe === "" || l.importe == null ? null : r2(num(l.importe)) }));
  if (d.tipo !== "traspaso") {
    const empty = lineas.filter(l => l.importe == null);
    const s = r2(sum(lineas.filter(l => l.importe != null).map(l => l.importe)));
    if (!total && s) total = s;
    if (empty.length === 1) empty[0].importe = r2(total - s);
    for (const l of lineas) if (l.importe == null) l.importe = 0;
  }
  if (!total) return { err: "Falta el total." };
  if (d.tipo === "traspaso") {
    if (!d.cuenta || !d.destino) return { err: "Di de qué cuenta sale y a cuál va." };
    if (d.cuenta === d.destino) return { err: "La cuenta de salida y la de llegada son la misma." };
  }
  // una categoría que no existe (o de otro tipo) no se guarda: la línea queda «sin categoría» y por revisar
  for (const l of lineas) if (l.cat && !(CATIDX[l.cat] && CATIDX[l.cat].tipo === d.tipo)) l.cat = "";
  const m = cleanMov({ ...d, total, lineas: lineas.filter(l => l.importe || l.concepto || l.cat) });
  if (m.tipo !== "traspaso") {
    const s = linesSum(m);
    const diff = r2(m.total - s);
    if (Math.abs(diff) >= 0.01) {
      // lo que no cuadra no se pierde: va a una línea aparte, en la categoría de la línea más grande
      const big = m.lineas.slice().sort((a, b) => b.importe - a.importe)[0];
      m.lineas.push({ concepto: diff > 0 ? "Resto del ticket" : "Ajuste", cat: big ? big.cat : "", importe: diff });
    }
    m.revisar = m.lineas.some(l => !l.cat) || !m.lineas.length || !!d.pregunta;
    // sólo una parte es tuya: el gasto es tu parte (cada línea en proporción) y se guarda el total del papel
    const parte = r2(Math.abs(num(d.parte)));
    if (!d.id && parte > 0 && parte < m.total - 0.005) {
      const f = parte / m.total;
      m.lineas = m.lineas.map(l => ({ ...l, importe: r2(l.importe * f) }));
      const res = r2(parte - linesSum(m));
      if (Math.abs(res) >= 0.005 && m.lineas.length) { const big = m.lineas.slice().sort((a, b) => b.importe - a.importe)[0]; big.importe = r2(big.importe + res); }
      m.ticketTotal = m.total; m.total = parte;
      const aviso = `Mi parte de un ticket de ${eur(m.ticketTotal)}`;
      m.nota = (m.nota ? m.nota + " · " : "") + aviso;
    }
  } else m.revisar = false;
  return { mov: m };
}

/* ================= escribir en la base ================= */
const queues = {};
function serial(path, fn){ const p = (queues[path] || Promise.resolve()).then(fn); queues[path] = p.catch(() => {}); return p; }
let movsReady = false;
async function putItems(key, items){
  return serial("movs/" + key, async () => {
    const ref = db.doc("movs/" + key);
    if (meses[key]) {
      try { await ref.update({ items }); return; }
      catch (e) { if (!e || e.code !== "invalid_argument") throw e; }
    }
    const cur = (meses[key] && meses[key].items) || {};
    const merged = { ...cur, ...items };
    await ref.set({ mes: key, items: merged });
    meses[key] = { mes: key, items: merged };
  });
}
async function saveMovs(list){
  if (!db || !movsReady) throw { code: "nodb" };
  const by = {};
  for (const m of list) (by[m.fecha.slice(0, 7)] ||= {})[m.id] = m;
  for (const [k, items] of Object.entries(by)) await putItems(k, items);
}
async function deleteMov(m){ if (!db) throw { code: "nodb" }; await putItems(m.fecha.slice(0, 7), { [m.id]: null }); }
async function saveCfg(name, data){ if (!db) throw { code: "nodb" }; return serial("config/" + name, () => db.doc("config/" + name).set(data)); }
async function saveAnio(y, patch){
  if (!db) throw { code: "nodb" };
  const cur = anio(y);
  const doc = { recurrentes: cur.recurrentes, presupuesto: cur.presupuesto, objetivos: cur.objetivos, ...patch };
  anios[String(y)] = doc; FC = {};
  return serial("anios/" + y, () => db.doc("anios/" + y).set(doc));
}
const saveErr = e => e && e.code === "nodb" ? (WEB ? "No hay conexión con la base de datos: revisa internet y vuelve a entrar." : "Aquí no se puede guardar: abre la página desde tu cuenta de Claude.") : e && e.code === "quota_exceeded" ? "Se ha llenado el espacio de la app." : "No se ha podido guardar. Prueba otra vez.";

async function saveDraft(key){
  const d = DRAFTS[key]; if (!d) return;
  const errBox = document.getElementById(key + "-err");
  const r = draftToMov(d);
  if (r.err) { if (errBox) errBox.textContent = r.err; return; }
  // repetido: el primer «Guardar» sólo avisa; si se vuelve a pulsar, es que es otro ticket y se guarda
  if (!d.id && repetido(d) && !d.repOk) { d.repOk = true; if (errBox) errBox.textContent = "Parece repetido (mira el aviso de arriba). Si es otro ticket, dale otra vez a Guardar."; return; }
  const btn = document.querySelector(`[data-edsave="${key}"]`); if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  try {
    const m = r.mov;
    if (d.blob && !m.ticket && assets) {
      try { const up = await assets.upload(d.blob); m.ticket = up.id; d.ticket = up.id; } catch { /* sin foto, pero el gasto se guarda igual */ }
    }
    if (d.id && d.origFecha && d.origFecha.slice(0, 7) !== m.fecha.slice(0, 7)) await deleteMov({ id: d.id, fecha: d.origFecha });
    const antes = d.id ? MOVS.find(x => x.id === d.id) : null;
    // si cambias dónde fue, el nombre de Drive sale de lo que pones tú, no de la razón social que leyó la IA
    if (antes && m.factura && norm(m.comercio) !== norm(antes.comercio)) m.factura = { ...m.factura, proveedor: "", cif: "" };
    await saveMovs([m]);
    if ((m.ticket || d.pdf) && !m.drive) driveUp(m, d.pdf);
    else if (m.drive && antes && (antes.fecha !== m.fecha || num(antes.total) !== num(m.total) || norm(antes.comercio) !== norm(m.comercio))) driveUp(m, null, false, true);
    if (d.onSaved) d.onSaved(m);
    toast(d.id ? "Cambios guardados" : m.tipo === "gasto" ? "Gasto guardado" : m.tipo === "ingreso" ? "Ingreso guardado" : "Traspaso guardado");
    delete DRAFTS[key];
    if (key === "edit") closeSheet(); else { removeJob(key); renderView(); }
  } catch (e) {
    if (errBox) errBox.textContent = saveErr(e);
    if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
  }
}

/* ================= archivar los tickets en Google Drive (sólo en la web) ================= */
// Como Senda: 02 - JUAN / 04 - FACTURAS / 01 Tickets / año / trimestre / AAAAMMDD_PROVEEDOR_IMPORTE€_NUMERO.pdf.
// Lo hace la Edge Function cuentas-drive; aquí sólo se le pasa el ticket y se apunta en el movimiento
// dónde ha quedado (m.drive). De uno en uno, en cola, para no atascar.
let driveApi = null, driveCola = Promise.resolve(), driveErr = "";
const toB64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = ko; r.readAsDataURL(blob); });
function driveUp(m, pdf, quiet, renombrar){
  if (!driveApi) return Promise.resolve(false);
  const p = driveCola.then(async () => {
    try {
      const f = m.factura || {};
      const it = { id: m.id, fecha: m.fecha, proveedor: f.proveedor || m.comercio, cif: f.cif || "", numero: f.numero || "", total: m.ticketTotal || m.total };
      if (renombrar && m.drive && m.drive.fileId) it.fileId = m.drive.fileId;
      else if (pdf && pdf.size < 10e6) { it.data = await toB64(pdf); it.mime = "application/pdf"; } else if (m.ticket) it.ticket = m.ticket; else return false;
      const [r] = await driveApi.subir([it]);
      if (!r || !r.ok) throw { message: (r && r.error) || "" };
      const drive = { fileId: r.fileId, nombre: r.nombre, ruta: r.ruta, enlace: r.enlace || "" };
      await putItems(m.fecha.slice(0, 7), { [m.id]: { drive, driveError: null } });
      driveErr = "";
      return true;
    } catch (e) {
      driveErr = e && e.code === "no_drive" ? "Falta el permiso de Google Drive (mira «Tickets en Drive», en Dinero)." : "No se ha podido subir a Drive" + (e && e.message ? ": " + e.message : ".");
      // el porqué se queda en el movimiento: así se puede mirar después y se reintenta solo más tarde
      try { await putItems(m.fecha.slice(0, 7), { [m.id]: { driveError: { msg: String(driveErr).slice(0, 300), code: (e && e.code) || "", at: Date.now() } } }); } catch {}
      if (!quiet) toast(e && e.code === "no_drive" ? "Guardado, pero falta el permiso de Google Drive" : "Guardado, pero no se ha podido subir a Drive");
      return false;
    }
  });
  driveCola = p.catch(() => {});
  return p;
}

// Al abrir la web, los tickets que se quedaron sin subir (porque falló Drive o no había conexión) se suben
// solos, en segundo plano. Uno que falló se vuelve a intentar pasada media hora.
let driveAutoHecho = false;
async function driveAuto(){
  if (driveAutoHecho || !driveApi || !movsReady) return;
  driveAutoHecho = true;
  const faltan = MOVS.filter(m => m.ticket && !m.drive && !(m.driveError && Date.now() - num(m.driveError.at) < 30 * 6e4)).slice(0, 10);
  let ok = 0;
  for (const m of faltan) { if (await driveUp(m, null, true)) ok++; else if (/permiso|carpeta/.test(driveErr)) break; }
  if (ok) toast(ok === 1 ? "Subido a Drive un ticket que faltaba" : `Subidos a Drive ${ok} tickets que faltaban`);
  if (faltan.length && tab === "dinero" && !typing()) renderView();
}

/* ================= hoja para ver o cambiar un movimiento ================= */
function openMov(id){
  const m = MOVS.find(x => x.id === id); if (!m) return;
  DRAFTS.edit = { ...JSON.parse(JSON.stringify(m)), origFecha: m.fecha, lineas: m.lineas.length ? JSON.parse(JSON.stringify(m.lineas)) : [{ concepto: "", cat: "", importe: "" }] };
  openSheet(`<div class="sheet-h"><h2>${esc(movTitle(m))}</h2><button class="x" data-close="1" aria-label="Cerrar">×</button></div>
    <p class="small muted" style="margin:0">${longDate(m.fecha)} · ${m.origen === "ticket" ? "leído de un ticket" : m.origen === "extracto" ? "del extracto del banco" : m.origen === "texto" ? "dictado" : m.origen === "cuota" ? "cuota de una deuda" : m.origen === "prestado" ? "dinero que te deben" : "apuntado a mano"}${m.banco ? " · ya visto en el banco" : ""}${m.revisar ? ` · <span class="flag">por revisar</span>` : ""}</p>
    ${m.drive ? `<p class="small muted" style="margin:0">En Drive: ${m.drive.enlace ? `<a href="${esc(m.drive.enlace)}" target="_blank" rel="noopener">${esc(m.drive.nombre)}</a>` : esc(m.drive.nombre)} <span class="muted">(${esc(m.drive.ruta)})</span></p>` : ""}
    ${editorHTML("edit")}`);
  paintSum("edit");
}
function openSheet(html){
  $("#sheet-root").innerHTML = `<div class="sheet-back" data-close="1"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.style.overflow = "hidden";
  const f = $("#sheet-root .sheet input, #sheet-root .sheet button"); if (f) f.focus({ preventScroll: true });
}
function closeSheet(){ $("#sheet-root").innerHTML = ""; document.body.style.overflow = ""; delete DRAFTS.edit; }

/* ================= apuntar: ticket, dictado, a mano, extracto ================= */
let way = store.get("cj.way", "ticket");
const JOBS = [];   // {key, kind, state: leyendo|listo|error, name, err}
function removeJob(key){ const i = JOBS.findIndex(j => j.key === key); if (i >= 0) { const j = JOBS[i]; if (j.url) try { URL.revokeObjectURL(j.url); } catch {} JOBS.splice(i, 1); } delete DRAFTS[key]; }
function renderApuntar(){
  const el = $("#v-apuntar");
  const canImg = !!(sample && imgCaps && imgCaps.images);
  let h = `<div class="panel"><div class="panel-head"><div><h2>Apuntar</h2><p>Elige cómo. Lo que lee la IA te lo enseño antes de guardarlo.</p></div></div>
    <div class="ways" role="group" aria-label="Cómo apuntar">
      <button type="button" data-way="ticket" aria-pressed="${way === "ticket"}">${ICON.camara}<b>Foto del ticket</b><span>O una factura en PDF</span></button>
      <button type="button" data-way="texto" aria-pressed="${way === "texto"}">${ICON.texto}<b>Contárselo</b><span>«Ayer 45 € de gasolina»</span></button>
      <button type="button" data-way="mano" aria-pressed="${way === "mano"}">${ICON.mano}<b>A mano</b><span>Rellenas tú los datos</span></button>
      <button type="button" data-way="extracto" aria-pressed="${way === "extracto"}">${ICON.hoja}<b>Extracto del banco</b><span>Excel, CSV o PDF</span></button>
    </div></div>`;
  h += `<div class="panel">`;
  if (way === "ticket") {
    if (!sample) h += `<div class="banner">${WEB ? "La IA no está disponible ahora mismo. Apúntalo a mano y prueba luego." : "Para leer tickets hace falta la IA, y aquí no está disponible. Abre la página desde tu cuenta de Claude, o apúntalo a mano."}</div>`;
    else h += `<div class="drop" id="drop" tabindex="0" role="button" aria-label="Elegir fotos de tickets">${ICON.camara.replace("<svg", '<svg style="width:40px;height:40px;fill:none;stroke:var(--acc);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"')}<b>Haz la foto o elige las fotos</b><span class="small muted">Puedes elegir varias a la vez: cada una es un ticket. Si un ticket es muy largo, hazle dos fotos y márcalas juntas con «Son del mismo ticket».</span>${canImg ? "" : `<span class="small" style="color:var(--warn)">Este aparato no deja mandar fotos a la IA: sólo podré leer facturas en PDF.</span>`}</div>
      <label class="small" style="display:inline-flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="same-ticket"> Son del mismo ticket</label>`;
  } else if (way === "texto") {
    h += sample ? `<div class="f"><label for="dict">Cuéntalo como lo dirías <small>(puedes poner varias cosas, una por línea; en el móvil, usa el micrófono del teclado)</small></label><textarea id="dict" class="inp area" rows="4" placeholder="Ayer 45 € de gasolina en Repsol con la tarjeta del Santander&#10;Hoy he sacado 100 € del cajero&#10;Me ha llegado la nómina, 2.850 €"></textarea></div><div class="row" style="margin-top:10px"><button class="btn primary" id="dict-go">Que lo apunte la IA</button></div>`
      : `<div class="banner">Para esto hace falta la IA, y aquí no está disponible. Usa «A mano».</div>`;
  } else if (way === "mano") {
    if (!JOBS.some(j => j.kind === "mano")) addJob("mano", newDraft());
    h += `<p class="small muted" style="margin:0">Rellena y guarda. Si el ticket lleva cosas de varias categorías, añade una línea por cada una.</p>`;
  } else if (way === "extracto") h += extractoHTML();
  h += `</div>`;
  if (way !== "extracto") {
    const jobs = JOBS.filter(j => way === "mano" ? j.kind === "mano" : j.kind !== "mano");
    const ready = jobs.filter(j => j.state === "listo" && j.kind !== "mano");
    if (ready.length > 1) h += `<div class="row"><button class="btn primary" id="save-all">Guardar los ${ready.length} que están listos</button></div>`;
    for (const j of jobs) h += jobHTML(j);
  }
  el.innerHTML = h;
  for (const j of JOBS) if (j.state === "listo") paintSum(j.key);
}
function jobHTML(j){
  let h = `<div class="job" data-job="${j.key}"><div class="job-h"><b>${esc(j.name || (j.kind === "mano" ? "Nuevo movimiento" : "Movimiento"))}</b>`;
  if (j.state === "leyendo") h += `<span class="thinking"><span class="spin"></span>${esc(j.msg || "Leyendo…")}</span></div>`;
  else if (j.state === "error") h += `<button class="btn sm ghost" data-eddrop="${j.key}">Quitar</button></div><p class="err" style="margin:0">${esc(j.err)}</p>${j.retry ? `<div class="row"><button class="btn sm" data-retry="${j.key}">Probar otra vez</button><button class="btn sm" data-tomano="${j.key}">Apuntarlo a mano</button></div>` : ""}`;
  else h += `</div>${editorHTML(j.key)}`;
  return h + `</div>`;
}
function addJob(kind, draft, extra = {}){
  const key = "j" + uid();
  JOBS.unshift({ key, kind, state: draft ? "listo" : "leyendo", ...extra });
  if (draft) DRAFTS[key] = draft;
  return key;
}
function jobUpdate(key, patch){
  const j = JOBS.find(x => x.key === key); if (!j) return;
  Object.assign(j, patch);
  if (tab !== "apuntar") return;
  const box = document.querySelector(`[data-job="${key}"]`);
  if (box && !box.contains(document.activeElement)) { const w = document.createElement("div"); w.innerHTML = jobHTML(j); box.replaceWith(w.firstElementChild); if (j.state === "listo") paintSum(key); }
  else if (!box) renderView();
}

/* ---------- lo que la IA necesita saber ---------- */
function catListForIA(tipo){ return Object.entries(CATIDX).filter(([, c]) => !tipo || c.tipo === tipo).map(([id, c]) => `${id} = ${c.tipo === "gasto" ? "gasto" : "ingreso"} · ${c.gNombre} › ${c.nombre}`).join("\n"); }
function learnedForIA(){
  const seen = new Map();
  for (const m of MOVS) {
    if (m.tipo === "traspaso" || !m.comercio || m.revisar) continue;
    const k = norm(m.comercio); if (!k || seen.has(k)) continue;
    const cs = [...new Set(m.lineas.map(l => l.cat).filter(Boolean))];
    if (cs.length) seen.set(k, `${m.comercio} → ${cs.join(", ")}`);
    if (seen.size >= 60) break;
  }
  return seen.size ? [...seen.values()].join("\n") : "(todavía nada)";
}
function accountsForIA(){ return cuentas().map(c => `${c.id} = ${c.nombre} (${ACC_TYPES[c.tipo] || c.tipo}${c.tarjetas ? ", tarjetas acabadas en " + c.tarjetas : ""})`).join("\n"); }
function guessAccount(o){
  const pago = String(o.pago || "").toLowerCase();
  if (o.cuenta && cuenta(o.cuenta)) return o.cuenta;
  if (pago === "efectivo" && cashAccount()) return cashAccount();
  const fin = String(o.tarjeta_final || "").replace(/\D/g, "");
  if (fin) { const c = cuentas().find(c => String(c.tarjetas || "").split(/[^0-9]+/).includes(fin)); if (c) return c.id; }
  return defaultAccount();
}
// La pregunta de la IA cuando duda de una categoría: sólo con opciones que existan
function preguntaDe(p, tipo, nLineas){
  if (!p || typeof p !== "object" || !String(p.texto || "").trim()) return null;
  const opciones = (Array.isArray(p.opciones) ? p.opciones : []).filter(o => o && CATIDX[o.cat] && CATIDX[o.cat].tipo === tipo)
    .slice(0, 4).map(o => ({ etiqueta: String(o.etiqueta || catName(o.cat)).slice(0, 40), cat: o.cat }));
  if (opciones.length < 2) return null;
  const linea = Math.min(Math.max(0, parseInt(p.linea) || 0), Math.max(0, nLineas - 1));
  return { texto: String(p.texto).trim().slice(0, 160), linea, opciones };
}
function iaToDraft(o, origen){
  const tipo = ["gasto", "ingreso", "traspaso"].includes(o.tipo) ? o.tipo : "gasto";
  const lineas = (Array.isArray(o.lineas) ? o.lineas : []).map(l => ({ concepto: String(l.concepto || ""), cat: CATIDX[l.cat] && CATIDX[l.cat].tipo === tipo ? l.cat : "", importe: l.importe == null ? "" : r2(num(l.importe)) }));
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(o.fecha || "") ? o.fecha : "";
  const notes = [];
  if (!fecha) notes.push("No he visto la fecha: ponla tú.");
  if (o.total == null) notes.push("No he visto el total.");
  if (o.dudas) notes.push(o.dudas);
  const aMano = String(o.manuscrito || "").trim().slice(0, 400);
  if (aMano) notes.push("Lo escrito a mano está en la nota.");
  const conf = num(o.confianza);
  return newDraft({
    tipo, fecha: fecha || toISO(NOW), total: o.total == null ? "" : r2(Math.abs(num(o.total))),
    cuenta: tipo === "traspaso" ? (cuenta(o.cuenta) ? o.cuenta : defaultAccount()) : guessAccount(o),
    destino: tipo === "traspaso" ? (cuenta(o.destino) ? o.destino : (String(o.destino || "").toLowerCase().includes("efectivo") ? cashAccount() : "")) : "",
    comercio: String(o.comercio || ""), nota: aMano, origen,
    factura: o.razon_social || o.numero || o.cif ? { proveedor: String(o.razon_social || "").slice(0, 120), cif: String(o.cif || "").slice(0, 20), numero: String(o.numero || "").slice(0, 40) } : null,
    lineas: lineas.length ? lineas : [{ concepto: "", cat: "", importe: "" }],
    iaNote: notes.length ? notes.join(" ") : (conf && conf < 0.6 ? "La IA no lo ha tenido del todo claro: repásalo." : ""),
    pregunta: preguntaDe(o.pregunta, tipo, lineas.length),
    pagos: (Array.isArray(o.pagos) ? o.pagos : []).map(p => ({ forma: String(p && p.forma || "").slice(0, 20), importe: r2(Math.abs(num(p && p.importe))) })).filter(p => p.importe > 0).slice(0, 8)
  });
}

/* ---------- ticket ---------- */
async function loadScript(src){
  if (document.querySelector(`script[src="${src}"]`)) return;
  await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
async function pdfLib(){
  if (!window.pdfjsLib) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  }
  return window.pdfjsLib;
}
async function pdfRead(file, maxPages){
  const lib = await pdfLib();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = ""; const images = [];
  const n = Math.min(doc.numPages, maxPages || 3);
  for (let p = 1; p <= doc.numPages && p <= 40; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let lastY = null, line = "";
    for (const it of tc.items) { const y = it.transform ? Math.round(it.transform[5]) : null; if (lastY != null && y !== lastY) { text += line.trim() + "\n"; line = ""; } line += it.str + " "; lastY = y; }
    text += line.trim() + "\n\n";
    if (p <= n) {
      const vp = page.getViewport({ scale: 1 }); const k = Math.min(2, 1400 / Math.max(vp.width, vp.height));
      const v2 = page.getViewport({ scale: k }); const c = document.createElement("canvas"); c.width = v2.width; c.height = v2.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: v2 }).promise;
      images.push(await new Promise(r => c.toBlob(r, "image/jpeg", 0.85)));
    }
  }
  return { text: text.trim(), images };
}
async function shrink(file){
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", 0.85));
}
function ticketPrompt(extraText){
  return `Eres el contable personal de Juan (España). Te paso ${extraText ? "el texto de una factura o ticket" : "la foto de un ticket o factura"} de sus cuentas PERSONALES. Léelo y devuelve SOLO un objeto JSON, sin nada más:
{"tipo":"gasto"|"ingreso","comercio":texto o null,"razon_social":texto o null,"cif":texto o null,"numero":texto o null,"fecha":"AAAA-MM-DD" o null,"total":número o null,"pago":"tarjeta"|"efectivo"|"bizum"|"transferencia"|"domiciliado"|null,"tarjeta_final":"4 cifras" o null,"lineas":[{"concepto":texto,"cat":id,"importe":número}],"confianza":número de 0 a 1,"dudas":texto o null,"manuscrito":texto o null,"pagos":[{"forma":"tarjeta"|"efectivo"|"bizum"|"otro","importe":número}],"pregunta":null o {"linea":número de línea empezando en 0,"texto":texto,"opciones":[{"etiqueta":texto,"cat":id}]}}

Reglas:
- No inventes. Lo que no se lea, null. Si no es un ticket ni una factura, pon confianza 0 y explícalo en "dudas".
- "comercio": el nombre corto del sitio, como lo diría una persona («Mercadona», «Repsol», «Endesa»), no la razón social entera.
- "razon_social": quien factura, tal como sale en el papel («Mercadona, S.A.», «Estación de Servicio Los Pinos, S.L.»), con el centro si lo pone; "cif": su CIF o NIF; "numero": el número de factura o de ticket tal cual. Lo que no salga, null.
- Importes tal y como se pagan, con IVA incluido. Punto decimal en el JSON.
- Agrupa por categoría: NO una línea por producto, sino una línea por categoría con la suma de sus productos y un concepto que lo resuma, p. ej. «Comida (leche, pan, fruta…)» y «Droguería (lejía, papel…)». Los descuentos, dentro de la línea a la que afectan.
- La suma de las líneas tiene que dar exactamente el total del papel. Si no te cuadra, dilo en "dudas".
- Bodas: lo que se gasta con motivo de una boda a la que va Juan (el regalo o el sobre a los novios, una lista de bodas, un traje o vestido o complementos para la boda, el hotel o el viaje a la boda, una despedida de soltero, la peluquería para la boda) va a «bodas.*», no a ropa, regalos o viajes. Si algo podría ser de una boda pero no lo sabes (un traje, un hotel, un regalo caro), usa "pregunta" para preguntárselo.
- Categorías: NO uses «compras.otras», «otros.varios» ni «otrosi.varios» salvo que de verdad no encaje en ninguna otra. Si dudas entre dos o tres categorías porque depende de algo que sólo sabe Juan (p. ej. si algo es un regalo o para él, si una cena es de ocio o de trabajo), pon en "cat" la más probable y rellena "pregunta": una pregunta corta y directa a Juan sobre esa línea, con 2 a 4 opciones, cada una con su categoría. Si no hay dudas, "pregunta" es null.
- "cat" tiene que ser uno de estos ids, exactamente:
${catListForIA()}
- Así ha clasificado Juan otras veces (úsalo como guía, manda sobre tu criterio; pero si el producto es claramente de otra cosa, como cartuchos en una tienda de deporte, manda el producto):
${learnedForIA()}
- Clasifica por lo que es cada producto, no por la tienda: unos cartuchos comprados en Decathlon son caza, no deporte. Cartuchos y munición (calibre, gramos, nº de perdigón, marcas como RIO, Saga, Fenix, Trust, Mirage; «SP RIO 50 34G/09» = cartuchos RIO de 34 g del nº 9), licencias de caza o de armas, coto, monterías, armero, ropa de caza y perros de caza van a las categorías «caza.*».
- Si la misma línea sale repetida varias veces, súmalas en una sola.
- El total es lo que cuesta la compra. «Efectivo», «Entregado» o «Pagado» es lo que dio el cliente, y «Cambio» o «Devolución efectivo» es la vuelta: no son el total ni otro gasto. Si pone «Efectivo», el pago es "efectivo".
- "tarjeta_final" SÓLO si se pagó con tarjeta bancaria. La tarjeta de socio, de puntos o de fidelización de la tienda (Decathlon, Carrefour Club, Mercadona…) no es la forma de pago: no la pongas.
- "manuscrito": todo lo que esté ESCRITO A MANO en el papel (con bolígrafo, lápiz o rotulador, no lo impreso), copiado tal cual y en el orden en que aparece: para qué fue, con quién, una obra, un nombre, «pagado», una cuenta hecha a mano… Si es difícil de leer, pon lo que se entienda y marca lo dudoso con «(?)». Si no hay nada escrito a mano, null. Si a mano se ha añadido una propina, súmala al total en una línea aparte «Propina» con la categoría del resto y dilo en "dudas".
- "pagos": cada pago que sale al pie del ticket, por separado (si se pagó con varias tarjetas y efectivo, uno por cada uno). Al efectivo réstale el cambio: «Efectivo 20,00 / Cambio 1,30» es un pago de 18,70 en efectivo. Si sólo hay un pago o no se ve, [].
- En una «factura simplificada» el "numero" es su número (p. ej. V2026036400100040626).
- Fechas de España: 03/09/26 es el 3 de septiembre de 2026; 21/8/2026 es el 21 de agosto. Hoy es ${toISO(NOW)}.${extraText ? "\n\nTexto del papel:\n" + extraText.slice(0, 40000) : ""}`;
}
async function readTicket(key, files){
  const j = JOBS.find(x => x.key === key); if (!j) return;
  jobUpdate(key, { state: "leyendo", msg: "Preparando…" });
  try {
    let images = [], text = "", thumb = null, pdf = null;
    for (const f of files) {
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        jobUpdate(key, { msg: "Abriendo el PDF…" });
        const r = await pdfRead(f, 2);
        if (!pdf && files.length === 1) pdf = f;   // el PDF tal cual, para archivarlo en Drive
        if (r.text.replace(/\s/g, "").length > 60) text += r.text + "\n"; else images.push(...r.images);
        if (!thumb && r.images[0]) thumb = r.images[0];
      } else { const b = await shrink(f); images.push(b); if (!thumb) thumb = b; }
    }
    const maxImg = (imgCaps && imgCaps.images && imgCaps.images.maxCount) || 0;
    if (images.length && !maxImg && !text) throw { mine: "Este aparato no deja mandar fotos a la IA. Apúntalo a mano o sube la factura en PDF." };
    images = images.slice(0, maxImg || 0);
    jobUpdate(key, { msg: "La IA está leyendo el papel…" });
    const o = await sample.json(ticketPrompt(text), { images: images.length ? images : undefined, cache: false });
    if (!o || typeof o !== "object") throw { mine: "La IA no ha devuelto nada que se pueda usar." };
    const d = iaToDraft(o, "ticket");
    d.blob = thumb; d.ticketUrl = thumb ? URL.createObjectURL(thumb) : ""; d.pdf = pdf;
    d.revisar = num(o.confianza) < 0.6;
    DRAFTS[key] = d;
    jobUpdate(key, { state: "listo", name: d.comercio || "Ticket", url: d.ticketUrl });
  } catch (e) {
    const msg = e && e.mine ? e.mine : e && e.code === "not_granted" ? "No has dado permiso para usar la IA." : e && e.code === "rate_limited" ? "Demasiados tickets seguidos. Espera un minuto y dale a «Probar otra vez»." : e && e.code === "invalid_json" ? "La IA no ha sabido leerlo bien." : "No he podido leerlo.";
    jobUpdate(key, { state: "error", err: msg, retry: true });
  }
}
async function onTicketFiles(fileList){
  const files = Array.from(fileList || []).filter(f => /^image\//.test(f.type) || f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (!files.length) return;
  const together = $("#same-ticket") && $("#same-ticket").checked;
  const groups = together ? [files] : files.map(f => [f]);
  const keys = groups.map(g => { const k = addJob("ticket", null, { name: g[0].name.replace(/\.[^.]+$/, "").slice(0, 40) || "Ticket" }); JOBS.find(x => x.key === k).files = g; return k; });
  renderView();
  for (let i = 0; i < groups.length; i++) await readTicket(keys[i], groups[i]);   // de uno en uno, para no atascar a la IA
}

/* ---------- dictado ---------- */
async function dictGo(){
  const t = ($("#dict") || {}).value || ""; if (!t.trim() || !sample) return;
  const key = addJob("texto", null, { name: "Lo que has contado", msg: "La IA lo está apuntando…" });
  renderView();
  try {
    const o = await sample.json(`Eres el contable personal de Juan (España). Te cuenta uno o varios movimientos de sus cuentas PERSONALES, hablando. Devuelve SOLO JSON:
{"movimientos":[{"tipo":"gasto"|"ingreso"|"traspaso","comercio":texto o null,"fecha":"AAAA-MM-DD","total":número,"cuenta":id de cuenta o null,"destino":id de cuenta o null (sólo traspasos),"pago":"tarjeta"|"efectivo"|null,"lineas":[{"concepto":texto,"cat":id,"importe":número}],"confianza":0-1,"dudas":texto o null,"pregunta":null o {"linea":número de línea empezando en 0,"texto":texto,"opciones":[{"etiqueta":texto,"cat":id}]}}]}
Reglas:
- Hoy es ${toISO(NOW)} (${DIA[NOW.getDay()]}). «Ayer», «el viernes», etc., cuéntalos desde hoy.
- «Traspaso» es mover dinero entre SUS cuentas (sacar del cajero = traspaso del banco al efectivo). No es gasto.
- Si no dice con qué pagó, deja "cuenta" en null. No inventes importes ni fechas.
- Bodas: lo que se gasta con motivo de una boda a la que va Juan (el regalo o el sobre a los novios, una lista de bodas, un traje o vestido o complementos para la boda, el hotel o el viaje a la boda, una despedida de soltero, la peluquería para la boda) va a «bodas.*», no a ropa, regalos o viajes. Si algo podría ser de una boda pero no lo sabes (un traje, un hotel, un regalo caro), usa "pregunta" para preguntárselo.
- Categorías: NO uses «compras.otras», «otros.varios» ni «otrosi.varios» salvo que de verdad no encaje en ninguna otra. Si dudas entre dos o tres categorías porque depende de algo que sólo sabe Juan (p. ej. si algo es un regalo o para él, si una cena es de ocio o de trabajo), pon en "cat" la más probable y rellena "pregunta": una pregunta corta y directa a Juan sobre esa línea, con 2 a 4 opciones, cada una con su categoría. Si no hay dudas, "pregunta" es null.
- "cat" (sólo gastos e ingresos), uno de estos ids exactamente:
${catListForIA()}
- Sus cuentas:
${accountsForIA()}
- Así ha clasificado Juan otras veces:
${learnedForIA()}

Lo que cuenta Juan:
${t.slice(0, 6000)}`, { cache: false });
    const list = Array.isArray(o && o.movimientos) ? o.movimientos : [];
    removeJob(key);
    if (!list.length) { addJob("texto", null, {}); JOBS[0].state = "error"; JOBS[0].err = "No he sacado ningún movimiento de lo que has escrito."; JOBS[0].name = "Lo que has contado"; }
    for (const m of list.reverse()) { const d = iaToDraft(m, "texto"); if (m.cuenta && cuenta(m.cuenta)) d.cuenta = m.cuenta; addJob("texto", d, { name: d.comercio || (d.tipo === "traspaso" ? "Traspaso" : "Movimiento") }); }
    if ($("#dict")) $("#dict").value = "";
  } catch (e) {
    jobUpdate(key, { state: "error", err: e && e.code === "not_granted" ? "No has dado permiso para usar la IA." : "No ha salido. Prueba otra vez." });
  }
  renderView();
}
async function saveAllReady(){
  const ready = JOBS.filter(j => j.state === "listo" && j.kind !== "mano" && (way === "texto" ? j.kind === "texto" : j.kind === "ticket"));
  let ok = 0, bad = 0;
  for (const j of ready) {
    const d = DRAFTS[j.key]; const r = draftToMov(d);
    if (r.err || (repetido(d) && !d.repOk)) { bad++; continue; }   // los que parecen repetidos se quedan para mirarlos uno a uno
    try {
      if (d.blob && assets) { try { const up = await assets.upload(d.blob); r.mov.ticket = up.id; } catch {} }
      await saveMovs([r.mov]); if (r.mov.ticket || d.pdf) driveUp(r.mov, d.pdf); removeJob(j.key); ok++;
    } catch { bad++; }
  }
  toast(bad ? `Guardados ${ok}. ${bad} necesitan que los mires.` : `Guardados ${ok}.`);
  renderView();
}
