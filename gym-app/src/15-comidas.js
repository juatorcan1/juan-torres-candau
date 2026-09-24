/* ---------- meal log: tick what you actually ate ----------
   comidas/<who>_<date> = { athlete, date, circ, m: { desayuno: { s: "si" | "otro" | "no", t, menu, an }, … }, dia }.
   Each meal of the menu gets "Comido", "Otra cosa" (with what it was) or "No lo comí". The other one's
   log is shown read-only, and the dietitian gets the last week of it. What was eaten instead of the
   menu is analysed by the dietitian (an), and the whole day can get a verdict too (dia). */
let mealLog = [];
const MEAL_STATES = [["si", "✓ Comido"], ["otro", "Otra cosa"], ["no", "No lo comí"]];
const MEAL_WORD = { si: "según el menú", otro: "otra cosa", no: "no lo comió" };
let shownMenu = {}; // the menu on screen per meal, saved with the tick
const mealDoc = (who, date) => mealLog.find(r => r.athlete === who && r.date === date) || null;
const mealsOf = (who, date) => (mealDoc(who, date) || {}).m || {};
const weekDate = i => toISO(addDays(mondayOf(today()), i));

const VWORD = { bien: "Bien", regular: "Regular", mal: "Mal" };
let mealBusy = {}, mealErr = {};
const rerender = () => { if (typing()) staleView = true; else renderView(); };

// write my day's document; on failure put back what was there and say so
async function saveMealDay(date, mutate){
  const id = `${me}_${date}`, before = mealDoc(me, date);
  const doc = { athlete: me, date, circ: (before && before.circ) || dCirc, m: {}, ...(before ? JSON.parse(JSON.stringify(before)) : {}) };
  delete doc.id;
  mutate(doc); doc.updatedAt = Date.now();
  mealLog = [...mealLog.filter(r => !(r.athlete === me && r.date === date)), { id, ...doc }];
  rerender();
  try { await db.doc(`comidas/${id}`).set(doc); return true; }
  catch {
    mealLog = [...mealLog.filter(r => !(r.athlete === me && r.date === date)), ...(before ? [before] : [])];
    rerender(); toast("No se ha podido guardar la comida"); return false;
  }
}
async function setMeal(date, k, patch){
  if (dbState !== "ready" || !me || date > todayISO()) return;
  const prev = mealsOf(me, date)[k] || {};
  const clear = patch.s && patch.s === prev.s && !("t" in patch); // tapping the same one again clears it
  const newText = "t" in patch && patch.t && patch.t !== prev.t;
  const ok = await saveMealDay(date, doc => {
    if (clear) { delete doc.m[k]; return; }
    const e = { ...prev, ...patch, menu: (shownMenu[k] || prev.menu || []).slice(0, 6) };
    if (e.s !== "otro" || newText || !e.t) delete e.an; // the verdict belongs to the text it was made for
    if (e.s !== "otro") delete e.t;
    doc.m[k] = e; doc.circ = dCirc;
  });
  if (patch.s === "otro" && !("t" in patch) && !clear) setTimeout(() => $(`.meal-other[data-meal-t="${k}"]`)?.focus(), 30);
  if (ok && newText) analyzeMeal(date, k);
}

