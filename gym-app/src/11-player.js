/* ---------- guided workout player ----------
   Walks through a workout set by set: the exercise drawing, the target and the challenge,
   a rest countdown with vibration, a beep and a spoken cue, and saves the session at the end. */
let run = store.get("gym.run", null);
let runTick = null, wakeLock = null, audioCtx = null;
const playerOpen = () => !$("#player").hidden;
const voiceOn = () => store.get("gym.voice", true);

// the items that count as "today you work": without warm-up and cool-down, unless that is all there is
function mainItems(w){
  const all = w.bloques.flatMap(b => b.items), core = w.bloques.filter(b => !/calentamiento|vuelta a la calma/i.test(b.nombre)).flatMap(b => b.items);
  return core.length ? core : all;
}
function flatten(w){
  const steps = [];
  w.bloques.forEach((b, bi) => b.items.forEach((it, ii) => { for (let s = 1; s <= it.series; s++) steps.push({ bi, ii, s }); }));
  return steps;
}
const itemOf = (st) => run.w.bloques[st.bi].items[st.ii];
const keyOf = (st) => st.bi + "." + st.ii;
function saveRun(){ store.set("gym.run", run); }
function openPlayer(w){
  if (!me) { toast("Elige primero quién eres"); return; }
  const { w: ww, swapped } = autoSwap(w);
  swap = null;
  run = { w: ww, steps: flatten(ww), i: 0, phase: "preview", startedAt: null, until: null, log: {}, cur: null, athlete: me, rpe: null, extra: "", swapped };
  saveRun(); showPlayer();
}
function resumePlayer(){ if (run && run.athlete === me && run.phase !== "preview") showPlayer(); }
function showPlayer(){
  $("#player").hidden = false; document.body.classList.add("playing");
  renderPlayer(); keepAwake(true);
}
function closePlayer(discard){
  swap = null;
  if (discard) { run = null; store.del("gym.run"); }
  $("#player").hidden = true; $("#player").innerHTML = ""; document.body.classList.remove("playing");
  clearInterval(runTick); runTick = null; keepAwake(false);
  if (tab === "hoy") renderHoy();
}
async function keepAwake(on){
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener?.("release", () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && playerOpen()) keepAwake(true); });

/* cues */
function beep(){
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.25, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.5);
  } catch {}
}
function say(text){
  if (!voiceOn()) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = "es-ES"; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
}
function buzz(){ try { navigator.vibrate?.([220, 120, 220]); } catch {} }
const target = it => it.modo === "reps" ? `${it.reps} reps${it.kg ? ` × ${fmt(it.kg, 2)} kg` : ""}` : it.modo === "tiempo" ? `${it.segundos} s` : `${it.metros} m`;
const mmssS = s => `${Math.floor(Math.max(0, s) / 60)}:${pad(Math.max(0, Math.ceil(s)) % 60)}`;

