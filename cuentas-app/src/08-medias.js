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

function renderMedias(){
  const el = $("#v-medias");
  if (!split) split = splitNew();
  let h = `<div class="subnav" role="tablist" aria-label="A medias"><button role="tab" aria-selected="true">Dividir la cuenta</button></div>`;
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

/* ---------- clics y escritura ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t || !t.closest("#v-medias")) return;
  const ds = t.dataset;
  if (t.id === "sp-img") return $("#sp-file").click();
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
document.addEventListener("keydown", e => { if (e.target.id === "sp-newp" && e.key === "Enter") { e.preventDefault(); const b = $("#sp-newp-go"); if (b) b.click(); } });
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
  const el = e.target; if (!el.closest || !el.closest("#v-medias") || !split) return;
  if (el.id === "sp-file") {
    const f = el.files && el.files[0]; el.value = ""; if (!f) return;
    splitImg = await shrink(f); if (splitImgUrl) URL.revokeObjectURL(splitImgUrl); splitImgUrl = URL.createObjectURL(splitImg);
    return renderView();
  }
  const k = { "sp-pagador": "pagador", "sp-cuenta": "cuenta", "sp-fecha": "fecha", "sp-cat": "cat" }[el.id];
  if (k) { split[k] = el.value; splitSave(); return renderView(); }
});
