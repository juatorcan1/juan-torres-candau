/* ---------- Hoy: what to do today ---------- */
const QUICK_TYPES = [["gym", "Gimnasio"], ["calistenia", "Calistenia"], ["casa", "En casa"], ["natacion", "Natación"], ["cinta", "Cinta"], ["bici", "Bici"]];
let qType = store.get("gym.qtype", "gym"), qMin = store.get("gym.qmin", 60);
if (!QUICK_TYPES.some(x => x[0] === qType)) qType = "gym";

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
  const pd = planDay(trainPlan()), doneToday = data().filter(s => s.athlete === me && s.date === todayISO());
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
          ${pd.actividad !== "descanso" ? `<button type="button" class="btn primary" data-hoy="plan" ${busy || !sample ? "disabled" : ""}>Prepárame la sesión</button>` : ""}</div>` : ""}
      <div class="quick">
        <div class="eyebrow">${pd ? "O pide otro" : "Pide un entreno"}</div>
        <div class="chips" role="group" aria-label="Tipo">${QUICK_TYPES.map(([k, l]) => `<button type="button" data-qtype="${k}" aria-pressed="${qType === k}">${l}</button>`).join("")}</div>
        <div class="chips" role="group" aria-label="Duración">${[20, 30, 40, 60, 90].map(n => `<button type="button" data-qmin="${n}" aria-pressed="${qMin === n}">${n} min</button>`).join("")}</div>
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
  if (t.dataset.qtype) { qType = t.dataset.qtype; store.set("gym.qtype", qType); renderHoy(); }
  else if (t.dataset.qmin) { qMin = +t.dataset.qmin; store.set("gym.qmin", qMin); renderHoy(); }
  else if (t.dataset.hoy === "quick") { const tl = QUICK_TYPES.find(x => x[0] === qType)[1].toLowerCase(); await quickWorkout({ tipo: qType === "casa" ? "casa" : tl, minutos: qMin }); }
  else if (t.dataset.hoy === "plan") { const pd = planDay(trainPlan()); if (pd) await quickWorkout({ plan: pd }); }
  else if (t.dataset.hoy === "resume") showPlayer();
  else if (t.dataset.hoy === "drop") { run = null; store.del("gym.run"); renderHoy(); }
  else if (t.dataset.hoy === "last") { const m = chatMsgs("coach").slice().reverse().find(x => x.entreno); if (m) openPlayer(m.entreno); }
  else if (t.dataset.go) setTab(t.dataset.go);
});