/* rendering */
function stepLabel(st){ const it = itemOf(st); return `${it.ejercicio} · serie ${st.s} de ${it.series}`; }
function spokenStep(st){ const it = itemOf(st), m = musNames(musclesOf(it).main); return `${m ? m + ". " : ""}${it.ejercicio}, serie ${st.s} de ${it.series}`; }
function renderPlayer(){
  const el = $("#player"); if (!run) { closePlayer(); return; }
  const w = run.w, st = run.steps[run.i], it = st && itemOf(st), total = run.steps.length;
  const doneN = Object.values(run.log).reduce((a, l) => a + l.length, 0);
  const head = `<div class="pl-head">
    <button type="button" class="btn sm ghost" data-pl="close" aria-label="Cerrar">✕</button>
    <div class="pl-title"><b>${esc(w.titulo)}</b><span class="muted">${run.startedAt ? `<span id="pl-elapsed">${mmssS((Date.now() - run.startedAt) / 1000)}</span> · ` : ""}${doneN}/${total} series</span></div>
    <button type="button" class="btn sm ghost" data-pl="voice" aria-pressed="${voiceOn()}" aria-label="Voz del entrenador">${voiceOn() ? "🔊" : "🔇"}</button>
  </div><div class="pl-bar"><i style="width:${total ? doneN / total * 100 : 0}%"></i></div>`;
  let body = "";
  if (run.phase === "preview") {
    body = `<div class="pl-body">
      ${w.objetivo ? `<p class="pl-goal">${esc(w.objetivo)}</p>` : ""}
      ${(() => { const all = mainItems(w).map(musclesOf), lv = levelsFor(all); const main = MUSCLE_ORDER.filter(k => lv[k] === 2);
        return main.length ? `<div class="pl-today"><div class="eyebrow">Hoy trabajas</div><div class="mus-title" style="font-size:24px">${esc(musNames(main))}</div>${bodyMap(lv, { cls: "small" })}<div class="mus-legend"><span><i style="background:var(--muscle)"></i>principal</span><span><i style="background:var(--mus-help)"></i>ayuda</span></div></div>` : ""; })()}
      ${run.swapped && run.swapped.length ? `<p class="note">Cambiado porque no te gusta: ${run.swapped.map(([a, b]) => `${esc(a)} → <b>${esc(b)}</b>`).join(", ")}.</p>` : ""}
      ${w.bloques.map((b, bi) => `<div class="pl-block"><div class="eyebrow">${esc(b.nombre)}</div>${b.items.map((x, ii) => `<div class="pl-item">
        ${figMini(x.ejercicio)}
        <div>${musclesOf(x).main.length ? `<div class="mus-chip">${esc(musNames(musclesOf(x).main))}</div>` : ""}<b>${esc(x.ejercicio)}</b><div class="muted" style="font-size:13px">${x.series} × ${target(x)} · descanso ${x.descanso_s} s</div>${x.reto ? `<div class="reto">${esc(x.reto)}</div>` : ""}</div>
        <button type="button" class="btn sm ghost" data-swap-item="${bi}.${ii}" aria-label="Cambiar ${esc(x.ejercicio)}">Cambiar</button></div>`).join("")}</div>`).join("")}
      ${w.nota ? `<p class="note">${esc(w.nota)}</p>` : ""}
    </div>
    <div class="pl-foot"><button type="button" class="btn primary big" data-pl="start">Empezar</button></div>`;
  } else if (run.phase === "done") {
    body = summaryHTML();
  } else {
    const next = run.steps[run.i + 1];
    const cur = run.cur || { reps: it.reps, kg: it.kg, secs: it.segundos, meters: it.metros };
    run.cur = cur;
    const mine = it.modo === "reps" ? bestFor(me, it.ejercicio).b : null, his = it.modo === "reps" ? bestFor(OTHER[me], it.ejercicio).b : null;
    const resting = run.phase === "rest", working = run.phase === "work";
    const secsLeft = run.until ? (run.until - Date.now()) / 1000 : 0, span = resting ? (it.descanso_s || 1) : (it.segundos || 1);
    const mu = musclesOf(it);
    body = `<div class="pl-body center">
      <div class="eyebrow">${esc(w.bloques[st.bi].nombre)} · trabajas</div>
      <h2 class="mus-title">${esc(musNames(mu.main) || it.ejercicio)}</h2>
      <div class="pl-how">${GUIDE[it.ejercicio] ? `<button type="button" class="pl-fig small figbtn" data-figzoom="${esc(it.ejercicio)}" aria-label="Ver en grande cómo se hace ${esc(it.ejercicio)}">${figMarkup(it.ejercicio)}</button>` : ""}<div><div class="muted" style="font-size:12px">cómo</div><b>${esc(it.ejercicio)}</b><div class="pl-set">Serie <b>${st.s}</b> de ${it.series} · <b>${target(it)}</b></div></div></div>
      ${resting || working ? `<div class="ring ${resting ? "rest" : "work"}">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rt"/><circle cx="60" cy="60" r="52" class="rv" id="pl-ring" style="stroke-dasharray:326.7;stroke-dashoffset:${326.7 * (1 - Math.max(0, secsLeft) / span)}"/></svg>
          <div class="ring-txt"><span id="pl-count">${mmssS(secsLeft)}</span><small>${resting ? "descanso" : "¡dale!"}</small></div></div>
          ${resting ? `<div class="pl-next">Siguiente: <b>${next ? esc(musNames(musclesOf(itemOf(next)).main) || itemOf(next).ejercicio) + " · " + esc(stepLabel(next)) : "terminar"}</b></div>` : ""}`
        : `<div class="pl-map">${bodyMap(levelsFor([mu]))}</div>
          ${it.indicacion ? `<div class="pl-cue">${esc(it.indicacion)}</div>` : ""}
          ${it.reto ? `<div class="reto big">${esc(it.reto)}</div>` : ""}
          ${mine || his ? `<div class="pl-best">${mine ? `<span><i class="dot ${me}"></i> Tu mejor: <b>${fmt(mine.kg, 2)} kg × ${mine.reps}</b></span>` : ""}${his ? `<span><i class="dot ${OTHER[me]}"></i> ${ATH[OTHER[me]]}: <b>${fmt(his.kg, 2)} kg × ${his.reps}</b></span>` : ""}</div>` : ""}
          ${it.modo === "reps" ? `<div class="steppers">
              ${stepper("reps", "Reps", cur.reps, 1)}${stepper("kg", "Kg", cur.kg, 2.5)}</div>`
            : it.modo === "distancia" ? `<div class="steppers">${stepper("meters", "Metros", cur.meters, 25)}</div>` : ""}`}
    </div>
    <div class="pl-foot">
      ${resting ? `<button type="button" class="btn" data-pl="plus">+15 s</button><button type="button" class="btn primary big" data-pl="skip">Saltar descanso</button>`
        : working ? `<button type="button" class="btn primary big" data-pl="workdone">Hecho</button>`
        : it.modo === "tiempo" ? `<button type="button" class="btn primary big" data-pl="work">Empezar ${it.segundos} s</button>`
        : `<button type="button" class="btn primary big" data-pl="done">Serie hecha</button>`}
      <div class="pl-aux"><button type="button" class="linkbtn" data-pl="skipex">Saltar ejercicio</button>${working ? "" : resting ? (next ? `<button type="button" class="linkbtn" data-swap-item="${next.bi}.${next.ii}">Cambiar el siguiente</button>` : "") : `<button type="button" class="linkbtn" data-swap-item="${st.bi}.${st.ii}">Cambiar ejercicio</button>`}<button type="button" class="linkbtn" data-pl="finish">Terminar ya</button></div>
    </div>`;
  }
  el.innerHTML = `<div class="pl-wrap">${head}${body}</div>${swapSheetHTML()}`;
  mountFigs();
  clearInterval(runTick); runTick = null;
  if (run.phase === "rest" || run.phase === "work" || (run.startedAt && run.phase !== "done")) runTick = setInterval(tickPlayer, 250);
}
function renderPlayerSoft(){ if (run && run.phase === "done") renderPlayer(); }
function stepper(k, label, v, stepv){
  return `<div class="stepper"><span>${label}</span><div><button type="button" data-step="${k}" data-d="${-stepv}" aria-label="Menos ${label}">−</button><output id="pl-${k}">${fmt(num(v), 2)}</output><button type="button" data-step="${k}" data-d="${stepv}" aria-label="Más ${label}">+</button></div></div>`;
}
function tickPlayer(){
  if (!run) return;
  const e = $("#pl-elapsed"); if (e && run.startedAt) e.textContent = mmssS((Date.now() - run.startedAt) / 1000);
  if (run.phase !== "rest" && run.phase !== "work") return;
  const it = itemOf(run.steps[run.i]), left = (run.until - Date.now()) / 1000, span = run.phase === "rest" ? (it.descanso_s || 1) : (it.segundos || 1);
  const c = $("#pl-count"); if (c) c.textContent = mmssS(left);
  const r = $("#pl-ring"); if (r) r.style.strokeDashoffset = 326.7 * (1 - Math.max(0, left) / span);
  if (run.phase === "work" && Math.ceil(left) === 3 && !run._w3) { run._w3 = true; beep(); }
  if (left <= 0) { if (run.phase === "rest") endRest(); else logSet(); }
}

