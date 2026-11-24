/* ---------- one more set ----------
   «+ Serie» adds a set to the exercise you are on (or, in the summary, to any exercise). «Siempre con N
   series» keeps it for every workout from then on, whatever the plan: perfiles/<who>.extraSeries =
   { "Extensión en polea": 1, … }, added to that exercise each time a workout is opened. */
const extraOf = (name, who = me) => { const x = profiles[who] && profiles[who].extraSeries; return Math.max(0, num(x && x[canonicalName(name)])); };
const extrasText = who => Object.entries((profiles[who] && profiles[who].extraSeries) || {}).filter(([, n]) => num(n) > 0).map(([k, n]) => `${k} +${n}`).join("; ");
function applyExtras(w){
  for (const b of w.bloques) for (const it of b.items) {
    it.base0 = it.series; const n = it.modo === "reps" ? extraOf(it.ejercicio) : 0;
    if (n) { it.series += n; it.extra = n; }
  }
  return w;
}
async function saveExtra(name, n){
  if (dbState !== "ready" || !me) return;
  const extraSeries = { ...((profiles[me] && profiles[me].extraSeries) || {}) }, k = canonicalName(name);
  if (n > 0) extraSeries[k] = n; else delete extraSeries[k];
  const doc = { ...profileDoc(me), extraSeries, updatedAt: Date.now() };
  profiles[me] = { id: me, ...doc };
  try { await db.doc("perfiles/" + me).set(doc); toast(n > 0 ? `A partir de ahora, ${name} con ${n} serie${n > 1 ? "s" : ""} más` : `${name} vuelve a sus series normales`); }
  catch { toast("No se ha podido guardar"); }
  if (playerOpen()) renderPlayer();
}
// under each exercise of the summary: make today's extra sets the rule, or see that they already are
function alwaysHTML(it, done){
  const base = it.base0 != null ? it.base0 : run.resumedAt ? null : it.series - (it.extra || 0);
  if (base == null) return "";
  const want = done - base, has = extraOf(it.ejercicio);
  if (has > 0 && want <= has) return `<div class="fix-always"><span class="pill ok">Siempre ${base + has} series</span><button type="button" class="linkbtn" data-always="${esc(it.ejercicio)}" data-n="0">Quitar</button></div>`;
  return want > 0 ? `<div class="fix-always"><button type="button" class="btn sm" data-always="${esc(it.ejercicio)}" data-n="${want}">Siempre con ${done} series</button></div>` : "";
}
// one more set of the exercise on screen (in the rest: of the one you just did)
function addSetNow(){
  const st = run.steps[run.i]; if (!st) return;
  const it = itemOf(st), l = run.log[keyOf(st)] || [], full = l.length >= it.series;
  it.series++; if (it.hasta != null) it.hasta++;
  run.steps = flatten(run.w); run.i = run.steps.findIndex(x => x.bi === st.bi && x.ii === st.ii && x.s === st.s);
  // correcting a set of an exercise already done (its ring, «◀ Anterior»): what is typed for it is kept, and
  // straight to the new set, with the numbers of the last one
  if (run.phase === "set" && run.edit && full) {
    const j = run.steps.findIndex(x => x.bi === st.bi && x.ii === st.ii && x.s === l.length + 1);
    if (j >= 0) {
      const c = run.cur || {}, ed = run.edit; run.edit = null;
      if (ed.k === keyOf(st) && l[ed.idx]) l[ed.idx] = { ...l[ed.idx], reps: num(c.reps), kg: num(c.kg), ...(it.modo === "distancia" ? { meters: num(c.meters) } : {}) };
      const z = l[l.length - 1]; run.nextCur = z ? { reps: z.reps, kg: z.kg, meters: z.meters } : null; goStep(j);
      saveRun(); renderPlayer(); syncRun(); toast(`${it.ejercicio}: serie ${l.length + 1} de ${it.series}`); return; }
  }
  // in the rest, the new set comes next only when it is of the same exercise (in a pair, the partner may go first)
  const n = run.steps[nextUndone(run.i)];
  if (run.phase === "rest" && n && keyOf(n) === keyOf(st)) { const l = lastLog(); run.nextCur = l ? { reps: l.reps, kg: l.kg, meters: l.meters } : null; }
  saveRun(); renderPlayer(); syncRun();
  toast(`${it.ejercicio}: ahora ${it.series} series`);
}
/* ---------- one set less ----------
   The «−» of «− Serie +» takes a set off the exercise on screen (in the rest: the one you just did). With sets still to do,
   one of those goes and nothing logged changes; with all of them done, the last one logged is deleted, after
   asking. A set opened to correct it (run.edit: its ring, «◀ Anterior», the table) is the one deleted
   (the «−» says «Borrar esta serie»). In the summary, the × of each set deletes that one. An exercise never goes below one
   set, and the only set logged of the whole workout is never deleted here (that is «Descartar»): the session
   in the database always gets the change, because syncRun only writes a workout with sets. */
