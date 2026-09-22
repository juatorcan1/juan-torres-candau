/* ---------- Apuntar: dictado a Claude o formulario ---------- */
let apMode = store.get("gym.apmode", "voz"); if (apMode !== "voz" && apMode !== "form") apMode = "voz";
const guideOpen = new Set();
let vBusy = false, vCtl = null, vResult = null, vErr = "", vDone = null, vStream = "";

const MIC = `<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="var(--surface-2)" stroke="var(--line)"/><rect x="13" y="7" width="8" height="13" rx="4" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M10 16a7 7 0 0 0 14 0M17 23v4M13 27h8" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/></svg>`;
const VOICE_EXAMPLES = [
  "Hoy gimnasio 70 minutos. Sentadilla: calentamiento 10 con 60, luego 4 series de 6 con 100 kilos. Prensa 3 de 12 con 180. Curl femoral 3 de 12 con 40, la última al fallo. Me he pesado: 83,4.",
  "El finde: el viernes 3 cañas, el sábado 2 tercios y vino en la comida, y por la noche 2 cubatas. El domingo nada.",
  "Ayer 45 minutos de cinta, 7 kilómetros con inclinación 2, pulsaciones medias 150. Ignacio hizo 1.500 metros de natación en 40 minutos, crol."
];

function renderApuntar(){
  const v = $("#view-apuntar");
  if (!me) {
    v.innerHTML = `<div class="panel who">
      <div class="eyebrow">Antes de empezar</div>
      <h2>¿Quién eres?</h2>
      <p class="muted" style="margin:0">Se recuerda en este dispositivo. Puedes cambiarlo arriba cuando quieras.</p>
      <div class="opts"><button type="button" class="juan" data-me="juan">Juan</button><button type="button" class="ignacio" data-me="ignacio">Ignacio</button></div>
    </div>`;
    return;
  }
  v.innerHTML = `<div style="display:grid;gap:14px">
    <div class="modes" role="group" aria-label="Cómo apuntar">
      <button type="button" data-apmode="voz" aria-pressed="${apMode === "voz"}">Hablando con Claude</button>
      <button type="button" data-apmode="form" aria-pressed="${apMode === "form"}">Formulario</button>
    </div>
    <div id="ap-body"></div>
  </div>`;
  if (apMode === "form") renderRegistrar(); else renderVoz();
}

function renderVoz(){
  const el = $("#ap-body"); if (!el) return;
  const canAsk = !!sample, canSave = dbState === "ready";
  el.innerHTML = `<div class="panel voice">
    <div class="panel-head" style="margin-bottom:0">
      <div><h2>Cuéntaselo a Claude</h2><div class="muted" style="font-size:13.5px;margin-top:2px">Sesiones, series, kilos, minutos, tu peso y las copas del finde: todo de una vez y sin formato.</div></div>
    </div>
    <div class="mic-help">${MIC}<div>${SR ? `<b>Pulsa el micrófono azul y habla.</b> Lo que digas se escribe solo; vuelve a pulsarlo para parar. También vale el micrófono del teclado.` : `<b>Pulsa el micrófono del teclado del móvil y habla.</b> En iPhone está abajo a la derecha del teclado; en Android, en la barra superior del teclado o manteniendo pulsada la barra espaciadora. Lo que digas se escribe solo aquí.`}</div></div>
    <label for="voz" class="eyebrow">Lo que has hecho</label>
    <div class="voz-box"><textarea id="voz" data-keep placeholder="Ej.: hoy press banca 4 series de 8 con 80 kilos, remo con barra 3 de 10 con 60… El sábado 4 cañas y 2 copas.">${esc(keep("voz"))}</textarea>${micButton("voz")}</div>
    <div class="examples" aria-label="Ejemplos">${VOICE_EXAMPLES.map((t, i) => `<button type="button" data-act="voz-ex" data-i="${i}">«${esc(t.slice(0, 58))}…»</button>`).join("")}</div>
    <div class="row-btns">
      ${vBusy
        ? `<button type="button" class="btn" data-act="voz-stop">Parar</button>`
        : `<button type="button" class="btn primary" data-act="voz-go" ${canAsk ? "" : "disabled"}>Apuntar con Claude</button>
           <button type="button" class="btn ghost" data-act="voz-clear">Borrar texto</button>`}
    </div>
    ${!canAsk ? `<div class="banner">${sampleState === "loading" ? "Conectando con Claude…" : (WEB ? "Claude no está disponible ahora mismo. Usa el formulario." : "Esta vista no puede usar Claude. Ábrela desde su enlace de Claude o usa el formulario.")}</div>` : ""}
    ${vBusy ? `<div class="thinking"><span class="spin"></span>${vStream ? "Claude está ordenando lo que has contado…" : "Pensando…"}</div>` : ""}
    ${vErr ? `<div class="err" role="alert">${esc(vErr)}</div>` : ""}
    ${vResult ? previewHTML(vResult, canSave) : ""}
    ${vDone ? `<div class="comment"><span class="by">Apuntado · Claude dice</span>${esc(vDone)}</div>` : ""}
  </div>`;
}

