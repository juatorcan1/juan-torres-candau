/* ---------- evolution of one exercise ----------
   In Récords: pick an exercise and see, session by session, the heaviest set of each of you on a line
   (same kg axis for both) and below every set of every day, newest first. */
let evoEx = store.get("gym.evo", "");
function evoSessions(key){
  const out = [];
  for (const s of data()) if (s.sport === "gym") for (const e of s.exercises || []) {
    if (normName(e.name) !== key) continue;
    const sets = (e.sets || []).filter(x => !x.warmup && num(x.reps)).map(x => ({ kg: num(x.kg), reps: num(x.reps) }));
    if (sets.length) out.push({ who: s.athlete, date: s.date, sets, top: Math.max(...sets.map(x => x.kg)), enCurso: !!s.enCurso });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function evoExercises(){
  const c = {};
  for (const s of data()) if (s.sport === "gym") for (const e of s.exercises || []) {
    // timed items (cardio, plank) are stored as 1 rep with no weight: nothing to follow here
    const k = normName(e.name); if (!k || !(e.sets || []).some(x => !x.warmup && (num(x.kg) > 0 || num(x.reps) > 1))) continue;
    (c[k] ||= { key: k, name: canonicalName(e.name.trim()), n: 0, mine: 0 }).n++; if (s.athlete === me) c[k].mine++;
  }
  return Object.values(c).sort((a, b) => b.mine - a.mine || b.n - a.n || a.name.localeCompare(b.name, "es"));
}
const evoSets = sets => sets.map(x => x.kg ? `${fmt(x.kg, 2)}×${x.reps}` : `${x.reps} reps`).join(" · ");
function evoHTML(){
  const list = evoExercises(); if (!list.length) return "";
  if (!list.some(x => x.key === evoEx)) evoEx = list[0].key;
  const ses = evoSessions(evoEx), name = list.find(x => x.key === evoEx).name;
  const firstLast = k => { const m = ses.filter(s => s.who === k); return m.length > 1 ? { a: m[0], b: m[m.length - 1] } : null; };
  const delta = KEYS.map(k => { const f = firstLast(k); if (!f) return "";
    const d = f.b.top - f.a.top; return `<span><i class="dot ${k}"></i> ${ATH[k]}: ${fmt(f.a.top, 2)} → <b>${fmt(f.b.top, 2)} kg</b>${d ? ` (${d > 0 ? "+" : ""}${fmt(d, 2)})` : ""}</span>`; }).filter(Boolean).join("");
  return `<div class="panel">
    <div class="panel-head"><div><h2>Evolución por ejercicio</h2><div class="muted" style="font-size:13px;margin-top:2px">La serie más pesada de cada día, y debajo todas las series.</div></div>
      <div class="legend"><span><i class="dot juan"></i>Juan</span><span><i class="dot ignacio"></i>Ignacio</span></div></div>
    <div class="f" style="max-width:360px"><label for="evo-ex">Ejercicio</label><select id="evo-ex">${list.map(x => `<option value="${esc(x.key)}" ${x.key === evoEx ? "selected" : ""}>${esc(x.name)} (${x.n})</option>`).join("")}</select></div>
    ${delta ? `<div class="evo-delta">${delta}</div>` : ""}
    <div id="evochart" role="img" aria-label="${esc(`Kilos de la serie más pesada en ${name}, por día`)}"></div>
    <div class="evo-list">${ses.slice().reverse().map(s => `<div class="evo-row"><i class="dot ${s.who}"></i><span class="evo-d">${esc(shortDate(parseISO(s.date)))}</span><span class="evo-s">${esc(evoSets(s.sets))}${s.enCurso ? ` <span class="muted">(sin terminar)</span>` : ""}</span></div>`).join("")}</div>
  </div>`;
}
function renderEvoChart(){
  const host = $("#evochart"); if (!host) return;
  const ses = evoSessions(evoEx).filter(s => s.top > 0);
  if (!ses.length) { host.innerHTML = `<div class="empty">Sin pesos apuntados en este ejercicio (solo repeticiones).</div>`; return; }
  const W = Math.max(300, Math.round(host.clientWidth || 640)), H = 200, M = { l: 40, r: 58, t: 14, b: 26 }, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const all = ses.map(s => s.top);
  let lo = Math.max(0, Math.floor(Math.min(...all) - 2.5)), hi = Math.ceil(Math.max(...all) + 2.5);
  const step = hi - lo > 60 ? 20 : hi - lo > 30 ? 10 : hi - lo > 12 ? 5 : 2.5; lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const d0 = parseISO(ses[0].date), d1 = parseISO(ses[ses.length - 1].date), span = Math.max(864e5 * 6, d1 - d0);
  const start = new Date(+d0 - span * 0.04), end = new Date(+d0 + span * 1.04);
  const x = d => M.l + (parseISO(d) - start) / (end - start) * iw, y = v => M.t + ih - (v - lo) / (hi - lo) * ih;
  let g = "";
  for (let v = lo; v <= hi + 1e-9; v += step) g += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 1)}</text>`;
  const ticks = 4; for (let i = 0; i <= ticks; i++) { const d = new Date(+start + (end - start) * (0.04 + 0.92 * i / ticks)); g += `<text class="axis" x="${x(toISO(d))}" y="${H - 8}" text-anchor="middle">${shortDate(d)}</text>`; }
  const ends = [];
  for (const k of KEYS) {
    const pts = ses.filter(s => s.who === k); if (!pts.length) continue;
    const col = k === "juan" ? "var(--juan)" : "var(--ign)";
    if (pts.length > 1) g += `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.top).toFixed(1)}`).join("")}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += pts.map(p => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.top).toFixed(1)}" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`).join("");
    const last = pts[pts.length - 1]; ends.push({ k, x: x(last.date), y: y(last.top), v: last.top });
  }
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 13) { const up = ends[0].y <= ends[1].y ? 0 : 1; ends[up].y -= 7; ends[1 - up].y += 7; }
  for (const e of ends) g += `<text class="val" x="${e.x + 9}" y="${e.y + 4}">${fmt(e.v, 2)} ${e.k === "juan" ? "J" : "I"}</text>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${g}<line class="evo-x" x1="0" x2="0" y1="${M.t}" y2="${M.t + ih}" stroke="var(--line)" hidden/><rect x="${M.l}" y="${M.t}" width="${iw}" height="${ih}" fill="transparent" class="evo-hit"/></svg><div class="tip" hidden></div>`;
  const tip = host.querySelector(".tip"), hit = host.querySelector(".evo-hit"), cross = host.querySelector(".evo-x");
  const dates = [...new Set(ses.map(s => s.date))];
  const show = ev => {
    const r = host.getBoundingClientRect(), sc = r.width / W, px = (ev.clientX - r.left) / sc;
    let best = dates[0]; for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(best) - px)) best = d;
    cross.setAttribute("x1", x(best)); cross.setAttribute("x2", x(best)); cross.hidden = false;
    const rows = KEYS.map(k => { const s = ses.find(z => z.who === k && z.date === best); return s ? `${ATH[k]}: ${esc(evoSets(s.sets))}` : ""; }).filter(Boolean);
    tip.innerHTML = `<b>${shortDate(parseISO(best))}</b><br>${rows.join("<br>")}`;
    tip.style.left = Math.max(90, Math.min(r.width - 90, x(best) * sc)) + "px"; tip.style.top = (M.t * sc + 4) + "px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", show); hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; cross.hidden = true; });
}
document.addEventListener("change", e => {
  if (e.target.id !== "evo-ex") return;
  evoEx = e.target.value; store.set("gym.evo", evoEx); renderRecords();
});