const setText = (it, x) => it.modo === "reps" ? `${fmt(num(x.reps))} × ${fmt(num(x.kg), 2)} kg` : it.modo === "distancia" ? `${fmt(num(x.meters))} m` : `${it.segundos} s`;
// the numbers for the set after the rest, as logSet sets them
function nextCurFor(st, next){
  const ni = itemOf(next), ln = run.log[keyOf(next)] || [], prev = keyOf(next) === keyOf(st) ? lastLog() : ln.slice(-1)[0];
  return prev && !ni.plan ? { reps: num(prev.reps), kg: num(prev.kg), meters: prev.meters } : (({ reps, kg, meters }) => ({ reps, kg, meters }))(planned(ni, next.s));
}
const stepAt = (bi, ii, s) => run.steps.findIndex(x => x.bi === bi && x.ii === ii && x.s === s);
function removeSetNow(){
  const st = run.steps[run.i]; if (!st || run.phase === "work") return;
  const k = keyOf(st), it = itemOf(st), l = run.log[k] || [];
  if (run.phase === "set" && run.edit && run.edit.k === k && l[run.edit.idx]) { deleteLogged(k, run.edit.idx); return; }
  if (it.series <= 1) { toast(`${it.ejercicio} ya tiene una sola serie: si no la vas a hacer, «Saltar ejercicio»`); return; }
  if (l.length >= it.series) { deleteLogged(k, l.length - 1); return; }
  // a set still to do: the last one of the exercise goes, nothing logged changes
  const was = run.steps[nextUndone(run.i)], wasK = was ? keyOf(was) + ":" + was.s : "";
  it.series--; if (it.hasta != null && it.hasta > it.series) it.hasta = it.series;
  run.steps = flatten(run.w);
  const j = stepAt(st.bi, st.ii, st.s);
  if (j >= 0) {
    run.i = j;
    // in the rest, what comes next may have been the set taken off
    if (run.phase === "rest") { const n = run.steps[nextUndone(run.i)]; if ((n ? keyOf(n) + ":" + n.s : "") !== wasK) run.nextCur = n ? nextCurFor(st, n) : null; }
  } else {
    // the set on screen was the one taken off: the exercise is finished, on to what is left
    run.i = stepAt(st.bi, st.ii, it.series); run.nextCur = null; advance();
  }
  saveRun(); renderPlayer(); syncRun();
  toast(`${it.ejercicio}: ahora ${it.series} serie${it.series > 1 ? "s" : ""}`);
}
// deletes set idx of exercise k from what is logged (player or summary)
function deleteLogged(k, idx){
  const [bi, ii] = k.split(".").map(Number), it = run.w.bloques[bi] && run.w.bloques[bi].items[ii], l = run.log[k];
  if (!it || !l || !l[idx]) return false;
  if (setsDone(run) <= 1) { toast("Es la única serie que llevas: si no quieres guardar el entreno, «Terminar y guardar» y luego «Descartar»"); return false; }
  if (!confirm(`¿Borrar la serie ${idx + 1} de ${it.ejercicio} (${setText(it, l[idx])})?`)) return false;
  const allDone = l.length >= it.series;
  l.splice(idx, 1);
  // one logged too many: the exercise has one set less; with sets still to do, the deleted one is to do again
  if (allDone) { it.series = Math.max(1, l.length); if (it.hasta != null && it.hasta > it.series) it.hasta = it.series; }
  run.edit = null; run.lastIdx = null;
  run.steps = flatten(run.w);
  if (run.phase !== "done") {
    run.nextCur = null;
    const j = stepAt(bi, ii, l.length + 1);
    if (j >= 0) goStep(j); // its first set left
    else { run.i = stepAt(bi, ii, l.length); advance(); }
  }
  fixOpen = run.phase === "done";
  saveRun(); renderPlayer(); syncRun();
  toast(`Borrada la serie ${idx + 1} de ${it.ejercicio}`);
  return true;
}
document.addEventListener("click", e => {
  const t = e.target.closest("button[data-addset],button[data-always],button[data-delset]"); if (!t || !run) return;
  e.preventDefault(); e.stopPropagation();
  if (t.dataset.always) { fixOpen = true; saveExtra(t.dataset.always, +t.dataset.n); return; }
  if (t.dataset.delset) { const [k, i] = t.dataset.delset.split(":"); deleteLogged(k, +i); return; }
  const k = t.dataset.addset, l = run.log[k]; if (!l || !l.length) return;
  const [bi, ii] = k.split(".").map(Number), it = run.w.bloques[bi].items[ii];
  l.push({ ...l[l.length - 1] }); it.series = Math.max(it.series, l.length); run.steps = flatten(run.w);
  fixOpen = true; saveRun(); renderPlayer(); syncRun();
}, true);