function setsLine(sets){
  const work = sets.filter(s => !s.warmup), groups = [];
  for (const s of work) { const g = groups[groups.length - 1]; if (g && g.reps === s.reps && g.kg === s.kg) g.n++; else groups.push({ n: 1, reps: s.reps, kg: s.kg }); }
  const w = sets.filter(s => s.warmup).length;
  return groups.map(g => `${g.n}×${fmt(g.reps)}${g.kg ? ` a ${fmt(g.kg, 2)} kg` : ""}`).join(", ") + (w ? ` (+${w} de calentamiento)` : "");
}
function previewHTML(r, canSave){
  const items = [];
  r.sesiones.forEach((s, i) => items.push(`<div class="pv-item"><span class="dot ${s.athlete}"></span><div>
    <div class="t">${ATH[s.athlete]} · ${esc(SPORTS[s.sport])} · ${relDay(s.date)} · ${fmt(s.minutes)} min</div>
    <div class="d">${esc(sessionSummary(s))}${s.exercises ? "<br>" + s.exercises.map(e => `<b>${esc(e.name)}</b>: ${esc(setsLine(e.sets))}`).join("<br>") : ""}${s.notes ? `<br><i>${esc(s.notes)}</i>` : ""}</div>
  </div><button type="button" class="x" data-act="voz-rm" data-kind="sesiones" data-i="${i}" aria-label="Quitar">×</button></div>`));
  r.pesajes.forEach((w, i) => items.push(`<div class="pv-item"><span class="dot ${w.athlete}"></span><div>
    <div class="t">${ATH[w.athlete]} · peso ${relDay(w.date)}</div><div class="d">${fmt(w.kg, 1)} kg${w.waist ? ` · cintura ${fmt(w.waist)} cm` : ""}${w.fat ? ` · ${fmt(w.fat, 1)} % grasa` : ""}</div>
  </div><button type="button" class="x" data-act="voz-rm" data-kind="pesajes" data-i="${i}" aria-label="Quitar">×</button></div>`));
  r.bebidas.forEach((b, i) => items.push(`<div class="pv-item"><span class="dot ${b.athlete}"></span><div>
    <div class="t">${ATH[b.athlete]} · copas ${relDay(b.date)}</div><div class="d">${b.qty} × ${esc(DRINKS[b.type].l)} · ${fmt(DRINKS[b.type].ube * b.qty, 1)} UBE · ${fmt(DRINKS[b.type].kcal * b.qty)} kcal</div>
  </div><button type="button" class="x" data-act="voz-rm" data-kind="bebidas" data-i="${i}" aria-label="Quitar">×</button></div>`));
  return `<div class="preview">
    <div class="eyebrow">Revisa antes de guardar</div>
    ${r.skipped ? `<div class="banner">He quitado ${r.skipped} cosa${r.skipped > 1 ? "s" : ""} de ${ATH[OTHER[me]]}: cada uno apunta lo suyo desde su usuario.</div>` : ""}
    ${items.length ? items.join("") : `<div class="empty">Claude no ha encontrado nada que apuntar. Prueba a contarlo con más detalle.</div>`}
    ${r.comentario ? `<div class="comment"><span class="by">Claude dice</span>${esc(r.comentario)}</div>` : ""}
    ${items.length ? `<div class="row-btns"><button type="button" class="btn primary" data-act="voz-save" ${canSave && !vBusy ? "" : "disabled"}>Guardar todo</button><button type="button" class="btn ghost" data-act="voz-discard">Descartar</button></div>` : ""}
  </div>`;
}

