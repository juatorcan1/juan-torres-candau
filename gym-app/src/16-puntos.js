/* ---------- the duel score, day by day ----------
   Sport: +1 for a day with a session, −1 for a training day of the plan that passed without one.
   Food: +1 if the day went well, 0 if regular, −1 if badly (the dietitian's verdict of the day, or the
   average of the meals ticked). Alcohol: −1 for a day of binge drinking (BINGE UBE or more). */
const GRADE_PTS = { bien: 1, regular: 0, mal: -1 };
function dayDiet(who, date){
  const doc = mealDoc(who, date); if (!doc) return null;
  if (doc.dia && GRADE_PTS[doc.dia.v] != null) return doc.dia.v;
  const vals = Object.values(doc.m || {}).map(v => v.s === "si" ? 1 : v.s === "otro" ? (v.an ? GRADE_PTS[v.an.v] ?? 0 : 0) : null).filter(v => v != null);
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg >= 0.5 ? "bien" : avg <= -0.5 ? "mal" : "regular";
}
function dayScore(who, date){
  const trained = data().some(s => s.athlete === who && s.date === date);
  const plan = trainPlan(who), pd = planDay(plan, date);
  // a missed day only counts from when the plan was agreed (penalizaDesde), not for days it was drawn up after
  const planned = !!pd && pd.actividad !== "descanso" && !/opcional/i.test(pd.foco || "") && date >= ((plan && plan.penalizaDesde) || "");
  const sport = trained ? 1 : planned && date < todayISO() ? -1 : 0;
  const dv = dayDiet(who, date), diet = dv ? GRADE_PTS[dv] : 0;
  const dd = drk().find(d => d.athlete === who && d.date === date), ube = dd ? dayUbe(dd.counts) : 0;
  const alcohol = ube >= BINGE ? -1 : 0;
  return { sport, diet, alcohol, total: sport + diet + alcohol, trained, planned, dv, ube };
}
// the first day anything counts: the first session, meal, drink or plan day of either of them
function scoreStart(){
  const dates = [...data().map(s => s.date), ...mealLog.map(r => r.date), ...drk().map(d => d.date)];
  for (const k of KEYS) { const p = trainPlan(k); if (p && p.semanas && p.semanas[0] && p.semanas[0].dias[0]) dates.push(p.semanas[0].dias[0].fecha); }
  return dates.filter(Boolean).sort()[0] || todayISO();
}
function scoreIn(who, a, b){
  const out = { total: 0, sportDays: 0, missed: 0, goodFood: 0, badFood: 0, binge: 0 };
  const end = b < todayISO() ? b : todayISO(), start = a > scoreStart() ? a : scoreStart();
  for (let d = parseISO(start); toISO(d) <= end; d = addDays(d, 1)) {
    const s = dayScore(who, toISO(d));
    out.total += s.total;
    if (s.sport > 0) out.sportDays++; if (s.sport < 0) out.missed++;
    if (s.diet > 0) out.goodFood++; if (s.diet < 0) out.badFood++;
    if (s.alcohol < 0) out.binge++;
  }
  return out;
}
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
function scorePanelHTML(){
  const [a, b] = periodRange(period), J = scoreIn("juan", a, b), I = scoreIn("ignacio", a, b);
  const row = (l, kj, ki, pts) => `<tr><td>${l}</td><td class="n">${kj ? `${kj} <span class="muted">(${signed(kj * pts)})</span>` : "–"}</td><td class="n">${ki ? `${ki} <span class="muted">(${signed(ki * pts)})</span>` : "–"}</td></tr>`;
  return `<div class="panel">
    <div class="panel-head"><h2>Puntos ${PERIOD_IN[period]}</h2></div>
    <div class="tscroll"><table>
      <thead><tr><th></th><th class="n">Juan</th><th class="n">Ignacio</th></tr></thead>
      <tbody>
        ${row("Días de deporte", J.sportDays, I.sportDays, 1)}
        ${row("Días de plan sin entrenar", J.missed, I.missed, -1)}
        ${row("Días comiendo bien", J.goodFood, I.goodFood, 1)}
        ${row("Días comiendo mal", J.badFood, I.badFood, -1)}
        ${row(`Días con ${BINGE} UBE o más`, J.binge, I.binge, -1)}
        <tr><td><b>Total</b></td><td class="n ${J.total > I.total ? "win" : ""}"><b>${signed(J.total)}</b></td><td class="n ${I.total > J.total ? "win" : ""}"><b>${signed(I.total)}</b></td></tr>
      </tbody></table></div>
    <p class="note" style="margin:10px 0 0">Cada día: ir al deporte <b>+1</b>, faltar a un día de entreno del plan <b>−1</b> (los días de descanso no cuentan). Comer bien <b>+1</b>, regular <b>0</b>, mal <b>−1</b>: manda el veredicto del día del dietista; si no lo has pedido, sale de las comidas que marques. Un día de ${BINGE} UBE o más de alcohol, <b>−1</b>. Hoy solo resta cuando se acabe el día.</p>
  </div>`;
}
