/* ================= pantalla: a medias (dividir la cuenta) ================= */
// En el bar: foto del ticket + dictar qué ha tomado cada uno → cuánto paga cada uno. Al guardarlo,
// tu parte es un gasto y lo de los demás va a «Lo que te deben» (o lo que debes tú, si pagó otro).
// La cuenta a medio hacer se queda en el móvil (localStorage) por si se cierra la página.
const YO = "Yo";
let split = store.get("cj.split", null);
let splitImg = null, splitImgUrl = "", splitBusy = false, splitErr = "";
function splitNew(){ return { personas: [YO], lineas: [], total: "", propina: "", sitio: "", fecha: toISO(NOW), cat: "", pagador: YO, cuenta: defaultAccount(), dictado: "", hecho: false, dudas: "" }; }
function splitSave(){ store.set("cj.split", split); }
const splitPeopleKnown = () => {
  const s = new Set(store.get("cj.split.gente", []));
  for (const c of cuentas()) if (LENT(c.tipo)) s.add(c.nombre);
  return [...s].filter(n => n && norm(n) !== norm(YO)).slice(0, 20);
};
// Cuánto le toca a cada uno: cada línea se reparte a partes iguales entre los suyos (si no tiene a nadie,
// entre todos); lo que no cuadra con el total del ticket y la propina, en proporción a lo consumido.
function splitCalc(s){
  const P = s.personas, base = Object.fromEntries(P.map(p => [p, 0]));
  let items = 0, sinDueño = 0;
  for (const l of s.lineas) {
    const v = num(l.importe); if (!v) continue;
    items += v;
    const who = (l.personas || []).filter(p => P.includes(p));
    if (!who.length) sinDueño++;
    const list = who.length ? who : P;
    for (const p of list) base[p] += v / list.length;
  }
  const total = num(s.total) || items;
  const extra = (total - items) + num(s.propina);
  const B = sum(Object.values(base));
  const out = {};
  for (const p of P) out[p] = base[p] + (B > 0 ? extra * base[p] / B : extra / P.length);
  // a céntimos, y el céntimo que sobra o falta para quien ha pagado
  const final = total + num(s.propina);
  let acc = 0;
  for (const p of P) { out[p] = r2(out[p]); acc += out[p]; }
  const res = r2(final - acc);
  if (Math.abs(res) >= 0.005 && P.length) { const k = P.includes(s.pagador) ? s.pagador : P[0]; out[k] = r2(out[k] + res); }
  return { por: out, items: r2(items), total: r2(total), final: r2(final), cuadre: r2(total - items), sinDueño };
}
const quienTxt = p => p === YO ? "Juan" : p;

