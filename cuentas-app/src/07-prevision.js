/* ================= pantalla: previsión ================= */
let pSub = store.get("cj.psub", "resumen");
const PSUBS = () => [["resumen", "Resumen"], ["gastos", "Gastos"], ["ingresos", "Ingresos"], ["viene", "Lo que viene"], ["largo", "Hasta " + MAX_Y], ["fijos", "Fijos y presupuesto"]];

function renderPrevision(){
  const el = $("#v-prevision");
  if (dbState === "loading") { el.innerHTML = `<div class="panel"><div class="thinking"><span class="spin"></span>Cargando…</div></div>`; return; }
  if (!PSUBS().some(([k]) => k === pSub)) pSub = "resumen";
  const f = forecast(Y);
  let h = `<div class="subnav" role="tablist" aria-label="Previsión">${PSUBS().map(([k, n]) => `<button role="tab" data-psub="${k}" aria-selected="${pSub === k}">${esc(n)}</button>`).join("")}</div>`;
  if (f.phase === "pasado" && ["resumen", "gastos", "ingresos"].includes(pSub)) h += `<div class="banner">${Y} ya está cerrado: aquí ves lo que pasó de verdad, no una previsión.</div>`;
  if (pSub === "resumen") h += asiAcabarasHTML(f, true) + mesesPrevisionHTML(f);
  else if (pSub === "gastos" || pSub === "ingresos") h += prevTipoHTML(pSub === "gastos" ? "gasto" : "ingreso");
  else if (pSub === "viene") h += loQueVieneHTML();
  else if (pSub === "largo") h += largoPlazoHTML() || `<div class="panel"><h2>Hasta ${MAX_Y}</h2><p class="why">Para ver cuánto tendrás cada año, primero dime cuánto tienes hoy en cada cuenta.</p><div class="row" style="margin-top:10px"><button class="btn primary sm" data-go="dinero" data-sub="cuentas">Poner mis cuentas</button></div></div>`;
  else h += previsionHTML();
  el.innerHTML = h;
  // gráficos de cada apartado
  if ($("#ch-pmes")) monthBars($("#ch-pmes"), [
    { label: "Ingresos", color: "var(--ing)", real: f.ing, prev: f.pIng },
    { label: "Gastos", color: "var(--gas)", real: f.gas, prev: f.pGas }
  ], { label: "Ingresos y gastos por mes, con lo previsto" });
  if ($("#ch-saldo")) {
    const firstP = f.saldoMes.findIndex(s => s.prev);
    monthLines($("#ch-saldo"), [{ label: "Dinero", color: "var(--sal)", values: f.saldoMes.map(s => s.v), dashFrom: firstP < 0 ? null : firstP, area: true }], { label: "Dinero en cuentas por mes" });
  }
  if ($("#ch-ptipo")) {
    const g = pSub === "gastos";
    monthBars($("#ch-ptipo"), [{ label: g ? "Gastos" : "Ingresos", color: g ? "var(--gas)" : "var(--ing)", real: g ? f.gas : f.ing, prev: g ? f.pGas : f.pIng }], { h: 200, label: (g ? "Gastos" : "Ingresos") + " por mes, con lo previsto" });
  }
  if ($("#ch-largo")) {
    const ys = []; for (let y = CUR_Y; y <= MAX_Y; y++) ys.push(y);
    const fs = ys.map(y => forecast(y));
    const series = [{ label: "Dinero", color: "var(--sal)", values: fs.map(x => x.saldoFin), dashFrom: 0 }];
    if (fs[0].hayDeudas) series.push({ label: "Deuda", color: "var(--over)", values: fs.map(x => x.deudaFinTotal), dashFrom: 0 });
    monthLines($("#ch-largo"), series, { labels: ys.map(String), tipLabels: ys.map(y => "31 dic " + y), label: "Dinero a fin de cada año hasta " + MAX_Y });
  }
}

