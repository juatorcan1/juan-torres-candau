/* ---------- Hoy: what to do today ---------- */
// Daily check-in: how the athlete feels decides the workout. Kept per device and per day.
const ENERGY = ["Reventado", "Flojo", "Normal", "Bien", "A tope"], SLEEP = ["Mal", "Regular", "Bien"];
const PLACES = [["gym", "Gimnasio", "gimnasio"], ["casa", "En casa", "en casa sin material"], ["parque", "Parque", "parque con barra de dominadas"], ["piscina", "Piscina", "piscina"], ["cardio", "Cinta o bici", "cinta o bici"]];
let ck = store.get("gym.ck", null);
if (!ck || ck.date !== toISO(today())) ck = { date: toISO(today()), energia: null, sueno: null, molesta: null, molestias: [], quiero: [], lugar: store.get("gym.lugar", "gym"), min: store.get("gym.qmin", 60) };
const saveCk = () => store.set("gym.ck", ck);
function checkinText(){
  if (!ck || ck.date !== toISO(today()) || (ck.energia == null && ck.sueno == null && !ck.quiero.length && !ck.molestias.length)) return "";
  const place = (PLACES.find(p => p[0] === ck.lugar) || PLACES[0])[2];
  return [ck.energia != null ? `energía ${ENERGY[ck.energia].toLowerCase()} (${ck.energia + 1}/5)` : "", ck.sueno != null ? `ha dormido ${SLEEP[ck.sueno].toLowerCase()}` : "",
    `molestias: ${ck.molestias.length ? musNames(ck.molestias) : "ninguna"}`, `quiere trabajar: ${ck.quiero.length ? musNames(ck.quiero) : "lo que toque según su plan y su recuperación"}`,
    `lugar: ${place}`, `tiempo: ${ck.min} min`].filter(Boolean).join("; ");
}
function checkinHTML(pd){
  const recent = recentMuscles(me, 3), rk = MUSCLE_ORDER.filter(k => recent[k] === 2);
  const lv = {}; for (const k of ck.quiero) lv[k] = 2;
  const chipsOf = (key, labels, val) => labels.map((l, i) => `<button type="button" data-ck="${key}" data-v="${i}" aria-pressed="${val === i}">${l}</button>`).join("");
  return `<div class="checkin">
    <div class="q"><div class="ql">¿Qué tal estás hoy?</div><div class="chips">${chipsOf("energia", ENERGY, ck.energia)}</div></div>
    <div class="q"><div class="ql">¿Cómo has dormido?</div><div class="chips">${chipsOf("sueno", SLEEP, ck.sueno)}</div></div>
    <div class="q"><div class="ql">¿Tienes agujetas o algo te molesta?</div><div class="chips"><button type="button" data-ck="molesta" data-v="0" aria-pressed="${ck.molesta === 0}">Nada</button><button type="button" data-ck="molesta" data-v="1" aria-pressed="${ck.molesta === 1}">Sí</button></div>
      ${ck.molesta === 1 ? `<div class="chips mus">${MUSCLE_ORDER.map(k => `<button type="button" data-ckm="molestias" data-k="${k}" aria-pressed="${ck.molestias.includes(k)}">${MUSCLES[k]}</button>`).join("")}</div>` : ""}</div>
    <div class="q"><div class="ql">¿Qué músculos quieres trabajar? <span class="muted">toca el cuerpo</span></div>
      <div class="ck-map">${bodyMap(lv, { clickable: true, cls: "small", label: ck.quiero.length ? musNames(ck.quiero) : "ninguno elegido" })}</div>
      <div class="chips"><button type="button" data-ck="quiero-auto" aria-pressed="${!ck.quiero.length}">${pd ? "Lo que toca en mi plan" : "Lo que toque"}</button>${ck.quiero.map(k => `<button type="button" data-ckm="quiero" data-k="${k}" aria-pressed="true">${MUSCLES[k]} ✕</button>`).join("")}</div>
      ${rk.length ? `<div class="note">Últimos 3 días trabajaste: <b>${esc(musNames(rk))}</b></div>` : ""}</div>
    <div class="q"><div class="ql">¿Dónde entrenas?</div><div class="chips">${PLACES.map(([k, l]) => `<button type="button" data-ck="lugar" data-v="${k}" aria-pressed="${ck.lugar === k}">${l}</button>`).join("")}</div></div>
    <div class="q"><div class="ql">¿Cuánto tiempo tienes?</div><div class="chips">${[20, 30, 40, 60, 90].map(n => `<button type="button" data-ck="min" data-v="${n}" aria-pressed="${ck.min === n}">${n} min</button>`).join("")}</div></div>
  </div>`;
}