let mSub = store.get("cj.msub", "dividir");
function renderMedias(){
  const el = $("#v-medias");
  if (!split) split = splitNew();
  let h = `<div class="subnav" role="tablist" aria-label="A medias"><button role="tab" data-msub="dividir" aria-selected="${mSub !== "tricount"}">Dividir la cuenta</button><button role="tab" data-msub="tricount" aria-selected="${mSub === "tricount"}">Tricount</button></div>`;
  if (mSub === "tricount") { el.innerHTML = h + tricountHTML(); tcAuto(); return; }
  h += `<div class="panel"><div class="panel-head"><div><h2>Dividir la cuenta</h2><p>Hazle una foto al ticket y di qué ha tomado cada uno. Te digo cuánto paga cada uno y, si quieres, lo apunto en tus cuentas.</p></div>${split.lineas.length || split.dictado || splitImg ? `<button class="btn sm ghost" id="sp-reset">Empezar otra</button>` : ""}</div>`;
  if (!sample) h += `<div class="banner" style="margin-bottom:12px">${WEB ? "La IA no está disponible ahora mismo: puedes meter las líneas a mano." : "Aquí no está la IA: abre la web para leer el ticket. Puedes meter las líneas a mano."}</div>`;
  h += `<div class="split-in">
    <div class="f"><span class="lab">1 · El ticket <small>(opcional)</small></span>${splitImgUrl ? `<div class="row" style="align-items:center"><button type="button" class="thumb" data-zoom="${esc(splitImgUrl)}" aria-label="Ver el ticket en grande"><img src="${esc(splitImgUrl)}" alt="Ticket"></button><button class="btn sm ghost" id="sp-img-del">Quitar la foto</button></div>` : `<button type="button" class="btn" id="sp-img"${sample ? "" : " disabled"}>${ICON.camara.replace("<svg", '<svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-4px;margin-right:6px"')}Foto del ticket</button>`}<input type="file" id="sp-file" accept="image/*" capture="environment" hidden></div>
    <div class="f"><label for="sp-dict">2 · Quién ha tomado qué <small>(usa el micrófono del teclado)</small></label><textarea id="sp-dict" class="inp area" rows="3" placeholder="Yo dos cañas y las bravas. Ignacio un vino y la tortilla. Las croquetas, a medias entre todos.">${esc(split.dictado)}</textarea></div>
    <div class="row"><button class="btn primary" id="sp-go"${sample && !splitBusy ? "" : " disabled"}>${splitBusy ? `<span class="spin"></span> Haciendo las cuentas…` : split.lineas.length ? "Volver a hacer las cuentas" : "Hacer las cuentas"}</button>${!split.lineas.length ? `<button class="btn ghost" id="sp-manual">Meterlo a mano</button>` : ""}<span class="err">${esc(splitErr)}</span></div>
  </div></div>`;
  if (split.lineas.length) h += splitResultHTML();
  el.innerHTML = h;
}
function splitResultHTML(){
  const s = split, c = splitCalc(s), P = s.personas;
  if (!misCuentas().some(x => x.id === s.cuenta)) s.cuenta = misCuentas().some(x => x.id === defaultAccount()) ? defaultAccount() : (misCuentas()[0] || {}).id || "";
  let h = `<div class="panel"><div class="panel-head"><div><h2>${esc(s.sitio || "La cuenta")}</h2><p>Toca los nombres de cada línea para cambiar de quién es. Lo que es de varios se reparte a partes iguales.</p></div></div>`;
  if (s.dudas) h += `<div class="ia-note" style="margin-bottom:10px">${esc(s.dudas)}</div>`;
  h += `<div class="f"><span class="lab">En la mesa</span><div class="chips">${P.map(p => `<button type="button" data-sppdel="${esc(p)}" title="${p === YO ? "Tú" : "Quitar"}" aria-pressed="true">${esc(p)}${p === YO ? "" : " ×"}</button>`).join("")}${splitPeopleKnown().filter(n => !P.some(p => norm(p) === norm(n))).slice(0, 6).map(n => `<button type="button" data-sppadd="${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>
    <div class="row" style="margin-top:6px"><input class="inp" id="sp-newp" placeholder="Otra persona" style="max-width:200px"><button class="btn sm" id="sp-newp-go">Añadir</button></div></div>`;
  h += `<div class="split-lines">`;
  s.lineas.forEach((l, i) => {
    const who = (l.personas || []).filter(p => P.includes(p));
    h += `<div class="sl${who.length ? "" : " nobody"}"><div class="sl-top"><input data-sli="${i}" data-slk="concepto" value="${esc(l.concepto)}" aria-label="Qué" placeholder="Qué"><input class="n" data-sli="${i}" data-slk="importe" inputmode="decimal" value="${esc(l.importe === "" || l.importe == null ? "" : typeof l.importe === "number" ? NF2.format(l.importe) : l.importe)}" placeholder="0,00" aria-label="Importe"><button type="button" class="x" data-sldel="${i}" aria-label="Quitar línea">×</button></div>
      <div class="chips sm">${P.map(p => `<button type="button" data-slp="${i}|${esc(p)}" aria-pressed="${who.includes(p)}">${esc(p)}</button>`).join("")}${who.length ? "" : `<span class="small" style="color:var(--warn);align-self:center">De nadie: lo pagan todos</span>`}</div></div>`;
  });
  h += `</div><div class="row"><button class="btn sm" id="sp-addl">+ Otra línea</button></div>`;
  h += `<div class="fgrid" style="margin-top:12px"><div class="f"><label for="sp-total">Total del ticket (€)</label><input id="sp-total" inputmode="decimal" value="${esc(s.total === "" ? "" : String(s.total).replace(".", ","))}" placeholder="${esc(NF2.format(c.items))}"></div><div class="f"><label for="sp-propina">Propina o bote (€)</label><input id="sp-propina" inputmode="decimal" value="${esc(s.propina === "" ? "" : String(s.propina).replace(".", ","))}" placeholder="0,00"></div></div>`;
  h += `<div id="sp-res">${splitTotalsHTML(c)}</div>`;
  // quién paga y guardar
  const hay = c.final > 0;
  h += `<div class="fgrid" style="margin-top:14px"><div class="f"><label for="sp-pagador">¿Quién ha pagado?</label><select id="sp-pagador">${P.map(p => `<option value="${esc(p)}"${p === s.pagador ? " selected" : ""}>${p === YO ? "Yo" : esc(p)}</option>`).join("")}</select></div>
    ${s.pagador === YO ? `<div class="f"><label for="sp-cuenta">Con qué</label><select id="sp-cuenta">${misCuentas().map(x => `<option value="${x.id}"${x.id === s.cuenta ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select></div>` : ""}
    <div class="f"><label for="sp-fecha">Fecha</label><input id="sp-fecha" type="date" value="${esc(s.fecha || toISO(NOW))}"></div>
    <div class="f"><label for="sp-cat">Tu parte es</label><select id="sp-cat">${catOptions("gasto", s.cat || (CATIDX["fuera.bares"] ? "fuera.bares" : ""))}</select></div></div>`;
  h += `<p class="small" id="sp-qd" style="margin:8px 0 0">${splitQuienDebe(c)}</p>`;
  h += `<div class="ed-foot"><button class="btn primary" id="sp-save"${hay && !s.hecho ? "" : " disabled"}>${s.hecho ? "Ya está en tus cuentas" : "Apuntarlo en mis cuentas"}</button><button class="btn" id="sp-share"${hay ? "" : " disabled"}>Mandar el reparto</button><span class="err" id="sp-err"></span></div>
    <p class="small muted" style="margin:6px 0 0">Al apuntarlo: ${s.pagador === YO ? "sale el total de tu cuenta, tu parte es un gasto y lo de cada uno pasa a «Lo que te deben»." : `tu parte es un gasto que ha pagado ${esc(s.pagador)}, y pasa a «Lo que te deben» como que le debes eso.`}</p></div>`;
  return h;
}
function splitTotalsHTML(c){
  const P = split.personas;
  let h = `<div class="split-tot">${P.map(p => `<div class="tile"><span class="l">${p === YO ? "Tú" : esc(p)}</span><span class="v">${eur(c.por[p] || 0)}</span></div>`).join("")}</div>`;
  const notes = [];
  if (Math.abs(c.cuadre) >= 0.01 && num(split.total)) notes.push(`Las líneas suman ${eur(c.items)} y el ticket ${eur(c.total)}: ${c.cuadre > 0 ? "lo que falta" : "lo que sobra"} (${eur(Math.abs(c.cuadre))}) lo reparto según lo que ha tomado cada uno.`);
  if (num(split.propina)) notes.push(`La propina, también según lo que ha tomado cada uno.`);
  h += `<p class="small" style="margin:8px 0 0">Total: <b class="num">${eur(c.final)}</b>${notes.length ? ` · <span class="muted">${notes.join(" ")}</span>` : ""}</p>`;
  return h;
}
function splitQuienDebe(c){
  const s = split, pg = s.pagador;
  const deudas = s.personas.filter(p => p !== pg && (c.por[p] || 0) > 0.005);
  if (!deudas.length) return "Nadie le debe nada a nadie.";
  return deudas.map(p => `<b>${p === YO ? "Tú le debes" : esc(p) + (pg === YO ? " te debe" : " le debe")}</b> ${eur(c.por[p])}${pg === YO ? "" : " a " + esc(pg)}`).join(" · ");
}
function splitShareText(){
  const s = split, c = splitCalc(s);
  let t = `${s.sitio || "La cuenta"}${s.fecha ? " (" + shortDate(s.fecha) + ")" : ""}: ${eur(c.final)}\n`;
  for (const p of s.personas) t += `· ${quienTxt(p)}: ${eur(c.por[p] || 0)}\n`;
  t += `Pagó ${quienTxt(s.pagador)}.`;
  return t;
}
function repaintSplitTotals(){
  const box = $("#sp-res"); if (!box || !split) return;
  const c = splitCalc(split);
  box.innerHTML = splitTotalsHTML(c);
  const qd = $("#sp-qd"); if (qd) qd.innerHTML = splitQuienDebe(c);
  const sv = $("#sp-save"), sh = $("#sp-share");
  if (sv) sv.disabled = !(c.final > 0) || split.hecho;
  if (sh) sh.disabled = !(c.final > 0);
}

/* ---------- la IA ---------- */
function splitPrompt(dict){
  return `Estás en un bar o restaurante con Juan (España) y hay que dividir la cuenta. ${splitImg ? "Te paso la foto del ticket y" : "No hay foto del ticket:"} lo que dice Juan de qué ha tomado cada uno. Devuelve SOLO un objeto JSON, sin nada más:
{"sitio":texto o null,"fecha":"AAAA-MM-DD" o null,"total":número o null,"cat":id,"personas":[nombres],"lineas":[{"concepto":texto,"importe":número o null,"personas":[nombres]}],"dudas":texto o null}

Reglas:
- Juan es siempre "${YO}" (si dice «yo», «me», «mío»… es "${YO}"). A los demás, con el nombre que diga, con mayúscula.${split.personas.length > 1 ? `\n- En la mesa están: ${split.personas.join(", ")}.` : ""}
- "personas": todos los que están en la mesa, empezando por "${YO}".
- ${splitImg ? "Las líneas salen del ticket, con su importe con IVA tal y como se paga. Si una línea tiene varias unidades que han tomado personas distintas (3 cañas: 2 de Juan y 1 de Ignacio), pártela en varias líneas con su parte del importe. La suma de las líneas tiene que dar el total del ticket; si no cuadra, dilo en \"dudas\"." : "Saca las líneas de lo que dice, con los precios que diga. Si no dice el precio de algo, importe null."}
- «A medias», «entre todos», «para compartir», «al centro» → en "personas" pon todos los que lo comparten. Si de una línea no sabes de quién es, deja "personas" vacío y dilo en "dudas".
- No inventes nada. "total": el total del ticket (null si no hay ticket).
- "cat": la categoría del gasto, uno de estos ids exactamente:
${catListForIA("gasto")}
- Fechas de España. Hoy es ${toISO(NOW)}.

Lo que dice Juan:
${(dict || "(no ha dicho nada: pon todas las líneas sin personas)").slice(0, 4000)}`;
}
async function splitGo(){
  const dict = ($("#sp-dict") || {}).value || "";
  split.dictado = dict; splitSave();
  if (!dict.trim() && !splitImg) { splitErr = "Haz la foto del ticket o di qué ha tomado cada uno."; return renderView(); }
  splitBusy = true; splitErr = ""; renderView();
  try {
    const o = await sample.json(splitPrompt(dict), { images: splitImg ? [splitImg] : undefined, cache: false });
    if (!o || !Array.isArray(o.lineas)) throw { mine: "La IA no ha devuelto nada que se pueda usar." };
    const personas = [YO];
    for (const p of [].concat(o.personas || [], ...o.lineas.map(l => l.personas || []))) { const n = String(p || "").trim().slice(0, 30); if (n && !personas.some(x => norm(x) === norm(n))) personas.push(norm(n) === norm(YO) ? YO : n); }
    for (const p of split.personas) if (!personas.some(x => norm(x) === norm(p))) personas.push(p);
    const fix = n => personas.find(x => norm(x) === norm(n)) || null;
    split = { ...split, personas, sitio: String(o.sitio || split.sitio || ""), fecha: /^\d{4}-\d{2}-\d{2}$/.test(o.fecha || "") && o.fecha <= toISO(NOW) ? o.fecha : split.fecha, total: o.total == null ? "" : r2(Math.abs(num(o.total))), cat: CATIDX[o.cat] && CATIDX[o.cat].tipo === "gasto" ? o.cat : split.cat, dudas: String(o.dudas || ""),
      lineas: o.lineas.map(l => ({ concepto: String(l.concepto || "").slice(0, 80), importe: l.importe == null ? "" : r2(num(l.importe)), personas: [...new Set((l.personas || []).map(fix).filter(Boolean))] })) };
    splitSave();
  } catch (e) {
    splitErr = e && e.mine ? e.mine : e && e.code === "rate_limited" ? "Demasiadas seguidas: espera un minuto." : e && e.code === "invalid_json" ? "La IA no ha sabido leerlo bien. Prueba otra vez." : "No ha salido. Prueba otra vez.";
  }
  splitBusy = false; renderView();
}

/* ---------- apuntarlo en las cuentas ---------- */
async function splitApuntar(){
  const s = split, c = splitCalc(s), err = $("#sp-err");
  const fecha = s.fecha || toISO(NOW);
  if (fecha > toISO(NOW)) { err.textContent = "La fecha no puede ser de un día que no ha llegado."; return; }
  if (s.pagador === YO && !misCuentas().some(x => x.id === s.cuenta)) { err.textContent = "Di con qué cuenta has pagado."; return; }
  const sitio = s.sitio || "La cuenta", cat = s.cat || (CATIDX["fuera.bares"] ? "fuera.bares" : "");
  // la cuenta de cada persona: la que ya tenga en «Lo que te deben», o una nueva
  const list = (cfg.cuentas && cfg.cuentas.length ? cfg.cuentas : cuentas()).map(x => ({ ...x }));
  let nuevas = false;
  const accOf = p => {
    let a = list.find(x => LENT(x.tipo) && !x.borrada && norm(x.nombre) === norm(p));
    if (!a) { a = { id: "deudor-" + (norm(p).replace(/ /g, "-").slice(0, 20) || "x") + "-" + uid().slice(-4), nombre: p, tipo: "prestado", nota: "", vence: null, fecha, ancla: { fecha: "1900-01-01", saldo: 0, ts: 0 } }; list.push(a); nuevas = true; }
    return a.id;
  };
  const movs = [], mio = c.por[YO] || 0;
  if (s.pagador === YO) {
    if (mio > 0.005) movs.push(cleanMov({ fecha, tipo: "gasto", cuenta: s.cuenta, comercio: sitio, nota: "Tu parte de la cuenta", total: mio, lineas: [{ concepto: "Tu parte en " + sitio, cat, importe: mio }], origen: "dividir" }));
    for (const p of s.personas) if (p !== YO && (c.por[p] || 0) > 0.005) movs.push(cleanMov({ fecha, tipo: "traspaso", cuenta: s.cuenta, destino: accOf(p), comercio: p, nota: "Su parte en " + sitio, total: c.por[p], origen: "dividir" }));
  } else if (mio > 0.005) {
    movs.push(cleanMov({ fecha, tipo: "gasto", cuenta: accOf(s.pagador), comercio: sitio, nota: "Pagó " + s.pagador, total: mio, lineas: [{ concepto: "Tu parte en " + sitio, cat, importe: mio }], origen: "dividir" }));
  }
  if (!movs.length) { err.textContent = "No hay nada que apuntar en tus cuentas."; return; }
  const btn = $("#sp-save"); if (btn) btn.disabled = true;
  try {
    if (nuevas) await saveCfg("cuentas", { items: list });
    await saveMovs(movs);
    store.set("cj.split.gente", [...new Set(s.personas.filter(p => p !== YO).concat(store.get("cj.split.gente", [])))].slice(0, 20));
    split.hecho = true; splitSave();
    toast(s.pagador === YO ? "Apuntado: tu parte y lo que te deben" : "Apuntado: tu parte y lo que le debes"); renderView();
  } catch (e) { err.textContent = saveErr(e); if (btn) btn.disabled = false; }
}

/* ================= Tricount (sólo leer) ================= */
// Los enlaces se guardan en config/tricount ({items: [{key, titulo, yo}]}); lo leído, en el móvil
// (localStorage) para verlo al momento, y se refresca al entrar si tiene más de 5 minutos.
let tcApi = null, tcBusy = false, tcErr = "", tcOpen = null;
let TC = store.get("cj.tc", {});          // key -> {at, ok, titulo, moneda, miembros, saldos, gastos} o {at, ok:false, error}
const tcItems = () => cfg.tricount || [];
const tcKeyOf = link => { const s = String(link || "").trim(); const m = s.match(/([A-Za-z0-9]{6,64})\/?(?:[?#].*)?$/); return m ? m[1] : ""; };
const tcMoney = (v, cur) => cur && cur !== "EUR" ? NF2.format(r2(v)) + " " + cur : eur(v);
function tcYo(it, d){
  if (it.yo && d.miembros.some(m => m.uuid === it.yo)) return it.yo;
  const j = d.miembros.filter(m => /^(juan|yo\b)/.test(norm(m.nombre)));   // «Juan», «Juanito», «Juan T.», «Yo»
  return j.length === 1 ? j[0].uuid : null;
}
// Para quedar en paz: el que más debe paga al que más le deben, y así hasta acabar
function tcSaldar(saldos){
  const deb = [], acr = [];
  for (const [u, v] of Object.entries(saldos)) { const c = Math.round(v * 100); if (c < 0) deb.push([u, -c]); else if (c > 0) acr.push([u, c]); }
  deb.sort((a, b) => b[1] - a[1]); acr.sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0, j = 0;
  while (i < deb.length && j < acr.length) {
    const x = Math.min(deb[i][1], acr[j][1]);
    out.push({ de: deb[i][0], a: acr[j][0], v: x / 100 });
    deb[i][1] -= x; acr[j][1] -= x;
    if (!deb[i][1]) i++; if (!acr[j][1]) j++;
  }
  return out;
}
const hace = ts => { const m = Math.round((Date.now() - ts) / 6e4); return m < 1 ? "ahora mismo" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
function tcAuto(){
  if (!tcApi || tcBusy || !tcItems().length) return;
  const viejo = tcItems().some(it => !TC[it.key] || Date.now() - TC[it.key].at > 5 * 6e4);
  if (viejo) tcRefresh();
}
async function tcRefresh(extra){
  if (!tcApi || tcBusy) return;
  const links = tcItems().map(it => it.key).concat(extra ? [extra] : []);
  if (!links.length) return;
  tcBusy = true; tcErr = ""; if (tab === "medias") renderView();
  let got = [];
  try {
    got = await tcApi.leer(links);
    for (const d of got) TC[d.key] = { ...d, at: Date.now() };
    store.set("cj.tc", TC);
    tcSyncSaldos();
  } catch (e) {
    tcErr = e && e.code === "session_expired" ? "Tu sesión ha caducado: vuelve a entrar." : e && e.code === "rate_limited" ? "Tricount pide esperar un poco. Prueba en un rato." : "No he podido hablar con Tricount ahora mismo. Prueba en un rato.";
  }
  tcBusy = false;
  if (tab === "medias") renderView();
  return got;
}
async function tcAdd(){
  const inp = $("#tc-link"), link = (inp && inp.value || "").trim();
  const key = tcKeyOf(link);
  if (!key) { tcErr = "Eso no parece un enlace de Tricount. Cópialo desde la app: el tricount → Invitar → Copiar enlace."; return renderView(); }
  if (tcItems().some(it => it.key === key)) { tcErr = "Ese tricount ya está."; return renderView(); }
  const got = await tcRefresh(key) || [];
  const d = got.find(x => x.key === key);
  if (!d) return;
  if (!d.ok) { tcErr = d.error || "No he podido leer ese tricount."; delete TC[key]; store.set("cj.tc", TC); return renderView(); }
  try { await saveCfg("tricount", { items: tcItems().concat([{ key, titulo: d.titulo, yo: null }]) }); tcOpen = key; toast("Tricount añadido"); }
  catch (e) { tcErr = saveErr(e); }
  renderView();
}
function tricountHTML(){
  let h = `<div class="panel"><div class="panel-head"><div><h2>Tus tricounts</h2><p>Seguís apuntando en Tricount como siempre; aquí ves cómo vais. Sólo leo: no cambio nada en Tricount.</p></div>${tcItems().length && tcApi ? `<button class="btn sm" id="tc-refresh"${tcBusy ? " disabled" : ""}>${tcBusy ? `<span class="spin"></span> Leyendo…` : "Actualizar"}</button>` : ""}</div>`;
  if (!WEB) return h + `<div class="banner">Tricount sólo se puede leer desde la web.</div></div>`;
  h += `<div class="row" style="align-items:flex-end"><div class="f" style="flex:1;min-width:220px"><label for="tc-link">Enlace del tricount <small>(en Tricount: el tricount → Invitar → Copiar enlace)</small></label><input id="tc-link" inputmode="url" placeholder="https://tricount.com/t…" autocomplete="off"></div><button class="btn primary" id="tc-add"${tcApi && !tcBusy ? "" : " disabled"}>Añadir</button></div>`;
  if (tcErr) h += `<p class="err" style="margin:8px 0 0">${esc(tcErr)}</p>`;
  h += `<p class="small muted" style="margin:8px 0 0">Tricount no tiene una conexión oficial: uso la misma que su app. Si un día la cambian, esto dejará de actualizarse, pero tus datos en Tricount no se tocan.</p></div>`;
  if (!tcItems().length) return h;
  for (const it of tcItems()) h += tcCardHTML(it);
  return h;
}
function tcCardHTML(it){
  const d = TC[it.key];
  let h = `<div class="panel"><div class="panel-head"><div><h2>${esc((d && d.ok && d.titulo) || it.titulo || "Tricount")}</h2><p>${d ? (d.ok ? `${d.gastos.length} movimientos · ${d.miembros.filter(m => m.activo).length} personas · leído ${hace(d.at)}` : `<span style="color:var(--over)">${esc(d.error || "No se ha podido leer")}</span>`) : tcBusy ? "Leyendo…" : "Sin leer todavía"}</p></div><button class="btn sm ghost" data-tcdel="${esc(it.key)}">${it.confirmDel ? "Sí, quitarlo" : "Quitar"}</button></div>`;
  if (!d || !d.ok) return h + `</div>`;
  const cur = d.moneda, nom = u => (d.miembros.find(m => m.uuid === u) || {}).nombre || "¿?";
  const yo = tcYo(it, d);
  h += `<div class="f" style="max-width:280px"><label for="tc-yo-${esc(it.key)}">¿Quién eres tú en este tricount?</label><select id="tc-yo-${esc(it.key)}" data-tcyo="${esc(it.key)}"><option value="">— Elige —</option>${d.miembros.map(m => `<option value="${esc(m.uuid)}"${m.uuid === yo ? " selected" : ""}>${esc(m.nombre)}</option>`).join("")}</select></div>`;
  if (yo) {
    const v = d.saldos[yo] || 0;
    h += `<div class="bal num" style="font-family:var(--display);font-weight:800;font-size:26px;margin:10px 0 2px;${v < -0.005 ? "color:var(--over)" : ""}">${v > 0.005 ? "Te deben " + tcMoney(v, cur) : v < -0.005 ? "Debes " + tcMoney(-v, cur) : "Estás en paz"}</div>`;
  }
  // saldos de todos
  const mx = Math.max(0.01, ...Object.values(d.saldos).map(Math.abs));
  h += `<div class="tc-bal">${d.miembros.filter(m => m.activo || Math.abs(d.saldos[m.uuid] || 0) > 0.005).sort((a, b) => (d.saldos[b.uuid] || 0) - (d.saldos[a.uuid] || 0)).map(m => { const v = d.saldos[m.uuid] || 0; return `<div class="tc-row"><span class="nm">${esc(m.nombre)}${m.uuid === yo ? " <small class='muted'>(tú)</small>" : ""}</span><span class="am num" style="color:${v > 0.005 ? "var(--ok)" : v < -0.005 ? "var(--over)" : "var(--muted)"}">${v > 0.005 ? "+" : v < -0.005 ? "−" : ""}${tcMoney(Math.abs(v), cur)}</span><span class="bar"><i style="width:${(Math.abs(v) / mx * 100).toFixed(1)}%;background:${v >= 0 ? "var(--ok)" : "var(--over)"}"></i></span></div>`; }).join("")}</div>`;
  const pagos = tcSaldar(d.saldos);
  if (pagos.length) h += `<h3 class="eyebrow" style="margin:16px 0 6px">Para quedar en paz</h3>${pagos.map(p => `<div class="rec" style="grid-template-columns:minmax(0,1fr) auto"><div class="n"${p.de === yo || p.a === yo ? "" : ' style="font-weight:500;color:var(--ink-2)"'}>${p.de === yo ? "Tú le pagas a " + esc(nom(p.a)) : p.a === yo ? esc(nom(p.de)) + " te paga a ti" : esc(nom(p.de)) + " le paga a " + esc(nom(p.a))}</div><span class="a">${tcMoney(p.v, cur)}</span></div>`).join("")}`;
  // pasar tu parte de los gastos a tus cuentas
  if (yo && TCP && TCP.key === it.key) return h + tcPasarHTML(it, d) + `</div>`;
  if (yo) {
    const pend = tcPendientes(it, d, yo), fuera = new Set((it.fuera || []).map(String));
    const van = pend.filter(g => !fuera.has(String(g.id)));
    const tot = r2(van.reduce((a, g) => a + (g.reparto[yo] || 0), 0));
    h += `<div class="tc-pasar"><div><b>${van.length ? `${van.length} gastos tuyos por pasar a tus cuentas` : "Tus gastos ya están en tus cuentas"}</b><span class="small muted">${van.length ? `Tu parte suma ${tcMoney(tot, cur)}.` : "Cuando apuntéis algo nuevo en Tricount, aparecerá aquí."}${pend.length > van.length ? ` ${pend.length - van.length} se quedan fuera (no son gastos tuyos o ya los tenías).` : ""}</span></div>${van.length || pend.length ? `<button class="btn sm${van.length ? " primary" : ""}" data-tcpasar="${esc(it.key)}"${sample && db ? "" : " disabled"}>${van.length ? "Pasar a mis cuentas" : "Revisar"}</button>` : ""}</div>`;
  }
  // movimientos
  const open = tcOpen === it.key;
  const lista = open ? d.gastos : d.gastos.slice(0, 8);
  h += `<h3 class="eyebrow" style="margin:16px 0 6px">${open ? "Todos los movimientos" : "Últimos movimientos"}</h3>`;
  let mesAnt = "";
  for (const g of lista) {
    // abierto: una franja por mes, con lo que te tocó pagar a ti ese mes
    if (open && g.fecha && g.fecha.slice(0, 7) !== mesAnt) {
      mesAnt = g.fecha.slice(0, 7);
      const d0 = parseISO(g.fecha);
      const tuyo = yo ? r2(d.gastos.filter(x => x.tipo === "gasto" && x.fecha && x.fecha.slice(0, 7) === mesAnt).reduce((a, x) => a + (x.reparto[yo] || 0), 0)) : 0;
      h += `<div class="mes-band" style="margin-left:0;margin-right:0"><b>${cap(MESL[d0.getMonth()])}${d0.getFullYear() !== CUR_Y ? " " + d0.getFullYear() : ""}</b><span class="num">${tuyo ? "tu parte " + tcMoney(tuyo, cur) : ""}</span></div>`;
    }
    const parte = yo ? g.reparto[yo] || 0 : 0;
    const pagoYo = g.pago === yo;
    const qui = g.tipo === "reembolso" ? `${esc(nom(g.pago))} → ${esc(Object.keys(g.reparto).filter(u => g.reparto[u] > 0).map(nom).join(", "))}` : `pagó ${pagoYo ? "tú" : esc(nom(g.pago))}`;
    h += `<div class="rec" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="n">${esc(g.concepto || (g.tipo === "reembolso" ? "Reembolso" : "Gasto"))}</div><div class="m">${g.fecha ? shortDate(g.fecha) + (parseISO(g.fecha).getFullYear() !== CUR_Y ? " " + parseISO(g.fecha).getFullYear() : "") + " · " : ""}${g.tipo === "reembolso" ? "reembolso: " : g.tipo === "ingreso" ? "ingreso · " : ""}${qui}${yo && g.tipo === "gasto" && parte ? ` · tu parte ${tcMoney(parte, cur)}` : ""}${g.local ? ` · ${NF2.format(g.local.importe)} ${esc(g.local.moneda)}` : ""}</div></div><span class="a">${tcMoney(g.total, cur)}</span></div>`;
  }
  if (d.gastos.length > lista.length || open) h += `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-tcmore="${esc(it.key)}">${open ? "Ver menos" : `Ver los ${d.gastos.length}`}</button></div>`;
  return h + `</div>`;
}

/* ---------- pasar los gastos de un tricount a las cuentas ---------- */
// De cada gasto entra SOLO tu parte, como gasto tuyo, contra una cuenta «Tricount: …» (de las de personas), cuyo
// saldo es lo que dice Tricount que te deben o debes. Lo que pagaste por los demás no es gasto tuyo: está en ese saldo.
// Cada gasto entra una vez (su id es «tc-» + el de Tricount) y lo que no debe entrar se recuerda en config/tricount
// (fuera); lo ya pasado, en «pasados», para que no vuelva aunque borres el movimiento.
let TCP = null;   // {key, rows: [{id, fecha, concepto, parte, total, pago, cat, sel, aviso, low}], busy, msg, err}
const tcAccId = key => "tricount-" + key;
function tcPendientes(it, d, yo){
  const hechos = new Set((it.pasados || []).map(String));
  for (const m of MOVS) if (String(m.id).startsWith("tc-")) hechos.add(String(m.id).slice(3));
  return d.gastos.filter(g => g.tipo === "gasto" && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha || "") && (g.reparto[yo] || 0) > 0.005 && !hechos.has(String(g.id)));
}
function tcPasarPrompt(it, d, rows){
  const nom = u => (d.miembros.find(m => m.uuid === u) || {}).nombre || "¿?";
  return `Eres el contable personal de Juan (España). Estos gastos son de un tricount que comparte con otras personas («${d.titulo}»: ${d.miembros.map(m => m.nombre).join(", ")}). De cada uno, a Juan le toca la «parte». Dime en qué categoría va la parte de Juan. Devuelve SOLO JSON:
{"g":[{"id":id tal cual,"cat":id de categoría o null,"no_gasto":true|false,"confianza":0-1}]}
Reglas:
- "no_gasto": true si NO es un gasto de verdad sino dinero que se mueve entre ellos: un préstamo, una deuda, un adelanto, un aporte, un ajuste o cuadre de cuentas, una devolución. Si no, false.
- Desayunos, cafés, cervezas, copas y churros = bares; comidas y cenas = restaurantes; compras del súper = supermercado; gasolina, peajes, viajes, caza, bodas… en lo suyo.
- "cat", uno de estos ids exactamente:
${catListForIA("gasto")}
- Así ha clasificado Juan otras veces (manda sobre tu criterio):
${learnedForIA()}
- Evita compras.otras: si no lo tienes claro, pon la que creas más probable con "confianza" baja.

Gastos (id | fecha | concepto | total | parte de Juan | pagó):
${rows.map(r => `${r.id} | ${r.fecha} | ${r.concepto} | ${r.total} | ${r.parte} | ${nom(r.pago)}`).join("\n")}`;
}
async function tcPasarStart(key){
  const it = tcItems().find(x => x.key === key), d = TC[key];
  if (!it || !d || !d.ok) return;
  const yo = tcYo(it, d); if (!yo) return;
  const fuera = new Set((it.fuera || []).map(String));
  const rows = tcPendientes(it, d, yo).map(g => ({ id: String(g.id), fecha: g.fecha, concepto: String(g.concepto || "Gasto").slice(0, 120), parte: r2(g.reparto[yo]), total: g.total, pago: g.pago, cat: "", sel: !fuera.has(String(g.id)), aviso: fuera.has(String(g.id)) ? "Fuera: no es un gasto tuyo." : "", low: false }));
  // ¿ya lo tenías apuntado (un ticket, el banco o a mano)? Mismo importe (el total o tu parte) y fecha cercana
  const dd = (a, b) => Math.abs((parseISO(a) - parseISO(b)) / 864e5), used = new Set();
  for (const r of rows) {
    if (!r.sel) continue;
    const m = MOVS.find(m => m.tipo === "gasto" && m.origen !== "tricount" && !used.has(m.id) && dd(m.fecha, r.fecha) <= 2 && (Math.abs(num(m.total) - r.total) < 0.01 || Math.abs(num(m.total) - r.parte) < 0.01));
    if (m) { used.add(m.id); r.sel = false; r.aviso = `¿Ya lo tenías? ${movTitle(m)} del ${shortDate(m.fecha)}, ${eur(m.total)}. Lo dejo sin marcar.`; }
  }
  TCP = { key, rows, busy: true, msg: "", err: "" };
  renderView();
  const N = 80, trozos = Math.ceil(rows.length / N);
  for (let i = 0; i < trozos; i++) {
    TCP.msg = trozos > 1 ? `La IA está poniendo las categorías: ${i + 1} de ${trozos}…` : "La IA está poniendo las categorías…"; renderView();
    const parte = rows.slice(i * N, (i + 1) * N);
    try {
      const o = await sample.json(tcPasarPrompt(it, d, parte), { cache: false });
      for (const x of (o && o.g) || []) {
        const r = parte.find(r => r.id === String(x && x.id)); if (!r) continue;
        if (x.cat && CATIDX[x.cat] && CATIDX[x.cat].tipo === "gasto") r.cat = x.cat;
        r.low = !r.cat || num(x.confianza) < 0.6;
        if (x.no_gasto && r.sel) { r.sel = false; r.aviso = "Parece un préstamo o un ajuste entre vosotros, no un gasto: lo dejo sin marcar."; }
      }
    } catch (e) {
      TCP.err = e && e.code === "rate_limited" ? "La IA está saturada: algunos gastos se han quedado sin categoría. Pónsela tú o vuelve a probar en un minuto." : "La IA no ha podido con algunos gastos: se han quedado sin categoría. Pónsela tú.";
    }
    if (!TCP || TCP.key !== key) return;   // cancelado
  }
  TCP.busy = false; renderView();
}
function tcPasarHTML(it, d){
  const P = TCP, cur = d.moneda, nom = u => (d.miembros.find(m => m.uuid === u) || {}).nombre || "¿?";
  let h = `<h3 class="eyebrow" style="margin:18px 0 6px">Pasar a mis cuentas</h3>`;
  if (P.busy) return h + `<div class="thinking"><span class="spin"></span>${esc(P.msg || "Preparando…")}</div><div class="row" style="margin-top:10px"><button class="btn sm ghost" data-tcpcancel="1">Cancelar</button></div>`;
  const sel = P.rows.filter(r => r.sel), tot = r2(sel.reduce((a, r) => a + r.parte, 0)), sinCat = sel.filter(r => !r.cat).length;
  h += `<p class="small" style="margin:0 0 8px">De cada gasto entra <b>sólo tu parte</b>, en su categoría, como pagado desde la cuenta «Tricount: ${esc(d.titulo)}» (está en Dinero → Lo que te deben, con lo que dice Tricount). Lo que no marques se queda fuera, y lo recuerdo para la próxima vez. Marcados: <b>${sel.length}</b> · suman <b class="num">${tcMoney(tot, cur)}</b>.</p>`;
  if (P.err) h += `<p class="err">${esc(P.err)}</p>`;
  h += `<div class="ext">`;
  let mes = "";
  for (const r of P.rows) {
    if (r.fecha.slice(0, 7) !== mes) { mes = r.fecha.slice(0, 7); const d0 = parseISO(r.fecha); h += `<div class="mes-band" style="margin:14px 0 4px"><b>${cap(MESL[d0.getMonth()])} ${d0.getFullYear()}</b></div>`; }
    h += `<div class="ext-row${r.sel ? "" : " off"}"><input type="checkbox" data-tcpsel="${esc(r.id)}"${r.sel ? " checked" : ""} aria-label="Pasar este"><span class="small">${shortDate(r.fecha)}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(r.concepto)}${r.low && r.sel ? ` <span class="flag" title="La IA no lo tiene claro: revisa la categoría">●</span>` : ""}<br><span class="small muted">pagó ${r.pago === tcYo(it, d) ? "tú" : esc(nom(r.pago))}${Math.abs(r.total - r.parte) >= 0.01 ? ` · total ${tcMoney(r.total, cur)}` : ""}</span></span><span class="c"><select data-tcpcat="${esc(r.id)}" aria-label="Categoría">${catOptions("gasto", r.cat)}</select></span><span class="a">−${tcMoney(r.parte, cur)}</span>${r.aviso ? `<span class="dup">${esc(r.aviso)}</span>` : ""}</div>`;
  }
  h += `</div>`;
  h += `<div class="row" style="margin-top:14px"><button class="btn primary" data-tcpsave="1"${sel.length || P.rows.length ? "" : " disabled"}>${sel.length ? `Pasar ${sel.length} gastos` : "Guardar lo que queda fuera"}</button><button class="btn ghost" data-tcpcancel="1">Cancelar</button><span class="err" id="tcp-err">${sinCat ? `${sinCat} marcados no tienen categoría: entrarán como «Sin categoría».` : ""}</span></div>`;
  return h;
}
// La cuenta «Tricount: …» con el saldo que dice Tricount hoy (sólo si cambia)
function tcCuentaAlDia(list, it, d, yo){
  const id = tcAccId(it.key), v = r2(d.saldos[yo] || 0), hoy = toISO(NOW);
  let a = list.find(x => x.id === id);
  if (!a) { a = { id, nombre: "Tricount: " + d.titulo, tipo: "prestado", nota: "Lo que dice Tricount que te deben (o debes) en «" + d.titulo + "»", vence: null, fecha: hoy, ancla: null }; list.push(a); }
  else if (a.borrada) a.borrada = false;
  else if (a.ancla && Math.abs(saldo(a, hoy) - v) < 0.005) return false;
  // el ancla va al final del día de hoy: todo lo apuntado con fecha de hoy o antes ya está en ese saldo
  a.ancla = { fecha: hoy, saldo: v, ts: Date.now() + 1e12 };
  return true;
}
async function tcPasarSave(){
  const P = TCP; if (!P || P.busy) return;
  const it = tcItems().find(x => x.key === P.key), d = TC[P.key];
  if (!it || !d || !d.ok) return;
  const yo = tcYo(it, d), err = $("#tcp-err"), btn = $("[data-tcpsave]");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  const nom = u => (d.miembros.find(m => m.uuid === u) || {}).nombre || "¿?";
  const acc = tcAccId(it.key), sel = P.rows.filter(r => r.sel);
  const movs = sel.map(r => cleanMov({ id: "tc-" + r.id, fecha: r.fecha, tipo: "gasto", cuenta: acc, comercio: r.concepto.slice(0, 80),
    nota: `Tricount «${d.titulo}» · pagó ${r.pago === yo ? "tú" : nom(r.pago)}${Math.abs(r.total - r.parte) >= 0.01 ? ` · tu parte de ${eur(r.total)}` : ""}`,
    total: r.parte, lineas: [{ concepto: r.concepto, cat: r.cat, importe: r.parte }], origen: "tricount", revisar: !r.cat }));
  try {
    const list = (cfg.cuentas && cfg.cuentas.length ? cfg.cuentas : cuentas()).map(x => ({ ...x }));
    if (tcCuentaAlDia(list, it, d, yo)) await saveCfg("cuentas", { items: list });
    if (movs.length) await saveMovs(movs);
    const fuera = new Set((it.fuera || []).map(String)), pasados = new Set((it.pasados || []).map(String));
    for (const r of P.rows) { if (r.sel) { fuera.delete(r.id); pasados.add(r.id); } else fuera.add(r.id); }
    const items = tcItems().map(({ confirmDel, ...x }) => x.key === it.key ? { ...x, yo, fuera: [...fuera], pasados: [...pasados] } : x);
    await saveCfg("tricount", { items }); cfg.tricount = items;
    TCP = null; toast(movs.length ? `Pasados ${movs.length} gastos a tus cuentas` : "Guardado"); renderView();
  } catch (e) { if (err) err.textContent = saveErr(e); if (btn) { btn.disabled = false; btn.textContent = `Pasar ${sel.length} gastos`; } }
}
// Al leer Tricount, la cuenta «Tricount: …» (si ya la hay) se pone con el saldo de Tricount
async function tcSyncSaldos(){
  if (!db || !cfg.cuentas) return;
  const list = cfg.cuentas.map(x => ({ ...x }));
  let cambia = false;
  for (const it of tcItems()) {
    const d = TC[it.key], a = list.find(x => x.id === tcAccId(it.key));
    if (!a || a.borrada || !d || !d.ok) continue;
    const yo = tcYo(it, d); if (yo && tcCuentaAlDia(list, it, d, yo)) cambia = true;
  }
  if (cambia) try { await saveCfg("cuentas", { items: list }); } catch { /* ya se pondrá al día la próxima vez */ }
}

/* ---------- clics y escritura ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t || !t.closest("#v-medias")) return;
  const ds = t.dataset;
  if (ds.msub) { mSub = ds.msub; store.set("cj.msub", mSub); tcErr = ""; return renderView(); }
  if (t.id === "tc-add") return tcAdd();
  if (t.id === "tc-refresh") return tcRefresh();
  if (ds.tcpasar) { tcOpen = null; return tcPasarStart(ds.tcpasar); }
  if (ds.tcpcancel) { TCP = null; return renderView(); }
  if (ds.tcpsave) return tcPasarSave();
  if (ds.tcmore) { tcOpen = tcOpen === ds.tcmore ? null : ds.tcmore; return renderView(); }
  if (ds.tcdel) {
    const it = tcItems().find(x => x.key === ds.tcdel); if (!it) return;
    if (!it.confirmDel) { it.confirmDel = true; renderView(); setTimeout(() => { it.confirmDel = false; }, 4000); return; }
    try { await saveCfg("tricount", { items: tcItems().filter(x => x.key !== ds.tcdel).map(({ confirmDel, ...x }) => x) }); delete TC[ds.tcdel]; store.set("cj.tc", TC); toast("Quitado"); } catch (err) { toast(saveErr(err)); }
    return;
  }
  if (t.id === "sp-img") {
    if (camPuede()) { abrirCamara(async f => { splitImg = await shrink(f); if (splitImgUrl) URL.revokeObjectURL(splitImgUrl); splitImgUrl = URL.createObjectURL(splitImg); renderView(); }); return; }
    return $("#sp-file").click();
  }
  if (t.id === "sp-img-del") { splitImg = null; if (splitImgUrl) URL.revokeObjectURL(splitImgUrl); splitImgUrl = ""; return renderView(); }
  if (t.id === "sp-go") return splitGo();
  if (t.id === "sp-manual") { split.dictado = ($("#sp-dict") || {}).value || ""; split.lineas = [{ concepto: "", importe: "", personas: [] }]; splitSave(); return renderView(); }
  if (t.id === "sp-reset") { split = splitNew(); splitImg = null; if (splitImgUrl) URL.revokeObjectURL(splitImgUrl); splitImgUrl = ""; splitErr = ""; splitSave(); return renderView(); }
  if (t.id === "sp-addl") { split.lineas.push({ concepto: "", importe: "", personas: [] }); splitSave(); renderView(); const ins = $$("#v-medias [data-slk=concepto]"); if (ins.length) ins[ins.length - 1].focus(); return; }
  if (ds.sldel != null) { split.lineas.splice(+ds.sldel, 1); splitSave(); return renderView(); }
  if (ds.slp) { const [i, p] = ds.slp.split("|"); const l = split.lineas[+i]; if (!l) return; const w = new Set(l.personas || []); w.has(p) ? w.delete(p) : w.add(p); l.personas = split.personas.filter(x => w.has(x)); splitSave(); return renderView(); }
  if (ds.sppdel != null) { const p = ds.sppdel; if (p === YO) return; split.personas = split.personas.filter(x => x !== p); for (const l of split.lineas) l.personas = (l.personas || []).filter(x => x !== p); if (split.pagador === p) split.pagador = YO; splitSave(); return renderView(); }
  if (ds.sppadd || t.id === "sp-newp-go") {
    const n = (ds.sppadd || ($("#sp-newp") || {}).value || "").trim().slice(0, 30);
    if (n && !split.personas.some(x => norm(x) === norm(n))) { split.personas.push(norm(n) === norm(YO) ? YO : cap(n)); splitSave(); }
    return renderView();
  }
  if (t.id === "sp-save") return splitApuntar();
  if (t.id === "sp-share") {
    const txt = splitShareText();
    try { if (navigator.share) { await navigator.share({ text: txt }); return; } } catch (err) { if (err && err.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(txt); toast("Copiado: pégalo en WhatsApp"); } catch { toast("No he podido copiarlo"); }
  }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "sp-newp" && e.key === "Enter") { e.preventDefault(); const b = $("#sp-newp-go"); if (b) b.click(); }
  if (e.target.id === "tc-link" && e.key === "Enter") { e.preventDefault(); tcAdd(); }
});
document.addEventListener("input", e => {
  const el = e.target; if (!el.closest || !el.closest("#v-medias") || !split) return;
  if (el.id === "sp-dict") { split.dictado = el.value; splitSave(); return; }
  if (el.dataset.sli != null) { const l = split.lineas[+el.dataset.sli]; if (l) l[el.dataset.slk] = el.value; }
  else if (el.id === "sp-total") split.total = el.value;
  else if (el.id === "sp-propina") split.propina = el.value;
  else return;
  splitSave(); repaintSplitTotals();
});
document.addEventListener("change", async e => {
  const el = e.target; if (!el.closest || !el.closest("#v-medias")) return;
  if (TCP && (el.dataset.tcpsel || el.dataset.tcpcat)) {
    const r = TCP.rows.find(r => r.id === (el.dataset.tcpsel || el.dataset.tcpcat)); if (!r) return;
    if (el.dataset.tcpsel) r.sel = el.checked; else { r.cat = el.value; r.low = false; }
    const y = window.scrollY; renderView(); window.scrollTo(0, y); return;
  }
  if (!split) return;
  if (el.id === "sp-file") {
    const f = el.files && el.files[0]; el.value = ""; if (!f) return;
    splitImg = await shrink(f); if (splitImgUrl) URL.revokeObjectURL(splitImgUrl); splitImgUrl = URL.createObjectURL(splitImg);
    return renderView();
  }
  if (el.dataset.tcyo) {
    const list = tcItems().map(({ confirmDel, ...x }) => x.key === el.dataset.tcyo ? { ...x, yo: el.value || null } : x);
    try { await saveCfg("tricount", { items: list }); cfg.tricount = list; renderView(); } catch (err) { toast(saveErr(err)); }
    return;
  }
  const k = { "sp-pagador": "pagador", "sp-cuenta": "cuenta", "sp-fecha": "fecha", "sp-cat": "cat" }[el.id];
  if (k) { split[k] = el.value; splitSave(); return renderView(); }
});
