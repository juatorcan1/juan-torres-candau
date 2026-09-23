/* ================= pantalla: dinero ================= */
let dSub = store.get("cj.dsub", "cuentas");
let accForm = null;      // borrador de cuenta
let cuadrar = null;      // {id, saldo}
let goalForm = null, recForm = null, catForm = null;
function renderDinero(){
  const el = $("#v-dinero");
  let h = `<div class="subnav" role="tablist" aria-label="Dinero">
    <button role="tab" data-dsub="cuentas" aria-selected="${dSub === "cuentas"}">Cuentas</button>
    <button role="tab" data-dsub="objetivos" aria-selected="${dSub === "objetivos"}">Objetivos</button>
    <button role="tab" data-dsub="prevision" aria-selected="${dSub === "prevision"}">Fijos y presupuesto</button>
    <button role="tab" data-dsub="categorias" aria-selected="${dSub === "categorias"}">Categorías</button></div>`;
  h += dSub === "cuentas" ? cuentasHTML() : dSub === "objetivos" ? objetivosHTML() : dSub === "prevision" ? previsionHTML() : categoriasHTML();
  el.innerHTML = h;
}

/* ---------- cuentas ---------- */
function cuentasHTML(){
  const phase = yearPhase(Y);
  const iso = phase === "pasado" ? `${Y}-12-31` : toISO(NOW);
  const cs = cuentas().filter(c => !DEBT(c.tipo)), ds = cuentas().filter(c => DEBT(c.tipo));
  const liq = sum(cs.filter(c => LIQUID(c.tipo)).map(c => saldo(c, iso)));
  const inv = sum(cs.filter(c => !LIQUID(c.tipo)).map(c => saldo(c, iso)));
  const deb = sum(ds.map(c => debe(c, iso)));
  let h = `<div class="panel"><div class="panel-head"><div><h2>${phase === "pasado" ? "Tu dinero a 31 de diciembre de " + Y : "Tu dinero hoy"}</h2><p>Bancos y efectivo: <b class="num">${eur(liq)}</b>${inv ? ` · depósitos e inversiones: <b class="num">${eur(inv)}</b>` : ""}${deb > 0.005 ? ` · debes: <b class="num" style="color:var(--over)">${eur(deb)}</b> · lo tuyo de verdad: <b class="num">${eur(liq + inv - deb)}</b>` : ""}</p></div><button class="btn primary sm" id="acc-new">Añadir cuenta</button></div>`;
  if (!cfg.cuentas || !cfg.cuentas.length) h += `<div class="banner" style="margin-bottom:12px"><b>Empieza por aquí.</b> Añade tus bancos y dime cuánto tienes hoy en cada uno. Así sé cuánto dinero tienes y cuánto tendrás a final de año.</div>`;
  if (accForm && !DEBT(accForm.tipo)) h += accFormHTML();
  h += `<div class="accs">`;
  for (const c of cs) {
    const s = saldo(c, iso);
    const months = Array.from({ length: 12 }, (_, i) => { const e = new Date(Y, i + 1, 0); return e > NOW ? null : saldo(c, toISO(e)); });
    if (phase === "actual") months[NOW.getMonth()] = saldo(c, toISO(NOW));
    const col = c.tipo === "deposito" || c.tipo === "inversion" ? "var(--ing)" : "var(--sal)";
    let extra = "";
    if (c.tipo === "deposito") {
      const endY = new Date(Y, 11, 31), v = c.vence ? parseISO(c.vence) : null;
      extra = `<div class="meta">${c.tae ? "Al " + NF2.format(num(c.tae)) + " % TAE" : "Sin TAE apuntada"}${v ? ` · vence el ${shortDate(c.vence)}${v.getFullYear() !== Y ? " de " + v.getFullYear() : ""}` : ""}</div>`;
      if (num(c.tae) && phase !== "pasado") { const until = v && v < endY ? v : endY; const d = (until - NOW) / 864e5; if (d > 0) extra += `<div class="meta">Te dará unos <b class="num">${eur(s * num(c.tae) / 100 * d / 365)}</b> hasta ${v && v < endY ? "que venza" : "fin de año"}.</div>`; }
    }
    h += `<div class="acc"><div class="acc-h"><div><b>${esc(c.nombre)}</b><div class="meta">${esc(ACC_TYPES[c.tipo] || c.tipo)}${c.entidad && c.entidad !== c.nombre ? " · " + esc(c.entidad) : ""}${c.tarjetas ? " · tarjeta …" + esc(c.tarjetas) : ""}</div></div><button class="btn sm ghost" data-accedit="${c.id}">Cambiar</button></div>
      <div class="bal num${s < 0 ? " neg" : ""}">${c.ancla ? eur(s) : "—"}</div>
      <div class="meta">${c.ancla ? `Saldo que me diste: ${eur(c.ancla.saldo)} el ${shortDate(c.ancla.fecha)}${parseISO(c.ancla.fecha).getFullYear() !== CUR_Y ? " de " + parseISO(c.ancla.fecha).getFullYear() : ""}` : "Dime cuánto hay hoy para poder llevar la cuenta."}</div>
      ${extra}${c.ancla ? sparkline(months, col) : ""}
      ${cuadrar && cuadrar.id === c.id ? `<div class="fgrid"><div class="f"><label for="cq-v">${DEBT(c.tipo) ? "Lo que debes de verdad hoy (€)" : "Lo que hay de verdad hoy (€)"}</label><input id="cq-v" inputmode="decimal" value="${esc(cuadrar.v)}"></div></div><div class="row"><button class="btn sm primary" data-cqsave="${c.id}">Poner este saldo</button><button class="btn sm ghost" data-cqcancel="1">Cancelar</button></div><p class="small muted" style="margin:0">Si no coincide con lo que calculo, la diferencia es algo que no está apuntado. No pasa nada: desde hoy cuento a partir de lo que me digas.</p>`
        : `<div class="row"><button class="btn sm" data-cq="${c.id}">${c.ancla ? "Cuadrar con el banco" : "Poner el saldo de hoy"}</button><button class="btn sm ghost" data-seeacc="${c.id}">Movimientos</button></div>`}
    </div>`;
  }
  h += `</div></div>`;
  h += deudasHTML(ds, iso, phase);
  if (WEB) h += `<div class="panel"><div class="panel-head"><div><h2>Copia de seguridad</h2><p>Todo lo tuyo en un fichero, por si algún día falla algo. La de Excel se abre con cualquier programa; la completa sirve para volver a cargarlo todo.</p></div></div>
    <div class="row"><button class="btn" id="bk-csv">Descargar en Excel</button><button class="btn" id="bk-json">Descargar la copia completa</button></div></div>`;
  return h;
}
// Copia de seguridad (sólo en la web: dentro de Claude no se pueden bajar ficheros)
function bajar(nombre, tipo, texto){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function copiaCSV(){
  const q = v => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const n = v => NF2.format(r2(v)).replace(/\./g, "");
  const rows = [["Fecha", "Tipo", "Cuenta", "Va a", "Dónde", "Concepto", "Grupo", "Categoría", "Importe", "Nota"]];
  for (const m of MOVS.slice().reverse()) {
    const cn = id => (cuentas().find(c => c.id === id) || (cfg.cuentas || []).find(c => c.id === id) || {}).nombre || "";
    if (m.tipo === "traspaso") { rows.push([m.fecha, "Traspaso", cn(m.cuenta), cn(m.destino), m.comercio, "", "", "", n(m.total), m.nota]); continue; }
    const sg = m.tipo === "gasto" ? -1 : 1;
    const ls = m.lineas && m.lineas.length ? m.lineas : [{ concepto: "", cat: "", importe: m.total }];
    for (const l of ls) rows.push([m.fecha, m.tipo === "gasto" ? "Gasto" : "Ingreso", cn(m.cuenta), "", m.comercio, l.concepto, l.cat ? CATIDX[l.cat] ? CATIDX[l.cat].gNombre : "" : "Sin categoría", l.cat ? catName(l.cat) : "Sin categoría", n(sg * num(l.importe)), m.nota]);
  }
  bajar(`cuentas-de-juan-${toISO(NOW)}.csv`, "text/csv;charset=utf-8", "\ufeff" + rows.map(r => r.map(q).join(";")).join("\r\n"));
}
function copiaJSON(){
  bajar(`cuentas-de-juan-${toISO(NOW)}.json`, "application/json", JSON.stringify({ hecha: new Date().toISOString(), movs: meses, config: { cuentas: { items: cfg.cuentas || [] }, categorias: cfg.cats || null, prefs: cfg.prefs || {} }, anios }, null, 1));
}
let cuotaForm = null;   // {id, fecha, capital, interes}
function deudasHTML(ds, iso, phase){
  const deb = sum(ds.map(c => debe(c, iso)));
  let h = `<div class="panel"><div class="panel-head"><div><h2>Lo que debes</h2><p>${ds.length ? (deb > 0.005 ? `En total, <b class="num">${eur(deb)}</b>.` : "Ahora mismo no debes nada.") : "No debes nada. Si algún día pides un préstamo, una hipoteca o usas una tarjeta de crédito, añádela aquí: te digo cuánto te queda, cuánto pagas de intereses y cuándo acabas."}</p></div><button class="btn sm" id="debt-new">Añadir una deuda</button></div>`;
  if (accForm && DEBT(accForm.tipo)) h += accFormHTML();
  if (!ds.length) return h + `</div>`;
  h += `<div class="accs">`;
  for (const c of ds) {
    const d = debe(c, iso);
    const months = Array.from({ length: 12 }, (_, i) => { const e = new Date(Y, i + 1, 0); return e > NOW ? null : debe(c, toISO(e)); });
    if (phase === "actual") months[NOW.getMonth()] = debe(c, toISO(NOW));
    const pago = cuenta(c.pago);
    const devuelto = sum(MOVS.filter(m => m.tipo === "traspaso" && m.destino === c.id && m.fecha.startsWith(Y + "-")).map(m => num(m.total)));
    const intereses = sum(MOVS.filter(m => m.deuda === c.id && m.tipo === "gasto" && m.fecha.startsWith(Y + "-")).map(m => num(m.total)));
    let meta = "";
    if (c.tipo === "prestamo") {
      meta += `<div class="meta">${num(c.cuota) ? "Cuota de " + eur(c.cuota) + " al mes" : "Sin cuota apuntada"}${num(c.tin) ? " · interés " + NF2.format(num(c.tin)) + " %" : ""}${pago ? " · se paga desde " + esc(pago.nombre) : ""}</div>`;
      if (d > 0.005 && phase !== "pasado") {
        const f = finPrestamo(c);
        meta += f === false ? `<div class="meta" style="color:var(--over)">Con esa cuota no bajas la deuda: sólo cubres intereses.</div>` : f ? `<div class="meta">Al ritmo de la cuota acabas en <b>${MESL[f.fecha.getMonth()]} de ${f.fecha.getFullYear()}</b> y pagarás aún unos <b class="num">${eur(f.intereses)}</b> de intereses.</div>` : "";
      }
      if (num(c.inicial) > 0) { const p = Math.min(100, Math.max(0, (1 - d / num(c.inicial)) * 100)); meta += `<div class="prog" role="img" aria-label="${pct(p)} devuelto" style="height:8px"><i style="width:${p.toFixed(1)}%;background:var(--ok)"></i></div><div class="meta">Pediste ${eur(c.inicial)}: llevas devuelto el ${pct(p)}.</div>`; }
    } else {
      meta += `<div class="meta">${num(c.limite) ? "Límite " + eur(c.limite) : ""}${pago ? (num(c.limite) ? " · " : "") + "se paga desde " + esc(pago.nombre) : ""}${c.tarjetas ? " · tarjeta …" + esc(c.tarjetas) : ""}</div>`;
    }
    if (devuelto || intereses) meta += `<div class="meta">En ${Y}: devueltos ${eur(devuelto)}${intereses ? ` y ${eur(intereses)} de intereses` : ""}.</div>`;
    let actions;
    if (cuadrar && cuadrar.id === c.id) actions = `<div class="fgrid"><div class="f"><label for="cq-v">Lo que debes de verdad hoy (€)</label><input id="cq-v" inputmode="decimal" value="${esc(cuadrar.v)}"></div></div><div class="row"><button class="btn sm primary" data-cqsave="${c.id}">Poner lo que debo</button><button class="btn sm ghost" data-cqcancel="1">Cancelar</button></div>`;
    else if (cuotaForm && cuotaForm.id === c.id) actions = `<div class="fgrid"><div class="f"><label for="cu-fecha">Fecha</label><input id="cu-fecha" type="date" value="${esc(cuotaForm.fecha)}"></div><div class="f"><label for="cu-cap">${c.tipo === "prestamo" ? "Devuelves (€)" : "Pagas (€)"}</label><input id="cu-cap" inputmode="decimal" value="${esc(String(cuotaForm.capital).replace(".", ","))}"></div>${c.tipo === "prestamo" ? `<div class="f"><label for="cu-int">Intereses (€)</label><input id="cu-int" inputmode="decimal" value="${esc(String(cuotaForm.interes).replace(".", ","))}"></div>` : ""}<div class="f"><label for="cu-pago">Sale de</label><select id="cu-pago">${cuentas().filter(x => !DEBT(x.tipo)).map(x => `<option value="${x.id}"${x.id === cuotaForm.pago ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select></div></div>${c.tipo === "prestamo" ? `<p class="small muted" style="margin:0">Lo he repartido con el interés que me diste. Si el recibo del banco dice otra cosa, cámbialo.</p>` : ""}<div class="row"><button class="btn sm primary" data-cuotasave="${c.id}">Apuntar</button><button class="btn sm ghost" data-cuotacancel="1">Cancelar</button><span class="err" id="cu-err"></span></div>`;
    else actions = `<div class="row">${d > 0.005 && phase !== "pasado" ? `<button class="btn sm" data-cuota="${c.id}">${c.tipo === "prestamo" ? "Apuntar la cuota" : "Pagar la tarjeta"}</button>` : ""}<button class="btn sm" data-cq="${c.id}">${c.ancla ? "Cuadrar con el banco" : "Poner lo que debo"}</button><button class="btn sm ghost" data-seeacc="${c.id}">Movimientos</button></div>`;
    h += `<div class="acc"><div class="acc-h"><div><b>${esc(c.nombre)}</b><div class="meta">${esc(ACC_TYPES[c.tipo])}${c.entidad && c.entidad !== c.nombre ? " · " + esc(c.entidad) : ""}</div></div><button class="btn sm ghost" data-accedit="${c.id}">Cambiar</button></div>
      <div class="bal num${d > 0.005 ? " neg" : ""}">${c.ancla ? (d > 0.005 ? "Debes " + eur(d) : "Pagado") : "—"}</div>
      ${meta}${c.ancla ? sparkline(months, "var(--over)") : ""}${actions}</div>`;
  }
  return h + `</div></div>`;
}
async function saveCuota(id){
  const c = cuenta(id); if (!c || !cuotaForm) return;
  const fecha = ($("#cu-fecha") || {}).value || toISO(NOW), cap = r2(Math.abs(num(($("#cu-cap") || {}).value))), int = r2(Math.abs(num(($("#cu-int") || {}).value))), pago = ($("#cu-pago") || {}).value;
  if (!cap && !int) { $("#cu-err").textContent = "Pon el importe."; return; }
  if (!pago) { $("#cu-err").textContent = "Di de qué cuenta sale."; return; }
  const list = [];
  if (cap) list.push(cleanMov({ fecha, tipo: "traspaso", cuenta: pago, destino: id, comercio: c.nombre, nota: c.tipo === "prestamo" ? "Cuota: lo que devuelves" : "Pago de la tarjeta", total: cap, origen: "cuota", deuda: id }));
  if (int) list.push(cleanMov({ fecha, tipo: "gasto", cuenta: pago, comercio: c.nombre, nota: "Cuota: intereses", total: int, lineas: [{ concepto: "Intereses de " + c.nombre, cat: "finanzas.intereses", importe: int }], origen: "cuota", deuda: id }));
  try { await saveMovs(list); cuotaForm = null; toast("Cuota apuntada"); renderView(); }
  catch (e) { $("#cu-err").textContent = saveErr(e); }
}
function accFormHTML(){
  const a = accForm;
  return `<div class="job" style="margin-bottom:14px"><b>${a.id ? "Cambiar cuenta" : "Nueva cuenta"}</b>
    <div class="f"><span class="lab">Tipo</span><div class="chips">${Object.entries(ACC_TYPES).filter(([k]) => DEBT(k) === DEBT(a.tipo)).map(([k, v]) => `<button type="button" data-acctipo="${k}" aria-pressed="${a.tipo === k}">${v}</button>`).join("")}</div></div>
    ${a.tipo !== "efectivo" && !a.id && !DEBT(a.tipo) ? `<div class="f"><span class="lab">Banco</span><div class="chips">${BANKS.map(b => `<button type="button" data-accbank="${esc(b)}" aria-pressed="${a.entidad === b}">${esc(b)}</button>`).join("")}</div></div>` : ""}
    <div class="fgrid">
      <div class="f"><label for="af-nombre">Nombre</label><input id="af-nombre" value="${esc(a.nombre)}" placeholder="${a.tipo === "efectivo" ? "Efectivo" : a.tipo === "prestamo" ? "Hipoteca de casa" : a.tipo === "credito" ? "Visa del BBVA" : "Santander nómina"}"></div>
      ${a.tipo !== "efectivo" ? `<div class="f"><label for="af-entidad">Banco</label><input id="af-entidad" value="${esc(a.entidad)}"></div>` : ""}
      ${!a.id ? `<div class="f"><label for="af-saldo">${DEBT(a.tipo) ? "Debes hoy (€)" : "Hay hoy (€)"}</label><input id="af-saldo" inputmode="decimal" value="${esc(a.saldo || "")}" placeholder="0,00"></div>` : ""}
      ${a.tipo === "prestamo" ? `<div class="f"><label for="af-inicial">Pediste (€) <small>(opcional)</small></label><input id="af-inicial" inputmode="decimal" value="${esc(a.inicial ? String(a.inicial).replace(".", ",") : "")}"></div>
        <div class="f"><label for="af-cuota">Cuota al mes (€)</label><input id="af-cuota" inputmode="decimal" value="${esc(a.cuota ? String(a.cuota).replace(".", ",") : "")}"></div>
        <div class="f"><label for="af-tin">Interés TIN %</label><input id="af-tin" inputmode="decimal" value="${esc(a.tin ? String(a.tin).replace(".", ",") : "")}" placeholder="3,20"></div>
        <div class="f"><label for="af-termina">Última cuota</label><input id="af-termina" type="date" value="${esc(a.termina || "")}"></div>` : ""}
      ${a.tipo === "credito" ? `<div class="f"><label for="af-limite">Límite (€)</label><input id="af-limite" inputmode="decimal" value="${esc(a.limite ? String(a.limite).replace(".", ",") : "")}"></div>` : ""}
      ${DEBT(a.tipo) ? `<div class="f"><label for="af-pago">Se paga desde</label><select id="af-pago"><option value="">— Elige —</option>${cuentas().filter(x => !DEBT(x.tipo)).map(x => `<option value="${x.id}"${x.id === a.pago ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select></div>` : ""}
      ${a.tipo === "banco" || a.tipo === "ahorro" || a.tipo === "credito" ? `<div class="f"><label for="af-tarjetas">Tarjeta <small>(4 últimas cifras)</small></label><input id="af-tarjetas" inputmode="numeric" value="${esc(a.tarjetas || "")}" placeholder="1234"></div>` : ""}
      ${a.tipo === "deposito" || a.tipo === "ahorro" ? `<div class="f"><label for="af-tae">TAE %</label><input id="af-tae" inputmode="decimal" value="${esc(a.tae ? String(a.tae).replace(".", ",") : "")}" placeholder="2,50"></div>` : ""}
      ${a.tipo === "deposito" ? `<div class="f"><label for="af-vence">Vence</label><input id="af-vence" type="date" value="${esc(a.vence || "")}"></div>` : ""}
    </div>
    ${a.tipo === "prestamo" ? `<p class="small muted" style="margin:0">La cuota ya la cuento yo en la previsión: no la apuntes también en «Lo fijo», o saldría dos veces.</p>` : ""}
    ${a.tipo === "credito" ? `<p class="small muted" style="margin:0">Lo que pagues con esta tarjeta cuenta como gasto el día de la compra, y sube lo que debes hasta que la pagas.</p>` : ""}
    ${a.tipo !== "prestamo" ? `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="af-hab"${a.habitual ? " checked" : ""}> Es con la que pago normalmente</label>` : ""}
    <div class="ed-foot"><button class="btn primary" id="af-save">Guardar</button><button class="btn ghost" id="af-cancel">Cancelar</button>${a.id ? `<span class="sp"></span><button class="btn danger" id="af-del">${a.confirmDel ? "Sí, quitarla" : "Quitar"}</button>` : ""}<span class="err" id="af-err"></span></div></div>`;
}
function readAccForm(){
  const a = accForm; if (!a) return;
  for (const k of ["nombre", "entidad", "saldo", "tarjetas", "tae", "vence", "inicial", "cuota", "tin", "termina", "limite", "pago"]) { const i = document.getElementById("af-" + k); if (i) a[k] = i.value; }
  const hb = $("#af-hab"); if (hb) a.habitual = hb.checked;
}
async function saveAccForm(){
  readAccForm();
  const a = accForm;
  const nombre = (a.nombre || "").trim() || (a.tipo === "efectivo" ? "Efectivo" : (a.entidad || "").trim());
  if (!nombre) { $("#af-err").textContent = "Ponle un nombre."; return; }
  const list = (cfg.cuentas && cfg.cuentas.length ? cfg.cuentas : cuentas()).map(c => ({ ...c }));
  const base = { nombre, tipo: a.tipo, entidad: (a.entidad || "").trim(), tarjetas: String(a.tarjetas || "").replace(/[^0-9 ,]/g, "").trim(), tae: a.tae ? num(a.tae) : null, vence: a.vence || null,
    inicial: a.inicial ? r2(num(a.inicial)) : null, cuota: a.cuota ? r2(num(a.cuota)) : null, tin: a.tin ? num(a.tin) : null, termina: a.termina || null, limite: a.limite ? r2(num(a.limite)) : null, pago: a.pago || null };
  if (DEBT(a.tipo) && !base.pago) { $("#af-err").textContent = "Di de qué cuenta se paga."; return; }
  if (a.id) { const i = list.findIndex(c => c.id === a.id); if (i >= 0) list[i] = { ...list[i], ...base }; }
  else {
    const id = norm(nombre).replace(/ /g, "-").slice(0, 24) + "-" + uid().slice(-4);
    const v = r2(num(a.saldo));
    list.push({ id, ...base, ancla: a.saldo !== "" && a.saldo != null ? { fecha: toISO(NOW), saldo: DEBT(a.tipo) ? -Math.abs(v) : v, ts: Date.now() } : null });
    a.id = id;
  }
  try {
    await saveCfg("cuentas", { items: list });
    if (a.habitual && a.tipo !== "prestamo") await saveCfg("prefs", { ...(cfg.prefs || {}), cuentaHabitual: a.id });
    accForm = null; toast("Cuenta guardada"); renderView();
  } catch (e) { $("#af-err").textContent = saveErr(e); }
}

/* ---------- objetivos ---------- */
function goalSaved(o){ if (o.cuenta && cuenta(o.cuenta)) return saldo(cuenta(o.cuenta), toISO(NOW)); return num(o.apartado); }
function goalCard(o, mini){
  const saved = goalSaved(o), imp = num(o.importe), falta = Math.max(0, imp - saved), p = imp ? Math.min(100, saved / imp * 100) : 0;
  const done = o.hecho || (imp > 0 && falta <= 0.005);
  let k = "";
  if (!done) {
    const am = ahorroMedio();
    if (o.fecha) {
      const f = parseISO(o.fecha);
      const meses = (f.getFullYear() - NOW.getFullYear()) * 12 + f.getMonth() - NOW.getMonth() + (f.getDate() >= NOW.getDate() ? 0 : -1) + 1;
      k += meses > 0 ? `<span>Aparta <b>${eur(falta / meses)}</b> al mes hasta ${MESL[f.getMonth()]}${f.getFullYear() !== NOW.getFullYear() ? " de " + f.getFullYear() : ""}</span>` : `<span style="color:var(--over)">La fecha ya ha pasado</span>`;
    }
    if (am && am.v > 0) { const n = Math.ceil(falta / am.v); const d = new Date(NOW.getFullYear(), NOW.getMonth() + n, 1); k += `<span>Con lo que ahorras (${eur(am.v)} al mes) lo tienes en <b>${MESL[d.getMonth()]} de ${d.getFullYear()}</b></span>`; }
    else if (am) k += `<span>Estos meses estás gastando más de lo que entra: así no llegas.</span>`;
  }
  return `<div class="goal${done ? " done" : ""}"><div class="goal-h"><div><b>${esc(o.nombre)}</b><div class="small muted">${o.tipo === "inversion" ? "Invertir" : "Comprar"}${o.fecha ? " · para " + shortDate(o.fecha) + (parseISO(o.fecha).getFullYear() !== Y ? " de " + parseISO(o.fecha).getFullYear() : "") : ""}${o.cuenta && cuenta(o.cuenta) ? " · lo guardas en " + esc(cuenta(o.cuenta).nombre) : ""}</div></div>${done ? `<span class="pill ok">Conseguido</span>` : `<span class="num">${eur(saved)} de ${eur(imp)}</span>`}</div>
    <div class="prog" role="img" aria-label="${pct(p)} conseguido"><i style="width:${p.toFixed(1)}%"></i></div>
    ${!done && !mini ? `<div class="k"><span>Falta <b>${eur(falta)}</b></span>${k}</div>` : !done ? `<div class="k"><span>Falta <b>${eur(falta)}</b></span></div>` : ""}
    ${mini ? "" : `<div class="row"><button class="btn sm" data-goaledit="${o.id}">Cambiar</button>${!o.cuenta && !done ? `<button class="btn sm ghost" data-goaladd="${o.id}">Apartar dinero</button>` : ""}</div>`}</div>`;
}
function objetivosHTML(){
  const obj = anio(Y).objetivos;
  const prevPend = anio(Y - 1).objetivos.filter(o => !o.hecho && !obj.some(x => x.id === o.id));
  let h = `<div class="panel"><div class="panel-head"><div><h2>Objetivos de ${Y}</h2><p>Lo que te quieres comprar o dónde quieres invertir. Te digo cuánto apartar cada mes y cuándo llegas.</p></div><button class="btn primary sm" id="goal-new">Añadir objetivo</button></div>`;
  if (prevPend.length) h += `<div class="banner" style="margin-bottom:12px">De ${Y - 1} quedaron ${prevPend.length} sin cumplir. <button class="btn sm" id="goal-bring">Traerlos a ${Y}</button></div>`;
  if (goalForm) h += goalFormHTML();
  h += obj.length ? `<div class="goals">${obj.map(o => goalCard(o)).join("")}</div>` : (goalForm ? "" : `<p class="empty">Todavía no hay objetivos en ${Y}.</p>`);
  return h + `</div>`;
}
function goalFormHTML(){
  const g = goalForm;
  return `<div class="job" style="margin-bottom:14px"><b>${g.id ? "Cambiar objetivo" : "Nuevo objetivo"}</b>
    <div class="seg" role="group"><button type="button" data-goaltipo="compra" aria-pressed="${g.tipo !== "inversion"}">Comprar algo</button><button type="button" data-goaltipo="inversion" aria-pressed="${g.tipo === "inversion"}">Invertir</button></div>
    <div class="fgrid">
      <div class="f wide"><label for="gf-nombre">Qué</label><input id="gf-nombre" value="${esc(g.nombre || "")}" placeholder="${g.tipo === "inversion" ? "Fondo indexado, piso para alquilar…" : "Coche nuevo, viaje, reforma…"}"></div>
      <div class="f"><label for="gf-importe">Cuánto (€)</label><input id="gf-importe" inputmode="decimal" value="${esc(g.importe ? String(g.importe).replace(".", ",") : "")}"></div>
      <div class="f"><label for="gf-fecha">Para cuándo</label><input id="gf-fecha" type="date" value="${esc(g.fecha || "")}"></div>
      <div class="f"><label for="gf-cuenta">Dónde lo guardas</label><select id="gf-cuenta"><option value="">Lo apunto yo</option>${cuentas().map(c => `<option value="${c.id}"${g.cuenta === c.id ? " selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></div>
      ${!g.cuenta ? `<div class="f"><label for="gf-apartado">Ya tienes apartado (€)</label><input id="gf-apartado" inputmode="decimal" value="${esc(g.apartado ? String(g.apartado).replace(".", ",") : "")}"></div>` : ""}
    </div>
    ${g.id ? `<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="gf-hecho"${g.hecho ? " checked" : ""}> Ya lo he conseguido</label>` : ""}
    <div class="ed-foot"><button class="btn primary" id="gf-save">Guardar</button><button class="btn ghost" id="gf-cancel">Cancelar</button>${g.id ? `<span class="sp"></span><button class="btn danger" id="gf-del">${g.confirmDel ? "Sí, quitarlo" : "Quitar"}</button>` : ""}<span class="err" id="gf-err"></span></div></div>`;
}
function readGoalForm(){
  const g = goalForm; if (!g) return;
  for (const k of ["nombre", "importe", "fecha", "cuenta", "apartado"]) { const i = document.getElementById("gf-" + k); if (i) g[k] = i.value; }
  const hc = $("#gf-hecho"); if (hc) g.hecho = hc.checked;
}
async function saveGoalForm(){
  readGoalForm();
  const g = goalForm;
  if (!(g.nombre || "").trim()) { $("#gf-err").textContent = "Pon qué es."; return; }
  if (!num(g.importe)) { $("#gf-err").textContent = "Pon cuánto cuesta."; return; }
  const o = { id: g.id || uid(), nombre: g.nombre.trim(), tipo: g.tipo === "inversion" ? "inversion" : "compra", importe: r2(num(g.importe)), fecha: g.fecha || null, cuenta: g.cuenta || null, apartado: g.cuenta ? 0 : r2(num(g.apartado)), hecho: !!g.hecho };
  const list = anio(Y).objetivos.filter(x => x.id !== o.id); list.push(o);
  list.sort((a, b) => (a.hecho - b.hecho) || String(a.fecha || "9").localeCompare(String(b.fecha || "9")));
  try { await saveAnio(Y, { objetivos: list }); goalForm = null; toast("Objetivo guardado"); renderView(); }
  catch (e) { $("#gf-err").textContent = saveErr(e); }
}

/* ---------- fijos y presupuesto ---------- */
function recSuggest(){
  // lo que se repite: mismo sitio, en 3 meses distintos de los últimos 6, con importes parecidos
  const since = toISO(new Date(NOW.getFullYear(), NOW.getMonth() - 6, 1));
  const have = new Set(anio(Y).recurrentes.map(r => norm(r.nombre)));
  const by = new Map();
  for (const m of MOVS) {
    if (m.fecha < since || m.tipo === "traspaso" || !m.comercio) continue;
    const k = m.tipo + "|" + norm(m.comercio); if (!k || have.has(norm(m.comercio))) continue;
    if (!by.has(k)) by.set(k, []); by.get(k).push(m);
  }
  const out = [];
  for (const [k, list] of by) {
    const months = new Set(list.map(m => m.fecha.slice(0, 7)));
    if (months.size < 3) continue;
    const amts = list.map(m => num(m.total)).sort((a, b) => a - b), med = amts[Math.floor(amts.length / 2)];
    if (amts.some(a => Math.abs(a - med) > med * 0.2 + 5)) continue;
    if (list.length > months.size * 1.5) continue;   // varias veces al mes: eso es variable (el súper), no fijo
    const m0 = list[0], cat = (m0.lineas.find(l => l.cat) || {}).cat || "";
    if (list.some(m => m.deuda) || cuentas().some(c => DEBT(c.tipo) && norm(c.nombre) === norm(m0.comercio))) continue;
    if (anio(Y).recurrentes.some(r => r.cat && r.cat === cat && Math.abs(num(r.importe) - med) <= med * 0.2 + 5)) continue;   // ya está como fijo con otro nombre
    out.push({ nombre: m0.comercio, tipo: m0.tipo, cat, importe: r2(med), cada: 1, mes: 1, dia: parseISO(m0.fecha).getDate() });
  }
  return out.slice(0, 12);
}
function previsionHTML(){
  const a = anio(Y), f = forecast(Y);
  const rfY = recsFor(Y), heredado = rfY.from !== Y;
  const recs = heredado ? f.recs : a.recurrentes;
  const sugg = recSuggest();
  let h = `<div class="panel"><div class="panel-head"><div><h2>Lo fijo de ${Y}</h2><p>Lo que entra y sale siempre: nómina, hipoteca, luz, seguros, colegio… Con esto calculo cómo acabarás el año.</p></div><div class="row">${!recs.length && anio(Y - 1).recurrentes.length ? `<button class="btn sm" id="rec-copy">Copiar los de ${Y - 1}</button>` : ""}${heredado ? "" : `<button class="btn primary sm" id="rec-new">Añadir fijo</button>`}</div></div>`;
  if (heredado) h += `<div class="banner" style="margin-bottom:12px">Para ${Y} uso los fijos de ${rfY.from}${Y - rfY.from > 0 && subida() ? `, con los gastos subidos un ${NF2.format(subida())} % al año` : ""}. Si en ${Y} va a cambiar algo (una subida de sueldo, una hipoteca nueva…), cópialos y cámbialos. <button class="btn sm" id="rec-copyfrom">Copiarlos a ${Y}</button></div>`;
  if (recForm) h += recFormHTML();
  if (recs.length) {
    const I = sum(recs.filter(r => r.tipo === "ingreso").map(r => num(r.importe) * 12 / (parseInt(r.cada) || 1)));
    const G = sum(recs.filter(r => r.tipo !== "ingreso").map(r => num(r.importe) * 12 / (parseInt(r.cada) || 1)));
    h += `<p class="small" style="margin:0 0 8px">De media al mes: entran <b class="num">${eur(I / 12)}</b> y salen <b class="num">${eur(G / 12)}</b> fijos.</p>`;
    for (const r of recs.slice().sort((a, b) => (a.tipo === "ingreso" ? 0 : 1) - (b.tipo === "ingreso" ? 0 : 1) || num(b.importe) - num(a.importe))) {
      h += `<div class="rec"><div><div class="n">${esc(r.nombre)}</div><div class="m">${r.tipo === "ingreso" ? "Entra" : "Sale"} ${EVERY[r.cada] || "cada " + r.cada + " meses"}${(parseInt(r.cada) || 1) > 1 || parseInt(r.mes) > 1 ? ", desde " + MESL[(parseInt(r.mes) || 1) - 1] : ""}${r.hasta ? " hasta " + MESL[parseInt(r.hasta) - 1] : ""} · ${esc(r.cat ? catName(r.cat) : "sin categoría")}</div></div><span class="a" style="color:${r.tipo === "ingreso" ? "var(--ok)" : "inherit"}">${r.tipo === "ingreso" ? "+" : "−"}${eur(r.importe)}</span>${heredado ? "<span></span>" : `<button class="btn sm ghost" data-recedit="${r.id}">Cambiar</button>`}</div>`;
    }
  } else if (!recForm) h += `<p class="empty">Todavía no hay fijos en ${Y}.</p>`;
  for (const c of cuentas().filter(c => c.tipo === "prestamo" && num(c.cuota) > 0 && c.ancla && debe(c, toISO(NOW)) > 0.005)) {
    h += `<div class="rec"><div><div class="n">${esc(c.nombre)}</div><div class="m">Sale cada mes · la cuota la saco yo de «Lo que debes»</div></div><span class="a">−${eur(c.cuota)}</span><button class="btn sm ghost" data-go="dinero" data-sub="cuentas">Ver</button></div>`;
  }
  h += `<div class="fgrid" style="margin-top:16px"><div class="f"><label for="pref-subida">Los precios suben al año (%)</label><input id="pref-subida" inputmode="decimal" value="${esc(NF2.format(subida()))}"></div></div><p class="small muted" style="margin:4px 0 0">Para los años que vienen subo los gastos este tanto cada año. Los ingresos no los subo, por prudencia.</p>`;
  if (sugg.length && !heredado) {
    h += `<h3 class="eyebrow" style="margin-top:18px">Parece que se repiten cada mes</h3>`;
    sugg.forEach((s, i) => { h += `<div class="rec"><div><div class="n">${esc(s.nombre)}</div><div class="m">${s.tipo === "ingreso" ? "Entra" : "Sale"} cada mes · ${esc(s.cat ? catName(s.cat) : "sin categoría")}</div></div><span class="a">${eur(s.importe)}</span><button class="btn sm" data-recsugg="${i}">Es fijo</button></div>`; });
  }
  h += `</div>`;

  // presupuesto
  const pres = a.presupuesto, prevY = yearStats(Y - 1);
  h += `<div class="panel"><div class="panel-head"><div><h2>Presupuesto de ${Y}</h2><p>Cuánto te quieres gastar en el año en cada cosa. Te aviso en «En qué se va» si vas a pasarte.</p></div>${prevY.G > 0 ? `<button class="btn sm" id="pres-prop">Proponer: lo de ${Y - 1} + 3 %</button>` : ""}</div><div class="tscroll"><table><thead><tr><th>Grupo</th><th class="n">${Y - 1}</th><th class="n">Llevas</th><th class="n">A fin de año</th><th class="n">Presupuesto</th><th></th></tr></thead><tbody>`;
  for (const g of cats().gasto) {
    const gf = groupForecast(Y, "gasto", g.id), ant = prevY.byGroupMonth.gasto[g.id] ? sum(prevY.byGroupMonth.gasto[g.id]) : 0, p = num(pres[g.id]);
    const pill = p ? (gf.fin > p ? `<span class="pill over">Te pasas</span>` : gf.fin > p * 0.9 ? `<span class="pill warn">Justo</span>` : `<span class="pill ok">Bien</span>`) : "";
    h += `<tr><td>${esc(g.nombre)}</td><td class="n">${ant ? eur(ant) : "—"}</td><td class="n">${eur(gf.real)}</td><td class="n">${eur(gf.fin)}</td><td class="n"><input class="inp" style="width:110px;text-align:right;padding:5px 7px;font-family:var(--mono);font-size:14px" data-pres="${g.id}" inputmode="decimal" value="${p ? String(p).replace(".", ",") : ""}" placeholder="—" aria-label="Presupuesto de ${esc(g.nombre)}"></td><td>${pill}</td></tr>`;
  }
  const PT = sum(Object.values(pres).map(num));
  h += `</tbody><tfoot><tr><th>Total</th><th class="n">${prevY.G ? eur(prevY.G) : "—"}</th><th class="n">${eur(yearStats(Y).G)}</th><th class="n">${eur(f.G)}</th><th class="n">${PT ? eur(PT) : "—"}</th><th></th></tr></tfoot></table></div></div>`;
  return h;
}
function recFormHTML(){
  const r = recForm;
  return `<div class="job" style="margin-bottom:14px"><b>${r.id ? "Cambiar fijo" : "Nuevo fijo"}</b>
    <div class="seg" role="group"><button type="button" data-rectipo="gasto" aria-pressed="${r.tipo !== "ingreso"}">Sale</button><button type="button" data-rectipo="ingreso" aria-pressed="${r.tipo === "ingreso"}">Entra</button></div>
    <div class="fgrid">
      <div class="f wide"><label for="rf-nombre">Qué</label><input id="rf-nombre" value="${esc(r.nombre || "")}" placeholder="${r.tipo === "ingreso" ? "Nómina" : "Hipoteca, luz, seguro del coche…"}"></div>
      <div class="f"><label for="rf-importe">Importe (€)</label><input id="rf-importe" inputmode="decimal" value="${esc(r.importe ? String(r.importe).replace(".", ",") : "")}"></div>
      <div class="f"><label for="rf-cada">Cada cuánto</label><select id="rf-cada">${Object.entries(EVERY).map(([k, v]) => `<option value="${k}"${String(r.cada || 1) === k ? " selected" : ""}>${cap(v)}</option>`).join("")}</select></div>
      <div class="f"><label for="rf-mes">${String(r.cada || 1) === "12" ? "En qué mes" : "Desde"}</label><select id="rf-mes">${MESL.map((n, i) => `<option value="${i + 1}"${(parseInt(r.mes) || 1) === i + 1 ? " selected" : ""}>${cap(n)}</option>`).join("")}</select></div>
      <div class="f"><label for="rf-hasta">Hasta</label><select id="rf-hasta"><option value="">Todo el año</option>${MESL.map((n, i) => `<option value="${i + 1}"${parseInt(r.hasta) === i + 1 ? " selected" : ""}>${cap(n)}</option>`).join("")}</select></div>
      <div class="f wide"><label for="rf-cat">Categoría</label><select id="rf-cat">${catOptions(r.tipo === "ingreso" ? "ingreso" : "gasto", r.cat)}</select></div>
    </div>
    <div class="ed-foot"><button class="btn primary" id="rf-save">Guardar</button><button class="btn ghost" id="rf-cancel">Cancelar</button>${r.id ? `<span class="sp"></span><button class="btn danger" id="rf-del">${r.confirmDel ? "Sí, quitarlo" : "Quitar"}</button>` : ""}<span class="err" id="rf-err"></span></div></div>`;
}
function readRecForm(){ const r = recForm; if (!r) return; for (const k of ["nombre", "importe", "cada", "mes", "hasta", "cat"]) { const i = document.getElementById("rf-" + k); if (i) r[k] = i.value; } }
async function saveRecForm(){
  readRecForm();
  const r = recForm;
  if (!(r.nombre || "").trim()) { $("#rf-err").textContent = "Pon qué es."; return; }
  if (!num(r.importe)) { $("#rf-err").textContent = "Pon el importe."; return; }
  const o = { id: r.id || uid(), nombre: r.nombre.trim(), tipo: r.tipo === "ingreso" ? "ingreso" : "gasto", importe: r2(Math.abs(num(r.importe))), cada: parseInt(r.cada) || 1, mes: parseInt(r.mes) || 1, hasta: r.hasta ? parseInt(r.hasta) : null, cat: r.cat || "" };
  const list = anio(Y).recurrentes.filter(x => x.id !== o.id); list.push(o);
  try { await saveAnio(Y, { recurrentes: list }); recForm = null; toast("Guardado"); renderView(); }
  catch (e) { $("#rf-err").textContent = saveErr(e); }
}
let presT;
function presInput(el){
  clearTimeout(presT);
  presT = setTimeout(async () => {
    const p = { ...anio(Y).presupuesto };
    $$("[data-pres]").forEach(i => { const v = num(i.value); if (v > 0) p[i.dataset.pres] = r2(v); else delete p[i.dataset.pres]; });
    try { await saveAnio(Y, { presupuesto: p }); toast("Presupuesto guardado"); } catch (e) { toast(saveErr(e)); }
  }, 900);
}

/* ---------- categorías ---------- */
function categoriasHTML(){
  let h = `<div class="panel"><div class="panel-head"><div><h2>Categorías</h2><p>Los grupos y sus categorías. Puedes añadir las tuyas o cambiarles el nombre; los movimientos no se pierden.</p></div></div>`;
  if (catForm) h += `<div class="job" style="margin-bottom:14px"><b>${catForm.cid ? "Cambiar nombre" : catForm.gid ? "Nueva categoría en " + esc(groupName(catForm.tipo, catForm.gid)) : "Nuevo grupo de " + (catForm.tipo === "gasto" ? "gastos" : "ingresos")}</b><div class="fgrid"><div class="f wide"><label for="cf-nombre">Nombre</label><input id="cf-nombre" value="${esc(catForm.nombre || "")}"></div></div><div class="ed-foot"><button class="btn primary" id="cf-save">Guardar</button><button class="btn ghost" id="cf-cancel">Cancelar</button><span class="err" id="cf-err"></span></div></div>`;
  for (const tipo of ["gasto", "ingreso"]) {
    h += `<h3 class="eyebrow" style="margin:14px 0 6px">${tipo === "gasto" ? "Gastos" : "Ingresos"}</h3>`;
    for (const g of cats()[tipo]) {
      h += `<div class="rec" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="n">${esc(g.nombre)} <button class="btn sm ghost" data-catren="${tipo}|${g.id}|">Renombrar</button></div><div class="chips" style="margin-top:6px">${g.cats.map(([cid, n]) => `<button type="button" data-catren="${tipo}|${g.id}|${cid}" title="Cambiar nombre">${esc(n)}</button>`).join("")}<button type="button" data-catadd="${tipo}|${g.id}">+ Añadir</button></div></div></div>`;
    }
    h += `<div class="row" style="margin-top:8px"><button class="btn sm" data-grpadd="${tipo}">+ Nuevo grupo</button></div>`;
  }
  return h + `</div>`;
}
async function saveCatForm(){
  const n = ($("#cf-nombre").value || "").trim();
  if (!n) { $("#cf-err").textContent = "Pon un nombre."; return; }
  const c = JSON.parse(JSON.stringify(cats()));
  const f = catForm, list = c[f.tipo];
  const slug = norm(n).replace(/ /g, "").slice(0, 16) || "c" + uid().slice(-4);
  if (f.cid) { const g = list.find(g => g.id === f.gid); const it = g && g.cats.find(x => x[0] === f.cid); if (it) it[1] = n; }
  else if (f.gid && f.rename) { const g = list.find(g => g.id === f.gid); if (g) g.nombre = n; }
  else if (f.gid) { const g = list.find(g => g.id === f.gid); if (g) { let id = slug; while (g.cats.some(x => x[0] === id)) id += "2"; g.cats.push([id, n]); } }
  else { let id = slug; while (list.some(g => g.id === id) || c.gasto.concat(c.ingreso).some(g => g.id === id)) id += "2"; list.push({ id, nombre: n, cats: [["varios", "Varios"]] }); }
  try { await saveCfg("categorias", c); cfg.cats = c; buildCatIdx(); catForm = null; toast("Guardado"); renderView(); }
  catch (e) { $("#cf-err").textContent = saveErr(e); }
}