const workoutMuscles = w => { const lv = levelsFor(mainItems(w).map(musclesOf)); return musNames(MUSCLE_ORDER.filter(k => lv[k] === 2)); };
function nextPlanDay(){
  const p = trainPlan(); if (!p || !Array.isArray(p.semanas)) return null;
  return p.semanas.flatMap(w => w.dias || []).find(d => d.fecha > todayISO() && d.actividad !== "descanso") || null;
}
function greeting(){ const h = new Date().getHours(); return h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches"; }
function todayMenu(){
  const dp = dietPlan(), d = dp && dp.dias.find(x => x.fecha === todayISO());
  if (d) return { src: "plan", desayuno: d.desayuno, media: d.media, comida: d.comida[dCirc] || [], merienda: d.merienda, cena: d.cena };
  const { t } = targetsFor(me), f = Math.min(1.45, Math.max(0.7, t.kcal / 2400));
  return { src: "base", ...dayMenu((today().getDay() + 6) % 7, dCirc, f) };
}
function renderHoy(){
  const v = $("#view-hoy");
  if (!me) {
    v.innerHTML = `<div class="panel who"><div class="eyebrow">Antes de empezar</div><h2>¿Quién eres?</h2>
      <p class="muted" style="margin:0">Se recuerda en este dispositivo.</p>
      <div class="opts"><button type="button" class="juan" data-me="juan">Juan</button><button type="button" class="ignacio" data-me="ignacio">Ignacio</button></div></div>`;
    return;
  }
  const { T } = (() => { const p = period; period = "semana"; const r = computeDuel(); period = p; return r; })();
  const pq = (() => { const p = period; period = "semana"; const r = piqueText(T); period = p; return r; })();
  const pd = planDay(trainPlan()), nx = nextPlanDay(), doneToday = data().filter(s => s.athlete === me && s.date === todayISO());
  const menu = todayMenu(), busy = chatBusy.coach;
  const paused = run && run.athlete === me && run.phase !== "preview";
  const lastCoach = chatMsgs("coach").slice().reverse().find(m => m.entreno);
  v.innerHTML = `<div style="display:grid;gap:16px">
    ${demoBanner()}
    <div class="hello"><h2>${greeting()}, ${ATH[me]}</h2><p>${esc(pq.main)}</p>${pq.sub ? `<p class="muted">${esc(pq.sub)}</p>` : ""}</div>

    <div class="panel today">
      <div class="panel-head" style="margin-bottom:10px"><h2>Entrena hoy</h2>${doneToday.length ? `<span class="pill ok">${doneToday.length} hecho${doneToday.length > 1 ? "s" : ""} hoy</span>` : ""}</div>
      ${paused ? `<div class="resume"><div><b>${esc(run.w.titulo)}</b><div class="muted" style="font-size:13px">Entreno a medias · ${Object.values(run.log).reduce((a, l) => a + l.length, 0)}/${run.steps.length} series</div></div>
          <div class="row-btns"><button type="button" class="btn primary" data-hoy="resume">Continuar</button><button type="button" class="btn ghost" data-hoy="drop">Descartar</button></div></div>` : ""}
      ${pd ? `<div class="plan-today"><div class="eyebrow">Según tu plan</div><b>${pd.actividad === "descanso" ? "Hoy toca descanso" : esc(pd.foco || SPORTS[pd.actividad] || pd.actividad)}</b>${pd.duracion_min ? ` <span class="muted">· ${pd.duracion_min} min</span>` : ""}
          <div class="muted" style="font-size:13.5px">${esc(pd.detalle)}</div>
          ${pd.entreno && pd.actividad !== "descanso" ? `<div class="muted" style="font-size:13.5px">Trabajas: <b>${esc(workoutMuscles(pd.entreno))}</b></div>` : ""}
          ${pd.actividad === "descanso" || doneToday.length ? "" : pd.entreno
            ? `<div class="row-btns"><button type="button" class="btn primary" data-plan-open="${pd.fecha}">Empezar</button><button type="button" class="btn ghost" data-hoy="plan" ${busy || !sample ? "disabled" : ""}>Adáptalo a cómo estoy</button></div>`
            : `<button type="button" class="btn primary" data-hoy="plan" ${busy || !sample ? "disabled" : ""}>Prepárame la sesión</button>`}</div>` : ""}
      ${nx && (!pd || pd.actividad === "descanso" || doneToday.length) ? `<div class="plan-today"><div class="eyebrow">Lo próximo · ${esc(nx.dia)} ${parseISO(nx.fecha).getDate()}</div><b>${esc(nx.foco || SPORTS[nx.actividad] || nx.actividad)}</b>${nx.duracion_min ? ` <span class="muted">· ${nx.duracion_min} min</span>` : ""}
          ${nx.entreno ? `<div class="muted" style="font-size:13.5px">Trabajas: <b>${esc(workoutMuscles(nx.entreno))}</b></div><button type="button" class="btn" data-plan-open="${nx.fecha}">Ver el entreno</button>` : `<div class="muted" style="font-size:13.5px">${esc(nx.detalle)}</div>`}</div>` : ""}
      <div class="quick">
        ${checkinHTML(pd)}
        <button type="button" class="btn primary big" data-hoy="quick" ${busy || !sample ? "disabled" : ""}>${busy ? "Tu entrenador lo está preparando…" : "Hazme el entreno"}</button>
        ${busy ? `<div class="thinking"><span class="spin"></span>Suele tardar menos de un minuto</div>` : ""}
        ${!sample && sampleState !== "loading" ? `<div class="note">Claude no está disponible ahora mismo.</div>` : ""}
        ${chatErr.coach ? `<div class="err">${esc(chatErr.coach)}</div>` : ""}
        ${lastCoach && !busy ? `<button type="button" class="linkbtn" data-hoy="last">Repetir el último: ${esc(lastCoach.entreno.titulo)}</button>` : ""}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head" style="margin-bottom:10px"><h2>Hoy comes</h2><button type="button" class="btn sm ghost" data-leaf="dieta">Menú completo</button></div>
      <div class="circs mini" role="group" aria-label="Dónde comes hoy">${Object.entries(CIRCS).map(([k, c]) => `<button type="button" data-circ="${k}" aria-pressed="${dCirc === k}"><b>${esc(c.l)}</b></button>`).join("")}</div>
      <div class="meals compact">${[["desayuno", "Desayuno"], ["comida", "Comida"], ["cena", "Cena"]].map(([k, l]) => `<div class="meal ${k === "comida" ? "main" : ""}"><div class="when">${l}</div><ul>${(menu[k] || []).slice(0, 3).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>
      ${menu.src === "base" ? `<button type="button" class="linkbtn" data-say="nutri" data-text="Hazme el menú de la semana" data-go="nutri">Pídele a tu dietista un menú semanal a tu medida</button>` : ""}
    </div>

    <div class="panel">
      <div class="panel-head" style="margin-bottom:10px"><h2>Apunta rápido</h2></div>
      <div class="qlog">
        <button type="button" data-tab="apuntar"><b>Cuéntaselo</b><span>Habla y Claude lo apunta</span></button>
        <button type="button" data-tab="cuerpo"><b>Peso</b><span>${(() => { const w = latestWeight(wts(), me); return w ? fmt(w.kg, 1) + " kg · " + relDay(w.date) : "Sin pesaje"; })()}</span></button>
        <button type="button" data-tab="cuerpo"><b>Copas</b><span>${fmt(alcoholIn(drk(), me, ...periodRange("semana")).ube, 1)} UBE esta semana</span></button>
      </div>
    </div>
  </div>`;
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.hoy === "quick") { saveCk(); await quickWorkout({ checkin: true }); }
  else if (t.dataset.hoy === "plan") { const pd = planDay(trainPlan()); if (pd) await quickWorkout({ plan: pd, checkin: !!checkinText() }); }
  else if (t.dataset.ck) {
    const k = t.dataset.ck, v = t.dataset.v;
    if (k === "lugar") { ck.lugar = v; store.set("gym.lugar", v); }
    else if (k === "min") { ck.min = +v; store.set("gym.qmin", +v); }
    else if (k === "quiero-auto") ck.quiero = [];
    else if (k === "molesta") { ck.molesta = +v; if (+v === 0) ck.molestias = []; }
    else ck[k] = ck[k] === +v ? null : +v;
    saveCk(); renderHoy();
  }
  else if (t.dataset.ckm) { const list = ck[t.dataset.ckm], k = t.dataset.k; const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k); saveCk(); renderHoy(); }
  else if (t.dataset.hoy === "resume") showPlayer();
  else if (t.dataset.hoy === "drop") { run = null; store.del("gym.run"); renderHoy(); }
  else if (t.dataset.hoy === "last") { const m = chatMsgs("coach").slice().reverse().find(x => x.entreno); if (m) openPlayer(m.entreno); }
  else if (t.dataset.go) setTab(t.dataset.go);
});
