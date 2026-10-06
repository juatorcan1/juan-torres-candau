/* ---------- training days of the plan that passed without anything logged ----------
   If you did train and forgot to log it, Hoy and the plan offer to log it on its own day: the gym
   with the guided workout (every set, no rests) and the rest with the form already filled in. */
const ACT_SPORT = { gym: "gym", calistenia: "gym", natacion: "natacion", cinta: "cinta", bici: "bici", otro: "otro" };
function missingDays(who = me){
  const plan = trainPlan(who); if (!plan || !Array.isArray(plan.semanas)) return [];
  const from = toISO(addDays(today(), -7)), pen = plan.penalizaDesde || "";
  return plan.semanas.flatMap(w => w.dias || []).filter(d => d.fecha < todayISO() && d.fecha >= from && d.fecha >= pen && d.actividad !== "descanso"
    && !/opcional/i.test(d.foco || "") && !data().some(s => s.athlete === who && s.date === d.fecha));
}
const dayName = iso => { const d = parseISO(iso); return `${DIA[d.getDay()]} ${d.getDate()}`; };
function missingHTML(){
  if (!me || dbState !== "ready") return "";
  const ds = missingDays(); if (!ds.length) return "";
  return `<div class="panel missing"><div class="panel-head" style="margin-bottom:6px"><h2>Te falta apuntar</h2></div>
    <p class="muted" style="margin:0 0 8px;font-size:13.5px">Si lo hiciste, apúntalo en su día: en vez de −1 suma +1.</p>
    ${ds.map(d => { const gym = d.entreno && (d.actividad === "gym" || d.actividad === "calistenia");
      return `<div class="miss-row"><div><b>${esc(dayName(d.fecha))}</b> · ${esc(d.foco || SPORTS[ACT_SPORT[d.actividad]] || d.actividad)}</div>
        <div class="row-btns">${gym ? `<button type="button" class="btn sm primary" data-log-day="${d.fecha}" data-mode="guided">Apuntar las series</button><button type="button" class="btn sm ghost" data-log-day="${d.fecha}" data-mode="form">Con el formulario</button>`
          : `<button type="button" class="btn sm primary" data-log-day="${d.fecha}" data-mode="form">Apuntar</button>`}</div></div>`; }).join("")}
  </div>`;
}
function logPastDay(fecha, mode){
  const d = planDay(trainPlan(), fecha); if (!d || !me) return;
  if (mode === "guided") {
    if (run && run.athlete === me && run.phase !== "preview") { toast("Antes guarda o descarta el entreno que tienes a medias"); return; }
    const w = normalizeWorkout(d.entreno); if (w) { openPlayer(w, { date: fecha, minutes: d.duracion_min }); return; }
  }
  draft = newDraft(ACT_SPORT[d.actividad] || "otro"); draft.date = fecha;
  if (d.duracion_min) draft.minutes = String(d.duracion_min);
  const m = String(d.detalle || "").match(/(\d[\d.]*)\s*m\b/);
  if (draft.sport === "natacion" && m) draft.meters = m[1].replace(/\./g, "");
  draft.notes = String(d.foco || "");
  // the gym form starts with the exercises of that day's workout, to correct with what you really did
  const w = draft.sport === "gym" && normalizeWorkout(d.entreno);
  if (w) { const ex = w.bloques.flatMap(b => b.items).filter(it => it.modo === "reps").map(it => ({ ...emptyEx(), name: it.ejercicio, group: CATALOG[it.ejercicio] || "",
    sets: Array.from({ length: it.series }, () => ({ ...emptySet(), reps: String(it.reps || ""), kg: it.kg ? String(it.kg) : "" })) }));
    if (ex.length) draft.exercises = ex; }
  store.set("gym.draft", draft); formErr = ""; apMode = "form"; setTab("apuntar");
  toast(`Apuntas el ${dayName(fecha)}: cambia lo que no cuadre y guarda`);
}
document.addEventListener("click", e => { const t = e.target.closest("button[data-log-day]"); if (t) logPastDay(t.dataset.logDay, t.dataset.mode); });
