/* ---------- Dieta ---------- */
let dWho = null;
let dDay = (today().getDay() + 6) % 7;
let dCirc = store.get("gym.circ", "bocadillo"); if (!CIRCS[dCirc]) dCirc = "bocadillo";
let aiBusy = false, aiCtl = null, aiText = "", aiErr = "";
const DAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"], DAYS_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function weeklyMinutes(who){
  const a = toISO(addDays(today(), -27));
  return data().filter(s => s.athlete === who && s.date >= a).reduce((x, s) => x + num(s.minutes), 0) / 4;
}
function targetsFor(who){
  const w = latestWeight(wts(), who);
  return { t: dietTargets(profileOf(who), w ? w.kg : null, weeklyMinutes(who)), w };
}
function renderDieta(){
  if (!dWho) dWho = me || "juan";
  const v = $("#view-dieta"), other = OTHER[dWho];
  const { t, w } = targetsFor(dWho), o = targetsFor(other).t, pr = profileOf(dWho), saved = !!(profiles[dWho] && profiles[dWho].height);
  const factor = Math.min(1.45, Math.max(0.7, t.kcal / 2400));
  const dp = me === dWho ? dietPlan() : dietPlan(dWho), pdd = dp && dp.dias.find(d => (parseISO(d.fecha).getDay() + 6) % 7 === dDay);
  const menu = pdd ? planMenu(pdd, dCirc) : dayMenu(dDay, dCirc, factor);
  const wk = periodRange("semana"), al = alcoholIn(drk(), dWho, ...wk);
  const editable = me === dWho && dbState === "ready";
  const tile = (l, val, unit, ov) => `<div class="tg"><div class="l">${l}</div><div class="v">${fmt(val)}<small> ${unit}</small></div><div class="o"><i class="dot ${other}"></i> ${ATH[other]}: ${fmt(ov)} ${unit}</div></div>`;
  v.innerHTML = `<div style="display:grid;gap:18px">
    <div class="panel">
      <div class="panel-head">
        <div><h2>Dieta de ${ATH[dWho]}</h2><div class="muted" style="font-size:13px;margin-top:2px">${esc(t.goal)} · mantenimiento estimado ${fmt(t.tdee)} kcal · ${w ? `peso ${fmt(w.kg, 1)} kg (${shortDate(parseISO(w.date))})` : "sin pesaje: se usan 80 kg"}</div></div>
        <div class="chips" role="group" aria-label="Persona">${KEYS.map(k => `<button type="button" data-dwho="${k}" aria-pressed="${dWho === k}">${ATH[k]}</button>`).join("")}</div>
      </div>
      <div class="targets">
        ${tile("Calorías / día", t.kcal, "kcal", o.kcal)}
        ${tile("Proteína", t.prot, "g", o.prot)}
        ${tile("Hidratos", t.carbs, "g", o.carbs)}
        ${tile("Grasa", t.fat, "g", o.fat)}
      </div>
      ${!saved ? `<div class="banner" style="margin-top:12px"><strong>Perfil sin completar.</strong> Se están usando valores por defecto (${PROFILE_DEFAULT.height} cm, ${PROFILE_DEFAULT.age} años). ${me === dWho ? "Rellena tus datos abajo para afinar los números." : `${ATH[dWho]} tiene que rellenar su perfil.`}</div>` : ""}
      ${al.kcal ? `<p class="note" style="margin:12px 0 0">Esta semana el alcohol de ${ATH[dWho]} suma <b>${fmt(al.kcal)} kcal</b>, casi un ${fmt(al.kcal / t.kcal * 100)} % de un día entero de comida.</p>` : ""}
      <details style="margin-top:14px" ${!saved && me === dWho ? "open" : ""}>
        <summary style="cursor:pointer;font-weight:600;color:var(--ink-2)">Datos de ${ATH[dWho]}</summary>
        <form id="pform" novalidate style="margin-top:12px;gap:12px">
          <div class="fgrid">
            <div class="f"><label for="p-height">Altura <small>cm</small></label><input id="p-height" type="number" inputmode="numeric" min="140" max="220" value="${esc(pr.height)}" ${editable ? "" : "disabled"}></div>
            <div class="f"><label for="p-age">Edad</label><input id="p-age" type="number" inputmode="numeric" min="16" max="90" value="${esc(pr.age)}" ${editable ? "" : "disabled"}></div>
            <div class="f"><label for="p-goal">Objetivo</label><select id="p-goal" ${editable ? "" : "disabled"}>${Object.entries(GOALS).map(([k, g]) => `<option value="${k}" ${pr.goal === k ? "selected" : ""}>${g.l}</option>`).join("")}</select></div>
            <div class="f"><label for="p-work">Trabajo</label><select id="p-work" ${editable ? "" : "disabled"}>${Object.entries(WORK).map(([k, g]) => `<option value="${k}" ${pr.work === k ? "selected" : ""}>${g.l}</option>`).join("")}</select></div>
            <div class="f"><label for="p-alc">Objetivo de alcohol <small>UBE/semana</small></label><input id="p-alc" type="number" inputmode="numeric" min="0" max="40" value="${esc(pr.alcoholGoal)}" ${editable ? "" : "disabled"}></div>
          </div>
          ${editable ? `<div class="row-btns"><button type="submit" class="btn primary">Guardar mis datos</button></div>` : `<p class="note" style="margin:0">${me === dWho ? "Conectando…" : `Solo ${ATH[dWho]} puede cambiar sus datos.`}</p>`}
        </form>
        <p class="note">Calorías con la fórmula de Mifflin-St Jeor y un factor de actividad según los minutos entrenados de las últimas 4 semanas (${fmt(weeklyMinutes(dWho))} min/semana) y el tipo de trabajo. Proteína ${GOALS[pr.goal].prot} g por kg de peso.</p>
      </details>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Menú del ${DAYS_LONG[dDay].toLowerCase()}</h2><div class="muted" style="font-size:13px;margin-top:2px">${pdd ? `De tu dietista: ${esc(dp.titulo)}${pdd.kcal ? ` · unas ${fmt(pdd.kcal)} kcal` : ""}` : "Menú base de la app. Pídele uno a medida a tu dietista."}</div></div>
        <button type="button" class="btn sm" data-say="nutri" data-text="Hazme el menú de la semana" data-go="nutri">${pdd ? "Nuevo menú semanal" : "Menú a medida"}</button></div>
      <div style="display:grid;gap:12px">
        <div class="days" role="group" aria-label="Día de la semana">${DAYS_SHORT.map((d, i) => `<button type="button" data-dday="${i}" aria-pressed="${dDay === i}" class="${i === (today().getDay() + 6) % 7 ? "today" : ""}" aria-label="${DAYS_LONG[i]}">${d}</button>`).join("")}</div>
        <div class="circs" role="group" aria-label="Dónde comes hoy">${Object.entries(CIRCS).map(([k, c]) => `<button type="button" data-circ="${k}" aria-pressed="${dCirc === k}"><b>${c.l}</b><span>${c.s}</span></button>`).join("")}</div>
      </div>
      <div class="meals" style="margin-top:10px">
        ${MEALS.map(([k, l]) => `<div class="meal ${k === "comida" ? "main" : ""}"><div class="when">${l}<small>${CIRC_MEALS.includes(k) ? esc(CIRCS[dCirc].l) : "En casa, igual en los tres"}</small></div><ul>${menu[k].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      </div>
      <div style="margin-top:12px"><div class="eyebrow" style="margin-bottom:6px">Trucos para ${esc(CIRCS[dCirc].l.toLowerCase())}</div><ul class="tips">${TIPS[dCirc].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <p class="note" style="margin:12px 0 0">Cantidades ajustadas a ${fmt(t.kcal)} kcal. ${esc(scaleText("Los días de pierna o de doble sesión añade {40} g de pan o {30} g de arroz en crudo.", factor))} Es una guía orientativa: si tienes alguna patología o alergia, consúltalo con un nutricionista.</p>
    </div>

    ${sample ? `<div class="panel">
      <div class="panel-head"><h2>Otra propuesta con Claude</h2></div>
      <div class="fgrid" style="grid-template-columns:1fr auto;align-items:end">
        <div class="f"><label for="d-pref">Algo que quieras cambiar <small>opcional</small></label><input id="d-pref" data-keep value="${esc(keep("d-pref"))}" placeholder="Sin pescado, tengo solo un microondas, quiero algo rápido…"></div>
        ${aiBusy ? `<button type="button" class="btn" data-act="ai-stop">Parar</button>` : `<button type="button" class="btn primary" data-act="ai-go">Proponer menú</button>`}
      </div>
      ${aiBusy && !aiText ? `<div class="thinking" style="margin-top:12px"><span class="spin"></span>Pensando…</div>` : ""}
      ${aiText ? `<div class="ai-out" id="ai-out" style="margin-top:12px">${esc(aiText)}</div>` : ""}
      ${aiErr ? `<div class="err" style="margin-top:10px">${esc(aiErr)}</div>` : ""}
    </div>` : ""}
  </div>`;
}
async function askMenu(){
  if (!sample || aiBusy) return;
  const { t } = targetsFor(dWho), pr = profileOf(dWho);
  aiBusy = true; aiText = ""; aiErr = ""; aiCtl = new AbortController(); renderDieta();
  const prompt = `Propón el menú de un ${DAYS_LONG[dDay].toLowerCase()} para ${ATH[dWho]} (hombre, ${pr.age} años, ${pr.height} cm, objetivo: ${GOALS[pr.goal].l.toLowerCase()}).
Objetivo diario: ${t.kcal} kcal, ${t.prot} g de proteína, ${t.carbs} g de hidratos, ${t.fat} g de grasa.
Situación del día (desayuno, media mañana, comida y merienda; la cena es en casa): ${CIRCS[dCirc].l} (${CIRCS[dCirc].s}). ${dCirc === "bocadillo" ? "No tiene cocina: solo cosas que se lleven en la mochila (bocadillos, tortitas de maíz, táper frío)." : dCirc === "bar" ? "Di qué pedir en un menú del día o de tapas típico de España y qué evitar." : "Tiene microondas y nevera en la oficina."}
${keep("d-pref") ? "Preferencias: " + String(keep("d-pref")).slice(0, 300) : ""}
Formato: cinco apartados (Desayuno, Media mañana, Comida, Merienda, Cena), cada uno con 1 a 3 líneas y cantidades en gramos, y al final una línea con el total aproximado de kcal y proteína. Comida española normal, fácil y barata. Sin emojis ni tablas.`;
  try {
    await sample(prompt, { signal: aiCtl.signal, cache: false, onText: ({ text }) => { aiText = text; const el = $("#ai-out"); if (el) el.textContent = text; else renderDieta(); } });
  } catch (e) {
    if (e && e.text) aiText = e.text;
    if (e && e.code !== "cancelled") aiErr = sampleMsg(e);
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sample = null;
  }
  aiBusy = false; renderDieta();
}
async function saveProfile(){
  if (dbState !== "ready" || me !== dWho) return;
  const p = { height: num($("#p-height").value), age: num($("#p-age").value), goal: $("#p-goal").value, work: $("#p-work").value, alcoholGoal: num($("#p-alc").value) };
  if (p.height < 140 || p.height > 220 || p.age < 16 || p.age > 90) { toast("Revisa la altura y la edad"); return; }
  try { await db.doc("perfiles/" + me).set({ ...profileDoc(me), ...p, updatedAt: Date.now() }); toast("Datos guardados"); }
  catch { toast("No se han podido guardar tus datos"); }
}
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.dwho) { dWho = t.dataset.dwho; aiText = ""; renderDieta(); }
  else if (t.dataset.dday) { dDay = +t.dataset.dday; renderDieta(); }
  else if (t.dataset.circ) { dCirc = t.dataset.circ; store.set("gym.circ", dCirc); renderView(); }
  else if (t.dataset.act === "ai-go") askMenu();
  else if (t.dataset.act === "ai-stop") aiCtl?.abort();
});

/* ---------- Músculos: tap a muscle, see how to work it ---------- */
let gMus = store.get("gym.gmus", "pectoral"); if (!MUSCLES[gMus]) gMus = "pectoral";
function exercisesFor(k){
  const main = [], help = [];
  for (const n of Object.keys(GUIDE)) { const m = musclesOf(n); if (m.main.includes(k)) main.push(n); else if (m.help.includes(k)) help.push(n); }
  return { main, help };
}
function renderEjercicios(){
  const v = $("#view-ejercicios"), { main, help } = exercisesFor(gMus);
  const lv = { [gMus]: 2 };
  const recent = me ? recentMuscles(me, 7) : {};
  const card = n => { const g = GUIDE[n], m = musclesOf(n); return `<article class="gcard">
      <div class="fig-wrap">${figMarkup(n)}</div>
      <div><div class="mus-chip">${esc(musNames(m.main))}</div><h3>${esc(n)}</h3>${m.help.length ? `<div class="mus">Ayudan: ${esc(musNames(m.help))}</div>` : ""}<ol>${g.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol><div class="ojo"><b>Ojo:</b> ${esc(g.ojo)}</div></div>
    </article>`; };
  v.innerHTML = `<div style="display:grid;gap:16px">
    <div class="panel">
      <div class="panel-head"><div><h2>Toca un músculo</h2><div class="muted" style="font-size:13px;margin-top:2px">Te enseño cómo trabajarlo; da igual con qué ejercicio.</div></div></div>
      ${bodyMap(lv, { clickable: true, pick: gMus })}
      <div class="chips mus" style="margin-top:10px">${MUSCLE_ORDER.map(k => `<button type="button" data-gmus="${k}" aria-pressed="${gMus === k}">${MUSCLES[k]}${recent[k] === 2 ? " ·" : ""}</button>`).join("")}</div>
      ${me && Object.keys(recent).length ? `<p class="note" style="margin:8px 0 0">El punto marca lo que has trabajado esta semana.</p>` : ""}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2 class="mus-title" style="font-size:30px">${MUSCLES[gMus]}</h2><div class="muted" style="font-size:13px;margin-top:2px">${main.length} ejercicio${main.length === 1 ? "" : "s"} donde es el protagonista</div></div>
        ${me ? `<button type="button" class="btn sm primary" data-say="coach" data-go="coach" data-text="${esc(`Hazme un entreno centrado en ${MUSCLES[gMus].toLowerCase()} para hoy`)}">Entreno de ${esc(MUSCLES[gMus].toLowerCase())}</button>` : ""}</div>
      <div class="guide-grid">${main.map(card).join("") || `<div class="empty">Sin ejercicios dibujados todavía.</div>`}</div>
      ${help.length ? `<div class="eyebrow" style="margin:16px 0 8px">También lo trabajan</div><div class="guide-grid">${help.map(card).join("")}</div>` : ""}
    </div>
  </div>`;
  mountFigs();
}
document.addEventListener("click", e => { const t = e.target.closest("button[data-gmus]"); if (t) { gMus = t.dataset.gmus; store.set("gym.gmus", gMus); renderEjercicios(); } });

/* ---------- figure animation ---------- */
const reduceMotion = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
const figEls = new Map();
let figRaf = 0, figLast = 0;
const figIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(en => { const f = figEls.get(en.target); if (f) f.vis = en.isIntersecting; })) : null;
function figMarkup(name){
  return `<svg class="fig" viewBox="0 -14 200 206" data-fig="${esc(name)}" role="img" aria-label="Dibujo de ${esc(name)}: posición inicial y final">${figSVG(name, reduceMotion ? 1 : 0, true)}</svg>`;
}
function mountFigs(){
  document.querySelectorAll("svg[data-fig]").forEach(el => { if (!figEls.has(el)) { figEls.set(el, { name: el.dataset.fig, vis: true }); figIO?.observe(el); } });
  if (!reduceMotion && figEls.size && !figRaf) figRaf = requestAnimationFrame(figTick);
}
function figTick(ts){
  figRaf = 0;
  if (ts - figLast > 33) {
    figLast = ts;
    const ph = (ts % 2800) / 2800, tri = ph < .5 ? ph * 2 : 2 - ph * 2, c = Math.min(1, Math.max(0, (tri - .12) / .76)), u = c * c * (3 - 2 * c);
    for (const [el, f] of figEls) {
      if (!el.isConnected) { figEls.delete(el); figIO?.unobserve(el); continue; }
      if (f.vis) el.innerHTML = figSVG(f.name, u, true);
    }
  }
  if (figEls.size && !document.hidden) figRaf = requestAnimationFrame(figTick);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) mountFigs(); });
