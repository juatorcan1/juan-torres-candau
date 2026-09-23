/* ================= pantalla: el año ================= */
const ICON = {
  ticket: `<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></svg>`,
  banco: `<svg viewBox="0 0 24 24"><path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>`,
  mano: `<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>`,
  texto: `<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>`,
  traspaso: `<svg viewBox="0 0 24 24"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>`,
  fijo: `<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></svg>`,
  camara: `<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  hoja: `<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></svg>`
};
const liquidNow = () => sum(cuentas().filter(c => LIQUID(c.tipo)).map(c => saldo(c, toISO(NOW))));
const totalAt = iso => sum(cuentas().filter(c => !DEBT(c.tipo)).map(c => saldo(c, iso)));
const deudaAt = iso => sum(cuentas().filter(c => DEBT(c.tipo)).map(c => debe(c, iso)));

function renderAnio(){
  const el = $("#v-anio");
  if (dbState === "loading") { el.innerHTML = `<div class="panel"><div class="thinking"><span class="spin"></span>Cargando tus cuentas…</div></div>`; return; }
  const st = yearStats(Y), f = forecast(Y);
  const phase = f.phase;
  const hayAlgo = MOVS.length > 0 || cuentas().some(c => c.ancla);
  let h = "";
  if (dbState === "none") h += `<div class="banner warn">${WEB ? "<b>No hay conexión con la base de datos.</b> Revisa internet y vuelve a cargar la página." : "<b>Aquí no se puede guardar.</b> Abre la página desde tu cuenta de Claude para que se guarden tus datos."}</div>`;
  if (!WEB) h += `<div class="banner"><b>Tus cuentas están en la web:</b> <a href="https://juatorcan1.github.io/juan-torres-candau/cuentas/" target="_blank" rel="noopener">juatorcan1.github.io/juan-torres-candau/cuentas</a>. Apunta allí: esta copia dentro de Claude no comparte los datos con la web.</div>`;
  if (!hayAlgo) h += firstSteps();

  const refIso = phase === "pasado" ? `${Y}-12-31` : toISO(NOW);
  const dinero = phase === "futuro" ? null : totalAt(refIso);
  const mesesPasados = phase === "pasado" ? 12 : phase === "actual" ? NOW.getMonth() + NOW.getDate() / daysIn(Y, NOW.getMonth()) : 0;
  const gastoMes = mesesPasados > 0.5 ? st.G / mesesPasados : 0;
  const colchon = gastoMes > 0 && phase !== "futuro" ? liquidNow() / gastoMes : null;
  const ah = st.I - st.G;
  const deuda = phase === "futuro" ? 0 : deudaAt(refIso);
  h += `<div class="tiles">
    <div class="tile"><span class="l"><span class="sw" style="background:var(--ing)"></span>Ha entrado</span><span class="v">${eur(st.I)}</span><span class="s">${phase === "pasado" ? "en todo el año" : "a fin de año: " + eur(f.I)}</span></div>
    <div class="tile"><span class="l"><span class="sw" style="background:var(--gas)"></span>Ha salido</span><span class="v">${eur(st.G)}</span><span class="s">${phase === "pasado" ? "en todo el año" : "a fin de año: " + eur(f.G)}</span></div>
    <div class="tile"><span class="l">Ahorrado</span><span class="v" style="color:${ah < 0 ? "var(--over)" : "inherit"}">${eur(ah)}</span><span class="s">${st.I > 0 ? pct(ah / st.I * 100) + " de lo que ha entrado" : "&nbsp;"}</span></div>
    <div class="tile"><span class="l"><span class="sw" style="background:var(--sal)"></span>${phase === "pasado" ? "Dinero a 31 dic" : "Dinero hoy"}</span><span class="v">${dinero == null ? "—" : eur(dinero)}</span><span class="s">${colchon != null ? "te da para " + NF0.format(Math.floor(colchon)) + (Math.floor(colchon) === 1 ? " mes" : " meses") + " de gastos" : phase === "futuro" ? "año que viene" : "en todas tus cuentas"}</span>${deuda > 0.005 ? `<span class="s" style="color:var(--over)">y debes ${eur(deuda)}</span>` : ""}</div>
  </div>`;
  if (st.revisar) h += `<div class="banner warn"><b>${st.revisar === 1 ? "Hay 1 movimiento" : "Hay " + st.revisar + " movimientos"} que la IA no ha tenido claro.</b> <button class="btn sm" data-go="movs" data-rev="1">Revisarlos</button></div>`;

  h += `<div class="panel"><div class="panel-head"><div><h2>Mes a mes</h2><p>${phase === "pasado" ? "Lo que entró y salió cada mes de " + Y + "." : "Lo que ha entrado y salido cada mes. Lo punteado es lo que calculo que falta."}</p></div></div>
    <div class="chart" id="ch-mes"></div>
    <div class="legend"><span><span class="sw" style="background:var(--ing)"></span>Ingresos</span><span><span class="sw" style="background:var(--gas)"></span>Gastos</span>${phase !== "pasado" ? `<span><span class="sw" style="background:transparent;border:1.5px dashed var(--prev)"></span>Previsto</span>` : ""}</div>
    ${tablaMeses(f)}</div>`;

  // previsión (el resumen; lo demás está en la pantalla Previsión)
  h += asiAcabarasHTML(f, false);

  // en qué se va
  const grupos = Object.entries(st.byGroupMonth.gasto).map(([g, a]) => [g, sum(a)]).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const obj = anio(Y).objetivos;
  h += `<div class="grid2">`;
  h += `<div class="panel"><div class="panel-head"><h2>En qué se va</h2><button class="btn sm" data-go="analisis">Ver todo</button></div>`;
  if (grupos.length) {
    const mx = grupos[0][1];
    h += `<div class="rank">` + grupos.slice(0, 6).map(([g, v]) => `<div class="rk" style="cursor:default"><span class="nm">${esc(groupName("gasto", g))}</span><span class="am">${eur(v)}</span><span class="bar"><i style="width:${(v / mx * 100).toFixed(1)}%;background:var(--gas)"></i></span></div>`).join("") + `</div>`;
  } else h += `<p class="empty">Todavía no hay gastos apuntados en ${Y}.</p>`;
  h += `</div>`;
  h += `<div class="panel"><div class="panel-head"><h2>Objetivos</h2><button class="btn sm" data-go="dinero" data-sub="objetivos">${obj.length ? "Ver todos" : "Añadir"}</button></div>`;
  h += obj.length ? `<div class="goals">${obj.slice(0, 3).map(o => goalCard(o, true)).join("")}</div>` : `<p class="empty">Apunta lo que te quieres comprar o dónde quieres invertir, y te digo cuánto tienes que apartar cada mes.</p>`;
  h += `</div></div>`;

  // pregúntale
  if (sample) h += `<div class="panel"><div class="panel-head"><div><h2>Pregúntale a la IA</h2><p>Mira tus números de ${Y} y te contesta.</p></div></div>
    <div class="sugg">${["¿Dónde puedo recortar?","¿Cómo voy frente al año pasado?","¿Llego a mis objetivos?","¿Cuánto puedo gastar al mes sin tocar el ahorro?"].map(s => `<button type="button" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <div class="ask" style="margin-top:10px"><textarea class="inp area" id="ask-q" rows="2" placeholder="Pregunta lo que quieras de tus cuentas" style="min-height:48px"></textarea><button class="btn primary" id="ask-go">Preguntar</button></div>
    <div id="ask-out" style="margin-top:12px"></div></div>`;

  el.innerHTML = h;
  monthBars($("#ch-mes"), [
    { label: "Ingresos", color: "var(--ing)", real: f.ing, prev: f.pIng },
    { label: "Gastos", color: "var(--gas)", real: f.gas, prev: f.pGas }
  ], { label: "Ingresos y gastos por mes" });
  if (askState.text || askState.busy) paintAsk();
}
// De aquí a 2040: el dinero y la deuda a 31 de diciembre de cada año
function largoPlazoHTML(){
  if (!forecast(CUR_Y).hayCuentas) return "";
  let rows = "";
  for (let y = CUR_Y; y <= MAX_Y; y++) { const f = forecast(y); rows += `<tr${y === Y ? ' style="font-weight:700"' : ""}><td>${y}</td><td class="n">${eur(f.I)}</td><td class="n">${eur(f.G)}</td><td class="n">${eur(f.ahorro)}</td><td class="n">${eur(f.saldoFin)}</td>${f.hayDeudas ? `<td class="n">${eur(f.deudaFinTotal)}</td>` : ""}</tr>`; }
  const fin = forecast(MAX_Y), hd = fin.hayDeudas;
  return `<div class="panel"><div class="panel-head"><div><h2>Hasta ${MAX_Y}</h2><p>Si todo sigue como hoy, el 31 de diciembre de ${MAX_Y} tendrás unos <b class="num">${eur(fin.saldoFin)}</b>${hd ? ` y deberás <b class="num">${eur(fin.deudaFinTotal)}</b>` : ""}.</p></div><button class="btn sm" data-go="prevision" data-psub="fijos">Cambiar la subida</button></div>
    <div class="chart" id="ch-largo"></div>
    <div class="legend"><span><span class="ln dash" style="border-color:var(--sal)"></span>Dinero a 31 de diciembre</span>${hd ? `<span><span class="ln dash" style="border-color:var(--over)"></span>Lo que debes</span>` : ""}</div>
    <p class="why">Es una cuenta, no una promesa: uso tus fijos de hoy, lo que gastas de media y los gastos subiendo un ${NF2.format(subida())} % al año. Los ingresos no los subo. Si algún año cambia algo, ponle sus fijos a ese año.</p>
    <details class="tbl"><summary>Ver año a año</summary><div class="tscroll"><table><thead><tr><th>Año</th><th class="n">Entra</th><th class="n">Sale</th><th class="n">Ahorras</th><th class="n">Tendrás</th>${hd ? `<th class="n">Deberás</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div></details></div>`;
}
function tablaMeses(f){
  let rows = "";
  for (let i = 0; i < 12; i++) {
    const pv = f.pIng[i] + f.pGas[i] > 0.005;
    const I = f.ing[i] + f.pIng[i], G = f.gas[i] + f.pGas[i];
    if (!I && !G) continue;
    rows += `<tr class="${pv && !f.ing[i] && !f.gas[i] ? "prev" : ""}"><td>${cap(MESL[i])}${pv ? " <span class='muted'>(previsto)</span>" : ""}</td><td class="n">${eur(I)}</td><td class="n">${eur(G)}</td><td class="n">${eur(I - G)}</td></tr>`;
  }
  if (!rows) return "";
  return `<details class="tbl"><summary>Ver los números</summary><div class="tscroll"><table><thead><tr><th>Mes</th><th class="n">Entra</th><th class="n">Sale</th><th class="n">Queda</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Año</th><th class="n">${eur(f.I)}</th><th class="n">${eur(f.G)}</th><th class="n">${eur(f.I - f.G)}</th></tr></tfoot></table></div></details>`;
}
function firstSteps(){
  const hasAcc = cfg.cuentas && cfg.cuentas.some(c => c.ancla);
  const hasRec = anio(Y).recurrentes.length > 0;
  return `<div class="panel"><div class="panel-head"><div><h2>Para empezar</h2><p>Tres pasos y la app empieza a trabajar para ti.</p></div></div>
  <ol class="steps">
    <li class="${hasAcc ? "done" : ""}"><div><b>Tus bancos y el efectivo</b><span>En qué bancos tienes dinero y cuánto hay hoy.</span></div><button class="btn sm" data-go="dinero" data-sub="cuentas">Poner</button></li>
    <li class="${hasRec ? "done" : ""}"><div><b>Lo fijo</b><span>Nómina, hipoteca, luz, seguros… lo que entra y sale siempre.</span></div><button class="btn sm" data-go="prevision" data-psub="fijos">Poner</button></li>
    <li><div><b>Tu primer ticket</b><span>Hazle una foto y la IA lo reparte por categorías.</span></div><button class="btn sm primary" data-go="apuntar">Escanear</button></li>
  </ol></div>`;
}

/* ---------- pregúntale ---------- */
const askState = { busy: false, text: "", q: "", ctl: null, err: "" };
function resumenParaIA(){
  const st = yearStats(Y), f = forecast(Y), prevSt = yearStats(Y - 1);
  const grupos = t => Object.fromEntries(Object.entries(yearStats(Y).byGroupMonth[t]).map(([g, a]) => [groupName(t, g), r2(sum(a))]));
  return {
    hoy: toISO(NOW), ejercicio: Y,
    ingresos_mes: st.ing.map(r2), gastos_mes: st.gas.map(r2),
    gastos_por_grupo: grupos("gasto"), ingresos_por_grupo: grupos("ingreso"),
    gastos_por_categoria: Object.fromEntries(Object.entries(st.byCat.gasto).map(([c, v]) => [c === "_sin" ? "Sin categoría" : catName(c), r2(v)])),
    año_anterior: { ingresos: r2(prevSt.I), gastos: r2(prevSt.G), gastos_mes: prevSt.gas.map(r2) },
    prevision_fin_de_año: f.phase === "pasado" ? null : { ingresos: r2(f.I), gastos: r2(f.G), ahorro: r2(f.ahorro), dinero_31_dic: f.hayCuentas ? r2(f.saldoFin) : null, deuda_31_dic: f.hayDeudas ? f.deudaFinTotal : 0, gasto_variable_medio_mes: r2(f.varAvg) },
    fijos: anio(Y).recurrentes.map(r => ({ nombre: r.nombre, tipo: r.tipo, importe: r.importe, cada_meses: r.cada })),
    presupuesto_anual_por_grupo: Object.fromEntries(Object.entries(anio(Y).presupuesto).map(([g, v]) => [groupName("gasto", g), v])),
    cuentas: cuentas().filter(c => !DEBT(c.tipo)).map(c => ({ nombre: c.nombre, tipo: ACC_TYPES[c.tipo] || c.tipo, saldo_hoy: c.ancla ? saldo(c, toISO(NOW)) : "sin saldo apuntado", tae: c.tae || undefined, vence: c.vence || undefined })),
    deudas: cuentas().filter(c => DEBT(c.tipo)).map(c => ({ nombre: c.nombre, tipo: ACC_TYPES[c.tipo], debe_hoy: c.ancla ? debe(c, toISO(NOW)) : "sin apuntar", cuota_mes: num(c.cuota) || undefined, tin: num(c.tin) || undefined, termina: c.termina || undefined })),
    objetivos: anio(Y).objetivos.map(o => ({ nombre: o.nombre, para: o.tipo, importe: o.importe, fecha: o.fecha, apartado: goalSaved(o) }))
  };
}
async function askGo(q){
  q = (q || "").trim(); if (!q || !sample || askState.busy) return;
  askState.busy = true; askState.q = q; askState.text = ""; askState.err = ""; askState.ctl = new AbortController();
  paintAsk();
  const prompt = `Eres el asesor de finanzas personales de Juan (España). Juan es constructor, no financiero: contesta en español llano, corto (lo que cabe en la pantalla de un móvil), sin tablas, una idea por frase, y si tiene que hacer algo dale los pasos numerados. Números en euros con dos decimales y coma decimal. Usa SOLO los datos de abajo; si un dato no está, dilo, no lo inventes.

Pregunta de Juan: ${q}

Sus datos (JSON):
${JSON.stringify(resumenParaIA())}`;
  try {
    await sample(prompt, { signal: askState.ctl.signal, cache: false, onText: ({ text }) => { askState.text = text; paintAsk(); } });
  } catch (e) {
    if (e && e.code !== "cancelled") askState.err = e.code === "not_granted" ? "No has dado permiso para preguntar a la IA." : e.code === "rate_limited" ? "Demasiadas preguntas seguidas. Espera un poco." : "No ha salido. Prueba otra vez.";
    if (e && e.text) askState.text = e.text;
  }
  askState.busy = false; paintAsk();
}
function paintAsk(){
  const o = $("#ask-out"); if (!o) return;
  o.innerHTML = (askState.q ? `<p class="small muted" style="margin:0 0 6px">${esc(askState.q)}</p>` : "") +
    (askState.busy && !askState.text ? `<div class="thinking"><span class="spin"></span>Pensando…</div>` : "") +
    (askState.text ? `<div class="answer">${esc(askState.text)}</div>` : "") +
    (askState.err ? `<p class="err">${esc(askState.err)}</p>` : "") +
    (askState.busy ? `<button class="btn sm ghost" id="ask-stop" style="margin-top:6px">Parar</button>` : "");
}

/* ================= pantalla: movimientos ================= */
const mf = { mes: "", tipo: "", grupo: "", cuenta: "", q: "", rev: false, limit: 200 };
function movTitle(m){ return m.comercio || (m.lineas && m.lineas[0] && m.lineas[0].concepto) || (m.tipo === "traspaso" ? "Traspaso" : catName((m.lineas[0] || {}).cat)); }
function movSub(m){
  const parts = [];
  if (m.tipo === "traspaso") parts.push(`${(cuenta(m.cuenta) || {}).nombre || "?"} → ${(cuenta(m.destino) || {}).nombre || "?"}`);
  else {
    const cs = [...new Set(splits(m).map(s => s.cat ? catName(s.cat) : "Sin categoría"))];
    parts.push(cs.slice(0, 3).join(" · ") + (cs.length > 3 ? " …" : ""));
    const c = cuenta(m.cuenta); if (c) parts.push(c.nombre);
  }
  return parts.join(" · ");
}
function movIcon(m){ return m.tipo === "traspaso" ? ICON.traspaso : m.origen === "ticket" ? ICON.ticket : m.origen === "extracto" ? ICON.banco : m.origen === "fijo" || m.origen === "cuota" ? ICON.fijo : m.origen === "texto" ? ICON.texto : ICON.mano; }
function movRow(m){
  const sign = m.tipo === "gasto" ? "−" : m.tipo === "ingreso" ? "+" : "";
  return `<button type="button" class="mv" data-mov="${esc(m.id)}"><span class="ic">${movIcon(m)}</span><span style="min-width:0"><span class="t" style="display:block">${m.revisar ? `<span class="flag" title="Revisar">● </span>` : ""}${esc(movTitle(m))}</span><span class="d" style="display:block">${esc(movSub(m))}</span></span><span class="a ${m.tipo === "ingreso" ? "in" : ""}">${sign}${eur(m.total)}${m.tipo === "traspaso" ? "<small>traspaso</small>" : ""}</span></button>`;
}
function filteredMovs(){
  const q = norm(mf.q);
  return MOVS.filter(m => {
    if (!m.fecha.startsWith(Y + "-")) return false;
    if (mf.mes !== "" && parseISO(m.fecha).getMonth() !== +mf.mes) return false;
    if (mf.tipo && m.tipo !== mf.tipo) return false;
    if (mf.cuenta && m.cuenta !== mf.cuenta && m.destino !== mf.cuenta) return false;
    if (mf.rev && !m.revisar) return false;
    if (mf.grupo) { const [t, g] = mf.grupo.split(":"); if (m.tipo !== t || !splits(m).some(s => (s.cat ? catGroup(s.cat) : "_sin") === g)) return false; }
    if (q && !norm(m.comercio + " " + m.nota + " " + (m.lineas || []).map(l => l.concepto + " " + catName(l.cat)).join(" ")).includes(q)) return false;
    return true;
  });
}
function renderMovs(){
  const el = $("#v-movs");
  if (dbState === "loading") { el.innerHTML = `<div class="panel"><div class="thinking"><span class="spin"></span>Cargando…</div></div>`; return; }
  const list = filteredMovs();
  let G = 0, I = 0; for (const m of list) { if (m.tipo === "gasto") G += num(m.total); else if (m.tipo === "ingreso") I += num(m.total); }
  let grpOpts = `<option value="">Todas las categorías</option>`;
  for (const t of ["gasto", "ingreso"]) { grpOpts += `<optgroup label="${t === "gasto" ? "Gastos" : "Ingresos"}">`; for (const g of cats()[t]) grpOpts += `<option value="${t}:${g.id}"${mf.grupo === t + ":" + g.id ? " selected" : ""}>${esc(g.nombre)}</option>`; grpOpts += `<option value="${t}:_sin"${mf.grupo === t + ":_sin" ? " selected" : ""}>Sin categoría</option></optgroup>`; }
  let h = `<div class="panel"><div class="panel-head"><div><h2>Movimientos de ${Y}</h2><p>${list.length} ${list.length === 1 ? "movimiento" : "movimientos"} · salen ${eur(G)} · entran ${eur(I)}</p></div><button class="btn sm primary" data-go="apuntar">Apuntar</button></div>
    <div class="filters">
      <input type="search" id="mf-q" placeholder="Buscar: Mercadona, gasolina…" value="${esc(mf.q)}" aria-label="Buscar">
      <select id="mf-mes" aria-label="Mes"><option value="">Todo el año</option>${MESL.map((n, i) => `<option value="${i}"${mf.mes === String(i) ? " selected" : ""}>${cap(n)}</option>`).join("")}</select>
      <select id="mf-tipo" aria-label="Tipo"><option value="">Todo</option><option value="gasto"${mf.tipo === "gasto" ? " selected" : ""}>Gastos</option><option value="ingreso"${mf.tipo === "ingreso" ? " selected" : ""}>Ingresos</option><option value="traspaso"${mf.tipo === "traspaso" ? " selected" : ""}>Traspasos</option></select>
      <select id="mf-grupo" aria-label="Categoría">${grpOpts}</select>
      <select id="mf-cuenta" aria-label="Cuenta"><option value="">Todas las cuentas</option>${accOptions(mf.cuenta)}</select>
      <label class="small" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="mf-rev"${mf.rev ? " checked" : ""}> Sólo por revisar</label>
    </div></div>`;
  h += `<div class="panel">`;
  if (!list.length) h += `<p class="empty">${MOVS.length ? "No hay nada con estos filtros." : "Aún no hay nada apuntado. Escanea un ticket o importa el extracto del banco."}</p>`;
  else {
    let day = "", dayTot = 0, buf = "";
    const flush = () => { if (day) h += `<div class="day"><h3><span>${longDate(day)}</span><span class="num">${dayTot ? (dayTot < 0 ? "−" : "+") + eur(Math.abs(dayTot)) : ""}</span></h3>${buf}</div>`; };
    for (const m of list.slice(0, mf.limit)) {
      if (m.fecha !== day) { flush(); day = m.fecha; dayTot = 0; buf = ""; }
      dayTot += m.tipo === "gasto" ? -num(m.total) : m.tipo === "ingreso" ? num(m.total) : 0;
      buf += movRow(m);
    }
    flush();
    if (list.length > mf.limit) h += `<div style="text-align:center;margin-top:12px"><button class="btn" id="mf-more">Ver ${Math.min(200, list.length - mf.limit)} más</button></div>`;
  }
  h += `</div>`;
  el.innerHTML = h;
}

/* ================= pantalla: en qué se va ================= */
let anTipo = store.get("cj.antipo", "gasto"), anOpen = null;
function renderAnalisis(){
  const el = $("#v-analisis");
  const st = yearStats(Y), f = forecast(Y), prev = yearStats(Y - 1);
  const t = anTipo, pres = anio(Y).presupuesto;
  const tot = t === "gasto" ? st.G : st.I;
  const ids = new Set([...Object.keys(st.byGroupMonth[t]), ...(t === "gasto" ? Object.keys(pres).filter(k => num(pres[k]) > 0) : [])]);
  const rows = [...ids].map(g => { const gf = groupForecast(Y, t, g); return { g, real: gf.real, fin: gf.fin, pres: t === "gasto" ? num(pres[g]) : 0, ant: prev.byGroupMonth[t][g] ? sum(prev.byGroupMonth[t][g]) : 0 }; })
    .filter(r => r.real > 0.005 || r.pres > 0 || r.fin > 0.005).sort((a, b) => b.real - a.real || b.fin - a.fin);
  const mx = Math.max(1, ...rows.map(r => Math.max(r.real, r.fin, r.pres)));
  const col = t === "gasto" ? "var(--gas)" : "var(--ing)";
  let h = `<div class="panel"><div class="panel-head"><div><h2>${t === "gasto" ? "En qué se va el dinero" : "De dónde viene el dinero"}</h2><p>${Y}: ${eur(tot)} ${t === "gasto" ? "gastados" : "ingresados"}${f.phase !== "pasado" ? ` · a fin de año, unos ${eur(t === "gasto" ? f.G : f.I)}` : ""}. Toca un grupo para ver el detalle.</p></div>
    <div class="seg" role="group" aria-label="Qué mirar"><button type="button" data-antipo="gasto" aria-pressed="${t === "gasto"}">Gastos</button><button type="button" data-antipo="ingreso" aria-pressed="${t === "ingreso"}">Ingresos</button></div></div>`;
  if (!rows.length) h += `<p class="empty">No hay ${t === "gasto" ? "gastos" : "ingresos"} apuntados en ${Y}.</p>`;
  h += `<div class="rank">`;
  for (const r of rows) {
    let pill = "";
    if (r.pres > 0) {
      const ratio = r.fin / r.pres;
      pill = ratio > 1.0001 ? `<span class="pill over">Te pasas ${eur(r.fin - r.pres)}</span>` : ratio > 0.9 ? `<span class="pill warn">Justo: te sobran ${eur(r.pres - r.fin)}</span>` : `<span class="pill ok">Bien: te sobran ${eur(r.pres - r.fin)}</span>`;
    }
    const open = anOpen === t + ":" + r.g;
    h += `<button type="button" class="rk" data-grp="${t}:${r.g}" aria-expanded="${open}"><span class="nm">${esc(groupName(t, r.g))}<small>${tot > 0 ? pct(r.real / tot * 100) : ""}</small></span><span class="am">${eur(r.real)}</span>
      <span class="bar"><i style="width:${(r.fin / mx * 100).toFixed(1)}%;background:${col};opacity:.25"></i><i style="width:${(r.real / mx * 100).toFixed(1)}%;background:${col}"></i>${r.pres > 0 ? `<u style="left:calc(${(r.pres / mx * 100).toFixed(1)}% - 1px)" title="Presupuesto"></u>` : ""}</span>
      <span class="meta">${f.phase !== "pasado" && r.fin - r.real > 0.5 ? `<span>a fin de año ${eur(r.fin)}</span>` : ""}${r.pres > 0 ? `<span>presupuesto ${eur(r.pres)}</span>` : ""}${r.ant > 0 ? `<span>${Y - 1}: ${eur(r.ant)}</span>` : ""}${pill}</span></button>`;
    if (open) h += `<div class="drill" id="drill"></div>`;
  }
  h += `</div>`;
  if (rows.length) h += `<div class="legend"><span><span class="sw" style="background:${col}"></span>Llevas</span>${f.phase !== "pasado" ? `<span><span class="sw" style="background:${col};opacity:.25"></span>Previsto a fin de año</span>` : ""}${t === "gasto" && Object.keys(pres).length ? `<span><span class="ln" style="border-top:0;border-left:2px solid var(--ink);height:12px;width:0"></span>Presupuesto</span>` : ""}</div>`;
  h += `</div>`;

  // curva acumulada
  const acc = a => { let s = 0; return a.map(v => (s += v)); };
  const realArr = t === "gasto" ? f.gas : f.ing, prevArr = t === "gasto" ? f.pGas : f.pIng;
  const cum = acc(realArr.map((v, i) => v + prevArr[i]));
  const lastReal = f.phase === "pasado" ? 11 : f.phase === "futuro" ? -1 : NOW.getMonth();
  const cumShown = cum.map((v, i) => (f.phase === "futuro" || i <= 11) ? v : null);
  const prevCum = acc(t === "gasto" ? prev.gas : prev.ing);
  const hasPrev = prev.n > 0;
  h += `<div class="panel"><div class="panel-head"><div><h2>La curva del año</h2><p>${t === "gasto" ? "Gasto" : "Ingreso"} acumulado mes a mes${hasPrev ? `, frente a ${Y - 1}` : ""}.</p></div></div><div class="chart" id="ch-cum"></div>
    <div class="legend"><span><span class="ln" style="border-color:${col}"></span>${Y}</span>${f.phase !== "pasado" ? `<span><span class="ln dash" style="border-color:${col}"></span>Previsto</span>` : ""}${hasPrev ? `<span><span class="ln" style="border-color:var(--lastyear)"></span>${Y - 1}</span>` : ""}</div></div>`;
  el.innerHTML = h;
  const series = [];
  if (hasPrev) series.push({ label: String(Y - 1), color: "var(--lastyear)", values: prevCum, endDot: false });
  series.push({ label: String(Y), color: col, values: cumShown, dashFrom: f.phase === "pasado" ? null : Math.max(0, lastReal + (f.phase === "actual" ? 0 : 0)) });
  monthLines($("#ch-cum"), series, { label: "Acumulado del año" });
  if (anOpen) renderDrill();
}
function renderDrill(){
  const box = $("#drill"); if (!box) return;
  const [t, g] = anOpen.split(":");
  const st = yearStats(Y);
  const months = st.byGroupMonth[t][g] || Array(12).fill(0);
  const tot = sum(months);
  const items = Object.entries(st.byCat[t]).filter(([c]) => (c === "_sin" ? "_sin" : catGroup(c)) === g).sort((a, b) => b[1] - a[1]);
  const con = months.filter(v => v > 0).length;
  const col = t === "gasto" ? "var(--gas)" : "var(--ing)";
  box.innerHTML = `<div class="subs">${items.map(([c, v]) => `<div class="sub"><span>${esc(c === "_sin" ? "Sin categoría" : catName(c))}</span><span class="p">${tot ? pct(v / tot * 100) : ""}</span><span class="num">${eur(v)}</span></div>`).join("") || `<p class="muted small">Sin movimientos todavía.</p>`}</div>
    ${tot ? `<div><div class="eyebrow">Mes a mes${con ? ` · media ${eur(tot / con)} en los meses con gasto` : ""}</div><div class="chart" id="ch-drill"></div></div>` : ""}
    <div class="row"><button class="btn sm" data-seegrp="${t}:${g}">Ver sus movimientos</button></div>`;
  if (tot) monthBars($("#ch-drill"), [{ label: groupName(t, g), color: col, real: months, prev: [] }], { h: 170, label: "Mes a mes de " + groupName(t, g) });
}
