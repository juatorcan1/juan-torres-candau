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
  if (!me) return;
  const d = planDay(trainPlan(), fecha) || { fecha, actividad: "gym" };
  formReturn = tab;
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

/* ---------- the plan as the place to fix any day ----------
   Under every day up to today, what you logged that day, set by set, with Editar (the full form:
   date, sport, minutes, every exercise and set), Borrar and «Añadir otra sesión». Saving or cancelling
   brings you back to where you were. */
let formReturn = null;
function daySesText(s){
  if (s.sport !== "gym") return sessionSummary(s);
  return (s.exercises || []).map(e => (e.sets || []).every(x => !num(x.kg) && num(x.reps) <= 1) && e.notes ? `${e.name} ${e.notes}` : `${e.name} ${(e.sets || []).filter(x => !x.warmup && num(x.reps)).map(x => num(x.kg) ? `${fmt(num(x.kg), 2)}×${num(x.reps)}` : `${num(x.reps)}`).join(" · ")}`).join("\n");
}
function daySessionsHTML(fecha){
  if (!me || fecha > todayISO()) return "";
  const ss = real.filter(s => s.athlete === me && s.date === fecha);
  if (!ss.length) return "";
  // the workout still open in the player is continued there, not edited in the form (the player would overwrite it)
  const live = s => s.enCurso && run && run.athlete === me && run.sid === s.id;
  return `<div class="pd-ses">${ss.map(s => `<div class="pd-s">
      <div class="pd-s-h"><b>${esc(SPORTS[s.sport] || s.sport)}</b>${num(s.minutes) ? ` · ${fmt(num(s.minutes))} min` : ""}${s.enCurso ? ` · <span class="muted">sin terminar</span>` : ""}</div>
      <div class="pd-s-sum">${esc(daySesText(s))}</div>
      <div class="row-btns">${live(s) ? `<button type="button" class="btn sm primary" data-hoy="resume">Continuar</button>` : `${(c => c ? `<button type="button" class="btn sm primary" data-continue="${esc(s.id)}">Continuar · faltan ${leftSets(c)} series</button>` : "")(continuable(s))}<button type="button" class="btn sm" data-day-edit="${esc(s.id)}">Editar</button>`}<button type="button" class="btn sm ghost" data-day-del="${esc(s.id)}" aria-label="Borrar esta sesión">Borrar</button></div></div>`).join("")}
    <button type="button" class="linkbtn" data-log-day="${fecha}" data-mode="form">+ Añadir otra sesión</button></div>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest("button[data-day-edit],button[data-day-del]"); if (!t) return;
  if (t.dataset.dayEdit) { formReturn = tab; loadForEdit(t.dataset.dayEdit); return; }
  const s = real.find(x => x.id === t.dataset.dayDel); if (!s || s.athlete !== me) return;
  if (!confirm(`¿Borrar ${SPORTS[s.sport] || "la sesión"} del ${dayName(s.date)}? No se puede deshacer.`)) return;
  if (run && run.sid === s.id) { run = null; store.del("gym.run"); }
  db.collection("sesiones").doc(s.id).delete().then(() => toast("Sesión borrada")).catch(() => toast("No se ha podido borrar"));
});

/* ---------- "we trained together": copy the other one's gym sessions ----------
   For whoever did exactly the same workouts as the other: one tap replaces your gym sessions with copies
   of theirs (every exercise, set, weight and rep, on the same days), and takes their extra sets too.
   Each copy is your own session (copia-<their id>), so you can edit it afterwards. */
const isCopyOf = (mine, theirs) => mine.copiaDe === theirs.id && num(mine.copiadoEn) >= num(theirs.updatedAt);
function copyTargets(){
  if (!me || dbState !== "ready") return [];
  const other = OTHER[me];
  const no = store.get("gym.nocopy", []);
  return real.filter(s => s.athlete === other && s.sport === "gym" && !s.enCurso && !no.includes(s.id))
    .filter(t => !(t.copiaDe && real.some(m => m.id === t.copiaDe))) // their copies of my own sessions
    .filter(t => !real.some(m => m.athlete === me && m.date === t.date && isCopyOf(m, t)));
}
function copyOtherHTML(){
  const ts = copyTargets(); if (!ts.length) return "";
  const days = [...new Set(ts.map(t => t.date))].sort();
  return `<div class="panel copy-other"><div class="panel-head" style="margin-bottom:6px"><h2>¿Entrenasteis juntos?</h2></div>
    <p class="muted" style="margin:0 0 10px;font-size:13.5px">${ATH[OTHER[me]]} tiene ${days.length} día${days.length > 1 ? "s" : ""} de gimnasio que tú no tienes igual (${days.map(d => esc(dayName(d))).join(", ")}). Si hicisteis lo mismo, copia sus ejercicios, series, pesos y repeticiones: sustituyen a tus sesiones de gimnasio de esos días.</p>
    <div class="row-btns"><button type="button" class="btn primary" data-copy-other="all">Copiar los entrenos de ${ATH[OTHER[me]]}</button><button type="button" class="btn ghost" data-copy-no="${esc(ts.map(t => t.id).join(","))}">No, cada uno lo suyo</button></div></div>`;
}
async function copyFromOther(){
  const other = OTHER[me], src = copyTargets(); if (!src.length) return;
  const days = new Set(src.map(s => s.date));
  if (!confirm(`Se borran tus sesiones de gimnasio de ${days.size} día${days.size > 1 ? "s" : ""} y se ponen las de ${ATH[other]}. ¿Seguimos?`)) return;
  const mine = real.filter(s => s.athlete === me && s.sport === "gym" && days.has(s.date));
  if (run && run.athlete === me && mine.some(s => s.id === run.sid)) { run = null; store.del("gym.run"); }
  try {
    for (const s of mine) await db.collection("sesiones").doc(s.id).delete();
    for (const s of src) {
      const { id, enCurso, ...d } = s, now = Date.now();
      await db.doc(`sesiones/copia-${id}`).set({ ...d, athlete: me, copiaDe: id, copiadoEn: now, createdAt: s.createdAt || now, updatedAt: now });
    }
    const ex = profiles[other] && profiles[other].extraSeries;
    if (ex && Object.keys(ex).length) await db.doc("perfiles/" + me).set({ ...profileDoc(me), extraSeries: { ...ex }, updatedAt: Date.now() });
    toast(`Copiados ${src.length} entreno${src.length > 1 ? "s" : ""} de ${ATH[other]}`);
  } catch { toast("No se ha podido copiar todo. Prueba otra vez."); }
}
document.addEventListener("click", e => {
  if (e.target.closest("button[data-copy-other]")) { copyFromOther(); return; }
  const t = e.target.closest("button[data-copy-no]"); if (!t) return;
  store.set("gym.nocopy", [...new Set([...store.get("gym.nocopy", []), ...t.dataset.copyNo.split(",")])]); renderView();
});
