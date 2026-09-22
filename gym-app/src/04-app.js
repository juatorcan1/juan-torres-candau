/* ---------- state ---------- */
const TABS = ["duelo", "apuntar", "historial", "records", "cuerpo", "dieta", "ejercicios"];
let db = null, dbState = "loading"; // loading | ready | none
let sample = null;                    // Claude, when this view can use it
let real = [], weights = [], drinks = [], profiles = {};
let me = store.get("gym.me", null); if (!ATH[me]) me = null;
let period = store.get("gym.period", "semana"); if (!PERIODS[period]) period = "semana";
let tab = (location.hash || "").slice(1) || store.get("gym.tab", "duelo");
if (tab === "registrar") tab = "apuntar";
if (!TABS.includes(tab)) tab = "duelo";
let chartMetric = store.get("gym.chart", "minutos");
let histWho = "ambos", histSport = "todos";
let openSess = new Set();
let confirmDel = null;
let draft = null;
const isDemo = () => real.length === 0;
const data = () => isDemo() ? DEMO : real;
const wDemo = () => weights.length === 0;
const dDemo = () => drinks.length === 0;
const wts = () => wDemo() ? DEMO_BODY.ws : weights;
const drk = () => dDemo() ? DEMO_BODY.ds : drinks;
const profileOf = who => ({ ...PROFILE_DEFAULT, ...(profiles[who] || {}) });
// Inputs marked data-keep survive re-renders caused by live data.
const kept = store.get("gym.kept", {});
const keep = (id, d = "") => (kept[id] ?? d);

/* ---------- toast ---------- */
let toastT;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

