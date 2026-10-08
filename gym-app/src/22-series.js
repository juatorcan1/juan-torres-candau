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
  const it = itemOf(st); it.series++;
  run.steps = flatten(run.w); run.i = run.steps.findIndex(x => x.bi === st.bi && x.ii === st.ii && x.s === st.s);
  if (run.phase === "rest") { const l = lastLog(); run.nextCur = l ? { reps: l.reps, kg: l.kg, meters: l.meters } : null; }
  saveRun(); renderPlayer(); syncRun();
  toast(`${it.ejercicio}: ahora ${it.series} series`);
}
document.addEventListener("click", e => {
  const t = e.target.closest("button[data-addset],button[data-always]"); if (!t || !run) return;
  e.preventDefault(); e.stopPropagation();
  if (t.dataset.always) { fixOpen = true; saveExtra(t.dataset.always, +t.dataset.n); return; }
  const k = t.dataset.addset, l = run.log[k]; if (!l || !l.length) return;
  const [bi, ii] = k.split(".").map(Number), it = run.w.bloques[bi].items[ii];
  l.push({ ...l[l.length - 1] }); it.series = Math.max(it.series, l.length); run.steps = flatten(run.w);
  fixOpen = true; saveRun(); renderPlayer(); syncRun();
}, true);