/* the dietitian looks at a meal, or at the whole day, and gives a verdict */
function verdictOf(o){
  if (!o || typeof o !== "object") return null;
  return { kcal: clampN(o.kcal, 0, 6000) ?? null, prot: clampN(o.proteina_g, 0, 500) ?? null,
    v: VWORD[o.veredicto] ? o.veredicto : "regular", c: String(o.comentario || "").slice(0, 400) };
}
function dietIntro(){
  const { t } = targetsFor(me), pr = profileOf(me);
  return `Eres el dietista de ${ATH[me]} (hombre, ${pr.age} años, ${pr.height} cm, objetivo: ${GOALS[pr.goal].l.toLowerCase()}). Objetivo diario: ${t.kcal} kcal y ${t.prot} g de proteína. Hablas en español de España, de tú, directo y sin sermones, sin emojis.`;
}
const VERDICT_JSON = `Responde SOLO con JSON: {"kcal": n, "proteina_g": n, "veredicto": "bien"|"regular"|"mal", "comentario": str}`;
async function askVerdict(key, prompt){
  if (!sample || mealBusy[key]) return null;
  mealBusy[key] = true; mealErr[key] = ""; rerender();
  let out = null;
  try { out = verdictOf(await sample.json(prompt, { cache: false })); if (!out) mealErr[key] = "El dietista no ha contestado bien. Prueba otra vez."; }
  catch (e) { mealErr[key] = sampleMsg(e); if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sample = null; }
  mealBusy[key] = false; rerender();
  return out;
}
async function analyzeMeal(date, k){
  const e = mealsOf(me, date)[k]; if (!e || !e.t) return;
  const label = (MEALS.find(x => x[0] === k) || [k, k])[1];
  const out = await askVerdict(`${date}:${k}`, `${dietIntro()}
En ${label.toLowerCase()} del ${DIA[parseISO(date).getDay()]} ${date} (${(CIRCS[mealDoc(me, date)?.circ] || CIRCS[dCirc]).l}) ha comido: "${e.t}".
Lo que tenía en su menú: ${(e.menu || []).join("; ") || "nada concreto"}.
Estima las kcal y la proteína de lo que ha comido y di si encaja con su objetivo.
${VERDICT_JSON}
"comentario": como mucho 30 palabras: qué tal y, si hace falta, cómo compensarlo en el resto del día.`);
  const now = mealsOf(me, date)[k];
  if (out && now && now.t === e.t) await saveMealDay(date, doc => { doc.m[k].an = out; });
}
const daySig = m => JSON.stringify(MEALS.map(([k]) => m[k] ? [m[k].s, m[k].t || ""] : 0));
async function dayVerdict(date){
  const m = mealsOf(me, date), al = alcoholIn(drk(), me, date, date);
  const lines = MEALS.map(([k, l]) => { const e = m[k];
    return `- ${l}: ${!e ? "sin apuntar" : e.s === "si" ? `según el menú (${(e.menu || []).join("; ")})` : e.s === "no" ? "no lo comió" : `otra cosa: "${e.t || "sin detallar"}"`}`; });
  const out = await askVerdict(`${date}:dia`, `${dietIntro()}
Esto es lo que ha apuntado que comió el ${DIA[parseISO(date).getDay()]} ${date}${date === todayISO() ? " (el día todavía no ha terminado)" : ""}:
${lines.join("\n")}
Alcohol ese día: ${fmt(al.ube, 1)} UBE (${fmt(al.kcal)} kcal).
Estima el total del día y da tu veredicto.
${VERDICT_JSON}
"comentario": como mucho 50 palabras: qué tal ha ido${date === todayISO() ? " y qué comer en lo que queda de día para cuadrarlo" : " y qué cambiar mañana"}.`);
  if (out) await saveMealDay(date, doc => { doc.dia = { ...out, firma: daySig(doc.m), at: Date.now() }; });
}
function verdictHTML(an){
  return `<div class="meal-an v-${an.v}"><span class="pill ${an.v === "bien" ? "ok" : an.v === "mal" ? "over" : "warn"}">${VWORD[an.v]}</span>
    ${an.kcal != null ? `<b>~${fmt(an.kcal)} kcal</b>${an.prot != null ? ` · ${fmt(an.prot)} g de proteína` : ""}` : ""}${an.c ? `<div>${esc(an.c)}</div>` : ""}</div>`;
}
function mealControls(k, date, who){
  if (date > todayISO()) return "";
  const st = mealsOf(who, date)[k], key = `${date}:${k}`;
  const an = st && st.an ? verdictHTML(st.an) : "";
  if (who !== me) return st ? `<div class="meal-seen ${st.s}">${ATH[who]}: ${esc(MEAL_WORD[st.s])}${st.t ? ` (${esc(st.t)})` : ""}</div>${an}` : "";
  return `<div class="meal-log" role="group" aria-label="¿Te lo has comido?">${MEAL_STATES.map(([s, l]) => `<button type="button" class="${s}" data-meal="${k}" data-date="${date}" data-s="${s}" aria-pressed="${st ? st.s === s : false}">${l}</button>`).join("")}</div>
    ${st && st.s === "otro" ? `<div class="meal-other-row"><input class="meal-other" data-meal-t="${k}" data-date="${date}" value="${esc(st.t || "")}" placeholder="¿Qué has comido?" aria-label="Qué has comido" enterkeyhint="done">
      <button type="button" class="btn sm primary" data-meal-save="${k}" data-date="${date}">${st.t ? "Cambiar" : "Guardar"}</button></div>
      ${mealBusy[key] ? `<div class="thinking"><span class="spin"></span>Tu dietista lo está mirando…</div>` : an || (st.t && sample ? `<button type="button" class="linkbtn" data-meal-an="${k}" data-date="${date}">Que lo valore el dietista</button>` : "")}
      ${mealErr[key] ? `<div class="err">${esc(mealErr[key])}</div>` : ""}` : ""}`;
}
const mealClass = (k, date, who) => { const st = mealsOf(who, date)[k]; return st ? "st-" + st.s : ""; };
function mealCount(who, dates){
  const c = { si: 0, otro: 0, no: 0 };
  for (const d of dates) for (const v of Object.values(mealsOf(who, d))) if (c[v.s] != null) c[v.s]++;
  return c;
}
// "Hoy: 2 según el menú, 1 otra cosa, 2 sin comer" and how the week compares with the rival
function mealSummaryHTML(who, date){
  if (date > todayISO()) return "";
  const d = mealCount(who, [date]), n = d.si + d.otro + d.no;
  const week = Array.from({ length: 7 }, (_, i) => weekDate(i)).filter(x => x <= todayISO());
  const a = mealCount(who, week), b = mealCount(OTHER[who], week);
  const part = c => [c.si ? `${c.si} según el menú` : "", c.otro ? `${c.otro} otra cosa` : "", c.no ? `${c.no} sin comer` : ""].filter(Boolean).join(", ") || "nada apuntado";
  return `<div class="meal-sum"><div><b>${date === todayISO() ? "Hoy" : DAYS_LONG[(parseISO(date).getDay() + 6) % 7]}:</b> ${esc(part(d))}${n < MEALS.length && who === me ? ` · <span class="muted">${MEALS.length - n} sin apuntar</span>` : ""}</div>
    <div class="muted">Esta semana según el menú: <i class="dot ${who}"></i> ${ATH[who]} ${a.si} · <i class="dot ${OTHER[who]}"></i> ${ATH[OTHER[who]]} ${b.si}</div>
    ${dayVerdictHTML(who, date, n)}</div>`;
}
function dayVerdictHTML(who, date, n){
  const doc = mealDoc(who, date), dia = doc && doc.dia, key = `${date}:dia`, own = who === me;
  const stale = dia && doc && dia.firma !== daySig(doc.m);
  const btn = own && n && sample ? `<button type="button" class="btn sm" data-meal-day="${date}">${dia ? "Actualizar el veredicto" : "Veredicto del día"}</button>` : "";
  return `<div class="day-verdict">
    ${dia ? `<div class="eyebrow">Veredicto del dietista${stale ? " · has apuntado más cosas desde entonces" : ""}</div>${verdictHTML(dia)}` : ""}
    ${mealBusy[key] ? `<div class="thinking"><span class="spin"></span>Tu dietista está mirando el día…</div>` : !dia || stale ? btn : ""}
    ${mealErr[key] ? `<div class="err">${esc(mealErr[key])}</div>` : ""}</div>`;
}
// Duel score for eating well: 1 point per meal eaten as planned or judged "bien" by the dietitian,
// half for "regular" (or not judged yet), none for "mal" or skipped; the day's verdict adds 1 / 0.5.
function dietPoints(who, a, b){
  let p = 0;
  const val = an => an ? (an.v === "bien" ? 1 : an.v === "regular" ? 0.5 : 0) : 0.5;
  for (const r of mealLog) if (r.athlete === who && r.date >= a && r.date <= b) {
    for (const v of Object.values(r.m || {})) p += v.s === "si" ? 1 : v.s === "otro" ? val(v.an) : 0;
    if (r.dia) p += r.dia.v === "bien" ? 1 : r.dia.v === "regular" ? 0.5 : 0;
  }
  return p;
}
// the last week for the dietitian
function mealLogText(who){
  const lines = [];
  for (let i = 6; i >= 0; i--) {
    const d = toISO(addDays(today(), -i)), doc = mealDoc(who, d); if (!doc) continue;
    const parts = MEALS.map(([k, l]) => { const v = doc.m[k]; return v ? `${l.toLowerCase()} ${MEAL_WORD[v.s]}${v.t ? ` (${v.t}${v.an && v.an.kcal ? `, unas ${v.an.kcal} kcal` : ""})` : ""}` : ""; }).filter(Boolean);
    if (parts.length) lines.push(`${d} (${(CIRCS[doc.circ] || {}).l || ""}): ${parts.join("; ")}`);
  }
  return lines.join("\n");
}

document.addEventListener("click", e => {
  const t = e.target.closest("button[data-meal],button[data-meal-save],button[data-meal-an],button[data-meal-day]"); if (!t) return;
  const d = t.dataset.date;
  if (t.dataset.meal) setMeal(d, t.dataset.meal, { s: t.dataset.s });
  else if (t.dataset.mealSave) { const k = t.dataset.mealSave, inp = $(`.meal-other[data-meal-t="${k}"]`); if (inp) setMeal(d, k, { s: "otro", t: inp.value.trim().slice(0, 160) }); }
  else if (t.dataset.mealAn) analyzeMeal(d, t.dataset.mealAn);
  else if (t.dataset.mealDay) dayVerdict(d || todayISO());
});
document.addEventListener("change", e => {
  const t = e.target.closest(".meal-other"); if (!t) return;
  setMeal(t.dataset.date, t.dataset.mealT, { s: "otro", t: t.value.trim().slice(0, 160) });
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches(".meal-other")) e.target.blur(); });
