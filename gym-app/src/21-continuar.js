/* ---------- carry on with a guided workout that was saved before the end ----------
   A saved session keeps its workout (guia); older ones find it in the plan or in the coach's chat by its
   title. The sets already logged go back into the player, it starts at the first set left, and saving
   updates the same session (same id), so nothing is duplicated. */
function workoutOfSession(s){
  if (s.guia && Array.isArray(s.guia.bloques)) return normalizeWorkout(s.guia);
  const title = String(s.notes || "").replace(/\s*\(entreno guiado\).*$/, "").trim(); if (!title) return null;
  const p = trainPlan(s.athlete);
  for (const w of (p && p.semanas) || []) for (const d of w.dias || []) if (d.entreno && String(d.entreno.titulo || "").trim() === title) return normalizeWorkout(d.entreno);
  const m = chatMsgs("coach").slice().reverse().find(x => x.entreno && String(x.entreno.titulo || "").trim() === title);
  return m ? normalizeWorkout(m.entreno) : null;
}
// the player state rebuilt from a saved session, or null if there is nothing left to do
function runFromSession(s){
  if (!s || s.athlete !== me || s.sport !== "gym") return null;
  const base = workoutOfSession(s); if (!base) return null;
  const { w } = autoSwap(base);
  const log = {}, used = new Set(), extra = [];
  for (const e of s.exercises || []) {
    let at = null;
    w.bloques.forEach((b, bi) => b.items.forEach((it, ii) => { if (!at && !used.has(bi + "." + ii) && normName(it.ejercicio) === normName(e.name)) at = [bi, ii, it]; }));
    const sets = (e.sets || []).filter(x => !x.warmup);
    if (!at) { extra.push(e); continue; }
    const [bi, ii, it] = at, k = bi + "." + ii; used.add(k);
    log[k] = sets.map(x => ({ reps: it.modo === "tiempo" ? 0 : num(x.reps), kg: num(x.kg), secs: it.modo === "tiempo" ? it.segundos : null, meters: null }));
    if (log[k].length > it.series) it.series = log[k].length;
  }
  // exercises logged that are not in the workout any more stay as done, at the start
  if (extra.length) {
    w.bloques.unshift({ nombre: "Ya hecho", items: extra.map(e => ({ ejercicio: e.name, modo: "reps", series: (e.sets || []).length, reps: num((e.sets[0] || {}).reps), kg: num((e.sets[0] || {}).kg), descanso_s: 0 })) });
    const shifted = {}; for (const [k, v] of Object.entries(log)) { const [bi, ii] = k.split(".").map(Number); shifted[(bi + 1) + "." + ii] = v; }
    Object.keys(log).forEach(k => delete log[k]); Object.assign(log, shifted);
    extra.forEach((e, ii) => { log["0." + ii] = (e.sets || []).map(x => ({ reps: num(x.reps), kg: num(x.kg), secs: null, meters: null })); });
  }
  const steps = flatten(w), i = steps.findIndex(st => ((log[st.bi + "." + st.ii] || []).length) < st.s);
  if (i < 0) return null;
  const ts = +String(s.id).split("-").pop();
  return { w, steps, i, log, startedAt: ts > 1e12 ? ts : (s.createdAt || Date.now()), prevMin: num(s.minutes), resumedAt: null, sid: s.id, athlete: me,
    phase: "set", until: null, cur: null, rpe: s.rpe || null, extra: "", swapped: [], tuned: 0, date: s.date };
}
const leftSets = r => r.steps.length - Object.values(r.log).reduce((a, l) => a + l.length, 0);
function continuable(s){ if (run && run.sid === s.id) return null; const r = runFromSession(s); return r && leftSets(r) > 0 ? r : null; }
function continueSession(id){
  const s = real.find(x => x.id === id); if (!s) return;
  if (run && run.athlete === me && run.phase !== "preview" && run.sid !== id) { toast("Antes guarda o descarta el entreno que tienes a medias"); return; }
  const r = runFromSession(s); if (!r) { toast("Ese entreno ya está completo"); return; }
  run = r; run.resumedAt = Date.now(); run.lastAt = Date.now();
  // weights from your history, without counting this same session as "last time"
  const at = run.steps[run.i], items = run.w.bloques.flatMap(b => b.items);
  const done = new Set(Object.entries(run.log).filter(([, l]) => l.length).map(([k]) => k));
  run.tuned = tuneFromHistory({ bloques: run.w.bloques.map((b, bi) => ({ ...b, items: b.items.filter((it, ii) => !done.has(bi + "." + ii)) })) });
  run.cur = planned(itemOf(at), at.s);
  saveRun(); showPlayer();
  toast(`Sigues por ${itemOf(at).ejercicio}, serie ${at.s}: te quedan ${leftSets(run)} series`);
}
document.addEventListener("click", e => { const t = e.target.closest("button[data-continue]"); if (t) continueSession(t.dataset.continue); });