/* flow */
function logSet(){
  const st = run.steps[run.i], it = itemOf(st), c = run.cur || {};
  (run.log[keyOf(st)] ||= []).push({ reps: num(c.reps), kg: num(c.kg), secs: it.modo === "tiempo" ? it.segundos : null, meters: it.modo === "distancia" ? num(c.meters) : null });
  run._w3 = false;
  const next = run.steps[run.i + 1];
  if (!next) { finishRun(); return; }
  if (it.descanso_s > 0) { run.phase = "rest"; run.until = Date.now() + it.descanso_s * 1000; say(`Descanso. Siguiente: ${spokenStep(next)}`); }
  else advance();
  saveRun(); renderPlayer();
}
function endRest(){ buzz(); beep(); advance(); const st = run.steps[run.i]; if (st) say(`${spokenStep(st)}. ${target(itemOf(st))}`); saveRun(); renderPlayer(); }
function advance(){
  const prev = run.steps[run.i]; run.i++; run.until = null;
  const st = run.steps[run.i]; if (!st) { finishRun(); return; }
  const it = itemOf(st), same = prev && keyOf(prev) === keyOf(st);
  const last = same ? run.cur : null;
  run.cur = { reps: last ? last.reps : it.reps, kg: last ? last.kg : it.kg, secs: it.segundos, meters: last ? last.meters : it.metros };
  run.phase = "set";
}
function finishRun(){ run.phase = "done"; run.until = null; run.endedAt = Date.now(); say("Entreno terminado. ¡Buen trabajo!"); saveRun(); renderPlayer(); }