/* ---------- header / scoreboard ---------- */
function computeDuel(){
  const [a, b] = periodRange(period);
  const inP = data().filter(s => s.date >= a && s.date <= b);
  const T = { juan: totals(inP.filter(s => s.athlete === "juan")), ignacio: totals(inP.filter(s => s.athlete === "ignacio")) };
  const wins = { juan: 0, ignacio: 0 };
  for (const k of KEYS) { const al = alcoholIn(drk(), k, a, b); T[k].ube = al.ube; T[k].alKcal = al.kcal; }
  for (const m of METRICS) {
    const j = T.juan[m.k], i = T.ignacio[m.k]; if (j === i) continue;
    if (m.low ? j < i : j > i) wins.juan++; else wins.ignacio++;
  }
  return { T, wins, inP };
}
function renderHeader(){
  document.body.classList.toggle("me-juan", me === "juan");
  document.body.classList.toggle("me-ignacio", me === "ignacio");
  $("#whoami").innerHTML = me
    ? `<span class="dot ${me}"></span><span>${WEB ? "Hola," : "Registras como"} <b>${ATH[me]}</b></span>${WEB ? `<button class="linkbtn" id="pw-open" type="button">Contraseña</button><button class="linkbtn" id="logout" type="button">Salir</button>` : `<button class="linkbtn" id="switch-me" type="button">Cambiar</button>`}`
    : `<span>Elige quién eres para registrar</span>`;
  const { T, wins } = computeDuel();
  const side = k => `
    <div class="side ${k} ${k === "ignacio" ? "right" : ""}">
      <span class="nm">${k === "ignacio" && me === k ? '<span class="you">TÚ</span>' : ""}${ATH[k]}${k === "juan" && me === k ? '<span class="you">TÚ</span>' : ""}</span>
      <div class="st"><span class="num">${fmt(T[k].minutos)}</span> min · <span class="num">${T[k].sesiones}</span> ses. · <span class="num">${fmtBig(T[k].volumen)}</span> kg</div>
    </div>`;
  $("#score").innerHTML = `
    ${side("juan")}
    <div class="mid">
      <div class="big" aria-label="Métricas ganadas: Juan ${wins.juan}, Ignacio ${wins.ignacio}">${wins.juan}<span class="sep">–</span>${wins.ignacio}</div>
      <div class="cap">métricas ganadas</div>
      <label class="sr" for="period" hidden>Periodo</label>
      <select id="period" aria-label="Periodo de la comparativa">
        ${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${k === period ? "selected" : ""}>${v}</option>`).join("")}
      </select>
    </div>
    ${side("ignacio")}`;
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
}

/* ---------- Duelo ---------- */
function piqueText(T){
  const pl = PERIOD_IN[period];
  const j = T.juan, i = T.ignacio;
  if (j.sesiones + i.sesiones === 0) return { main: `Nadie ha entrenado ${pl} todavía.`, sub: "El primero que registre una sesión se pone por delante." };
  const lead = j.minutos === i.minutos ? null : (j.minutos > i.minutos ? "juan" : "ignacio");
  const diff = Math.abs(j.minutos - i.minutos);
  let main;
  if (!lead) main = `Empate a minutos ${pl}. El próximo entreno decide.`;
  else if (!me) main = `${ATH[lead]} le saca ${fmt(diff)} min a ${ATH[OTHER[lead]]} ${pl}.`;
  else if (lead === me) main = `Le sacas ${fmt(diff)} min a ${ATH[OTHER[me]]} ${pl}. Que no te pille.`;
  else main = `${ATH[lead]} te saca ${fmt(diff)} min ${pl}. Toca moverse.`;
  const subs = [];
  const vj = j.volumen, vi = i.volumen;
  if (vj !== vi) {
    const vl = vj > vi ? "juan" : "ignacio", vd = Math.abs(vj - vi);
    subs.push(me ? (vl === me ? `Y has levantado ${fmt(vd)} kg más.` : `${ATH[vl]} ha levantado ${fmt(vd)} kg más que tú.`) : `${ATH[vl]} lleva ${fmt(vd)} kg más de volumen.`);
  }
  const cardio = x => x.kmBici + x.kmCinta + x.mNado / 1000;
  const cj = cardio(j), ci = cardio(i);
  if (Math.abs(cj - ci) >= 0.5) {
    const cl = cj > ci ? "juan" : "ignacio";
    subs.push(me ? (cl === me ? `En cardio vas ${fmt(Math.abs(cj - ci), 1)} km por delante.` : `En cardio ${ATH[cl]} te lleva ${fmt(Math.abs(cj - ci), 1)} km.`) : `En cardio ${ATH[cl]} lleva ${fmt(Math.abs(cj - ci), 1)} km más.`);
  }
  return { main, sub: subs.join(" ") };
}
const CHART_METRICS = {
  minutos: { label: "Minutos", unit: "min", get: s => num(s.minutes) },
  volumen: { label: "Volumen", unit: "kg", get: s => s.sport === "gym" ? gymStats(s).vol : 0 },
  km: { label: "Km cardio", unit: "km", dec: 1, get: s => s.sport === "natacion" ? num(s.meters) / 1000 : (s.sport === "bici" || s.sport === "cinta" || s.sport === "otro") ? num(s.km) : 0 },
  sesiones: { label: "Sesiones", unit: "", get: () => 1 }
};
if (!CHART_METRICS[chartMetric]) chartMetric = "minutos";

function renderDuelo(){
  const { T } = computeDuel();
  const p = piqueText(T);
  const rows = METRICS.map(m => {
    const j = T.juan[m.k], i = T.ignacio[m.k], mx = Math.max(j, i);
    const pj = mx ? j / mx * 100 : 0, pi = mx ? i / mx * 100 : 0;
    const f = v => (m.big ? fmtBig(v) : fmt(v, m.dec || 0));
    return `<div class="h2h-row">
      <div class="v l ${j !== i && (m.low ? j < i : j > i) ? "win" : ""}">${f(j)}</div>
      <div class="h2h-mid">
        <div class="lbl">${m.label}${m.unit ? ` <span>(${m.unit}${m.low ? ", gana quien menos" : ""})</span>` : ""}</div>
        <div class="bars" aria-hidden="true"><div class="b l"><i style="width:${pj}%"></i></div><div class="b r"><i style="width:${pi}%"></i></div></div>
      </div>
      <div class="v ${j !== i && (m.low ? i < j : i > j) ? "win" : ""}">${f(i)}</div>
    </div>`;
  }).join("");
  const recent = [...data()].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).slice(0, 8);
  const sj = streak(data(), "juan"), si = streak(data(), "ignacio");
  const bj = bestWeekMinutes(data(), "juan"), bi = bestWeekMinutes(data(), "ignacio");
  $("#view-duelo").innerHTML = `
    <div style="display:grid;gap:18px">
      ${demoBanner()}
      <div class="pique" role="status">
        <div class="eyebrow">${PERIODS[period]}</div>
        <p>${esc(p.main)}</p>
        ${p.sub ? `<div class="sub">${esc(p.sub)}</div>` : ""}
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Cara a cara</h2>
          <div class="legend"><span><i class="dot juan"></i>Juan</span><span><i class="dot ignacio"></i>Ignacio</span></div>
        </div>
        <div class="h2h">${rows}</div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div><h2>Últimas 8 semanas</h2><div class="muted" style="font-size:13px;margin-top:2px">Pasa el dedo o el ratón por una semana para ver el detalle</div></div>
          <div class="seg" role="group" aria-label="Métrica del gráfico">
            ${Object.entries(CHART_METRICS).map(([k, v]) => `<button type="button" data-cm="${k}" aria-pressed="${k === chartMetric}">${v.label}</button>`).join("")}
          </div>
        </div>
        <div class="legend"><span><i class="dot juan"></i>Juan</span><span><i class="dot ignacio"></i>Ignacio</span></div>
        <div id="chart"></div>
        <details class="tbl"><summary>Ver como tabla</summary><div class="tscroll" id="chart-table"></div></details>
      </div>
      <div class="grid2">
        <div class="panel">
          <div class="panel-head"><h2>Actividad reciente</h2></div>
          <div class="feed">${recent.length ? recent.map(s => `
            <div class="feed-item">
              <span class="dot ${s.athlete}"></span>
              <div class="what"><b>${ATH[s.athlete]}</b> · ${esc(SPORTS[s.sport] || "")} · <span class="num">${fmt(num(s.minutes))}</span> min<div class="muted" style="font-size:13px">${esc(sessionSummary(s))}</div></div>
              <span class="when">${relDay(s.date)}</span>
            </div>`).join("") : `<div class="empty">Aún no hay sesiones.</div>`}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Constancia y cuerpo</h2></div>
          <div class="streaks">
            <div class="streak"><div class="eyebrow"><i class="dot juan"></i> Juan</div><div class="n">${sj}</div><div class="l">día${sj === 1 ? "" : "s"} seguidos entrenando</div></div>
            <div class="streak"><div class="eyebrow"><i class="dot ignacio"></i> Ignacio</div><div class="n">${si}</div><div class="l">día${si === 1 ? "" : "s"} seguidos entrenando</div></div>
          </div>
          <div class="tscroll" style="margin-top:14px"><table>
            <thead><tr><th></th><th class="n">Juan</th><th class="n">Ignacio</th></tr></thead>
            <tbody>
              <tr><td>Mejor semana</td><td class="n">${fmt(bj.best)} min</td><td class="n">${fmt(bi.best)} min</td></tr>
              ${bodyRows()}
            </tbody></table></div>
        </div>
      </div>
    </div>`;
  renderChart();
}
function bodyRows(){
  const r = k => { const w = latestWeight(wts(), k), old = latestWeight(wts(), k, toISO(addDays(today(), -28))); return { w, d: w && old ? w.kg - old.kg : null }; };
  const J = r("juan"), I = r("ignacio");
  const wk = periodRange("semana"), aj = alcoholIn(drk(), "juan", ...wk), ai = alcoholIn(drk(), "ignacio", ...wk);
  const dd = x => x == null ? "–" : (x > 0 ? "+" : "") + fmt(x, 1) + " kg";
  return `<tr><td>Peso actual</td><td class="n">${J.w ? fmt(J.w.kg, 1) + " kg" : "–"}</td><td class="n">${I.w ? fmt(I.w.kg, 1) + " kg" : "–"}</td></tr>
    <tr><td>Cambio en 4 semanas</td><td class="n">${dd(J.d)}</td><td class="n">${dd(I.d)}</td></tr>
    <tr><td>Alcohol esta semana</td><td class="n ${aj.ube < ai.ube ? "win" : ""}">${fmt(aj.ube, 1)} UBE</td><td class="n ${ai.ube < aj.ube ? "win" : ""}">${fmt(ai.ube, 1)} UBE</td></tr>`;
}
function demoBanner(kind = "s"){
  const demo = kind === "s" ? isDemo() : kind === "w" ? wDemo() : kind === "d" ? dDemo() : wDemo() && dDemo();
  if (!demo) return "";
  const [art, what, first] = kind === "s" ? ["Las", "sesiones", "primeras"] : kind === "w" ? ["Los", "pesajes", "primeros"] : kind === "d" ? ["Las", "copas", "primeras"] : ["Los", "pesajes y copas", "primeros"];
  const why = dbState === "none"
    ? (WEB ? "No hay conexión con la base de datos: revisa internet y recarga." : "Esta vista no está conectada a la base de datos, así que no se guardará nada. Ábrela desde su enlace de Claude.")
    : `Desaparecen en cuanto apuntéis vuestros ${first} ${what} reales.`;
  return `<div class="banner"><strong>Datos de ejemplo.</strong> ${art} ${what} que ves son ${art === "Las" ? "inventadas" : "inventados"} para enseñar cómo funciona. ${why}</div>`;
}

function niceScale(max){
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  return { top: Math.ceil(max / step) * step, step };
}
function roundTop(x, y, w, h, r){
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function renderChart(){
  const host = $("#chart"); if (!host) return;
  const cm = CHART_METRICS[chartMetric];
  const m0 = mondayOf(today()); const weeks = [];
  for (let i = 7; i >= 0; i--) weeks.push(addDays(m0, -7 * i));
  const rows = weeks.map(w => {
    const a = toISO(w), b = toISO(addDays(w, 6)), r = { w };
    for (const k of KEYS) r[k] = data().filter(s => s.athlete === k && s.date >= a && s.date <= b).reduce((acc, s) => acc + cm.get(s), 0);
    return r;
  });
  const W = Math.max(300, Math.round(host.clientWidth || 640)), H = 230, M = { l: 46, r: 8, t: 18, b: 28 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const max = Math.max(0, ...rows.flatMap(r => [r.juan, r.ignacio]));
  const { top, step } = niceScale(max);
  const y = v => M.t + ih - (v / top) * ih;
  const band = iw / rows.length, bw = Math.max(6, Math.min(22, (band - 12) / 2 - 1));
  const fv = v => cm.dec ? fmt(v, cm.dec) : fmtBig(v);
  let g = "";
  for (let v = 0; v <= top + 1e-9; v += step) {
    g += `<line class="${v === 0 ? "base" : "grid"}" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text class="axis" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${fv(v)}</text>`;
  }
  rows.forEach((r, i) => {
    const cx = M.l + band * i + band / 2;
    const xj = cx - 1 - bw, xi = cx + 1;
    const hj = ih * r.juan / top, hi = ih * r.ignacio / top;
    g += `<path d="${roundTop(xj, y(r.juan), bw, hj, 4)}" fill="var(--juan)"/>`;
    g += `<path d="${roundTop(xi, y(r.ignacio), bw, hi, 4)}" fill="var(--ign)"/>`;
    const last = i === rows.length - 1, sparse = band < 48;
    if (last || !sparse || (rows.length - 1 - i) % 2 === 0) g += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${last ? (sparse ? "Hoy" : "Esta sem.") : shortDate(r.w)}</text>`;
    if (i === rows.length - 1) {
      if (r.juan) g += `<text class="val" x="${xj + bw / 2}" y="${y(r.juan) - 5}" text-anchor="middle">${fv(r.juan)}</text>`;
      if (r.ignacio) g += `<text class="val" x="${xi + bw / 2}" y="${y(r.ignacio) - 5}" text-anchor="middle">${fv(r.ignacio)}</text>`;
    }
  });
  let hits = "";
  rows.forEach((r, i) => { hits += `<rect class="hit" data-i="${i}" tabindex="0" x="${M.l + band * i}" y="${M.t}" width="${band}" height="${ih}" rx="4" aria-label="Semana del ${shortDate(r.w)}: Juan ${fv(r.juan)} ${cm.unit}, Ignacio ${fv(r.ignacio)} ${cm.unit}"/>`; });
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${cm.label} por semana, Juan contra Ignacio">${hits}${g}</svg><div class="tip" hidden></div>`;
  const tip = host.querySelector(".tip");
  const show = el => {
    const i = +el.dataset.i, r = rows[i];
    const u = cm.unit ? " " + cm.unit : "";
    const d = r.juan - r.ignacio;
    tip.innerHTML = `<b>Semana del ${shortDate(r.w)}</b><br>Juan: ${fv(r.juan)}${u}<br>Ignacio: ${fv(r.ignacio)}${u}${d ? `<br>${d > 0 ? "Juan" : "Ignacio"} +${fv(Math.abs(d))}${u}` : ""}`;
    const scale = host.clientWidth / W;
    let left = (M.l + band * i + band / 2) * scale;
    left = Math.max(80, Math.min(host.clientWidth - 80, left));
    tip.style.left = left + "px"; tip.style.top = (M.t * scale + 4) + "px"; tip.hidden = false;
  };
  host.querySelectorAll(".hit").forEach(el => {
    el.addEventListener("pointerenter", () => show(el));
    el.addEventListener("pointerdown", () => show(el));
    el.addEventListener("focus", () => show(el));
    el.addEventListener("pointerleave", () => tip.hidden = true);
    el.addEventListener("blur", () => tip.hidden = true);
  });
  $("#chart-table").innerHTML = `<table><thead><tr><th>Semana</th><th class="n">Juan</th><th class="n">Ignacio</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${shortDate(r.w)}</td><td class="n ${r.juan > r.ignacio ? "win" : ""}">${fv(r.juan)}</td><td class="n ${r.ignacio > r.juan ? "win" : ""}">${fv(r.ignacio)}</td></tr>`).join("")
  }</tbody></table>`;
}

/* ---------- Historial ---------- */
function renderHistorial(){
  const list = [...data()]
    .filter(s => histWho === "ambos" || s.athlete === histWho)
    .filter(s => histSport === "todos" || s.sport === histSport)
    .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  const byDay = {}; for (const s of list) (byDay[s.date] ||= []).push(s);
  const days = Object.keys(byDay).sort().reverse();
  $("#view-historial").innerHTML = `
    <div style="display:grid;gap:18px">
      ${demoBanner()}
      <div class="panel">
        <div class="panel-head">
          <h2>Historial</h2>
          <div class="filters">
            <select id="h-who" aria-label="Filtrar por persona">
              <option value="ambos" ${histWho === "ambos" ? "selected" : ""}>Los dos</option>
              <option value="juan" ${histWho === "juan" ? "selected" : ""}>Juan</option>
              <option value="ignacio" ${histWho === "ignacio" ? "selected" : ""}>Ignacio</option>
            </select>
            <select id="h-sport" aria-label="Filtrar por deporte">
              <option value="todos">Todos los deportes</option>
              ${Object.entries(SPORTS).map(([k, v]) => `<option value="${k}" ${histSport === k ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </div>
        </div>
        ${days.length ? days.map(d => {
          const dt = parseISO(d);
          return `<div class="day"><h3>${DIA[dt.getDay()]} ${dt.getDate()} ${MES[dt.getMonth()]} ${dt.getFullYear()}</h3>${byDay[d].map(sessRow).join("")}</div>`;
        }).join("") : `<div class="empty">No hay sesiones con estos filtros.</div>`}
      </div>
    </div>`;
}
function sessRow(s){
  const open = openSess.has(s.id);
  return `<div class="sess" data-sid="${esc(s.id)}" tabindex="0" aria-expanded="${open}">
    <span class="dot ${s.athlete}"></span>
    <div>
      <div class="top"><b>${ATH[s.athlete]}</b><span class="chip">${esc(SPORTS[s.sport] || "")}</span>${s.time ? `<span class="muted" style="font-size:13px">${esc(s.time)}</span>` : ""}</div>
      <div class="sum">${esc(sessionSummary(s)) || "&nbsp;"}</div>
    </div>
    <span class="mins">${fmt(num(s.minutes))} min</span>
    ${open ? sessDetail(s) : ""}
  </div>`;
}
function sessDetail(s){
  const kv = [];
  const add = (l, v) => { if (v !== "" && v != null && v !== 0 && v !== "0") kv.push(`<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`); };
  add("Duración", num(s.minutes) ? fmt(num(s.minutes)) + " min" : "");
  add("Esfuerzo (RPE)", num(s.rpe) ? num(s.rpe) + " / 10" : "");
  add("Sensación", s.feeling || "");
  add("FC media", num(s.hrAvg) ? fmt(num(s.hrAvg)) + " ppm" : "");
  add("FC máxima", num(s.hrMax) ? fmt(num(s.hrMax)) + " ppm" : "");
  add("Calorías", num(s.kcal) ? fmt(num(s.kcal)) + " kcal" : "");
  add("Peso corporal", num(s.bodyWeight) ? fmt(num(s.bodyWeight), 1) + " kg" : "");
  if (s.sport === "bici") {
    add("Tipo", s.bikeType || ""); add("Distancia", num(s.km) ? fmt(num(s.km), 1) + " km" : "");
    add("Velocidad media", num(s.km) && num(s.minutes) ? fmt(num(s.km) / (num(s.minutes) / 60), 1) + " km/h" : "");
    add("Desnivel", num(s.elevation) ? fmt(num(s.elevation)) + " m" : ""); add("Potencia media", num(s.watts) ? fmt(num(s.watts)) + " W" : "");
    add("Cadencia", num(s.cadence) ? fmt(num(s.cadence)) + " rpm" : "");
  }
  if (s.sport === "natacion") {
    add("Distancia", num(s.meters) ? fmt(num(s.meters)) + " m" : ""); add("Piscina", num(s.poolLength) ? num(s.poolLength) + " m" : "");
    add("Largos", num(s.laps) ? fmt(num(s.laps)) : ""); add("Estilo", s.style || "");
    add("Ritmo", num(s.meters) && num(s.minutes) ? mmss(num(s.minutes) * 100 / num(s.meters)) + " /100 m" : "");
  }
  if (s.sport === "cinta") {
    add("Distancia", num(s.km) ? fmt(num(s.km), 2) + " km" : ""); add("Inclinación", num(s.incline) ? fmt(num(s.incline), 1) + " %" : "");
    add("Ritmo", num(s.km) && num(s.minutes) ? mmss(num(s.minutes) / num(s.km)) + " min/km" : "");
    add("Velocidad media", num(s.km) && num(s.minutes) ? fmt(num(s.km) / (num(s.minutes) / 60), 1) + " km/h" : "");
  }
  if (s.sport === "otro") { add("Actividad", s.activity || ""); add("Distancia", num(s.km) ? fmt(num(s.km), 1) + " km" : ""); }
  if (s.sport === "gym") {
    const g = gymStats(s);
    add("Volumen", fmt(g.vol) + " kg"); add("Series efectivas", String(g.sets)); add("Repeticiones", String(g.reps));
  }
  const exs = s.sport === "gym" ? (s.exercises || []).map(ex => `
    <div class="ex-block">
      <h4>${esc(ex.name)} <span>${[ex.group, ex.equip].filter(Boolean).map(esc).join(" · ")}</span></h4>
      <div class="tscroll"><table><thead><tr><th>Serie</th><th class="n">Reps</th><th class="n">Kg</th><th class="n">RIR</th><th class="n">Descanso</th><th class="n">1RM est.</th></tr></thead><tbody>
      ${(ex.sets || []).map((st, i) => `<tr><td>${st.warmup ? "Calent." : i + 1 - (ex.sets || []).slice(0, i).filter(x => x.warmup).length}</td><td class="n">${fmt(num(st.reps))}</td><td class="n">${fmt(num(st.kg), 2)}</td><td class="n">${st.rir == null || st.rir === "" ? "–" : fmt(num(st.rir))}</td><td class="n">${num(st.rest) ? num(st.rest) + " s" : "–"}</td><td class="n">${!st.warmup && e1rm(num(st.kg), num(st.reps)) ? fmt(e1rm(num(st.kg), num(st.reps)), 1) : "–"}</td></tr>`).join("")}
      </tbody></table></div>
      ${ex.notes ? `<p class="notes">${esc(ex.notes)}</p>` : ""}
    </div>`).join("") : "";
  const mine = !s.demo && me === s.athlete && dbState === "ready";
  return `<div class="sess-detail">
    ${kv.length ? `<dl class="kv" style="margin:0">${kv.join("")}</dl>` : ""}
    ${exs}
    ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ""}
    ${mine ? `<div class="actions">
      <button class="btn sm" type="button" data-edit="${esc(s.id)}">Editar</button>
      ${confirmDel === s.id
        ? `<button class="btn sm danger" type="button" data-del="${esc(s.id)}">Sí, borrar esta sesión</button><button class="btn sm ghost" type="button" data-nodel>Cancelar</button>`
        : `<button class="btn sm ghost" type="button" data-askdel="${esc(s.id)}">Borrar</button>`}
    </div>` : ""}
  </div>`;
}

/* ---------- Récords ---------- */
function renderRecords(){
  const L = data();
  const ex = {};
  for (const s of L) if (s.sport === "gym") for (const e of s.exercises || []) {
    const key = normName(e.name); if (!key) continue;
    const r = ex[key] ||= { name: e.name.trim(), group: e.group || CATALOG[e.name.trim()] || "Otro", juan: null, ignacio: null };
    for (const st of e.sets || []) {
      if (st.warmup) continue; const kg = num(st.kg), reps = num(st.reps); if (!reps) continue;
      const cur = r[s.athlete] ||= { kg: -1, reps: 0, e1: 0, maxReps: 0, date: s.date };
      if (kg > cur.kg || (kg === cur.kg && reps > cur.reps)) { cur.kg = kg; cur.reps = reps; cur.date = s.date; }
      cur.e1 = Math.max(cur.e1, e1rm(kg, reps)); cur.maxReps = Math.max(cur.maxReps, reps);
    }
  }
  const byGroup = {};
  for (const r of Object.values(ex)) (byGroup[r.group] ||= []).push(r);
  const groups = Object.keys(byGroup).sort((a, b) => (GROUPS.indexOf(a) + 99 * (GROUPS.indexOf(a) < 0)) - (GROUPS.indexOf(b) + 99 * (GROUPS.indexOf(b) < 0)));
  const cell = (a, b, pick, f) => {
    const va = a ? pick(a) : null, vb = b ? pick(b) : null;
    const w = va != null && vb != null && va !== vb ? (va > vb ? "a" : "b") : null;
    return [`<td class="n ${w === "a" ? "win" : ""}">${va == null ? "–" : f(a)}</td>`, `<td class="n ${w === "b" ? "win" : ""}">${vb == null ? "–" : f(b)}</td>`];
  };
  let strength = "";
  for (const gname of groups) {
    strength += `<tr class="grp"><td colspan="7">${esc(gname)}</td></tr>`;
    for (const r of byGroup[gname].sort((a, b) => a.name.localeCompare(b.name, "es"))) {
      const [bj, bi] = cell(r.juan, r.ignacio, x => x.kg * 1000 + x.reps, x => x.kg > 0 ? `${fmt(x.kg, 2)} kg × ${x.reps}` : `${x.reps} reps`);
      const [ej, ei] = cell(r.juan, r.ignacio, x => x.e1 || null, x => x.e1 ? fmt(x.e1, 1) : "–");
      const [rj, ri] = cell(r.juan, r.ignacio, x => x.maxReps, x => fmt(x.maxReps));
      strength += `<tr><td>${esc(r.name)}</td>${bj}${bi}${ej}${ei}${rj}${ri}</tr>`;
    }
  }
  const best = (who, sport, val, filt = () => true, low = false) => {
    let b = null;
    for (const s of L) if (s.athlete === who && s.sport === sport && filt(s)) { const v = val(s); if (v > 0 && (b == null || (low ? v < b : v > b))) b = v; }
    return b;
  };
  const cardio = [
    { l: "Salida en bici más larga", f: w => best(w, "bici", s => num(s.km)), fm: v => fmt(v, 1) + " km" },
    { l: "Mayor velocidad media en bici", note: "desde 5 km", f: w => best(w, "bici", s => num(s.km) / (num(s.minutes) / 60), s => num(s.km) >= 5 && num(s.minutes) > 0), fm: v => fmt(v, 1) + " km/h" },
    { l: "Mayor potencia media en bici", f: w => best(w, "bici", s => num(s.watts)), fm: v => fmt(v) + " W" },
    { l: "Nado más largo", f: w => best(w, "natacion", s => num(s.meters)), fm: v => fmt(v) + " m" },
    { l: "Mejor ritmo nadando", note: "desde 200 m", low: true, f: w => best(w, "natacion", s => num(s.minutes) * 100 / num(s.meters), s => num(s.meters) >= 200 && num(s.minutes) > 0, true), fm: v => mmss(v) + " /100 m" },
    { l: "Carrera en cinta más larga", f: w => best(w, "cinta", s => num(s.km)), fm: v => fmt(v, 2) + " km" },
    { l: "Mejor ritmo en cinta", note: "desde 1 km", low: true, f: w => best(w, "cinta", s => num(s.minutes) / num(s.km), s => num(s.km) >= 1 && num(s.minutes) > 0, true), fm: v => mmss(v) + " min/km" },
    { l: "Sesión más larga", f: w => Math.max(0, ...L.filter(s => s.athlete === w).map(s => num(s.minutes))) || null, fm: v => fmt(v) + " min" },
    { l: "Más volumen en una sesión", f: w => Math.max(0, ...L.filter(s => s.athlete === w && s.sport === "gym").map(s => gymStats(s).vol)) || null, fm: v => fmt(v) + " kg" },
    { l: "Mejor semana", f: w => bestWeekMinutes(L, w).best || null, fm: v => fmt(v) + " min" }
  ];
  let wj = 0, wi = 0;
  const cardioRows = cardio.map(c => {
    const a = c.f("juan"), b = c.f("ignacio");
    let w = null; if (a != null && b != null && a !== b) w = (c.low ? a < b : a > b) ? "a" : "b";
    if (w === "a") wj++; if (w === "b") wi++;
    return `<tr><td>${c.l}${c.note ? ` <span class="muted">(${c.note})</span>` : ""}</td><td class="n ${w === "a" ? "win" : ""}">${a == null ? "–" : c.fm(a)}</td><td class="n ${w === "b" ? "win" : ""}">${b == null ? "–" : c.fm(b)}</td></tr>`;
  }).join("");
  $("#view-records").innerHTML = `
    <div style="display:grid;gap:18px">
      ${demoBanner()}
      <div class="panel">
        <div class="panel-head">
          <div><h2>Récords de fuerza</h2><div class="muted" style="font-size:13px;margin-top:2px">Mejor serie (más kilos), 1RM estimado (fórmula de Epley, series de hasta 12 reps) y máximo de repeticiones. Sin contar calentamiento. ● = va ganando.</div></div>
        </div>
        ${strength ? `<div class="tscroll"><table>
          <thead><tr><th rowspan="2">Ejercicio</th><th class="n" colspan="2">Mejor serie</th><th class="n" colspan="2">1RM est. (kg)</th><th class="n" colspan="2">Máx. reps</th></tr>
          <tr><th class="n">Juan</th><th class="n">Ignacio</th><th class="n">Juan</th><th class="n">Ignacio</th><th class="n">Juan</th><th class="n">Ignacio</th></tr></thead>
          <tbody>${strength}</tbody></table></div>` : `<div class="empty">Registrad sesiones de gimnasio para ver récords.</div>`}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Récords de cardio y constancia</h2><div class="muted num" style="font-size:13px">Juan ${wj} – ${wi} Ignacio</div></div>
        <div class="tscroll"><table><thead><tr><th>Récord</th><th class="n">Juan</th><th class="n">Ignacio</th></tr></thead><tbody>${cardioRows}</tbody></table></div>
      </div>
    </div>`;
}

/* ---------- Registrar ---------- */
const emptySet = () => ({ reps: "", kg: "", rir: "", rest: "", warmup: false });
const emptyEx = () => ({ name: "", group: "", equip: "", notes: "", sets: [emptySet(), emptySet(), emptySet()] });
function newDraft(sport = "gym"){
  const n = new Date();
  return { id: null, sport, date: toISO(n), time: `${pad(n.getHours())}:${pad(n.getMinutes())}`, minutes: "", rpe: "", feeling: "", bodyWeight: "", kcal: "", hrAvg: "", hrMax: "", notes: "",
    exercises: [emptyEx()], bikeType: "", km: "", elevation: "", watts: "", cadence: "", meters: "", poolLength: "25", laps: "", style: "", incline: "", activity: "" };
}
draft = store.get("gym.draft", null);
if (!draft || typeof draft !== "object" || !Array.isArray(draft.exercises)) draft = newDraft();
let saveDraftT;
const saveDraft = () => { clearTimeout(saveDraftT); saveDraftT = setTimeout(() => store.set("gym.draft", draft), 400); };
let saving = false, formErr = "";

const field = (f, label, attrs = "", hint = "") => `<div class="f"><label for="f-${f}">${label}${hint ? ` <small>${hint}</small>` : ""}</label><input id="f-${f}" data-f="${f}" value="${esc(draft[f])}" ${attrs}></div>`;
const selectF = (f, label, opts) => `<div class="f"><label for="f-${f}">${label}</label><select id="f-${f}" data-f="${f}"><option value="">—</option>${opts.map(o => `<option ${draft[f] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
const numA = (step = "any", min = 0, max = "") => `type="number" inputmode="decimal" step="${step}" min="${min}" ${max !== "" ? `max="${max}"` : ""}`;

function renderRegistrar(){
  const v = $("#ap-body"); if (!v) return renderApuntar();
  if (!me) {
    v.innerHTML = `<div class="panel who">
      <div class="eyebrow">Antes de empezar</div>
      <h2>¿Quién eres?</h2>
      <p class="muted" style="margin:0">Se recuerda en este dispositivo. Puedes cambiarlo arriba cuando quieras.</p>
      <div class="opts"><button type="button" class="juan" data-me="juan">Juan</button><button type="button" class="ignacio" data-me="ignacio">Ignacio</button></div>
    </div>`;
    return;
  }
  const d = draft;
  const sport = d.sport;
  let specific = "";
  if (sport === "gym") {
    specific = `<fieldset><legend>Ejercicios</legend>
      <div id="ex-list" style="display:grid;gap:12px">${d.exercises.map(exBlock).join("")}</div>
      <div class="row-btns"><button type="button" class="btn" data-act="add-ex">+ Añadir ejercicio</button></div>
    </fieldset>`;
  } else if (sport === "bici") {
    specific = `<fieldset><legend>Bicicleta</legend><div class="fgrid">
      ${selectF("bikeType", "Tipo", ["Carretera", "Montaña", "Estática", "Spinning", "Rodillo", "Gravel"])}
      ${field("km", "Distancia", numA("0.1"), "km")}
      ${field("elevation", "Desnivel", numA("1"), "m")}
      ${field("watts", "Potencia media", numA("1"), "W")}
      ${field("cadence", "Cadencia media", numA("1"), "rpm")}
    </div></fieldset>`;
  } else if (sport === "natacion") {
    specific = `<fieldset><legend>Natación</legend><div class="fgrid">
      ${field("meters", "Distancia", numA("25"), "m")}
      ${selectF("poolLength", "Piscina (m)", ["25", "50", "Aguas abiertas"])}
      ${field("laps", "Largos", numA("1"), "auto si lo dejas vacío")}
      ${selectF("style", "Estilo", ["Crol", "Braza", "Espalda", "Mariposa", "Mixto", "Técnica"])}
    </div></fieldset>`;
  } else if (sport === "cinta") {
    specific = `<fieldset><legend>Cinta</legend><div class="fgrid">
      ${field("km", "Distancia", numA("0.01"), "km")}
      ${field("incline", "Inclinación media", numA("0.5"), "%")}
    </div></fieldset>`;
  } else {
    specific = `<fieldset><legend>Otra actividad</legend><div class="fgrid">
      <div class="f"><label for="f-activity">Actividad</label><input id="f-activity" data-f="activity" list="dl-otros" value="${esc(d.activity)}" placeholder="Pádel, fútbol, elíptica…"></div>
      ${field("km", "Distancia", numA("0.1"), "km, opcional")}
    </div></fieldset>`;
  }
  const canSave = dbState === "ready";
  v.innerHTML = `<div class="panel">
    <div class="panel-head">
      <div><h2>${d.id ? "Editar sesión" : "Nueva sesión"}</h2><div class="muted" style="font-size:13px;margin-top:2px">Como <b style="color:var(--ink)">${ATH[me]}</b>. Rellena lo que tengas; solo son obligatorios la fecha y los minutos.</div></div>
      ${d.id ? `<button type="button" class="btn sm ghost" data-act="cancel-edit">Cancelar edición</button>` : ""}
    </div>
    <form id="form" novalidate>
      <fieldset><legend>Deporte</legend>
        <div class="sports" role="group" aria-label="Deporte">${Object.entries(SPORTS).map(([k, l]) => `<button type="button" data-sport="${k}" aria-pressed="${k === sport}">${l}</button>`).join("")}</div>
      </fieldset>
      <fieldset><legend>Sesión</legend><div class="fgrid">
        ${field("date", "Fecha", 'type="date" required')}
        ${field("time", "Hora", 'type="time"')}
        ${field("minutes", "Duración", numA("1", 1) + " required", "min")}
        ${field("rpe", "Esfuerzo (RPE)", numA("1", 1, 10), "1–10")}
        ${selectF("feeling", "Sensación", ["Muy mal", "Regular", "Bien", "Muy bien", "Imparable"])}
        ${field("hrAvg", "FC media", numA("1"), "ppm")}
        ${field("hrMax", "FC máxima", numA("1"), "ppm")}
        ${field("kcal", "Calorías", numA("1"), "kcal")}
        ${field("bodyWeight", "Peso corporal", numA("0.1"), "kg")}
      </div></fieldset>
      ${specific}
      <div class="live" id="live"></div>
      <div class="f wide"><label for="f-notes">Notas</label><textarea id="f-notes" data-f="notes" placeholder="Cómo te has sentido, molestias, qué mejorar…">${esc(d.notes)}</textarea></div>
      <div class="form-foot">
        <button type="submit" class="btn primary" ${canSave && !saving ? "" : "disabled"}>${saving ? "Guardando…" : d.id ? "Guardar cambios" : "Guardar sesión"}</button>
        <button type="button" class="btn ghost" data-act="reset">Vaciar</button>
        ${!canSave ? `<span class="err">${dbState === "loading" ? "Conectando con la base de datos…" : (WEB ? "Sin conexión con la base de datos." : "Abre la página desde su enlace de Claude para poder guardar.")}</span>` : ""}
        ${formErr ? `<span class="err" role="alert">${esc(formErr)}</span>` : ""}
      </div>
    </form>
    <datalist id="dl-ex">${Object.keys(CATALOG).map(n => `<option value="${esc(n)}"></option>`).join("")}${[...new Set(data().flatMap(s => (s.exercises || []).map(e => e.name)))].filter(n => !CATALOG[n]).map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
    <datalist id="dl-otros"><option value="Pádel"></option><option value="Fútbol"></option><option value="Tenis"></option><option value="Elíptica"></option><option value="Remo ergómetro"></option><option value="Correr en exterior"></option><option value="Caminar"></option><option value="Yoga"></option><option value="Boxeo"></option><option value="Senderismo"></option></datalist>
  </div>`;
  updateLive();
  d.exercises.forEach((_, i) => updateHint(i));
}
function exBlock(ex, i){
  let wn = 0;
  return `<div class="ex" data-ex="${i}">
    <div class="ex-head">
      <input id="ex-${i}-name" data-ex="${i}" data-ef="name" list="dl-ex" value="${esc(ex.name)}" placeholder="Ejercicio (p. ej. Press banca)" aria-label="Nombre del ejercicio ${i + 1}">
      <button type="button" class="x" data-act="del-ex" data-ex="${i}" aria-label="Quitar ejercicio">×</button>
    </div>
    <div class="ex-meta">
      <select id="ex-${i}-group" data-ex="${i}" data-ef="group" aria-label="Grupo muscular"><option value="">Grupo muscular</option>${GROUPS.map(g => `<option ${ex.group === g ? "selected" : ""}>${g}</option>`).join("")}</select>
      <select id="ex-${i}-equip" data-ex="${i}" data-ef="equip" aria-label="Material"><option value="">Material</option>${EQUIP.map(g => `<option ${ex.equip === g ? "selected" : ""}>${g}</option>`).join("")}</select>
    </div>
    <div class="ex-hint" id="hint-${i}"></div>
    <div id="guide-${i}"></div>
    <div class="sets">
      <div class="setrow hd" aria-hidden="true"><span>#</span><span>Reps</span><span>Kg</span><span>RIR</span><span>Desc. s</span><span>Calent.</span><span></span></div>
      ${ex.sets.map((st, j) => {
        const lab = st.warmup ? "C" : String(++wn);
        return `<div class="setrow ${st.warmup ? "warm" : ""}">
          <span class="i">${lab}</span>
          <input id="s-${i}-${j}-reps" data-ex="${i}" data-set="${j}" data-sf="reps" type="number" inputmode="numeric" min="0" step="1" value="${esc(st.reps)}" aria-label="Repeticiones serie ${j + 1}">
          <input id="s-${i}-${j}-kg" data-ex="${i}" data-set="${j}" data-sf="kg" type="number" inputmode="decimal" min="0" step="any" value="${esc(st.kg)}" aria-label="Kilos serie ${j + 1}">
          <input id="s-${i}-${j}-rir" data-ex="${i}" data-set="${j}" data-sf="rir" type="number" inputmode="numeric" min="0" max="10" step="1" value="${esc(st.rir)}" aria-label="Repeticiones en reserva serie ${j + 1}">
          <input id="s-${i}-${j}-rest" data-ex="${i}" data-set="${j}" data-sf="rest" type="number" inputmode="numeric" min="0" step="5" value="${esc(st.rest)}" aria-label="Descanso en segundos serie ${j + 1}">
          <span class="wu"><input id="s-${i}-${j}-wu" data-ex="${i}" data-set="${j}" data-sf="warmup" type="checkbox" ${st.warmup ? "checked" : ""} aria-label="Serie de calentamiento"></span>
          <button type="button" class="x" data-act="del-set" data-ex="${i}" data-set="${j}" aria-label="Quitar serie">×</button>
        </div>`;
      }).join("")}
    </div>
    <div class="f"><label for="ex-${i}-notes">Notas del ejercicio <small>técnica, agarre, tempo…</small></label><input id="ex-${i}-notes" data-ex="${i}" data-ef="notes" value="${esc(ex.notes)}"></div>
    <div class="row-btns"><button type="button" class="btn sm" data-act="add-set" data-ex="${i}">+ Serie</button><button type="button" class="btn sm ghost" data-act="dup-ex" data-ex="${i}">Duplicar ejercicio</button></div>
  </div>`;
}
function updateLive(){
  const el = $("#live"); if (!el) return;
  const d = draft, m = num(d.minutes); let t = "";
  if (d.sport === "gym") {
    const g = gymStats(d);
    t = `Llevas <b>${d.exercises.filter(e => e.name.trim()).length}</b> ejercicios · <b>${g.sets}</b> series efectivas · <b>${fmt(g.reps)}</b> reps · <b>${fmt(g.vol)} kg</b> de volumen`;
  } else if (d.sport === "bici") {
    t = num(d.km) && m ? `Velocidad media: <b>${fmt(num(d.km) / (m / 60), 1)} km/h</b>` : "Pon distancia y minutos para calcular la velocidad media.";
  } else if (d.sport === "natacion") {
    const pl = num(d.poolLength);
    t = num(d.meters) && m ? `Ritmo: <b>${mmss(m * 100 / num(d.meters))} /100 m</b>${pl && !num(d.laps) ? ` · <b>${fmt(num(d.meters) / pl)}</b> largos` : ""}` : "Pon metros y minutos para calcular el ritmo.";
  } else if (d.sport === "cinta") {
    t = num(d.km) && m ? `Ritmo: <b>${mmss(m / num(d.km))} min/km</b> · Velocidad: <b>${fmt(num(d.km) / (m / 60), 1)} km/h</b>` : "Pon distancia y minutos para calcular ritmo y velocidad.";
  } else {
    t = "Apunta qué has hecho y cuánto tiempo.";
  }
  el.innerHTML = t;
}
function bestFor(who, name){
  const key = normName(name); let b = null, last = null;
  for (const s of data()) if (s.athlete === who && s.sport === "gym" && s.id !== draft.id) for (const e of s.exercises || []) {
    if (normName(e.name) !== key) continue;
    const work = (e.sets || []).filter(x => !x.warmup && num(x.reps));
    if (work.length && (!last || s.date > last.date)) last = { date: s.date, sets: work };
    for (const st of work) if (!b || num(st.kg) > b.kg || (num(st.kg) === b.kg && num(st.reps) > b.reps)) b = { kg: num(st.kg), reps: num(st.reps) };
  }
  return { b, last };
}
function updateGuide(i){
  const el = $("#guide-" + i), ex = draft.exercises[i]; if (!el || !ex) return;
  const name = canonicalName(ex.name);
  if (!GUIDE[name]) { el.innerHTML = ""; return; }
  const open = guideOpen.has(i);
  const want = `<button type="button" class="btn sm ghost" data-act="guide" data-ex="${i}" aria-expanded="${open}">${open ? "Ocultar dibujo" : "Cómo se hace"}</button>${open ? inlineGuide(name) : ""}`;
  if (el.dataset.state !== name + open) { el.dataset.state = name + open; el.innerHTML = want; mountFigs(); }
}
function updateHint(i){
  updateGuide(i);
  const el = $("#hint-" + i); const ex = draft.exercises[i]; if (!el || !ex) return;
  if (!ex.name.trim()) { el.innerHTML = ""; return; }
  const mine = bestFor(me, ex.name), his = bestFor(OTHER[me], ex.name);
  const f = b => b ? (b.kg > 0 ? `${fmt(b.kg, 2)} kg × ${b.reps}` : `${b.reps} reps`) : "sin datos";
  const parts = [];
  if (mine.last) {
    const s = mine.last.sets, same = s.every(x => num(x.kg) === num(s[0].kg) && num(x.reps) === num(s[0].reps));
    parts.push(`<span>Última vez (${shortDate(parseISO(mine.last.date))}): <b class="num">${same ? `${s.length} × ${fmt(num(s[0].reps))}${num(s[0].kg) ? ` a ${fmt(num(s[0].kg), 2)} kg` : ""}` : s.map(x => `${fmt(num(x.reps))}×${fmt(num(x.kg), 2)}`).join(", ")}</b></span>`);
  }
  parts.push(`<span><i class="dot ${me}"></i> Tu mejor: <b class="num">${f(mine.b)}</b></span>`);
  parts.push(`<span><i class="dot ${OTHER[me]}"></i> ${ATH[OTHER[me]]}: <b class="num">${f(his.b)}</b></span>`);
  el.innerHTML = parts.join("");
}
function clean(o){ const r = {}; for (const [k, v] of Object.entries(o)) if (v !== "" && v != null && !(typeof v === "number" && !isFinite(v))) r[k] = v; return r; }
function buildDoc(){
  const d = draft, n = v => (String(v).trim() === "" ? null : num(v));
  const doc = clean({
    athlete: me, sport: d.sport, date: d.date, time: d.time, minutes: n(d.minutes), rpe: n(d.rpe), feeling: d.feeling,
    hrAvg: n(d.hrAvg), hrMax: n(d.hrMax), kcal: n(d.kcal), bodyWeight: n(d.bodyWeight), notes: (d.notes || "").trim(), updatedAt: Date.now()
  });
  if (d.sport === "gym") {
    doc.exercises = d.exercises.filter(e => e.name.trim()).map(e => clean({
      name: e.name.trim(), group: e.group || CATALOG[e.name.trim()] || "", equip: e.equip, notes: (e.notes || "").trim(),
      sets: e.sets.filter(s => String(s.reps).trim() !== "" || String(s.kg).trim() !== "").map(s => clean({ reps: n(s.reps) ?? 0, kg: n(s.kg) ?? 0, rir: n(s.rir), rest: n(s.rest), warmup: !!s.warmup }))
    }));
  }
  if (d.sport === "bici") Object.assign(doc, clean({ bikeType: d.bikeType, km: n(d.km), elevation: n(d.elevation), watts: n(d.watts), cadence: n(d.cadence) }));
  if (d.sport === "natacion") {
    const pl = num(d.poolLength);
    Object.assign(doc, clean({ meters: n(d.meters), poolLength: pl || null, openWater: d.poolLength === "Aguas abiertas" || null, style: d.style, laps: n(d.laps) ?? (pl && num(d.meters) ? Math.round(num(d.meters) / pl) : null) }));
  }
  if (d.sport === "cinta") Object.assign(doc, clean({ km: n(d.km), incline: n(d.incline) }));
  if (d.sport === "otro") Object.assign(doc, clean({ activity: (d.activity || "").trim(), km: n(d.km) }));
  return doc;
}
function validate(doc){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.date || "")) return "Pon la fecha de la sesión.";
  if (!(doc.minutes > 0)) return "Pon cuántos minutos has entrenado.";
  if (doc.sport === "gym" && !(doc.exercises || []).some(e => (e.sets || []).some(s => s.reps > 0))) return "Añade al menos un ejercicio con repeticiones.";
  return "";
}
async function submit(){
  if (saving || dbState !== "ready") return;
  const doc = buildDoc(); formErr = validate(doc);
  if (formErr) { renderRegistrar(); return; }
  saving = true; renderRegistrar();
  try {
    const col = db.collection("sesiones");
    if (draft.id) {
      const prev = real.find(s => s.id === draft.id);
      await col.doc(draft.id).set({ ...doc, createdAt: prev?.createdAt || Date.now() });
    } else {
      await col.doc().set({ ...doc, createdAt: Date.now() });
    }
    const wasEdit = !!draft.id;
    draft = newDraft(draft.sport); store.del("gym.draft"); formErr = "";
    toast(wasEdit ? "Cambios guardados" : "Sesión guardada. " + (ATH[OTHER[me]]) + " ya puede verla.");
    saving = false; setTab(wasEdit ? "historial" : "duelo");
    return;
  } catch (e) {
    const c = e && e.code;
    formErr = c === "invalid_argument" ? (WEB ? "No se puede guardar: solo puedes apuntar tus propios datos." : "No tienes permiso para guardar aquí: pide al dueño que te comparta la página con acceso “Puede interactuar”.")
      : c === "quota_exceeded" ? "La base de datos está llena. Borra sesiones antiguas para seguir guardando."
      : "No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.";
  }
  saving = false; renderRegistrar();
}
function loadForEdit(id){
  const s = real.find(x => x.id === id); if (!s || s.athlete !== me) return;
  const str = v => v == null ? "" : String(v);
  draft = { ...newDraft(s.sport), id: s.id, date: s.date || "", time: str(s.time), minutes: str(s.minutes), rpe: str(s.rpe), feeling: str(s.feeling), bodyWeight: str(s.bodyWeight),
    kcal: str(s.kcal), hrAvg: str(s.hrAvg), hrMax: str(s.hrMax), notes: str(s.notes), bikeType: str(s.bikeType), km: str(s.km), elevation: str(s.elevation), watts: str(s.watts),
    cadence: str(s.cadence), meters: str(s.meters), poolLength: s.openWater ? "Aguas abiertas" : str(s.poolLength || 25), laps: str(s.laps), style: str(s.style), incline: str(s.incline), activity: str(s.activity),
    exercises: (s.exercises && s.exercises.length ? s.exercises : [emptyEx()]).map(e => ({ name: str(e.name), group: str(e.group), equip: str(e.equip), notes: str(e.notes),
      sets: (e.sets || []).map(st => ({ reps: str(st.reps), kg: str(st.kg), rir: str(st.rir), rest: str(st.rest), warmup: !!st.warmup })) })) };
  formErr = ""; apMode = "form"; setTab("apuntar");
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, .sess, [data-me]");
  if (!t) return;
  if (t.id === "switch-me") { me = null; store.del("gym.me"); renderAll(); setTab("apuntar"); return; }
  if (t.dataset.me) { me = t.dataset.me; store.set("gym.me", me); renderAll(); return; }
  if (t.dataset.tab) { setTab(t.dataset.tab); return; }
  if (t.dataset.cm) { chartMetric = t.dataset.cm; store.set("gym.chart", chartMetric); renderDuelo(); return; }
  if (t.dataset.edit) { loadForEdit(t.dataset.edit); return; }
  if (t.dataset.askdel) { confirmDel = t.dataset.askdel; renderHistorial(); return; }
  if (t.hasAttribute("data-nodel")) { confirmDel = null; renderHistorial(); return; }
  if (t.dataset.del) {
    const id = t.dataset.del; confirmDel = null;
    db.collection("sesiones").doc(id).delete().then(() => toast("Sesión borrada")).catch(() => toast("No se ha podido borrar"));
    return;
  }
  if (t.dataset.sport) { draft.sport = t.dataset.sport; saveDraft(); formErr = ""; renderRegistrar(); return; }
  if (t.dataset.act) {
    const a = t.dataset.act, i = +t.dataset.ex, j = +t.dataset.set;
    if (a === "add-ex") { draft.exercises.push(emptyEx()); renderRegistrar(); setTimeout(() => $(`#ex-${draft.exercises.length - 1}-name`)?.focus(), 0); }
    if (a === "del-ex") { draft.exercises.splice(i, 1); if (!draft.exercises.length) draft.exercises.push(emptyEx()); renderRegistrar(); }
    if (a === "dup-ex") { draft.exercises.splice(i + 1, 0, JSON.parse(JSON.stringify(draft.exercises[i]))); renderRegistrar(); }
    if (a === "add-set") { const s = draft.exercises[i].sets; const last = s[s.length - 1]; s.push(last ? { ...last, warmup: false } : emptySet()); renderRegistrar(); setTimeout(() => $(`#s-${i}-${s.length - 1}-reps`)?.focus(), 0); }
    if (a === "del-set") { draft.exercises[i].sets.splice(j, 1); renderRegistrar(); }
    if (a === "reset") { const sp = draft.sport; const id = draft.id; draft = newDraft(sp); draft.id = id; formErr = ""; renderRegistrar(); }
    if (a === "cancel-edit") { draft = newDraft(draft.sport); formErr = ""; renderRegistrar(); }
    saveDraft(); return;
  }
  if (t.classList.contains("sess") && !e.target.closest(".sess-detail")) { toggleSess(t.dataset.sid); }
});
document.addEventListener("keydown", e => {
  const t = e.target;
  if (t.classList && t.classList.contains("sess") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleSess(t.dataset.sid); }
});
function toggleSess(id){ openSess.has(id) ? openSess.delete(id) : openSess.add(id); confirmDel = null; renderHistorial(); $(`.sess[data-sid="${CSS.escape(id)}"]`)?.focus(); }
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.f) { draft[t.dataset.f] = t.value; }
  else if (t.dataset.sf) {
    const st = draft.exercises[+t.dataset.ex].sets[+t.dataset.set];
    if (t.dataset.sf === "warmup") { st.warmup = t.checked; renderRegistrar(); saveDraft(); return; }
    st[t.dataset.sf] = t.value;
  } else if (t.dataset.ef) {
    const ex = draft.exercises[+t.dataset.ex]; ex[t.dataset.ef] = t.value;
    if (t.dataset.ef === "name") {
      const g = CATALOG[t.value.trim()];
      if (g && !ex.group) { ex.group = g; const sel = $(`#ex-${t.dataset.ex}-group`); if (sel) sel.value = g; }
      updateHint(+t.dataset.ex);
    }
  } else return;
  updateLive(); saveDraft();
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "period") { period = t.value; store.set("gym.period", period); renderAll(); }
  if (t.id === "h-who") { histWho = t.value; renderHistorial(); }
  if (t.id === "h-sport") { histSport = t.value; renderHistorial(); }
  if (t.dataset && (t.dataset.f || t.dataset.ef) && t.tagName === "SELECT") { if (t.dataset.f) draft[t.dataset.f] = t.value; else draft.exercises[+t.dataset.ex][t.dataset.ef] = t.value; updateLive(); saveDraft(); }
});
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "wform") saveWeight();
  else if (e.target.id === "pform") saveProfile();
  else if (e.target.id === "form") submit();
});
let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (tab === "duelo") renderChart(); if (tab === "cuerpo") renderWChart(); }, 150); });

