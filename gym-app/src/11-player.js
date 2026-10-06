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
  const tuned = tuneFromHistory(ww);
  swap = null;
  run = { w: ww, steps: flatten(ww), i: 0, phase: "preview", startedAt: null, until: null, log: {}, cur: null, athlete: me, rpe: null, extra: "", swapped, tuned };
  saveRun(); showPlayer();
}
/* weights start from what you actually lifted last time on that exercise, set by set: each set is
   compared with the same set last time. Reached the target reps → a step up in weight; fell short → same
   weight and one rep more. it.prev keeps last time's sets and it.plan today's target for every set. */
const BIG_LIFTS = new Set(["Prensa", "Hip thrust", "Sentadilla", "Peso muerto", "Peso muerto rumano", "Sentadilla búlgara"]);
function tuneFromHistory(w){
  let n = 0;
  for (const b of w.bloques) for (const it of b.items) {
    if (it.modo !== "reps") continue;
    const { last } = bestFor(me, it.ejercicio); if (!last || !last.sets.length) continue;
    const top = Math.max(...last.sets.map(x => num(x.kg)));
    if (!top) continue; // bodyweight: nothing to carry over
    const step = BIG_LIFTS.has(canonicalName(it.ejercicio)) ? 5 : 2.5;
    it.prev = { date: last.date, sets: last.sets.map(x => ({ kg: num(x.kg), reps: num(x.reps) })) };
    it.plan = Array.from({ length: it.series }, (_, i) => {
      const p = it.prev.sets[Math.min(i, it.prev.sets.length - 1)];
      return num(p.reps) >= num(it.reps) ? { kg: p.kg + step, reps: num(it.reps) } : { kg: p.kg, reps: Math.min(num(it.reps), num(p.reps) + 1) };
    });
    it.reto = `La última vez (${relDay(last.date)}): ${it.prev.sets.map(x => `${fmt(x.kg, 2)}×${x.reps}`).join(" · ")}. Hoy: ${it.plan.map(x => `${fmt(x.kg, 2)}×${x.reps}`).join(" · ")}.`;
    n++;
    it.kg = it.plan[0].kg;
  }
  return n;
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
// what set s (1, 2…) of an item asks for: its own target when the weights come from last time
const planned = (it, s) => { const p = it.plan && it.plan[s - 1]; return { reps: p ? p.reps : it.reps, kg: p ? p.kg : it.kg, secs: it.segundos, meters: it.metros }; };
/* last time next to today, set by set: what you did in each set then and what you do (or did) now,
   with an arrow when you beat it */
function prevHTML(st, cur){
  const it = itemOf(st), s = st.s;
  if (it.modo !== "reps" || !me) return "";
  const last = it.prev || bestFor(me, it.ejercicio).last; if (!last || !last.sets.length) return "";
  const done = run.log[keyOf(st)] || [];
  const n = Math.max(it.series, last.sets.length), d = parseISO(last.date);
  const cell = x => x ? `${fmt(x.kg, 2)}<small>×${x.reps}</small>` : "–";
  const cmp = (a, b) => !a || !b ? "" : a.kg > b.kg || (a.kg === b.kg && a.reps > b.reps) ? "up" : a.kg === b.kg && a.reps === b.reps ? "eq" : "down";
  const cols = Array.from({ length: n }, (_, i) => {
    const was = last.sets[i], did = done[i] ? { kg: num(done[i].kg), reps: num(done[i].reps) } : null, plan = i < it.series ? planned(it, i + 1) : null;
    const c = did ? cmp(did, was) : "";
    return `<div class="pv-col ${i === s - 1 ? "now" : ""}"><span class="pv-s">S${i + 1}</span><span class="pv-was">${cell(was)}</span><span class="pv-today ${did ? "did " + c : ""}">${did ? cell(did) + (c === "up" ? " ▲" : c === "down" ? " ▼" : "") : plan ? cell(plan) : "–"}</span></div>`;
  }).join("");
  return `<div class="pl-prev" role="table" aria-label="Series de la última vez y de hoy">
    <div class="pv-col pv-head"><span class="pv-s"></span><span class="pv-was">${esc(DIA[d.getDay()])} ${d.getDate()}</span><span class="pv-today">Hoy</span></div>${cols}</div>`;
}
const mmssS = s => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };

