/* ---------- "este ejercicio no me gusta": swap it for another that works the same muscle ----------
   Alternatives come from the exercise library, ranked by the muscles they share with the original
   (main muscle first), or from the coach. Disliked exercises live in the athlete's profile
   (perfiles/<who>.noGusta) and are replaced on their own whenever a workout opens. */
const SWIM = ["Crol", "Espalda", "Braza", "Mariposa", "Patada con tabla", "Pull buoy"];
const CARDIO = ["Carrera en cinta", "Bici", "Elíptica", "Remo ergómetro", "Comba", "Caminar en cinta inclinada"];
const TIMED = new Set(["Plancha", "Mountain climbers"]);
const BODYWEIGHT = new Set(["Dominadas", "Fondos", "Flexiones", "Remo invertido", "Mountain climbers", "Sentadilla sin peso", "Pike push-up", "Burpee",
  "Puente de glúteo", "Fondos en banco", "Plancha", "Crunch", "Elevación de piernas", "Zancadas", "Sentadilla búlgara", "Gemelos"]);
let swap = null; // the open "Cambiar" sheet: { bi, ii, list, ai, aiErr, dislike }

const dislikes = (who = me) => { const l = profiles[who] && profiles[who].noGusta; return Array.isArray(l) ? l.map(String) : []; };
const isDisliked = (name, who = me) => dislikes(who).some(n => normName(n) === normName(name));
async function updateDislikes({ add = [], remove = [] }){
  if (dbState !== "ready" || !me) return false;
  const drop = new Set([...add, ...remove].map(normName));
  const next = [...dislikes().filter(n => !drop.has(normName(n))), ...add.map(canonicalName)].slice(-40);
  const doc = { ...profileDoc(me), noGusta: next, updatedAt: Date.now() };
  profiles[me] = { id: me, ...doc };
  try { await db.doc("perfiles/" + me).set(doc); return true; }
  catch { toast("No se ha podido guardar"); return false; }
}