// «Así acabarás el año»: el resumen de la previsión (también sale en «El año»)
function asiAcabarasHTML(f, full){
  if (f.phase === "pasado") {
    const st = yearStats(Y);
    return st.n ? `<div class="panel"><h2>Así cerró ${Y}</h2><dl class="fore" style="margin-top:12px"><div><dt>Entró</dt><dd>${eur(st.I)}</dd></div><div><dt>Salió</dt><dd>${eur(st.G)}</dd></div><div class="big"><dt>Ahorro</dt><dd>${eur(st.I - st.G)}</dd></div></dl></div>` : "";
  }
  const nFijos = f.recs.length;
  return `<div class="panel"><div class="panel-head"><div><h2>Así acabarás ${Y}</h2><p>Si sigues como vas.</p></div>${full ? `<button class="btn sm" data-psub="fijos">Cambiar lo fijo</button>` : `<button class="btn sm" data-go="prevision" data-psub="resumen">Ver la previsión</button>`}</div>
    <dl class="fore">
      <div><dt>Entrará</dt><dd>${eur(f.I)}</dd></div>
      <div><dt>Saldrá</dt><dd>${eur(f.G)}</dd></div>
      <div class="big"><dt>Ahorrarás</dt><dd style="color:${f.ahorro < 0 ? "var(--over)" : "inherit"}">${eur(f.ahorro)}</dd></div>
      ${f.hayCuentas ? `<div class="big"><dt>Tendrás el 31 de diciembre</dt><dd>${eur(f.saldoFin)}</dd></div>` : ""}
      ${f.hayDeudas ? `<div><dt>Deberás el 31 de diciembre</dt><dd>${eur(f.deudaFinTotal)}</dd></div>` : ""}
    </dl>
    <p class="why">Cuento lo que ya ha pasado${nFijos ? `, lo fijo que tienes apuntado (${nFijos} ${nFijos === 1 ? "cosa" : "cosas"})` : ""}${f.varAvg > 0 ? ` y, para el resto del gasto, ${f.varBase}: unos ${eur(f.varAvg)} al mes` : ""}. Los ingresos que no son fijos no los cuento, por prudencia.${f.intereses > 0 ? ` Incluye ${eur(f.intereses)} de intereses de tus depósitos.` : ""}${f.interesesDeuda > 0 ? ` De las cuotas de tus préstamos, los intereses (${eur(f.interesesDeuda)} hasta fin de año) los cuento como gasto y el resto como deuda que devuelves.` : ""}${f.recsFrom !== Y ? ` Uso los fijos de ${f.recsFrom}, con los gastos subidos un ${NF2.format(subida())} % al año.` : ""}${!nFijos ? ` <b>Apunta tu nómina y tus gastos fijos</b> y la previsión será mucho mejor.` : ""}${!f.hayCuentas ? ` Para saber cuánto tendrás a final de año, dime cuánto tienes hoy en cada cuenta.` : ""}</p>
    ${full && f.hayCuentas ? `<h3 class="eyebrow" style="margin-top:16px">Dinero en tus cuentas, mes a mes</h3><div class="chart" id="ch-saldo"></div><div class="legend"><span><span class="ln" style="border-color:var(--sal)"></span>Lo que ha habido</span><span><span class="ln dash" style="border-color:var(--sal)"></span>Lo que calculo</span></div>` : ""}
  </div>`;
}