/* summary and saving */
function runSession(){
  const w = run.w, ex = [], mins = Math.max(1, Math.round(((run.endedAt || Date.now()) - (run.startedAt || Date.now())) / 60000));
  let meters = 0;
  w.bloques.forEach((b, bi) => b.items.forEach((it, ii) => {
    const l = run.log[bi + "." + ii]; if (!l || !l.length) return;
    if (it.modo === "distancia") { meters += l.reduce((a, x) => a + num(x.meters), 0); return; }
    if (it.modo === "tiempo") { ex.push(clean({ name: it.ejercicio, group: CATALOG[it.ejercicio] || "", notes: `${l.length} × ${it.segundos} s`, sets: l.map(() => ({ reps: 1, kg: 0 })) })); return; }
    ex.push(clean({ name: it.ejercicio, group: CATALOG[it.ejercicio] || "", equip: num(l[0].kg) ? "" : "Peso corporal", sets: l.map(x => clean({ reps: x.reps, kg: x.kg, rest: it.descanso_s || null })) }));
  }));
  const sport = w.tipo === "natacion" ? "natacion" : w.tipo === "cinta" || w.tipo === "bici" ? w.tipo : w.tipo === "otro" ? "otro" : "gym";
  const doc = clean({ athlete: me, date: todayISO(), time: `${pad(new Date(run.startedAt || Date.now()).getHours())}:${pad(new Date(run.startedAt || Date.now()).getMinutes())}`,
    sport, minutes: mins, rpe: run.rpe, notes: `${w.titulo} (entreno guiado)`, source: "entrenador" });
  if (sport === "gym" && ex.length) doc.exercises = ex;
  if (sport === "gym" && !ex.length) { doc.sport = "otro"; doc.activity = w.titulo; }
  if (sport === "natacion") Object.assign(doc, clean({ meters: meters || null, style: w.bloques.flatMap(b => b.items).find(i => i.modo === "distancia")?.ejercicio }));
  if (sport === "cinta" || sport === "bici" || sport === "otro") { const km = num(run.extra); if (km) doc.km = km; if (sport === "otro") doc.activity = w.titulo; }
  return doc;
}
function prList(doc){
  const out = [];
  for (const e of doc.exercises || []) {
    const b = bestFor(me, e.name).b, top = (e.sets || []).reduce((m, x) => !m || x.kg > m.kg || (x.kg === m.kg && x.reps > m.reps) ? x : m, null);
    if (top && top.reps && (!b || top.kg > b.kg || (top.kg === b.kg && top.reps > b.reps))) out.push(`${e.name}: ${top.kg ? fmt(top.kg, 2) + " kg × " : ""}${top.reps}${b ? ` (antes ${b.kg ? fmt(b.kg, 2) + " × " : ""}${b.reps})` : ""}`);
  }
  return out;
}
function summaryHTML(){
  const doc = runSession(), g = doc.exercises ? gymStats(doc) : null, prs = prList(doc);
  const needKm = doc.sport === "cinta" || doc.sport === "bici";
  return `<div class="pl-body">
    <div class="pl-done"><div class="eyebrow">Entreno terminado</div><h2>${prs.length ? "¡Récord!" : "¡Hecho!"}</h2>
      <div class="kv"><div><dt>Tiempo</dt><dd>${doc.minutes} min</dd></div>${g ? `<div><dt>Series</dt><dd>${g.sets}</dd></div><div><dt>Volumen</dt><dd>${fmt(g.vol)} kg</dd></div>` : ""}${doc.meters ? `<div><dt>Nadado</dt><dd>${fmt(doc.meters)} m</dd></div>` : ""}</div>
      ${prs.length ? `<div class="prs">${prs.map(p => `<div>🏆 ${esc(p)}</div>`).join("")}</div>` : ""}
      ${(() => { const done = run.w.bloques.flatMap((b, bi) => b.items.filter((it, ii) => (run.log[bi + "." + ii] || []).length)).map(musclesOf); return done.length ? `<div class="eyebrow">Has trabajado</div>${bodyMap(levelsFor(done), { cls: "small" })}` : ""; })()}
    </div>
    <div class="f"><label>¿Cuánto te ha costado? <small>RPE 1–10</small></label><div class="chips">${[5, 6, 7, 8, 9, 10].map(n => `<button type="button" data-rpe="${n}" aria-pressed="${run.rpe === n}">${n}</button>`).join("")}</div></div>
    ${needKm ? `<div class="f"><label for="pl-km">Distancia total <small>km</small></label><input id="pl-km" type="number" inputmode="decimal" step="0.1" value="${esc(run.extra)}"></div>` : ""}
  </div>
  <div class="pl-foot"><button type="button" class="btn primary big" data-pl="save" ${dbState === "ready" ? "" : "disabled"}>Guardar entreno</button>
    <div class="pl-aux"><button type="button" class="linkbtn" data-pl="discard">Descartar</button></div></div>`;
}
async function saveRunSession(){
  const doc = runSession(); const now = Date.now();
  try {
    await db.collection("sesiones").doc().set({ ...doc, createdAt: now, updatedAt: now });
    const prs = prList(doc);
    closePlayer(true);
    toast(prs.length ? `Guardado. ¡${prs.length} récord${prs.length > 1 ? "s" : ""}! ${ATH[OTHER[me]]} ya lo ve.` : "Entreno guardado");
  } catch (e) { toast(e && e.code === "invalid_argument" ? "Solo puedes guardar tus propios entrenos" : "No se ha podido guardar. Revisa la conexión."); }
}

