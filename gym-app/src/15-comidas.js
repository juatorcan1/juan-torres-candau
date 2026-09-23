/* ---------- meal log: tick what you actually ate ----------
   comidas/<who>_<date> = { athlete, date, circ, m: { desayuno: { s: "si" | "otro" | "no", t, menu }, … } }.
   Each meal of the menu gets "Comido", "Otra cosa" (with what it was) or "No lo comí". The other one's
   log is shown read-only, and the dietitian gets the last week of it. */
let mealLog = [];
const MEAL_STATES = [["si", "✓ Comido"], ["otro", "Otra cosa"], ["no", "No lo comí"]];
const MEAL_WORD = { si: "según el menú", otro: "otra cosa", no: "no lo comió" };
let shownMenu = {}; // the menu on screen per meal, saved with the tick
const mealDoc = (who, date) => mealLog.find(r => r.athlete === who && r.date === date) || null;
const mealsOf = (who, date) => (mealDoc(who, date) || {}).m || {};
const weekDate = i => toISO(addDays(mondayOf(today()), i));

async function setMeal(date, k, patch){
  if (dbState !== "ready" || !me || date > todayISO()) return;
  const m = { ...mealsOf(me, date) }, prev = m[k] || {};
  if (patch.s && patch.s === prev.s && !("t" in patch)) delete m[k]; // tapping the same one again clears it
  else m[k] = { ...prev, ...patch, menu: (shownMenu[k] || prev.menu || []).slice(0, 6) };
  const id = `${me}_${date}`, doc = { athlete: me, date, circ: dCirc, m, updatedAt: Date.now() };
  mealLog = [...mealLog.filter(r => !(r.athlete === me && r.date === date)), { id, ...doc }];
  renderView();
  if (patch.s === "otro" && !patch.t) setTimeout(() => $(`.meal-other[data-meal-t="${k}"]`)?.focus(), 30);
  try { await db.doc(`comidas/${id}`).set(doc); } catch { toast("No se ha podido guardar la comida"); }
}
function mealControls(k, date, who){
  if (date > todayISO()) return "";
  const st = mealsOf(who, date)[k];
  if (who !== me) return st ? `<div class="meal-seen ${st.s}">${ATH[who]}: ${esc(MEAL_WORD[st.s])}${st.t ? ` (${esc(st.t)})` : ""}</div>` : "";
  return `<div class="meal-log" role="group" aria-label="¿Te lo has comido?">${MEAL_STATES.map(([s, l]) => `<button type="button" class="${s}" data-meal="${k}" data-date="${date}" data-s="${s}" aria-pressed="${st ? st.s === s : false}">${l}</button>`).join("")}</div>
    ${st && st.s === "otro" ? `<input class="meal-other" data-meal-t="${k}" data-date="${date}" value="${esc(st.t || "")}" placeholder="¿Qué has comido? (opcional)" aria-label="Qué has comido">` : ""}`;
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
    <div class="muted">Esta semana según el menú: <i class="dot ${who}"></i> ${ATH[who]} ${a.si} · <i class="dot ${OTHER[who]}"></i> ${ATH[OTHER[who]]} ${b.si}</div></div>`;
}
// the last week for the dietitian
function mealLogText(who){
  const lines = [];
  for (let i = 6; i >= 0; i--) {
    const d = toISO(addDays(today(), -i)), doc = mealDoc(who, d); if (!doc) continue;
    const parts = MEALS.map(([k, l]) => { const v = doc.m[k]; return v ? `${l.toLowerCase()} ${MEAL_WORD[v.s]}${v.t ? ` (${v.t})` : ""}` : ""; }).filter(Boolean);
    if (parts.length) lines.push(`${d} (${(CIRCS[doc.circ] || {}).l || ""}): ${parts.join("; ")}`);
  }
  return lines.join("\n");
}

document.addEventListener("click", e => {
  const t = e.target.closest("button[data-meal]"); if (!t) return;
  setMeal(t.dataset.date, t.dataset.meal, { s: t.dataset.s });
});
document.addEventListener("change", e => {
  const t = e.target.closest(".meal-other"); if (!t) return;
  setMeal(t.dataset.date, t.dataset.mealT, { s: "otro", t: t.value.trim().slice(0, 120) });
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches(".meal-other")) e.target.blur(); });