/* rendering */
/* the whole workout as a row of small rings, one per exercise, that fill up set by set: 2/3 means
   two of its three sets done, so you can see at a glance how much is left */
const TRACK_ICO = {
  reps: `<path d="M5 9v6M8 7v10M16 7v10M19 9v6M8 12h8"/>`,
  tiempo: `<circle cx="12" cy="13" r="6.5"/><path d="M12 13V9.5M10 4h4"/>`,
  distancia: `<path d="M4 10q2-2.5 4 0t4 0 4 0 4 0M4 15.5q2-2.5 4 0t4 0 4 0 4 0"/>`
};
function trackHTML(nowKey){
  const w = run.w, C = 106.8; let n = 0, nowN = 0;
  const cells = w.bloques.map((b, bi) => b.items.map((it, ii) => {
    const k = bi + "." + ii, done = Math.min((run.log[k] || []).length, it.series), now = k === nowKey; n++; if (now) nowN = n;
    // an exercise already behind you with sets missing was skipped (or cut short)
    const past = !now && run.steps.findIndex(s => keyOf(s) === k) < run.i && done < it.series;
    const cls = now ? "now" : done >= it.series ? "full" : past ? "skip" : "";
    return `<li class="tk ${cls}" ${now ? 'aria-current="step"' : ""} aria-label="${esc(it.ejercicio)}: ${done} de ${it.series} series${past ? ", saltado" : ""}">
      <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="tk-t"/><circle cx="20" cy="20" r="17" class="tk-v" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - done / (it.series || 1))}"/><g transform="translate(8 8)" class="tk-i">${TRACK_ICO[it.modo] || TRACK_ICO.reps}</g></svg>
      <span>${done}/${it.series}</span></li>`;
  }).join("")).join(`<li class="tk-sep" aria-hidden="true"></li>`);
  return `<div class="pl-track"><div class="eyebrow">Ejercicio ${nowN} de ${n}</div><ol class="tk-row" id="pl-track">${cells}</ol></div>`;
}
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
      ${run.tuned ? `<p class="note">Pesos según lo que levantaste la última vez en ${run.tuned} ejercicio${run.tuned > 1 ? "s" : ""}.</p>` : ""}
      ${run.swapped && run.swapped.length ? `<p class="note">Cambiado porque no te gusta: ${run.swapped.map(([a, b]) => `${esc(a)} → <b>${esc(b)}</b>`).join(", ")}.</p>` : ""}
      ${w.bloques.map((b, bi) => `<div class="pl-block"><div class="eyebrow">${esc(b.nombre)}</div>${b.items.map((x, ii) => `<div class="pl-item">
        ${figMini(x.ejercicio)}
        <div>${musclesOf(x).main.length ? `<div class="mus-chip">${esc(musNames(musclesOf(x).main))}</div>` : ""}<b>${esc(x.ejercicio)}</b><div class="muted" style="font-size:13px">${x.series} × ${target(x)} · descanso ${x.descanso_s} s</div>${x.reto ? `<div class="reto">${esc(x.reto)}</div>` : ""}${gripTag(x.ejercicio)}${noteHTML(x.ejercicio, { small: true, add: false })}</div>
        <button type="button" class="btn sm ghost" data-swap-item="${bi}.${ii}" aria-label="Cambiar ${esc(x.ejercicio)}">Cambiar</button></div>`).join("")}</div>`).join("")}
      ${w.nota ? `<p class="note">${esc(w.nota)}</p>` : ""}
    </div>
    <div class="pl-foot"><button type="button" class="btn primary big" data-pl="start">Empezar</button></div>`;
  } else if (run.phase === "done") {
    body = summaryHTML();
  } else {
    const next = run.steps[run.i + 1];
    const cur = run.cur || planned(it, st.s);
    run.cur = cur;
    const mine = it.modo === "reps" ? bestFor(me, it.ejercicio).b : null, his = it.modo === "reps" ? bestFor(OTHER[me], it.ejercicio).b : null;
    const resting = run.phase === "rest", working = run.phase === "work";
    const paused = run.pausedLeft != null, secsLeft = paused ? run.pausedLeft / 1000 : run.until ? (run.until - Date.now()) / 1000 : 0, span = resting ? (it.descanso_s || 1) : (it.segundos || 1);
    const newEx = resting && next && keyOf(next) !== keyOf(st); // the rest before a different exercise: time to set up the machine
    const mu = musclesOf(it);
    // while resting, the top of the screen already shows what comes next (the new exercise, or the next set)
    const dSt = resting && next ? next : st, dIt = itemOf(dSt), dMu = musclesOf(dIt), dCur = resting && next ? run.nextCur : cur;
    body = `<div class="pl-body center">
      ${trackHTML(keyOf(dSt))}
      <div class="eyebrow">${esc(w.bloques[dSt.bi].nombre)} · ${resting && next ? "a continuación" : "trabajas"}</div>
      <h2 class="mus-title">${esc(musNames(dMu.main) || dIt.ejercicio)}</h2>
      <div class="pl-how">${GUIDE[dIt.ejercicio] ? `<button type="button" class="pl-fig small figbtn" data-figzoom="${esc(dIt.ejercicio)}" aria-label="Ver en grande cómo se hace ${esc(dIt.ejercicio)}">${figMarkup(dIt.ejercicio)}</button>` : ""}<div><div class="muted" style="font-size:12px">cómo</div><b>${esc(dIt.ejercicio)}</b><div class="pl-set">Serie <b>${dSt.s}</b> de ${dIt.series} · <b>${target({ ...dIt, ...(dCur && dIt.modo === "reps" ? { reps: dCur.reps, kg: dCur.kg } : {}) })}</b></div></div></div>
      ${prevHTML(dSt, dCur)}
      ${gripHTML(dIt.ejercicio)}
      ${noteHTML(dIt.ejercicio)}
      ${resting || working ? `<div class="ring ${resting ? "rest" : "work"}">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rt"/><circle cx="60" cy="60" r="52" class="rv" id="pl-ring" style="stroke-dasharray:326.7;stroke-dashoffset:${326.7 * (1 - Math.max(0, secsLeft) / span)}"/></svg>
          <div class="ring-txt"><span id="pl-count">${mmssS(secsLeft)}</span><small>${paused ? "en pausa" : resting ? "descanso" : "¡dale!"}</small></div></div>
          ${resting ? `<div class="pl-next">${!next ? "Última serie hecha: <b>a terminar</b>" : newEx ? `Acabaste <b>${esc(it.ejercicio)}</b>. Prepara la máquina y pulsa «Estoy listo».` : `Siguiente: <b>serie ${next.s} de ${itemOf(next).series}</b>`}</div>${restEdit(st, next)}` : ""}`
        : `<div class="pl-map">${bodyMap(levelsFor([mu]))}</div>
          ${it.indicacion ? `<div class="pl-cue">${esc(it.indicacion)}</div>` : ""}
          ${it.reto && !it.prev ? `<div class="reto big">${esc(it.reto)}</div>` : ""}
          ${mine || his ? `<div class="pl-best">${mine ? `<span><i class="dot ${me}"></i> Tu mejor: <b>${fmt(mine.kg, 2)} kg × ${mine.reps}</b></span>` : ""}${his ? `<span><i class="dot ${OTHER[me]}"></i> ${ATH[OTHER[me]]}: <b>${fmt(his.kg, 2)} kg × ${his.reps}</b></span>` : ""}</div>` : ""}
          ${steppersFor(it, cur, "cur")}`}
    </div>
    <div class="pl-foot">
      ${resting ? `<button type="button" class="btn ${paused ? "primary" : ""}" data-pl="pause">${paused ? "▶ Seguir" : "❚❚ Pausar"}</button><button type="button" class="btn primary big" data-pl="skip">${newEx ? "Estoy listo" : "Saltar descanso"}</button>`
        : working ? `<button type="button" class="btn ${paused ? "primary" : ""}" data-pl="pause">${paused ? "▶ Seguir" : "❚❚ Pausar"}</button><button type="button" class="btn primary big" data-pl="workdone">Hecho</button>`
        : it.modo === "tiempo" ? `<button type="button" class="btn primary big" data-pl="work">Empezar ${it.segundos} s</button>`
        : `<button type="button" class="btn primary big" data-pl="done">Serie hecha</button>`}
      <div class="pl-aux">${resting ? `<button type="button" class="linkbtn" data-pl="plus">+30 s</button>` : ""}<button type="button" class="linkbtn" data-pl="skipex">Saltar ejercicio</button>${working ? "" : resting ? (next ? `<button type="button" class="linkbtn" data-swap-item="${next.bi}.${next.ii}">Cambiar el siguiente</button>` : "") : `<button type="button" class="linkbtn" data-swap-item="${st.bi}.${st.ii}">Cambiar ejercicio</button>`}<button type="button" class="linkbtn" data-pl="finish">Terminar y guardar</button></div>
    </div>`;
  }
  el.innerHTML = `<div class="pl-wrap">${head}${body}</div>${swapSheetHTML()}`;
  mountFigs();
  // keep the current exercise in view in the row of rings
  requestAnimationFrame(() => { const tr = $("#pl-track"), tn = tr && tr.querySelector(".now");
    if (tn) tr.scrollLeft = tn.offsetLeft - (tr.clientWidth - tn.offsetWidth) / 2; });
  clearInterval(runTick); runTick = null;
  if (run.phase === "rest" || run.phase === "work" || (run.startedAt && run.phase !== "done")) runTick = setInterval(tickPlayer, 250);
}
function renderPlayerSoft(){ if (run && run.phase === "done") renderPlayer(); }
// the number can be tapped and typed, or moved with − / +; tgt says what it edits:
// "cur" the set on screen, "next" the next set (during the rest), "last" the set just done
function stepper(k, label, v, stepv, tgt = "cur"){
  return `<div class="stepper"><span>${label}</span><div><button type="button" data-step="${k}" data-tgt="${tgt}" data-d="${-stepv}" aria-label="Menos ${label}">−</button><input class="stepin" id="pl-${tgt}-${k}" data-stepin="${k}" data-tgt="${tgt}" type="text" inputmode="decimal" value="${fmt(num(v), 2)}" aria-label="${label}"><button type="button" data-step="${k}" data-tgt="${tgt}" data-d="${stepv}" aria-label="Más ${label}">+</button></div></div>`;
}
function steppersFor(it, v, tgt, cls = ""){
  if (!v) return "";
  return it.modo === "reps" ? `<div class="steppers ${cls}">${stepper("reps", "Reps", v.reps, 1, tgt)}${stepper("kg", "Kg", v.kg, 2.5, tgt)}</div>`
    : it.modo === "distancia" ? `<div class="steppers ${cls}">${stepper("meters", "Metros", v.meters, 25, tgt)}</div>` : "";
}
const lastSum = (it, l) => it.modo === "reps" ? `${fmt(l.reps)} reps${l.kg ? " × " + fmt(l.kg, 2) + " kg" : ""}` : fmt(l.meters) + " m";
function refreshLastSum(){ const el = $("#pl-last-sum"), l = lastLog(); if (el && l) el.textContent = lastSum(itemOf(run.steps[run.i]), l); }
const lastLog = () => { const st = run.steps[run.i], l = st && run.log[keyOf(st)]; return l && l.length ? l[l.length - 1] : null; };
const stepTarget = tgt => tgt === "next" ? run.nextCur : tgt === "last" ? lastLog() : run.cur;
// during the rest: fix what you just did, and set the weight for the next set
function restEdit(st, next){
  const it = itemOf(st), last = lastLog(), ni = next && itemOf(next);
  const fixLast = it.modo !== "tiempo" && last ? `<details class="pl-edit"><summary>Acabas de hacer <b id="pl-last-sum">${lastSum(it, last)}</b> · corregir</summary>${steppersFor(it, last, "last", "sm")}</details>` : "";
  const setNext = ni && ni.modo !== "tiempo" && run.nextCur ? `<div class="pl-edit"><div class="eyebrow">Siguiente serie${keyOf(next) !== keyOf(st) ? ` · ${esc(ni.ejercicio)}` : ""}</div>${steppersFor(ni, run.nextCur, "next", "sm")}</div>` : "";
  return setNext + fixLast;
}
function tickPlayer(){
  if (!run) return;
  const e = $("#pl-elapsed"); if (e && run.startedAt) e.textContent = mmssS((Date.now() - run.startedAt) / 1000);
  if (run.phase !== "rest" && run.phase !== "work") return;
  if (run.pausedLeft != null) return;
  const it = itemOf(run.steps[run.i]), left = (run.until - Date.now()) / 1000, span = run.phase === "rest" ? (it.descanso_s || 1) : (it.segundos || 1);
  const c = $("#pl-count"); if (c) c.textContent = mmssS(left);
  const r = $("#pl-ring"); if (r) r.style.strokeDashoffset = 326.7 * (1 - Math.max(0, left) / span);
  if (run.phase === "work" && Math.ceil(left) === 3 && !run._w3) { run._w3 = true; beep(); }
  if (left <= 0) { if (run.phase === "rest") endRest(); else logSet(); }
}

/* flow */
function logSet(){
  const st = run.steps[run.i], it = itemOf(st), c = run.cur || {};
  run.lastAt = Date.now();
  (run.log[keyOf(st)] ||= []).push({ reps: num(c.reps), kg: num(c.kg), secs: it.modo === "tiempo" ? it.segundos : null, meters: it.modo === "distancia" ? num(c.meters) : null });
  run._w3 = false;
  const next = run.steps[run.i + 1];
  if (!next) { finishRun(); return; }
  run.pausedLeft = null;
  const ni = itemOf(next);
  // the next set of the same exercise keeps what you just did, unless it has its own target from last time
  run.nextCur = keyOf(next) === keyOf(st) && !ni.plan ? { reps: num(c.reps), kg: num(c.kg), meters: c.meters } : (({ reps, kg, meters }) => ({ reps, kg, meters }))(planned(ni, next.s));
  if (it.descanso_s > 0) { run.phase = "rest"; run.until = Date.now() + it.descanso_s * 1000; say(`Descanso. Siguiente: ${spokenStep(next)}`); }
  else advance();
  saveRun(); renderPlayer();
}
function endRest(){ buzz(); beep(); advance(); const st = run.steps[run.i]; if (st) say(`${spokenStep(st)}. ${target({ ...itemOf(st), ...(run.cur || {}) })}`); saveRun(); renderPlayer(); }
function advance(){
  const prev = run.steps[run.i]; run.i++; run.until = null; run.pausedLeft = null;
  const st = run.steps[run.i]; if (!st) { finishRun(); return; }
  const it = itemOf(st), same = prev && keyOf(prev) === keyOf(st);
  const last = run.nextCur || (same ? run.cur : null);
  const def = planned(it, st.s);
  run.cur = { reps: last ? last.reps : def.reps, kg: last ? last.kg : def.kg, secs: it.segundos, meters: last && last.meters != null ? last.meters : it.metros };
  run.nextCur = null;
  run.phase = "set";
}
function finishRun(){ run.phase = "done"; run.until = null;
  // left half done and saved later: the workout ended with the last set, not now
  run.endedAt = run.lastAt && Date.now() - run.lastAt > 20 * 60000 ? run.lastAt : Date.now(); say("Entreno terminado. ¡Buen trabajo!"); saveRun(); renderPlayer(); }

/* summary and saving */
function runSession(){
  const w = run.w, ex = [], mins = Math.min(240, Math.max(1, Math.round(((run.endedAt || Date.now()) - (run.startedAt || Date.now())) / 60000)));
  let meters = 0;
  w.bloques.forEach((b, bi) => b.items.forEach((it, ii) => {
    const l = run.log[bi + "." + ii]; if (!l || !l.length) return;
    if (it.modo === "distancia") { meters += l.reduce((a, x) => a + num(x.meters), 0); return; }
    if (it.modo === "tiempo") { ex.push(clean({ name: it.ejercicio, group: CATALOG[it.ejercicio] || "", notes: `${l.length} × ${it.segundos} s`, sets: l.map(() => ({ reps: 1, kg: 0 })) })); return; }
    ex.push(clean({ name: it.ejercicio, group: CATALOG[it.ejercicio] || "", equip: num(l[0].kg) ? "" : "Peso corporal", sets: l.map(x => clean({ reps: x.reps, kg: x.kg, rest: it.descanso_s || null })) }));
  }));
  const sport = w.tipo === "natacion" ? "natacion" : w.tipo === "cinta" || w.tipo === "bici" ? w.tipo : w.tipo === "otro" ? "otro" : "gym";
  const doc = clean({ athlete: me, date: run.startedAt ? toISO(new Date(run.startedAt)) : todayISO(), time: `${pad(new Date(run.startedAt || Date.now()).getHours())}:${pad(new Date(run.startedAt || Date.now()).getMinutes())}`,
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
    <div class="pl-done"><div class="eyebrow">${(() => { const d = Object.values(run.log).reduce((a, l) => a + l.length, 0); return d < run.steps.length ? `Guardas lo que has hecho: ${d} de ${run.steps.length} series` : "Entreno terminado"; })()}</div><h2>${prs.length ? "¡Récord!" : "¡Hecho!"}</h2>
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
    const k = t.dataset.step, tgt = t.dataset.tgt || "cur", obj = stepTarget(tgt); if (!obj) return;
    obj[k] = Math.max(0, Math.round((num(obj[k]) + num(t.dataset.d)) * 100) / 100);
    const o = $(`#pl-${tgt}-${k}`); if (o) o.value = fmt(obj[k], 2); if (tgt === "last") refreshLastSum(); saveRun(); return;
  }
  if (t.dataset.rpe) { run.rpe = +t.dataset.rpe; saveRun(); renderPlayer(); return; }
  if (a === "close") { if (run.phase === "preview") closePlayer(true); else { closePlayer(false); toast("Entreno en pausa: en Hoy lo continúas o guardas lo hecho"); } }
  else if (a === "voice") { store.set("gym.voice", !voiceOn()); renderPlayer(); }
  else if (a === "start") { run.startedAt = Date.now(); advanceFromStart(); beep(); say(`Empezamos. ${spokenStep(run.steps[0])}. ${target(itemOf(run.steps[0]))}`); saveRun(); renderPlayer(); }
  else if (a === "done" || a === "workdone") logSet();
  else if (a === "work") { run.phase = "work"; run.pausedLeft = null; run.until = Date.now() + itemOf(run.steps[run.i]).segundos * 1000; beep(); saveRun(); renderPlayer(); }
  else if (a === "plus") { if (run.pausedLeft != null) run.pausedLeft += 30000; else run.until += 30000; saveRun(); renderPlayer(); }
  else if (a === "pause") {
    if (run.pausedLeft == null) { run.pausedLeft = Math.max(0, run.until - Date.now()); try { speechSynthesis.cancel(); } catch {} }
    else { run.until = Date.now() + run.pausedLeft; run.pausedLeft = null; }
    saveRun(); renderPlayer();
  }
  else if (a === "skip") endRest();
  else if (a === "skipex") { run.nextCur = null; const k = keyOf(run.steps[run.i]); while (run.steps[run.i] && keyOf(run.steps[run.i]) === k) run.i++; run.i--; advance(); saveRun(); renderPlayer(); }
  else if (a === "finish") finishRun();
  else if (a === "save") saveRunSession();
  else if (a === "discard") closePlayer(true);
});
function advanceFromStart(){ run.i = -1; advance(); }
document.addEventListener("input", e => {
  if (!run) return;
  if (e.target.id === "pl-km") { run.extra = e.target.value; saveRun(); }
  else if (e.target.dataset && e.target.dataset.stepin) { const obj = stepTarget(e.target.dataset.tgt); if (obj) { obj[e.target.dataset.stepin] = Math.max(0, num(e.target.value)); if (e.target.dataset.tgt === "last") refreshLastSum(); saveRun(); } }
});
document.addEventListener("focusin", e => { if (e.target.classList && e.target.classList.contains("stepin")) e.target.select(); });