/* the alternatives */
const bodyweightOnly = w => w.tipo === "calistenia" || (ck && ck.date === todayISO() && (ck.lugar === "casa" || ck.lugar === "parque"));
const kindOf = it => it.modo === "distancia" || SWIM.includes(it.ejercicio) ? "swim" : CARDIO.includes(canonicalName(it.ejercicio)) ? "cardio" : "fuerza";
function convertItem(item, name){
  const base = { ...item, ejercicio: name, musculos: [], reto: "", indicacion: "" };
  if (TIMED.has(name)) return { ...base, modo: "tiempo", segundos: item.modo === "tiempo" ? item.segundos : 45, reps: null, kg: null, metros: null };
  const best = bestFor(me, name).b, bw = BODYWEIGHT.has(name);
  return { ...base, modo: "reps", reps: item.modo === "reps" ? item.reps : 12, kg: best ? best.kg : bw ? 0 : item.modo === "reps" ? item.kg : 0, segundos: null, metros: null,
    indicacion: best ? `Tu mejor aquí: ${best.kg ? fmt(best.kg, 2) + " kg × " : ""}${best.reps}` : bw ? "" : "Primera vez: ajusta el peso para que las últimas repeticiones cuesten." };
}
function alternativesFor(item, w, n = 6){
  const name = canonicalName(item.ejercicio), kind = kindOf(item), ok = c => normName(c) !== normName(name) && !isDisliked(c);
  const opt = (c, why, it) => ({ name: c, why, item: it });
  if (kind === "swim") return SWIM.filter(ok).slice(0, n).map(c => opt(c, musNames(musclesOf(c).main), { ...item, ejercicio: c, musculos: [], reto: "" }));
  if (kind === "cardio") return CARDIO.filter(ok).slice(0, n).map(c => opt(c, musNames(musclesOf(c).main), { ...item, ejercicio: c, musculos: [], reto: "", indicacion: "Ritmo como el previsto." }));
  const mu = musclesOf(item), bw = bodyweightOnly(w), used = new Set(w.bloques.flatMap(b => b.items).map(x => normName(x.ejercicio)));
  const pool = [...new Set([...Object.keys(GUIDE), ...Object.keys(EX_MUS)])].filter(c => !SWIM.includes(c) && !CARDIO.includes(c) && ok(c) && (!bw || BODYWEIGHT.has(c)));
  return pool.map(c => {
    const m = musclesOf(c), shared = m.main.filter(k => mu.main.includes(k));
    if (!shared.length) return null;
    const s = shared.length * 3 + (m.main[0] === mu.main[0] ? 2 : 0) + m.help.filter(k => mu.help.includes(k)).length
      - m.main.filter(k => !mu.main.includes(k)).length - (used.has(normName(c)) ? 4 : 0) + (GUIDE[c] ? 1 : 0);
    return { c, s, shared };
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, n).map(({ c, shared }) => opt(c, musNames(shared), convertItem(item, c)));
}

/* disliked exercises are replaced before the workout starts */
function autoSwap(w){
  const copy = JSON.parse(JSON.stringify(w)), swapped = [];
  for (const b of copy.bloques) b.items.forEach((it, i) => {
    if (!isDisliked(it.ejercicio)) return;
    const alt = alternativesFor(it, copy, 1)[0];
    if (alt) { swapped.push([it.ejercicio, alt.name]); b.items[i] = { ...alt.item, series: it.series, descanso_s: it.descanso_s }; }
  });
  return { w: copy, swapped };
}

/* replacing an item of the running workout; sets already done stay with the old exercise */
function applySwap(bi, ii, item){
  const items = run.w.bloques[bi].items, old = items[ii], done = (run.log[bi + "." + ii] || []).length;
  if (!done) items[ii] = { ...item, series: old.series };
  else {
    items.splice(ii, 1, { ...old, series: done }, { ...item, series: Math.max(1, old.series - done) });
    const log = {};
    for (const [k, v] of Object.entries(run.log)) { const [b, i] = k.split(".").map(Number); log[b === bi && i > ii ? b + "." + (i + 1) : k] = v; }
    run.log = log;
  }
  run.steps = flatten(run.w);
  if (done) { const at = run.steps.findIndex(s => s.bi === bi && s.ii === ii && s.s === done); run.i = run.phase === "rest" ? at : at + 1; }
  const st = run.steps[run.i];
  if (run.phase === "set" && st && st.bi === bi && st.ii === (done ? ii + 1 : ii)) { const it = itemOf(st); run.cur = { reps: it.reps, kg: it.kg, secs: it.segundos, meters: it.metros }; }
}

/* the sheet */
function openSwap(bi, ii){
  const it = run && run.w.bloques[bi] && run.w.bloques[bi].items[ii]; if (!it) return;
  swap = { bi, ii, list: alternativesFor(it, run.w), ai: null, aiErr: "", dislike: isDisliked(it.ejercicio) };
  renderPlayer();
}
function swapSheetHTML(){
  if (!swap || !run) return "";
  const it = run.w.bloques[swap.bi].items[swap.ii], mu = musclesOf(it);
  const opt = (o, i, src) => `<div class="swap-opt">${figMini(o.name)}
      <button type="button" class="swap-pick" data-swap-pick="${src}:${i}"><span class="mus-chip">${esc(o.why)}</span><b>${esc(o.name)}</b><small>${esc(o.item.series + " × " + target(o.item))}</small></button></div>`;
  return `<div class="swap-back" data-swap="close"></div>
  <div class="swap-sheet" role="dialog" aria-modal="true" aria-labelledby="swap-t">
    <div class="swap-h"><div><div class="eyebrow">Cambiar ejercicio</div><b id="swap-t">${esc(it.ejercicio)}</b>${mu.main.length ? `<div class="muted" style="font-size:13px">Otros que trabajan ${esc(musNames(mu.main).toLowerCase())}</div>` : ""}</div>
      <button type="button" class="btn sm ghost" data-swap="close" aria-label="Cerrar">✕</button></div>
    <label class="swap-dis"><input type="checkbox" id="swap-dis" ${swap.dislike ? "checked" : ""}> No me gusta: no me lo vuelvas a poner</label>
    <div class="swap-list">${swap.list.length ? swap.list.map((o, i) => opt(o, i, "l")).join("") : `<p class="muted" style="margin:0">No tengo otro parecido en la lista: pídeselo a tu entrenador.</p>`}</div>
    ${Array.isArray(swap.ai) ? `<div class="eyebrow">Tu entrenador propone</div><div class="swap-list">${swap.ai.map((o, i) => opt(o, i, "a")).join("")}</div>` : ""}
    ${swap.ai === "loading" ? `<div class="thinking"><span class="spin"></span>Tu entrenador lo está pensando…</div>`
      : Array.isArray(swap.ai) ? "" : `<button type="button" class="btn" data-swap="ai" ${sample ? "" : "disabled"}>Pídeselo al entrenador</button>`}
    ${swap.aiErr ? `<div class="err" role="alert">${esc(swap.aiErr)}</div>` : ""}
  </div>`;
}
async function pickSwap(src, i){
  const o = (src === "a" ? swap.ai : swap.list)[i]; if (!o) return;
  const old = run.w.bloques[swap.bi].items[swap.ii].ejercicio, dis = swap.dislike;
  applySwap(swap.bi, swap.ii, o.item);
  swap = null; saveRun(); renderPlayer();
  if (dis !== isDisliked(old)) {
    const okSaved = await updateDislikes(dis ? { add: [old] } : { remove: [old] });
    toast(okSaved && dis ? `Cambiado. ${old} no te vuelve a salir` : `Cambiado por ${o.name}`);
  } else toast(`Cambiado por ${o.name}`);
}
async function askCoachSwap(){
  const s = swap, it = run.w.bloques[s.bi].items[s.ii], mu = musclesOf(it);
  s.ai = "loading"; s.aiErr = ""; renderPlayer();
  const prompt = `Eres el entrenador personal de ${ATH[me]}. En su entreno "${run.w.titulo}" quiere cambiar "${it.ejercicio}" (${it.series} × ${target(it)}), que trabaja ${musNames(mu.main).toLowerCase() || "?"}${mu.help.length ? " y ayuda " + musNames(mu.help).toLowerCase() : ""}, porque no le gusta o le cuesta.
Lugar: ${bodyweightOnly(run.w) ? "sin material, con su propio peso" : "gimnasio con máquinas, poleas, barras y mancuernas"}.
Resto del entreno de hoy: ${run.w.bloques.flatMap(b => b.items).map(x => x.ejercicio).filter(n => n !== it.ejercicio).join(", ") || "nada más"}.
No le gustan: ${dislikes().join(", ") || "nada apuntado"}.
Propón 3 alternativas distintas entre sí que trabajen el mismo músculo principal (o casi), con series, repeticiones y un peso prudente para él.
Responde SOLO con JSON: {"opciones": [ITEM, ITEM, ITEM]}
ITEM = {"ejercicio": str, "musculos": [clave], "modo": "reps"|"tiempo"|"distancia", "series": n, "reps": n?, "kg": n?, "segundos": n?, "metros": n?, "descanso_s": n, "indicacion": str}
Claves de músculos: ${Object.keys(MUSCLES).join(", ")}. Usa estos nombres cuando encajen (tienen dibujo): ${Object.keys(GUIDE).join(", ")}.
Datos de ${ATH[me]}:
${athleteContext(me)}`;
  try {
    const o = await sample.json(prompt, { cache: false });
    const w = normalizeWorkout({ bloques: [{ nombre: "Opciones", items: Array.isArray(o && o.opciones) ? o.opciones : [] }] });
    if (swap !== s) return;
    const list = w ? w.bloques[0].items.filter(x => normName(x.ejercicio) !== normName(it.ejercicio)).slice(0, 4) : [];
    s.ai = list.length ? list.map(x => ({ name: x.ejercicio, why: musNames(musclesOf(x).main), item: x })) : null;
    if (!list.length) s.aiErr = "No ha propuesto nada útil. Prueba otra vez.";
  } catch (e) {
    if (swap !== s) return;
    s.ai = null; s.aiErr = sampleMsg(e);
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sample = null;
  }
  if (run && swap === s) renderPlayer();
}

/* the list of disliked exercises, to take one back */
function dislikesHTML(){
  const l = dislikes(); if (!l.length) return "";
  return `<div class="panel"><div class="panel-head" style="margin-bottom:6px"><h2>No te gustan</h2></div>
    <p class="muted" style="margin:0 0 10px;font-size:13.5px">No te los pongo en ningún entreno: se cambian solos por otro del mismo músculo. Toca uno para volver a aceptarlo.</p>
    <div class="chips">${l.map(n => `<button type="button" data-undislike="${esc(n)}" aria-label="Volver a aceptar ${esc(n)}">${esc(n)} ✕</button>`).join("")}</div></div>`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-swap-item],[data-swap],[data-swap-pick],[data-undislike]"); if (!t) return;
  if (t.dataset.swapItem && run) { const [bi, ii] = t.dataset.swapItem.split(".").map(Number); openSwap(bi, ii); }
  else if (t.dataset.swap === "close") { swap = null; renderPlayer(); }
  else if (t.dataset.swap === "ai" && swap) askCoachSwap();
  else if (t.dataset.swapPick && swap) { const [src, i] = t.dataset.swapPick.split(":"); pickSwap(src, +i); }
  else if (t.dataset.undislike) { if (await updateDislikes({ remove: [t.dataset.undislike] })) { toast(`${t.dataset.undislike} vuelve a salir`); if (tab === "plan") renderPlan(); } }
});
document.addEventListener("change", e => { if (e.target.id === "swap-dis" && swap) swap.dislike = e.target.checked; });
document.addEventListener("keydown", e => { if (e.key === "Escape" && swap) { swap = null; renderPlayer(); } });
