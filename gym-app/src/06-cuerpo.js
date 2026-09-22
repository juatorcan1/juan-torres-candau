/* ---------- Peso y alcohol ---------- */
let bDate = toISO(today());
let bPending = {};           // bebidas/<id> -> counts not yet confirmed by the store
let bTimer = {};
let cBusy = false, cCtl = null, cText = "", cErr = "";

function lastWeekday(target){ // 5 = sábado, 4 = viernes (0 = lunes)
  const t = today(); const wd = (t.getDay() + 6) % 7; let back = wd - target; if (back <= 0) back += 7; return toISO(addDays(t, -back));
}
function drinkDoc(who, date){
  const id = `${who}_${date}`;
  if (bPending[id]) return { id, counts: bPending[id] };
  const d = drk().find(x => x.athlete === who && x.date === date);
  return { id, counts: (d && d.counts) || {} };
}
function bodyCard(k){
  const w = latestWeight(wts(), k), s = weightSeries(wts(), k);
  const prev = s.length > 1 ? s[s.length - 2] : null, first = s[0];
  const wk = periodRange("semana"), al = alcoholIn(drk(), k, ...wk), goal = num(profileOf(k).alcoholGoal) || 7, st = alcoholStatus(al.ube, goal);
  const d = (a, b) => { const x = a - b; return (x > 0 ? "+" : x < 0 ? "−" : "±") + fmt(Math.abs(x), 1) + " kg"; };
  return `<div class="bc">
    <div class="who"><i class="dot ${k}"></i>${ATH[k]}${me === k ? ' <span class="chip">tú</span>' : ""}</div>
    <div class="kg">${w ? fmt(w.kg, 1) : "–"}<small> kg</small></div>
    <div class="delta">${w && prev ? `${d(w.kg, prev.kg)} desde el ${shortDate(parseISO(prev.date))}` : "Sin pesaje anterior"}${w && first && first !== w ? ` · ${d(w.kg, first.kg)} desde el inicio` : ""}</div>
    <div class="row"><span>Alcohol esta semana</span><b class="num">${fmt(al.ube, 1)} / ${fmt(goal)} UBE</b></div>
    <div class="row"><span class="pill ${st.cls}">${st.t}</span><span class="muted" style="font-size:12.5px">${fmt(al.kcal)} kcal ≈ ${fmt(al.kcal / 11)} min de cinta</span></div>
    ${al.over || al.binge ? `<div class="row" style="font-size:12.5px;color:var(--ink-2)">${al.over ? `${al.over} día${al.over > 1 ? "s" : ""} por encima de ${DAILY_LOW_RISK} UBE` : ""}${al.binge ? ` · ${al.binge} de consumo intensivo (≥ ${BINGE} UBE)` : ""}</div>` : ""}
  </div>`;
}
function renderCuerpo(){
  const v = $("#view-cuerpo");
  const dd = me ? drinkDoc(me, bDate) : null;
  const dU = dd ? dayUbe(dd.counts) : 0, dK = dd ? dayKcal(dd.counts) : 0;
  const weeks = []; const m0 = mondayOf(today());
  for (let i = 7; i >= 0; i--) { const s = addDays(m0, -7 * i); weeks.push([toISO(s), toISO(addDays(s, 6)), s]); }
  const myW = me ? weightSeries(wts(), me).slice(-6).reverse() : [];
  v.innerHTML = `<div style="display:grid;gap:18px">
    ${demoBanner("wd") || demoBanner("w") || demoBanner("d")}
    <div class="panel">
      <div class="panel-head"><h2>Cómo vais esta semana</h2>
        ${sample ? `<button type="button" class="btn sm" data-act="c-ask" ${cBusy ? "disabled" : ""}>Pedir valoración a Claude</button>` : ""}</div>
      <div class="body-cmp">${bodyCard("juan")}${bodyCard("ignacio")}</div>
      ${cBusy || cText || cErr ? `<div style="margin-top:14px">${cBusy && !cText ? `<div class="thinking"><span class="spin"></span>Pensando…</div>` : ""}${cText ? `<div class="comment"><span class="by">Claude dice</span>${esc(cText)}</div>` : ""}${cErr ? `<div class="err">${esc(cErr)}</div>` : ""}${cBusy ? `<div style="margin-top:8px"><button type="button" class="btn sm ghost" data-act="c-stop">Parar</button></div>` : ""}</div>` : ""}
      <p class="note" style="margin:12px 0 0">1 UBE = 10 g de alcohol (una caña o una copa de vino; un cubata son 2). Referencia de Sanidad para hombres: consumo de bajo riesgo hasta ${DAILY_LOW_RISK} UBE al día, y ${BINGE} UBE o más en una ocasión es consumo intensivo. Para rendir y bajar peso, cuanto menos, mejor.</p>
    </div>

    ${me ? `<div class="grid2">
      <div class="panel">
        <div class="panel-head"><h2>Apunta tu peso</h2><span class="muted" style="font-size:13px">Mejor en ayunas, el mismo día cada semana</span></div>
        <form id="wform" novalidate style="gap:12px">
          <div class="fgrid">
            <div class="f"><label for="w-date">Fecha</label><input id="w-date" data-keep type="date" value="${esc(keep("w-date", toISO(today())))}"></div>
            <div class="f"><label for="w-kg">Peso <small>kg</small></label><input id="w-kg" data-keep type="number" inputmode="decimal" step="0.1" min="30" max="250" value="${esc(keep("w-kg"))}"></div>
            <div class="f"><label for="w-waist">Cintura <small>cm, opcional</small></label><input id="w-waist" data-keep type="number" inputmode="decimal" step="0.5" min="40" max="200" value="${esc(keep("w-waist"))}"></div>
            <div class="f"><label for="w-fat">Grasa <small>%, opcional</small></label><input id="w-fat" data-keep type="number" inputmode="decimal" step="0.1" min="3" max="60" value="${esc(keep("w-fat"))}"></div>
          </div>
          <div class="row-btns"><button type="submit" class="btn primary" ${dbState === "ready" ? "" : "disabled"}>Guardar peso</button></div>
        </form>
        ${myW.length ? `<div class="tscroll" style="margin-top:12px"><table><thead><tr><th>Tus últimos pesajes</th><th class="n">Kg</th><th class="n">Cintura</th><th></th></tr></thead><tbody>${myW.map(w => `<tr><td>${shortDate(parseISO(w.date))}</td><td class="n">${fmt(w.kg, 1)}</td><td class="n">${w.waist ? fmt(w.waist) + " cm" : "–"}</td><td class="n">${!w.demo && dbState === "ready" ? `<button type="button" class="btn sm ghost" data-act="w-del" data-id="${esc(w.id)}">Borrar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Tu alcohol</h2><span class="pill ${dU > DAILY_LOW_RISK ? (dU >= BINGE ? "over" : "warn") : dU ? "ok" : "neutral"}">${fmt(dU, 1)} UBE · ${fmt(dK)} kcal</span></div>
        <div class="datebar" style="margin-bottom:12px">
          <div class="chips" role="group" aria-label="Día">
            ${[["Hoy", toISO(today())], ["Ayer", toISO(addDays(today(), -1))], ["Viernes", lastWeekday(4)], ["Sábado", lastWeekday(5)], ["Domingo", lastWeekday(6)]]
              .filter((x, i, arr) => arr.findIndex(y => y[1] === x[1]) === i)
              .map(([l, d]) => `<button type="button" data-bdate="${d}" aria-pressed="${bDate === d}">${l}</button>`).join("")}
          </div>
          <input id="b-date" type="date" value="${bDate}" max="${toISO(today())}" aria-label="Otro día">
        </div>
        <div class="drinks">${Object.entries(DRINKS).map(([k, d]) => { const n = num(dd.counts[k]); return `<div class="drink ${n ? "has" : ""}">
          <div><div class="n">${d.l}</div><div class="m">${d.m} · ${fmt(d.ube, 1)} UBE</div></div>
          <div class="ctl"><button type="button" data-drink="${k}" data-d="-1" aria-label="Quitar ${d.l}" ${n ? "" : "disabled"}>−</button><span class="c">${n}</span><button type="button" class="plus" data-drink="${k}" data-d="1" aria-label="Añadir ${d.l}" ${dbState === "ready" ? "" : "disabled"}>+</button></div>
        </div>`; }).join("")}</div>
        <p class="note" style="margin:10px 0 0">Cada toque se guarda solo. Para el finde entero es más rápido contárselo a Claude en <b>Apuntar</b>.</p>
      </div>
    </div>` : `<div class="panel"><p style="margin:0">Elige quién eres en <b>Apuntar</b> para registrar tu peso y el alcohol.</p></div>`}

    <div class="panel">
      <div class="panel-head"><h2>Evolución del peso</h2><div class="legend"><span><i class="dot juan"></i>Juan</span><span><i class="dot ignacio"></i>Ignacio</span></div></div>
      <div id="wchart"></div>
      <details class="tbl"><summary>Ver como tabla</summary><div class="tscroll" id="wchart-table"></div></details>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Alcohol por semana</h2><span class="muted" style="font-size:13px">● = quien menos ha bebido</span></div>
      <div class="tscroll"><table><thead><tr><th>Semana</th><th class="n">Juan</th><th class="n">Ignacio</th><th class="n">kcal Juan</th><th class="n">kcal Ignacio</th></tr></thead><tbody>
        ${weeks.slice().reverse().map(([a, b, s]) => { const j = alcoholIn(drk(), "juan", a, b), i = alcoholIn(drk(), "ignacio", a, b);
          return `<tr><td>${a === weeks[weeks.length - 1][0] ? "Esta semana" : shortDate(s)}</td><td class="n ${j.ube < i.ube ? "win" : ""}">${fmt(j.ube, 1)} UBE</td><td class="n ${i.ube < j.ube ? "win" : ""}">${fmt(i.ube, 1)} UBE</td><td class="n">${fmt(j.kcal)}</td><td class="n">${fmt(i.kcal)}</td></tr>`; }).join("")}
      </tbody></table></div>
    </div>
  </div>`;
  renderWChart();
}
function renderWChart(){
  const host = $("#wchart"); if (!host) return;
  const start = addDays(mondayOf(today()), -7 * 11), a = toISO(start), end = today();
  const S = {}; for (const k of KEYS) S[k] = weightSeries(wts(), k).filter(w => w.date >= a);
  const all = KEYS.flatMap(k => S[k].map(w => w.kg));
  if (!all.length) { host.innerHTML = `<div class="empty">Aún no hay pesajes.</div>`; $("#wchart-table").innerHTML = ""; return; }
  const W = Math.max(300, Math.round(host.clientWidth || 640)), H = 220, M = { l: 40, r: 58, t: 14, b: 26 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  let lo = Math.floor(Math.min(...all) - 0.5), hi = Math.ceil(Math.max(...all) + 0.5);
  const step = hi - lo > 12 ? 5 : hi - lo > 6 ? 2 : 1; lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const span = end - start || 1;
  const x = d => M.l + (parseISO(d) - start) / span * iw, y = v => M.t + ih - (v - lo) / (hi - lo) * ih;
  let g = "";
  for (let v = lo; v <= hi + 1e-9; v += step) g += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  for (let i = 0; i <= 11; i += 2) { const d = addDays(start, 7 * i); g += `<text class="axis" x="${x(toISO(d))}" y="${H - 8}" text-anchor="middle">${shortDate(d)}</text>`; }
  const ends = [];
  for (const k of KEYS) {
    const pts = S[k]; if (!pts.length) continue;
    const col = k === "juan" ? "var(--juan)" : "var(--ign)";
    g += `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join("")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += pts.map(p => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`).join("");
    const last = pts[pts.length - 1]; ends.push({ k, x: x(last.date), y: y(last.kg), v: last.kg });
  }
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 13) { const up = ends[0].y <= ends[1].y ? 0 : 1; ends[up].y -= 7; ends[1 - up].y += 7; }
  for (const e of ends) g += `<text class="val" x="${e.x + 9}" y="${e.y + 4}">${fmt(e.v, 1)} ${e.k === "juan" ? "J" : "I"}</text>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Peso de Juan e Ignacio en las últimas 12 semanas">${g}<line id="wx" x1="0" x2="0" y1="${M.t}" y2="${M.t + ih}" stroke="var(--line)" hidden/><rect x="${M.l}" y="${M.t}" width="${iw}" height="${ih}" fill="transparent" id="whit"/></svg><div class="tip" hidden></div>`;
  const tip = host.querySelector(".tip"), hit = host.querySelector("#whit"), cross = host.querySelector("#wx");
  const dates = [...new Set(KEYS.flatMap(k => S[k].map(p => p.date)))].sort();
  const show = ev => {
    const r = host.getBoundingClientRect(), sc = r.width / W, px = (ev.clientX - r.left) / sc;
    let best = dates[0]; for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(best) - px)) best = d;
    const line = k => { const w = latestWeight(S[k], k, best); return `${ATH[k]}: ${w ? fmt(w.kg, 1) + " kg" : "–"}`; };
    cross.setAttribute("x1", x(best)); cross.setAttribute("x2", x(best)); cross.hidden = false;
    tip.innerHTML = `<b>${shortDate(parseISO(best))}</b><br>${line("juan")}<br>${line("ignacio")}`;
    tip.style.left = Math.max(70, Math.min(r.width - 70, x(best) * sc)) + "px"; tip.style.top = (M.t * sc + 4) + "px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.hidden = true; });
  $("#wchart-table").innerHTML = `<table><thead><tr><th>Fecha</th><th class="n">Juan</th><th class="n">Ignacio</th></tr></thead><tbody>${dates.slice().reverse().map(d => {
    const j = S.juan.find(p => p.date === d), i = S.ignacio.find(p => p.date === d);
    return `<tr><td>${shortDate(parseISO(d))}</td><td class="n">${j ? fmt(j.kg, 1) : "–"}</td><td class="n">${i ? fmt(i.kg, 1) : "–"}</td></tr>`; }).join("")}</tbody></table>`;
}
async function saveWeight(){
  if (dbState !== "ready" || !me) return;
  const date = keep("w-date", toISO(today())), kg = num(keep("w-kg"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || kg < 30 || kg > 250) { toast("Pon una fecha y un peso válido en kg"); return; }
  try {
    await db.doc(`pesajes/${me}_${date}`).set(clean({ athlete: me, date, kg, waist: num(keep("w-waist")) || null, fat: num(keep("w-fat")) || null, updatedAt: Date.now() }));
    kept["w-kg"] = ""; kept["w-waist"] = ""; kept["w-fat"] = ""; store.set("gym.kept", kept);
    toast("Peso guardado"); renderCuerpo();
  } catch { toast("No se ha podido guardar el peso"); }
}
function bumpDrink(type, delta){
  if (dbState !== "ready" || !me) return;
  const d = drinkDoc(me, bDate), counts = { ...d.counts };
  counts[type] = Math.max(0, num(counts[type]) + delta); if (!counts[type]) delete counts[type];
  bPending[d.id] = counts; renderCuerpo();
  clearTimeout(bTimer[d.id]);
  const date = bDate;
  bTimer[d.id] = setTimeout(async () => {
    const c = bPending[d.id];
    try {
      if (Object.keys(c).length) await db.doc(`bebidas/${d.id}`).set({ athlete: me, date, counts: c, updatedAt: Date.now() });
      else await db.doc(`bebidas/${d.id}`).delete();
    } catch { toast("No se ha podido guardar el alcohol"); }
    if (bPending[d.id] === c) delete bPending[d.id];
  }, 700);
}
async function askBody(){
  if (!sample || cBusy) return;
  cBusy = true; cText = ""; cErr = ""; cCtl = new AbortController(); renderCuerpo();
  const weeks = []; const m0 = mondayOf(today());
  for (let i = 3; i >= 0; i--) { const s = addDays(m0, -7 * i), a = toISO(s), b = toISO(addDays(s, 6)); weeks.push(`Semana del ${a}: ` + KEYS.map(k => { const al = alcoholIn(drk(), k, a, b), t = totals(data().filter(x => x.athlete === k && x.date >= a && x.date <= b)); return `${ATH[k]} ${fmt(al.ube, 1)} UBE (${al.binge} días ≥${BINGE}), ${fmt(t.minutos)} min de entreno`; }).join("; ")); }
  const kg = KEYS.map(k => `${ATH[k]}: pesajes ${weightSeries(wts(), k).slice(-6).map(w => `${w.date} ${w.kg} kg`).join(", ") || "ninguno"}; objetivo ${GOALS[profileOf(k).goal].l}; objetivo de alcohol ${profileOf(k).alcoholGoal} UBE/semana`).join("\n");
  const prompt = `Eres el entrenador de dos amigos, Juan e Ignacio, que compiten para ponerse en forma. Valora en 4 a 6 frases, de tú a los dos, en español de España, directo y con pique sano:
1) si esta semana alguno se ha pasado con el alcohol (1 UBE = 10 g; bajo riesgo hasta ${DAILY_LOW_RISK} UBE al día en hombres; ${BINGE} o más en una ocasión es consumo intensivo) y quién va mejor;
2) cómo va el peso de cada uno respecto a su objetivo;
3) un consejo concreto para cada uno para la semana que viene.
No uses listas ni emojis. Nada de sermones.
${isDemo() || wDemo() || dDemo() ? "(Parte de los datos son de ejemplo.)\n" : ""}
Datos:
${weeks.join("\n")}
${kg}`;
  try {
    await sample(prompt, { signal: cCtl.signal, cache: false, onText: ({ text }) => { cText = text; const el = $("#view-cuerpo .comment"); if (el) el.lastChild.textContent = text; else renderCuerpo(); } });
  } catch (e) {
    if (e && e.text) cText = e.text;
    if (e && e.code !== "cancelled") cErr = sampleMsg(e);
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sample = null;
  }
  cBusy = false; renderCuerpo();
}
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.bdate) { bDate = t.dataset.bdate; renderCuerpo(); return; }
  if (t.dataset.drink) { bumpDrink(t.dataset.drink, +t.dataset.d); return; }
  const a = t.dataset.act;
  if (a === "c-ask") askBody();
  else if (a === "c-stop") cCtl?.abort();
  else if (a === "w-del") db?.doc("pesajes/" + t.dataset.id).delete().then(() => toast("Pesaje borrado")).catch(() => toast("No se ha podido borrar"));
});
document.addEventListener("change", e => { if (e.target.id === "b-date" && e.target.value) { bDate = e.target.value > toISO(today()) ? toISO(today()) : e.target.value; renderCuerpo(); } });