// Mes a mes: lo real, lo previsto y el dinero a fin de cada mes
function mesesPrevisionHTML(f){
  let rows = "";
  for (let i = 0; i < 12; i++) {
    const pv = f.pIng[i] + f.pGas[i] + (f.pCap ? f.pCap[i] : 0) > 0.005;
    const I = f.ing[i] + f.pIng[i], G = f.gas[i] + f.pGas[i];
    const s = f.saldoMes[i];
    rows += `<tr class="${pv && !f.ing[i] && !f.gas[i] ? "prev" : ""}"><td>${cap(MESL[i])}${pv ? (f.ing[i] || f.gas[i] ? " <span class='muted'>(real + lo que falta)</span>" : " <span class='muted'>(previsto)</span>") : ""}</td><td class="n">${eur(I)}</td><td class="n">${eur(G)}</td><td class="n">${eur(I - G)}</td>${f.hayCuentas ? `<td class="n">${eur(s.v)}</td>` : ""}</tr>`;
  }
  return `<div class="panel"><div class="panel-head"><div><h2>Mes a mes</h2><p>${f.phase === "pasado" ? "Lo que entró y salió cada mes." : "Lo que ya ha pasado, y lo que calculo para los meses que quedan (punteado)."}</p></div></div>
    <div class="chart" id="ch-pmes"></div>
    <div class="legend"><span><span class="sw" style="background:var(--ing)"></span>Ingresos</span><span><span class="sw" style="background:var(--gas)"></span>Gastos</span>${f.phase !== "pasado" ? `<span><span class="sw" style="background:transparent;border:1.5px dashed var(--prev)"></span>Previsto</span>` : ""}</div>
    <div class="tscroll" style="margin-top:12px"><table><thead><tr><th>Mes</th><th class="n">Entra</th><th class="n">Sale</th><th class="n">Queda</th>${f.hayCuentas ? `<th class="n">Dinero a fin de mes</th>` : ""}</tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th>${Y}</th><th class="n">${eur(f.I)}</th><th class="n">${eur(f.G)}</th><th class="n">${eur(f.I - f.G)}</th>${f.hayCuentas ? `<th class="n">${eur(f.saldoFin)}</th>` : ""}</tr></tfoot></table></div></div>`;
}