/* controls */
document.addEventListener("click", e => {
  const t = e.target.closest("#player button"); if (!t || !run) return;
  const a = t.dataset.pl;
  if (t.dataset.step) {
    const k = t.dataset.step; run.cur[k] = Math.max(0, Math.round((num(run.cur[k]) + num(t.dataset.d)) * 100) / 100);
    const o = $("#pl-" + k); if (o) o.textContent = fmt(run.cur[k], 2); saveRun(); return;
  }
  if (t.dataset.rpe) { run.rpe = +t.dataset.rpe; saveRun(); renderPlayer(); return; }
  if (a === "close") { if (run.phase === "preview") closePlayer(true); else { closePlayer(false); toast("Entreno en pausa: lo retomas desde Hoy"); } }
  else if (a === "voice") { store.set("gym.voice", !voiceOn()); renderPlayer(); }
  else if (a === "start") { run.startedAt = Date.now(); advanceFromStart(); beep(); say(`Empezamos. ${spokenStep(run.steps[0])}. ${target(itemOf(run.steps[0]))}`); saveRun(); renderPlayer(); }
  else if (a === "done" || a === "workdone") logSet();
  else if (a === "work") { run.phase = "work"; run.until = Date.now() + itemOf(run.steps[run.i]).segundos * 1000; beep(); saveRun(); renderPlayer(); }
  else if (a === "plus") { run.until += 15000; saveRun(); }
  else if (a === "skip") endRest();
  else if (a === "skipex") { const k = keyOf(run.steps[run.i]); while (run.steps[run.i] && keyOf(run.steps[run.i]) === k) run.i++; run.i--; advance(); saveRun(); renderPlayer(); }
  else if (a === "finish") finishRun();
  else if (a === "save") saveRunSession();
  else if (a === "discard") closePlayer(true);
});
function advanceFromStart(){ run.i = -1; advance(); }
document.addEventListener("input", e => { if (e.target.id === "pl-km" && run) { run.extra = e.target.value; saveRun(); } });