function weekContext(){
  const wk = periodRange("semana"), lines = [];
  for (const k of KEYS) {
    const t = totals(data().filter(s => s.athlete === k && s.date >= wk[0] && s.date <= wk[1]));
    const al = alcoholIn(drk(), k, ...wk), w = latestWeight(wts(), k), old = latestWeight(wts(), k, toISO(addDays(today(), -28)));
    lines.push(`${ATH[k]}: ${t.sesiones} sesiones, ${fmt(t.minutos)} min, ${fmt(t.volumen)} kg de volumen; alcohol ${fmt(al.ube, 1)} UBE (objetivo ${profileOf(k).alcoholGoal} UBE/semana)${w ? `; peso ${fmt(w.kg, 1)} kg${old ? ` (${fmt(w.kg - old.kg, 1)} kg en 4 semanas)` : ""}` : ""}; objetivo: ${GOALS[profileOf(k).goal].l}.`);
  }
  if (isDemo() || wDemo() || dDemo()) lines.push("(Parte de estos datos son de ejemplo; no los menciones como reales.)");
  return lines.join("\n");
}
function parsePrompt(text){
  const t = today(), other = OTHER[me];
  return `Convierte lo que cuenta ${ATH[me]} (dictado por voz; puede haber errores de transcripción) en datos para su app de entrenamiento, que comparte con ${ATH[other]} para picarse.
Hoy es ${DIA[t.getDay()]} ${toISO(t)}. Convierte fechas relativas ("ayer", "el sábado", "el finde") en fechas YYYY-MM-DD de hoy o del pasado.
Todo es de ${ATH[me]} (athlete "${me}") salvo que diga claramente que lo hizo ${ATH[other]} (athlete "${other}").

Responde SOLO con un objeto JSON con esta forma:
{"sesiones":[], "pesajes":[], "bebidas":[], "comentario":""}

sesiones: {"athlete","date","time"?,"sport":"gym"|"bici"|"natacion"|"cinta"|"otro","minutes","rpe"?,"kcal"?,"hrAvg"?,"hrMax"?,"notes"?, y según el deporte:
  gym: "exercises":[{"name","sets":[{"reps","kg","rir"?,"rest"?,"warmup"?}]}] — un objeto por serie ("4 series de 8 con 80" son 4 objetos iguales). "Al fallo" = rir 0. kg 0 si es con el peso corporal.
  bici: "km","elevation"?,"watts"?,"cadence"?,"bikeType"?  natacion: "meters","poolLength"?,"style"?  cinta: "km","incline"?  otro: "activity","km"?}
  Si no dice la duración, estima (60 min de gimnasio) y apúntalo en notes.
  Para "name" usa estos nombres cuando encajen: ${Object.keys(CATALOG).join(", ")}.
pesajes: {"athlete","date","kg","waist"?,"fat"?}
bebidas: {"athlete","date","type","qty"} con type uno de: ${Object.entries(DRINKS).map(([k, d]) => `${k} (${d.l}, ${d.m})`).join("; ")}. "Una copa", "un gin-tonic" o "un cubata" = cubata; "una cerveza" sin más = cana; "un vino" = vino.
comentario: 2 a 4 frases de tú, en español de España, directas y con pique sano hacia ${ATH[other]}. Di si se ha pasado con el alcohol (1 UBE = 10 g de alcohol; bajo riesgo: hasta ${DAILY_LOW_RISK} UBE al día en hombres; ${BINGE} o más UBE en una ocasión es consumo intensivo) y cómo va con el peso, la dieta y el entreno respecto a ${ATH[other]}, usando el contexto.
No inventes nada que no diga. Deja las listas vacías si no hay datos de ese tipo.

Contexto de esta semana (antes de lo que cuenta ahora):
${weekContext()}

Lo que cuenta:
"""
${text.slice(0, 6000)}
"""`;
}
function normalizeParsed(o){
  const out = { sesiones: [], pesajes: [], bebidas: [], comentario: "" };
  if (!o || typeof o !== "object") return out;
  const T = toISO(today());
  const okA = a => ATH[a] ? a : me;
  const okD = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && d <= T ? d : T;
  const pos = (v, max = 1e6) => { const n = num(v); return n > 0 && n <= max ? n : null; };
  const arr = v => Array.isArray(v) ? v : [];
  for (const s of arr(o.sesiones)) {
    if (!s || !SPORTS[s.sport]) continue;
    const doc = clean({ athlete: okA(s.athlete), date: okD(s.date), time: /^\d{2}:\d{2}$/.test(s.time || "") ? s.time : "", sport: s.sport,
      minutes: pos(s.minutes, 600) || (s.sport === "gym" ? 60 : null), rpe: pos(s.rpe, 10), kcal: pos(s.kcal, 5000), hrAvg: pos(s.hrAvg, 230), hrMax: pos(s.hrMax, 240),
      notes: String(s.notes || "").slice(0, 500), updatedAt: Date.now() });
    if (!doc.minutes) continue;
    if (s.sport === "gym") {
      doc.exercises = arr(s.exercises).filter(e => e && String(e.name || "").trim()).map(e => {
        const name = canonicalName(e.name);
        return clean({ name, group: CATALOG[name] || "", sets: arr(e.sets).map(x => clean({ reps: pos(x && x.reps, 500) || 0, kg: Math.max(0, num(x && x.kg)), rir: x && x.rir != null && x.rir !== "" ? Math.max(0, num(x.rir)) : null, rest: pos(x && x.rest, 900), warmup: !!(x && x.warmup) })).filter(x => x.reps > 0) });
      }).filter(e => e.sets.length);
      if (!doc.exercises.length) continue;
    }
    if (s.sport === "bici") Object.assign(doc, clean({ km: pos(s.km, 500), elevation: pos(s.elevation, 9000), watts: pos(s.watts, 2000), cadence: pos(s.cadence, 200), bikeType: String(s.bikeType || "") }));
    if (s.sport === "natacion") Object.assign(doc, clean({ meters: pos(s.meters, 20000), poolLength: pos(s.poolLength, 100), style: String(s.style || "") }));
    if (s.sport === "cinta") Object.assign(doc, clean({ km: pos(s.km, 100), incline: pos(s.incline, 30) }));
    if (s.sport === "otro") Object.assign(doc, clean({ activity: String(s.activity || "").slice(0, 60), km: pos(s.km, 500) }));
    out.sesiones.push(doc);
  }
  for (const w of arr(o.pesajes)) { const kg = pos(w && w.kg, 250); if (kg && kg > 30) out.pesajes.push(clean({ athlete: okA(w.athlete), date: okD(w.date), kg, waist: pos(w.waist, 200), fat: pos(w.fat, 60) })); }
  for (const b of arr(o.bebidas)) { const q = Math.round(num(b && b.qty) || 1); if (b && DRINKS[b.type] && q > 0 && q <= 40) out.bebidas.push({ athlete: okA(b.athlete), date: okD(b.date), type: b.type, qty: q }); }
  out.comentario = String(o.comentario || "").slice(0, 900);
  if (WEB) {
    const before = out.sesiones.length + out.pesajes.length + out.bebidas.length;
    for (const k of ["sesiones", "pesajes", "bebidas"]) out[k] = out[k].filter(x => x.athlete === me);
    out.skipped = before - (out.sesiones.length + out.pesajes.length + out.bebidas.length);
  }
  return out;
}
const SAMPLE_ERR = {
  not_granted: "No has dado permiso para usar Claude en esta página.", sampling_disabled: "Claude no está disponible para esta cuenta.",
  rate_limited: "Demasiadas peticiones seguidas. Espera un poco y vuelve a intentarlo.", session_expired: "Tu sesión ha caducado: vuelve a iniciar sesión.",
  invalid_json: "Claude no ha devuelto los datos bien ordenados. Pulsa otra vez.", refused: "Claude no ha querido procesar este texto. Cámbialo un poco.",
  prompt_too_large: "El texto es demasiado largo. Cuéntalo en dos partes.",
  no_key: "Claude todavía no está configurado en el servidor (falta la clave de Anthropic).", upstream_error: "No se ha podido hablar con Claude. Vuelve a intentarlo."
};
const sampleMsg = e => SAMPLE_ERR[e && e.code] || "No se ha podido hablar con Claude. Vuelve a intentarlo.";
async function vozGo(){
  const text = String(keep("voz")).trim();
  if (!text) { vErr = "Cuenta primero lo que has hecho (pulsa el micrófono del teclado)."; renderVoz(); return; }
  if (!sample || vBusy) return;
  vBusy = true; vErr = ""; vResult = null; vDone = null; vStream = ""; vCtl = new AbortController(); renderVoz();
  try {
    const o = await sample.json(parsePrompt(text), { signal: vCtl.signal, cache: false, onText: ({ text }) => { if (!vStream) { vStream = text; renderVoz(); } } });
    vResult = normalizeParsed(o);
  } catch (e) {
    if (e && e.code !== "cancelled") vErr = sampleMsg(e);
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sample = null;
  }
  vBusy = false; renderVoz();
}
async function vozSave(){
  if (!vResult || dbState !== "ready" || vBusy) return;
  vBusy = true; vErr = ""; renderVoz();
  const r = vResult, now = Date.now();
  try {
    for (const s of r.sesiones) await db.collection("sesiones").doc().set({ ...s, createdAt: now, updatedAt: now, source: "voz" });
    for (const w of r.pesajes) await db.doc(`pesajes/${w.athlete}_${w.date}`).set({ ...w, updatedAt: now });
    const add = {};
    for (const b of r.bebidas) { const id = `${b.athlete}_${b.date}`; (add[id] ||= { athlete: b.athlete, date: b.date, c: {} }).c[b.type] = (add[id].c[b.type] || 0) + b.qty; }
    for (const [id, g] of Object.entries(add)) {
      const cur = drinks.find(d => d.id === id), counts = { ...((cur && cur.counts) || {}) };
      for (const [k, n] of Object.entries(g.c)) counts[k] = num(counts[k]) + n;
      await db.doc(`bebidas/${id}`).set({ athlete: g.athlete, date: g.date, counts, updatedAt: now });
    }
    vDone = r.comentario || "Todo apuntado.";
    vResult = null; kept.voz = ""; store.set("gym.kept", kept);
    toast("Apuntado. " + ATH[OTHER[me]] + " ya lo puede ver.");
  } catch (e) {
    vErr = e && e.code === "invalid_argument" ? (WEB ? "No se puede guardar: solo puedes apuntar tus propios datos." : "No tienes permiso para guardar aquí: pide acceso “Puede interactuar” a la página.") : "No se ha podido guardar todo. Revisa la conexión y vuelve a intentarlo.";
  }
  vBusy = false; renderVoz();
}
function inlineGuide(name){
  const g = GUIDE[name]; if (!g) return "";
  return `<div class="inline-guide" style="margin-top:8px">${figMarkup(name)}<div><div class="mus muted" style="font-size:12.5px;margin-bottom:4px">${esc(g.m)}</div><ol>${g.steps.map(t => `<li>${esc(t)}</li>`).join("")}</ol><div class="ojo" style="font-size:12.5px;margin-top:6px"><b style="color:var(--over)">Ojo:</b> ${esc(g.ojo)}</div></div></div>`;
}

document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.apmode) { apMode = t.dataset.apmode; store.set("gym.apmode", apMode); renderApuntar(); return; }
  const a = t.dataset.act;
  if (a === "voz-go") vozGo();
  else if (a === "voz-stop") vCtl?.abort();
  else if (a === "voz-clear") { kept.voz = ""; store.set("gym.kept", kept); vErr = ""; renderVoz(); $("#voz")?.focus(); }
  else if (a === "voz-ex") { kept.voz = VOICE_EXAMPLES[+t.dataset.i]; store.set("gym.kept", kept); renderVoz(); }
  else if (a === "voz-rm") { vResult[t.dataset.kind].splice(+t.dataset.i, 1); renderVoz(); }
  else if (a === "voz-discard") { vResult = null; renderVoz(); }
  else if (a === "voz-save") vozSave();
  else if (a === "guide") { const i = +t.dataset.ex; guideOpen.has(i) ? guideOpen.delete(i) : guideOpen.add(i); updateGuide(i); }
});
