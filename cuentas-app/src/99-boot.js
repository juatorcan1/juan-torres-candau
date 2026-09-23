/* ================= navegación ================= */
const TABS = ["anio", "movs", "apuntar", "analisis", "dinero"];
function renderHeader(){
  $("#y-lab").textContent = Y;
  $("#y-prev").disabled = Y <= CUR_Y - 15; $("#y-next").disabled = Y >= MAX_Y;
  const ph = yearPhase(Y);
  const doy = Math.round((NOW - new Date(CUR_Y, 0, 1)) / 864e5) + 1, dy = (new Date(CUR_Y + 1, 0, 1) - new Date(CUR_Y, 0, 1)) / 864e5;
  $("#sub").textContent = ph === "actual" ? `Ejercicio en curso · día ${doy} de ${dy}` : ph === "pasado" ? "Ejercicio cerrado" : "Ejercicio que viene: todo es previsión";
}
function renderView(){
  const a = document.activeElement;
  const keep = a && a.id && $("#main").contains(a) ? { id: a.id, s: (() => { try { return [a.selectionStart, a.selectionEnd]; } catch { return null; } })() } : null;
  stale = false;
  ({ anio: renderAnio, movs: renderMovs, apuntar: renderApuntar, analisis: renderAnalisis, dinero: renderDinero }[tab] || renderAnio)();
  if (keep) { const n = document.getElementById(keep.id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (keep.s && keep.s[0] != null) n.setSelectionRange(keep.s[0], keep.s[1]); } catch {} } }
}
function renderAll(){ renderHeader(); renderView(); }
function setTab(t){
  if (!TABS.includes(t)) t = "anio";
  tab = t; store.set("cj.tab", t);
  for (const k of TABS) $("#v-" + k).hidden = k !== t;
  for (const b of $$(".bnav button")) b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false");
  renderView();
  window.scrollTo({ top: 0 });
}
let stale = false;
function typing(){ const a = document.activeElement; return !!(a && a.closest && a.closest("main") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"); }
function onData(){
  STATS = {}; FC = {};
  renderHeader();
  if (typing()) { stale = true; return; }
  renderView();
}
document.addEventListener("focusout", () => setTimeout(() => { if (stale && !typing()) renderView(); }, 0));

/* ================= clics ================= */
function edKey(el){ const e = el.closest(".ed"); return e ? e.dataset.ed : null; }
document.addEventListener("click", async e => {
  const t = e.target.closest("button, [data-zoom], [data-close], #drop, #drop-ext, .zoom"); if (!t) return;
  const ds = t.dataset;
  if (t.classList.contains("zoom")) { t.remove(); return; }
  if (ds.tab) return setTab(ds.tab);
  if (ds.go) { if (ds.sub) { dSub = ds.sub; store.set("cj.dsub", dSub); } if (ds.rev) { Object.assign(mf, { rev: true, mes: "", tipo: "", grupo: "", cuenta: "", q: "" }); } return setTab(ds.go); }
  if (t.id === "y-prev" || t.id === "y-next") { Y += t.id === "y-prev" ? -1 : 1; store.set("cj.year", Y); anOpen = null; askState.text = ""; askState.q = ""; return renderAll(); }
  if (ds.close) return closeSheet();
  if (ds.zoom) { const z = document.createElement("div"); z.className = "zoom"; z.innerHTML = `<img src="${esc(ds.zoom)}" alt="Ticket">`; document.body.appendChild(z); return; }
  if (ds.mov) return openMov(ds.mov);

  // el año
  if (ds.ask) { const q = $("#ask-q"); if (q) q.value = ds.ask; return askGo(ds.ask); }
  if (t.id === "ask-go") return askGo(($("#ask-q") || {}).value);
  if (t.id === "ask-stop") { if (askState.ctl) askState.ctl.abort(); return; }

  // movimientos
  if (t.id === "mf-more") { mf.limit += 200; return renderView(); }

  // en qué se va
  if (ds.antipo) { anTipo = ds.antipo; store.set("cj.antipo", anTipo); anOpen = null; return renderView(); }
  if (ds.grp) { anOpen = anOpen === ds.grp ? null : ds.grp; return renderView(); }
  if (ds.seegrp) { Object.assign(mf, { grupo: ds.seegrp, mes: "", tipo: "", cuenta: "", q: "", rev: false }); return setTab("movs"); }

  // apuntar
  if (ds.way) { way = ds.way; store.set("cj.way", way); return renderView(); }
  if (t.id === "drop") return $("#f-ticket").click();
  if (t.id === "drop-ext") return $("#f-extracto").click();
  if (t.id === "dict-go") return dictGo();
  if (t.id === "save-all") { t.disabled = true; return saveAllReady(); }
  if (ds.retry) { const j = JOBS.find(x => x.key === ds.retry); if (j && j.files) readTicket(j.key, j.files); return; }
  if (ds.tomano) { const j = JOBS.find(x => x.key === ds.tomano); if (j) { DRAFTS[j.key] = newDraft({ origen: "ticket" }); if (j.files && j.files[0] && /^image\//.test(j.files[0].type)) { const b = await shrink(j.files[0]); DRAFTS[j.key].blob = b; DRAFTS[j.key].ticketUrl = URL.createObjectURL(b); } jobUpdate(j.key, { state: "listo" }); } return; }

  // editor de movimiento
  const k = edKey(t) || ds.edsave || ds.eddel || ds.eddrop || ds.fixtotal || ds.fixrest;
  if (k && DRAFTS[k]) {
    const d = DRAFTS[k];
    if (ds.edtipo) { if (d.tipo !== ds.edtipo) { d.tipo = ds.edtipo; d.lineas = d.lineas.map(l => ({ ...l, cat: CATIDX[l.cat] && CATIDX[l.cat].tipo === d.tipo ? l.cat : "" })); if (d.tipo === "traspaso" && !d.destino) d.destino = cuentas().find(c => c.id !== d.cuenta) ? cuentas().find(c => c.id !== d.cuenta).id : ""; repaintEditor(k); } return; }
    if (ds.liadd) { d.lineas.push({ concepto: "", cat: "", importe: "" }); repaintEditor(k); const ins = document.querySelectorAll(`.ed[data-ed="${k}"] [data-lk="concepto"]`); if (ins.length) ins[ins.length - 1].focus(); return; }
    if (ds.lidel != null) { d.lineas.splice(+ds.lidel, 1); if (!d.lineas.length) d.lineas.push({ concepto: "", cat: "", importe: "" }); return repaintEditor(k); }
    if (ds.fixtotal) { d.total = linesSum(d); return repaintEditor(k); }
    if (ds.fixrest) {
      const diff = r2(num(d.total) - linesSum(d));
      if (diff > 0) d.lineas.push({ concepto: "Resto", cat: (d.lineas.find(l => l.cat) || {}).cat || "", importe: diff });
      else { const l = d.lineas[d.lineas.length - 1]; l.importe = r2(num(l.importe) + diff); }
      return repaintEditor(k);
    }
    if (ds.edsave) return saveDraft(k);
    if (ds.eddrop) { removeJob(k); if (way === "mano") addJob("mano", newDraft()); return renderView(); }
    if (ds.eddel) {
      if (!d.confirmDel) { d.confirmDel = true; return repaintEditor(k); }
      t.disabled = true;
      try { await deleteMov({ id: d.id, fecha: d.origFecha || d.fecha }); toast("Borrado"); closeSheet(); }
      catch (err) { const eb = document.getElementById(k + "-err"); if (eb) eb.textContent = saveErr(err); t.disabled = false; }
      return;
    }
  }
  if (ds.eddrop) { removeJob(ds.eddrop); return renderView(); }

  // extracto
  if (t.id === "ext-cancel") { Object.assign(EXT, { rows: [], file: "", saldo: null, err: "" }); return renderView(); }
  if (t.id === "ext-save") return extSave();

  // dinero
  if (ds.dsub) { dSub = ds.dsub; store.set("cj.dsub", dSub); return renderView(); }
  if (t.id === "acc-new") { accForm = { tipo: "banco", nombre: "", entidad: "", saldo: "", habitual: !(cfg.cuentas || []).some(c => c.tipo === "banco") }; renderView(); const n = $("#af-nombre"); if (n) n.scrollIntoView({ block: "center" }); return; }
  if (t.id === "bk-csv") return copiaCSV();
  if (t.id === "bk-json") return copiaJSON();
  if (t.id === "debt-new") { accForm = { tipo: "prestamo", nombre: "", entidad: "", saldo: "" }; cuotaForm = null; renderView(); const n = $("#af-nombre"); if (n) n.scrollIntoView({ block: "center" }); return; }
  if (ds.cuota) {
    const c = cuenta(ds.cuota); if (!c) return;
    const total = c.tipo === "prestamo" ? (num(c.cuota) || debe(c, toISO(NOW))) : debe(c, toISO(NOW));
    const r = c.tipo === "prestamo" ? repartoCuota(c, total, toISO(NOW)) : { capital: r2(total), interes: 0 };
    cuotaForm = { id: c.id, fecha: toISO(NOW), capital: r.capital, interes: r.interes, pago: c.pago || defaultAccount() }; cuadrar = null;
    return renderView();
  }
  if (ds.cuotacancel) { cuotaForm = null; return renderView(); }
  if (ds.cuotasave) return saveCuota(ds.cuotasave);
  if (ds.acctipo) { readAccForm(); accForm.tipo = ds.acctipo; return renderView(); }
  if (ds.accbank) { readAccForm(); if (!accForm.nombre || accForm.nombre === accForm.entidad) accForm.nombre = ds.accbank; accForm.entidad = ds.accbank; return renderView(); }
  if (ds.accedit) { const c = cuenta(ds.accedit); if (c) { accForm = { ...c, habitual: (cfg.prefs || {}).cuentaHabitual === c.id }; renderView(); window.scrollTo({ top: 0 }); } return; }
  if (t.id === "af-save") return saveAccForm();
  if (t.id === "af-cancel") { accForm = null; return renderView(); }
  if (t.id === "af-del") {
    if (!accForm.confirmDel) { readAccForm(); accForm.confirmDel = true; return renderView(); }
    const list = (cfg.cuentas || []).map(c => c.id === accForm.id ? { ...c, borrada: true } : c);
    try { await saveCfg("cuentas", { items: list }); accForm = null; toast("Cuenta quitada. Sus movimientos se quedan."); renderView(); } catch (err) { $("#af-err").textContent = saveErr(err); }
    return;
  }
  if (ds.cq) { const c = cuenta(ds.cq); cuotaForm = null; cuadrar = { id: ds.cq, v: c && c.ancla ? String(DEBT(c.tipo) ? debe(c, toISO(NOW)) : saldo(c, toISO(NOW))).replace(".", ",") : "" }; renderView(); const i = $("#cq-v"); if (i) { i.focus(); i.select(); } return; }
  if (ds.cqcancel) { cuadrar = null; return renderView(); }
  if (ds.cqsave) {
    const v = ($("#cq-v") || {}).value; if (v == null || String(v).trim() === "") return;
    const list = (cfg.cuentas && cfg.cuentas.length ? cfg.cuentas : cuentas()).map(c => c.id === ds.cqsave ? { ...c, ancla: { fecha: toISO(NOW), saldo: DEBT(c.tipo) ? -Math.abs(r2(num(v))) : r2(num(v)), ts: Date.now() } } : c);
    try { await saveCfg("cuentas", { items: list }); cuadrar = null; toast("Saldo puesto"); } catch (err) { toast(saveErr(err)); }
    return;
  }
  if (ds.seeacc) { Object.assign(mf, { cuenta: ds.seeacc, grupo: "", mes: "", tipo: "", q: "", rev: false }); return setTab("movs"); }

  if (t.id === "goal-new") { goalForm = { tipo: "compra" }; return renderView(); }
  if (ds.goaltipo) { readGoalForm(); goalForm.tipo = ds.goaltipo; return renderView(); }
  if (ds.goaledit || ds.goaladd) { const o = anio(Y).objetivos.find(x => x.id === (ds.goaledit || ds.goaladd)); if (o) { goalForm = { ...o }; renderView(); window.scrollTo({ top: 0 }); const f = ds.goaladd ? $("#gf-apartado") : null; if (f) { f.focus(); f.select(); } } return; }
  if (t.id === "gf-save") return saveGoalForm();
  if (t.id === "gf-cancel") { goalForm = null; return renderView(); }
  if (t.id === "gf-del") {
    if (!goalForm.confirmDel) { readGoalForm(); goalForm.confirmDel = true; return renderView(); }
    try { await saveAnio(Y, { objetivos: anio(Y).objetivos.filter(o => o.id !== goalForm.id) }); goalForm = null; toast("Objetivo quitado"); renderView(); } catch (err) { $("#gf-err").textContent = saveErr(err); }
    return;
  }
  if (t.id === "goal-bring") {
    const cur = anio(Y).objetivos, add = anio(Y - 1).objetivos.filter(o => !o.hecho && !cur.some(x => x.id === o.id));
    try { await saveAnio(Y, { objetivos: cur.concat(add.map(o => ({ ...o }))) }); toast("Traídos"); renderView(); } catch (err) { toast(saveErr(err)); }
    return;
  }

  if (t.id === "rec-new") { recForm = { tipo: "gasto", cada: 1, mes: 1 }; return renderView(); }
  if (ds.rectipo) { readRecForm(); recForm.tipo = ds.rectipo; recForm.cat = ""; return renderView(); }
  if (ds.recedit) { const r = anio(Y).recurrentes.find(x => x.id === ds.recedit); if (r) { recForm = { ...r }; renderView(); window.scrollTo({ top: 0 }); } return; }
  if (ds.recsugg != null) { const s = recSuggest()[+ds.recsugg]; if (s) { recForm = { ...s }; renderView(); window.scrollTo({ top: 0 }); } return; }
  if (t.id === "rf-save") return saveRecForm();
  if (t.id === "rf-cancel") { recForm = null; return renderView(); }
  if (t.id === "rf-del") {
    if (!recForm.confirmDel) { readRecForm(); recForm.confirmDel = true; return renderView(); }
    try { await saveAnio(Y, { recurrentes: anio(Y).recurrentes.filter(r => r.id !== recForm.id) }); recForm = null; toast("Quitado"); renderView(); } catch (err) { $("#rf-err").textContent = saveErr(err); }
    return;
  }
  if (t.id === "rec-copy") { try { await saveAnio(Y, { recurrentes: anio(Y - 1).recurrentes.map(r => ({ ...r, id: uid() })) }); toast(`Copiados los fijos de ${Y - 1}`); renderView(); } catch (err) { toast(saveErr(err)); } return; }
  if (t.id === "rec-copyfrom") { try { await saveAnio(Y, { recurrentes: forecast(Y).recs.map(r => ({ ...r, id: uid(), importe: r2(num(r.importe)) })) }); toast(`Fijos copiados a ${Y}: cámbialos a tu gusto`); renderView(); } catch (err) { toast(saveErr(err)); } return; }
  if (t.id === "pres-prop") {
    const prev = yearStats(Y - 1), p = { ...anio(Y).presupuesto };
    for (const [g, a] of Object.entries(prev.byGroupMonth.gasto)) { if (g === "_sin") continue; const v = sum(a); if (v > 0 && !p[g]) p[g] = Math.ceil(v * 1.03 / 10) * 10; }
    try { await saveAnio(Y, { presupuesto: p }); toast("Propuesta puesta: cámbiala a tu gusto"); renderView(); } catch (err) { toast(saveErr(err)); }
    return;
  }

  if (ds.catren) { const [tipo, gid, cid] = ds.catren.split("|"); const g = cats()[tipo].find(x => x.id === gid); catForm = { tipo, gid, cid: cid || null, rename: !cid, nombre: cid ? (g.cats.find(x => x[0] === cid) || [])[1] : g.nombre }; renderView(); window.scrollTo({ top: 0 }); const n = $("#cf-nombre"); if (n) n.focus(); return; }
  if (ds.catadd) { const [tipo, gid] = ds.catadd.split("|"); catForm = { tipo, gid }; renderView(); window.scrollTo({ top: 0 }); const n = $("#cf-nombre"); if (n) n.focus(); return; }
  if (ds.grpadd) { catForm = { tipo: ds.grpadd }; renderView(); window.scrollTo({ top: 0 }); const n = $("#cf-nombre"); if (n) n.focus(); return; }
  if (t.id === "cf-save") return saveCatForm();
  if (t.id === "cf-cancel") { catForm = null; return renderView(); }
});

/* ================= escribir y elegir ================= */
let qT;
document.addEventListener("input", e => {
  const el = e.target;
  const k = edKey(el);
  if (k && DRAFTS[k]) { readEd(k, el); if (el.dataset.lk === "importe" || el.dataset.k === "total") paintSum(k); return; }
  if (el.id === "mf-q") { mf.q = el.value; mf.limit = 200; clearTimeout(qT); qT = setTimeout(renderView, 250); return; }
  if (el.dataset.pres) return presInput(el);
});
document.addEventListener("change", e => {
  const el = e.target;
  const k = edKey(el);
  if (k && DRAFTS[k]) { readEd(k, el); paintSum(k); return; }
  if (el.id === "f-ticket") { const f = el.files; onTicketFiles(f); el.value = ""; return; }
  if (el.id === "f-extracto") { const f = el.files && el.files[0]; if (f) onExtractFile(f); el.value = ""; return; }
  if (/^mf-(mes|tipo|grupo|cuenta)$/.test(el.id)) { mf[el.id.slice(3)] = el.value; mf.limit = 200; return renderView(); }
  if (el.id === "mf-rev") { mf.rev = el.checked; return renderView(); }
  if (el.id === "ext-cuenta") { EXT.cuenta = el.value; if (EXT.rows.length) { EXT.rows.forEach(r => { r.dup = ""; r.match = null; r.sel = true; }); markDups(); } return renderView(); }
  if (el.dataset.exsel != null) { const r = EXT.rows[+el.dataset.exsel]; if (r) r.sel = el.checked; return renderView(); }
  if (el.dataset.excat != null) { const r = EXT.rows[+el.dataset.excat]; if (r) { if (el.value.startsWith("tr:")) { r.dest = el.value.slice(3); r.cat = ""; } else { r.dest = ""; r.cat = el.value; } r.low = false; } return; }
  if (el.id === "ext-saldo") { EXT.useSaldo = el.checked; return; }
  if (el.id === "gf-cuenta") { readGoalForm(); return renderView(); }
  if (el.id === "rf-cada") { readRecForm(); return renderView(); }
  if (el.id === "pref-subida") { const v = Math.max(0, Math.min(20, num(el.value))); saveCfg("prefs", { ...(cfg.prefs || {}), subida: v }).then(() => toast("Guardado")).catch(err => toast(saveErr(err))); return; }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if ($(".zoom")) { $(".zoom").remove(); return; } if ($("#sheet-root .sheet")) closeSheet(); }
  if ((e.key === "Enter" || e.key === " ") && (e.target.id === "drop" || e.target.id === "drop-ext")) { e.preventDefault(); e.target.click(); }
  if (e.target.id === "ask-q" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askGo(e.target.value); }
});
for (const ev of ["dragover", "dragenter"]) document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest(".drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", e => { const d = e.target.closest && e.target.closest(".drop"); if (d) d.classList.remove("over"); });
document.addEventListener("drop", e => {
  const d = e.target.closest && e.target.closest(".drop"); if (!d) return;
  e.preventDefault(); d.classList.remove("over");
  const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return;
  if (d.id === "drop") onTicketFiles(files); else onExtractFile(files[0]);
});

/* ================= arranque ================= */
buildCatIdx();
setTab(tab);
renderHeader();
(async () => {
  const use = n => (window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null));
  use("sample").then(async s => { sample = s; if (s) imgCaps = await s.limits().catch(() => null); if (!typing()) renderView(); });
  use("assets").then(a => { assets = a; });
  db = await use("db");
  if (!db) { dbState = "none"; renderAll(); return; }
  const got = new Set();
  const fail = err => { if (err && (err.code === "revoked" || err.code === "not_granted" || err.code === "capability_disabled")) { dbState = "none"; db = null; renderAll(); } };
  const ready = k => { got.add(k); if (got.size === 3) dbState = "ready"; onData(); };
  db.collection("movs").onSnapshot(snap => { meses = {}; for (const d of snap.docs) meses[d.id] = d.data(); rebuild(); movsReady = true; ready("movs"); }, fail);
  db.collection("config").onSnapshot(snap => {
    cfg = { cuentas: null, cats: null, prefs: {} };
    for (const d of snap.docs) { const v = d.data() || {}; if (d.id === "cuentas") cfg.cuentas = v.items || []; else if (d.id === "categorias" && v.gasto && v.ingreso) cfg.cats = v; else if (d.id === "prefs") cfg.prefs = v; }
    buildCatIdx(); ready("config");
  }, fail);
  db.collection("anios").onSnapshot(snap => { anios = {}; for (const d of snap.docs) anios[d.id] = d.data(); ready("anios"); }, fail);
})();