// Previsión de gastos o de ingresos, por grupos y categorías
function prevTipoHTML(tipo){
  const st = yearStats(Y), prev = yearStats(Y - 1), f = forecast(Y);
  const g = tipo === "gasto";
  const real = g ? st.G : st.I, falta = sum(g ? f.pGas : f.pIng), fin = real + falta, ant = g ? prev.G : prev.I;
  const pres = g ? anio(Y).presupuesto : {};
  const grupos = (cats()[tipo] || []).map(x => ({ id: x.id, nombre: x.nombre, cats: x.cats.map(([cid, n]) => [x.id + "." + cid, n]) }));
  grupos.push({ id: "_sin", nombre: "Sin categoría", cats: [["_sin", "Sin categoría"]] });
  const rows = grupos.map(gr => {
    const cs = gr.cats.map(([k, n]) => ({ n, real: st.byCat[tipo][k] || 0, falta: f.catPrev[tipo][k] || 0, ant: prev.byCat[tipo][k] || 0 })).filter(c => c.real + c.falta + c.ant > 0.005);
    const r = { ...gr, cs, real: sum(cs.map(c => c.real)), falta: sum(cs.map(c => c.falta)), ant: sum(cs.map(c => c.ant)), pres: num(pres[gr.id]) };
    r.fin = r.real + r.falta;
    return r;
  }).filter(r => r.fin + r.ant + r.pres > 0.005).sort((a, b) => b.fin - a.fin);
  const dif = ant > 0 ? (fin - ant) / ant * 100 : null;
  let h = `<div class="panel"><div class="panel-head"><div><h2>Previsión de ${g ? "gastos" : "ingresos"} de ${Y}</h2><p>${f.phase === "pasado" ? `En ${Y} ${g ? "salieron" : "entraron"} ${eur(real)}.` : `Llevas ${eur(real)}. Calculo que ${g ? "saldrán" : "entrarán"} ${eur(falta)} más hasta fin de año.`}${dif != null ? ` Frente a ${Y - 1} (${eur(ant)}), ${Math.abs(dif) < 0.5 ? "casi igual" : dif > 0 ? "un " + pct(dif) + " más" : "un " + pct(-dif) + " menos"}.` : ""}</p></div>${f.phase !== "pasado" ? `<button class="btn sm" data-psub="fijos">Cambiar lo fijo</button>` : ""}</div>
    <div class="tiles">
      <div class="tile"><span class="l">Llevas</span><span class="v">${eur(real)}</span></div>
      <div class="tile"><span class="l">Falta</span><span class="v">${eur(falta)}</span><span class="s">previsto</span></div>
      <div class="tile"><span class="l">A fin de año</span><span class="v">${eur(fin)}</span></div>
      <div class="tile"><span class="l">${Y - 1}</span><span class="v">${ant ? eur(ant) : "—"}</span></div>
    </div>
    <h3 class="eyebrow" style="margin-top:16px">Mes a mes</h3><div class="chart" id="ch-ptipo"></div>
    <div class="legend"><span><span class="sw" style="background:${g ? "var(--gas)" : "var(--ing)"}"></span>Real</span>${f.phase !== "pasado" ? `<span><span class="sw" style="background:transparent;border:1.5px dashed var(--prev)"></span>Previsto</span>` : ""}</div>
    <p class="why">${g ? `Para lo fijo (hipoteca, luz, seguros…) cuento lo que tienes apuntado en «Fijos». Para lo demás, lo que gastas de media estos últimos meses${f.phase === "futuro" ? `, subido un ${NF2.format(subida())} % al año` : ""}.` : `Sólo cuento lo que entra seguro: tus ingresos fijos${f.intereses > 0 ? " y los intereses de tus depósitos" : ""}. Lo que no es fijo (una venta, un regalo…) no lo doy por hecho.`}</p></div>`;
  h += `<div class="panel"><h2>Por ${g ? "gastos" : "ingresos"}: grupo a grupo</h2><div class="tscroll" style="margin-top:12px"><table><thead><tr><th>Qué</th><th class="n">Llevas</th><th class="n">Falta</th><th class="n">A fin de año</th><th class="n">${Y - 1}</th>${g ? `<th class="n">Presupuesto</th>` : ""}</tr></thead><tbody>`;
  if (!rows.length) h += `<tr><td colspan="6" class="muted">Todavía no hay nada que prever: apunta tus ${g ? "gastos fijos" : "ingresos fijos"} en «Fijos y presupuesto».</td></tr>`;
  for (const r of rows) {
    let pill = "";
    if (r.pres > 0) pill = r.fin > r.pres + 0.005 ? `<span class="pill over">Te pasas ${eur(r.fin - r.pres)}</span>` : r.fin > r.pres * 0.9 ? `<span class="pill warn">Justo</span>` : `<span class="pill ok">Bien</span>`;
    h += `<tr class="grp"><td>${esc(r.nombre)}</td><td class="n">${eur(r.real)}</td><td class="n">${r.falta > 0.005 ? eur(r.falta) : "—"}</td><td class="n">${eur(r.fin)}</td><td class="n">${r.ant ? eur(r.ant) : "—"}</td>${g ? `<td class="n">${r.pres ? eur(r.pres) + " " + pill : "—"}</td>` : ""}</tr>`;
    if (r.cs.length > 1 || (r.cs.length === 1 && r.cs[0].n !== r.nombre)) for (const c of r.cs.sort((a, b) => (b.real + b.falta) - (a.real + a.falta))) h += `<tr class="subrow"><td>${esc(c.n)}</td><td class="n">${eur(c.real)}</td><td class="n">${c.falta > 0.005 ? eur(c.falta) : "—"}</td><td class="n">${eur(c.real + c.falta)}</td><td class="n">${c.ant ? eur(c.ant) : "—"}</td>${g ? "<td></td>" : ""}</tr>`;
  }
  h += `</tbody><tfoot><tr><th>Total</th><th class="n">${eur(real)}</th><th class="n">${eur(falta)}</th><th class="n">${eur(fin)}</th><th class="n">${ant ? eur(ant) : "—"}</th>${g ? `<th class="n">${sum(Object.values(pres).map(num)) ? eur(sum(Object.values(pres).map(num))) : "—"}</th>` : ""}</tr></tfoot></table></div></div>`;
  return h;
}

// Lo que viene: los próximos seis meses, con lo fijo, las cuotas, los vencimientos y los objetivos
function loQueVieneHTML(){
  let h = `<div class="panel"><div class="panel-head"><div><h2>Lo que viene</h2><p>Los próximos seis meses: lo que entra y sale fijo, las cuotas, lo que vence y tus objetivos, y cuánto tendrás a final de cada mes.</p></div><button class="btn sm" data-psub="fijos">Cambiar lo fijo</button></div>`;
  let alguno = false;
  for (let k = 0; k < 6; k++) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() + k, 1), y = d.getFullYear(), mo = d.getMonth();
    if (y > MAX_Y) break;
    const f = forecast(y), key = y + "-" + pad(mo + 1);
    const items = [];
    const hecho = (r) => MOVS.some(m => m.fecha.startsWith(key) && m.tipo === (r.tipo === "ingreso" ? "ingreso" : "gasto") && ((r.cat && m.lineas.some(l => l.cat === r.cat)) || norm(m.comercio) === norm(r.nombre)) && Math.abs(num(m.total) - num(r.importe)) <= num(r.importe) * 0.15 + 1);
    for (const r of f.recs) if (recHits(r, mo)) items.push({ n: r.nombre, v: (r.tipo === "ingreso" ? 1 : -1) * num(r.importe), ok: k === 0 && hecho(r), t: r.tipo === "ingreso" ? "Entra" : "Sale" });
    for (const c of cuentas()) {
      if (c.tipo === "prestamo" && num(c.cuota) > 0 && c.ancla && debe(c, toISO(NOW)) > 0.005 && !(c.termina && d > parseISO(c.termina))) items.push({ n: "Cuota de " + c.nombre, v: -num(c.cuota), ok: k === 0 && cuotaPagada(c, y, mo), t: "Cuota" });
      if (c.tipo === "deposito" && c.vence && c.vence.startsWith(key)) items.push({ n: "Vence " + c.nombre, v: 0, info: `el ${shortDate(c.vence)}: ${eur(saldo(c, toISO(NOW)))} vuelven a estar libres`, t: "Vence" });
    }
    for (let yy = CUR_Y; yy <= y; yy++) for (const o of anio(yy).objetivos) if (!o.hecho && o.fecha && o.fecha.startsWith(key)) items.push({ n: "Objetivo: " + o.nombre, v: 0, info: `para el ${shortDate(o.fecha)}: ${eur(o.importe)} (te faltan ${eur(Math.max(0, num(o.importe) - goalSaved(o)))})`, t: "Objetivo" });
    const vari = f.varAvg || 0;
    const entra = f.pIng[mo] + (k === 0 ? f.ing[mo] : 0), sale = f.pGas[mo] + (f.pCap ? f.pCap[mo] : 0) + (k === 0 ? f.gas[mo] : 0);
    const s = f.saldoMes[mo];
    if (items.length || entra || sale) alguno = true;
    h += `<div class="day"><h3><span>${cap(MESL[mo])}${y !== CUR_Y ? " " + y : ""}${k === 0 ? " · este mes" : ""}</span><span class="num">${f.hayCuentas ? "a fin de mes: " + eur(s.v) : ""}</span></h3>`;
    for (const it of items.sort((a, b) => a.v - b.v)) h += `<div class="rec"><div><div class="n"${it.ok ? ' style="text-decoration:line-through;color:var(--muted)"' : ""}>${esc(it.n)}</div><div class="m">${esc(it.t)}${it.ok ? " · ya está apuntado" : ""}${it.info ? " · " + esc(it.info) : ""}</div></div><span class="a" style="color:${it.v > 0 ? "var(--ok)" : "inherit"}">${it.v ? (it.v > 0 ? "+" : "−") + eur(Math.abs(it.v)) : ""}</span><span></span></div>`;
    if (vari > 0) h += `<div class="rec"><div><div class="n">Gasto del día a día</div><div class="m">súper, gasolina, comer fuera… (la media de estos meses)</div></div><span class="a">−${eur(vari)}</span><span></span></div>`;
    h += `<p class="small" style="margin:6px 0 0;display:flex;gap:14px;flex-wrap:wrap"><span>Entra <b class="num" style="color:var(--ok)">${eur(entra)}</b></span><span>Sale <b class="num">${eur(sale)}</b></span><span>Queda <b class="num"${entra - sale < 0 ? ' style="color:var(--over)"' : ""}>${eur(entra - sale)}</b></span>${k === 0 ? `<span class="muted">(lo de este mes: lo apuntado más lo que calculo que falta)</span>` : ""}</p></div>`;
  }
  if (!alguno) h += `<p class="empty">Todavía no hay nada que prever. Apunta tus fijos (nómina, hipoteca, recibos…) y lo verás aquí mes a mes.</p>`;
  return h + `</div>`;
}
