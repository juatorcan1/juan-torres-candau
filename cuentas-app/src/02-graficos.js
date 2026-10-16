/* ================= gráficos ================= */
// Escala "bonita" para el eje
function niceMax(v){
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 1.2, 1.6, 2, 2.4, 3, 4, 6, 8, 10]) if (k * p >= v) return k * p;   // divisibles en cuartos redondos
  return 10 * p;
}
const NF1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const axisLab = v => Math.abs(v) >= 10000 ? NF1.format(v / 1000) + " mil" : NF0.format(v);
function tipShow(wrap, x, y, html){
  let t = wrap.querySelector(".tip");
  if (!t) { t = document.createElement("div"); t.className = "tip"; wrap.appendChild(t); }
  t.innerHTML = html; t.hidden = false;
  const w = wrap.clientWidth;
  t.style.left = Math.min(Math.max(x, 80), w - 80) + "px"; t.style.top = y + "px";
}
function tipHide(wrap){ const t = wrap.querySelector(".tip"); if (t) t.hidden = true; }
function bindTips(wrap, svg, W, rows){
  wrap.querySelectorAll(".hit").forEach(h => {
    const i = +h.dataset.i;
    const show = () => { const r = svg.getBoundingClientRect(), k = r.width / W; tipShow(wrap, (+h.dataset.cx) * k, (+h.dataset.ty) * k, rows(i)); };
    h.addEventListener("pointerenter", show); h.addEventListener("focus", show);
    h.addEventListener("pointerleave", () => tipHide(wrap)); h.addEventListener("blur", () => tipHide(wrap));
  });
}

// Barras por mes, varias series lado a lado; cada serie con parte real y parte prevista.
// series: [{label, color, real[12], prev[12]}]
function monthBars(el, series, opts = {}){
  const W = Math.round(Math.max(340, Math.min(720, el.clientWidth || 640))), H = opts.h || 230, L = 46, R = 8, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const tot = i => series.map(s => (s.real[i] || 0) + ((s.prev || [])[i] || 0));
  const max = niceMax(Math.max(1, ...Array.from({ length: 12 }, (_, i) => Math.max(...tot(i)))));
  const cw = pw / 12, gap = 2, bw = Math.max(3, Math.min(18, (cw - (cw < 30 ? 4 : 10)) / series.length - gap));
  const yv = v => T + ph - v / max * ph;
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = max * k / 4, y = yv(v); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="axis" x="${L - 6}" y="${y + 4}" text-anchor="end">${axisLab(v)}</text>`; }
  let bars = "", hits = "";
  for (let i = 0; i < 12; i++) {
    const x0 = L + i * cw + (cw - (bw + gap) * series.length + gap) / 2;
    series.forEach((s, j) => {
      const x = x0 + j * (bw + gap), rv = Math.max(0, s.real[i] || 0), pv = Math.max(0, (s.prev || [])[i] || 0);
      const yR = yv(rv), hR = T + ph - yR;
      if (pv > 0) { const yP = yv(rv + pv); bars += `<path d="${roundTop(x, yP, bw, yR - yP + (rv > 0 ? 0 : 0))}" style="fill:${s.color};fill-opacity:.22;stroke:${s.color}" stroke-dasharray="3 2" stroke-width="1.2"/>`; }
      if (rv > 0) bars += `<path d="${pv > 0 ? rect(x, yR, bw, hR) : roundTop(x, yR, bw, hR)}" style="fill:${s.color}"/>`;
    });
    const top = Math.min(...series.map(s => yv((s.real[i] || 0) + ((s.prev || [])[i] || 0))));
    hits += `<rect class="hit" tabindex="0" data-i="${i}" data-cx="${L + i * cw + cw / 2}" data-ty="${top}" x="${L + i * cw}" y="${T}" width="${cw}" height="${ph}" aria-label="${MESL[i]}"/>`;
    g += `<text class="axis" x="${L + i * cw + cw / 2}" y="${H - 8}" text-anchor="middle">${W < 460 ? MES[i][0].toUpperCase() : MES[i]}</text>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "Por meses")}">${g}<line class="base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>${bars}${hits}</svg>`;
  bindTips(el, el.querySelector("svg"), W, i => `<b>${cap(MESL[i])}</b>` + series.map(s => {
    const rv = s.real[i] || 0, pv = (s.prev || [])[i] || 0;
    return `<div class="r"><span class="sw" style="background:${s.color}"></span>${esc(s.label)}: ${eur(rv + pv)}${pv > 0.005 ? ` <span style="opacity:.7">(${rv > 0.005 ? eur(pv) + " previsto" : "previsto"})</span>` : ""}</div>`;
  }).join(""));
}
function rect(x, y, w, h){ return `M${x},${y}h${w}v${h}h${-w}z`; }
function roundTop(x, y, w, h){ const r = Math.min(4, w / 2, h); if (h <= 0) return ""; return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`; }

// Líneas por mes. series: [{label, color, values[12] (null = sin dato), dashFrom (índice desde el que es previsión), dash}]
function monthLines(el, series, opts = {}){
  const W = Math.round(Math.max(340, Math.min(720, el.clientWidth || 640))), H = opts.h || 220, L = 52, R = 12, T = 14, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const N = series[0].values.length, LAB = opts.labels || MES, TIPL = opts.tipLabels || MESL.map(cap);
  const vals = series.flatMap(s => s.values.filter(v => v != null));
  let lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  hi = niceMax(hi); if (lo < 0) lo = -niceMax(-lo);
  const xv = i => L + (i + .5) * pw / N, yv = v => T + ph - (v - lo) / (hi - lo) * ph;
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = yv(v); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="axis" x="${L - 6}" y="${y + 4}" text-anchor="end">${axisLab(v)}</text>`; }
  if (lo < 0) g += `<line class="base" x1="${L}" x2="${W - R}" y1="${yv(0)}" y2="${yv(0)}"/>`;
  const step = N > 12 ? (W < 460 ? 3 : 2) : 1;
  for (let i = 0; i < N; i++) if (i % step === 0 || i === N - 1) g += `<text class="axis" x="${xv(i)}" y="${H - 8}" text-anchor="middle">${N <= 12 && W < 460 ? String(LAB[i])[0].toUpperCase() : LAB[i]}</text>`;
  let paths = "";
  for (const s of series) {
    const pts = s.values.map((v, i) => v == null ? null : [xv(i), yv(v)]);
    const seg = (from, to) => { let d = "", on = false; for (let i = from; i <= to; i++) { const p = pts[i]; if (!p) { on = false; continue; } d += (on ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); on = true; } return d; };
    const df = s.dashFrom == null ? N : s.dashFrom;
    const solid = df > 0 ? seg(0, Math.min(N - 1, df - 1)) : "", dashed = df < N ? seg(Math.max(0, df - 1), N - 1) : "";
    if (s.area && solid) { const idx = pts.map((p, i) => p && i < df ? i : -1).filter(i => i >= 0); if (idx.length > 1) paths += `<path d="${solid}L${xv(idx[idx.length - 1])},${yv(Math.max(lo, 0))}L${xv(idx[0])},${yv(Math.max(lo, 0))}z" style="fill:${s.color};fill-opacity:.10"/>`; }
    if (s.dash) { if (solid || dashed) paths += `<path d="${seg(0, N - 1)}" style="fill:none;stroke:${s.color}" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round"/>`; }
    else {
      if (solid) paths += `<path d="${solid}" style="fill:none;stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (dashed) paths += `<path d="${dashed}" style="fill:none;stroke:${s.color}" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
    }
    const lastI = pts.reduce((a, p, i) => p ? i : a, -1);
    if (lastI >= 0 && s.endDot !== false) paths += `<circle cx="${pts[lastI][0]}" cy="${pts[lastI][1]}" r="4" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>`;
  }
  let hits = "";
  for (let i = 0; i < N; i++) { const tops = series.map(s => s.values[i]).filter(v => v != null); hits += `<rect class="hit" tabindex="0" data-i="${i}" data-cx="${xv(i)}" data-ty="${tops.length ? yv(Math.max(...tops)) : T + ph / 2}" x="${L + i * pw / N}" y="${T}" width="${pw / N}" height="${ph}" aria-label="${esc(TIPL[i])}"/>`; }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "Evolución")}">${g}${paths}${hits}</svg>`;
  bindTips(el, el.querySelector("svg"), W, i => `<b>${esc(TIPL[i])}</b>` + series.filter(s => s.values[i] != null).map(s => `<div class="r"><span class="sw" style="background:${s.color}"></span>${esc(s.label)}: ${eur(s.values[i])}${s.dashFrom != null && i >= s.dashFrom ? " <span style='opacity:.7'>(previsto)</span>" : ""}</div>`).join(""));
}
function sparkline(values, color){
  const v = values.filter(x => x != null); if (v.length < 2) return "";
  const W = 200, H = 36, lo = Math.min(...v), hi = Math.max(...v), rg = hi - lo || 1;
  const pts = values.map((x, i) => x == null ? null : [i * W / (values.length - 1), H - 3 - (x - lo) / rg * (H - 6)]).filter(Boolean);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="-4 0 ${W + 8} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L")}" style="fill:none;stroke:${color}" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="3" style="fill:${color}"/></svg>`;
}
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Una línea en el tiempo (pts: [[ms, valor]], ordenados), para precios: el eje no empieza en cero y
// una raya vertical sigue al dedo hasta el día más cercano. opts: {unit, tip(i) → html, label, color}
function niceStep(x){
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= x) return k * p;
  return 10 * p;
}
function timeTicks(t0, t1){
  const d0 = new Date(t0), days = (t1 - t0) / 864e5, out = [];
  if (days > 800) {
    const n = new Date(t1).getFullYear() - d0.getFullYear(), st = Math.max(1, Math.ceil(n / 6));
    for (let y = d0.getFullYear() + 1; y <= new Date(t1).getFullYear(); y += st) out.push([new Date(y, 0, 1).getTime(), String(y)]);
  } else if (days > 75) {
    const st = Math.max(1, Math.ceil(days / 30.4 / 6));
    for (let d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + st, 1))
      out.push([d.getTime(), d.getMonth() === 0 || days > 400 ? MES[d.getMonth()] + " " + String(d.getFullYear()).slice(2) : MES[d.getMonth()]]);
  } else {
    const st = Math.max(1, Math.ceil(days / 5));
    for (let d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + st))
      out.push([d.getTime(), d.getDate() + " " + MES[d.getMonth()]]);
  }
  return out;
}
function timeLine(el, pts, opts = {}){
  const W = Math.round(Math.max(300, Math.min(720, el.clientWidth || 640))), H = opts.h || 210, L = 58, R = 14, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B, color = opts.color || "var(--ing)";
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0], ts = t1 - t0 || 1;
  const vs = pts.map(p => p[1]), vmin = Math.min(...vs), vmax = Math.max(...vs);
  const pad = (vmax - vmin) * 0.08 || Math.abs(vmax) * 0.05 || 1;
  let step = niceStep((vmax - vmin + 2 * pad) / 4);
  let lo = Math.floor((vmin - pad) / step) * step, hi = Math.ceil((vmax + pad) / step) * step;
  if (lo < 0 && vmin >= 0) lo = 0;
  if ((hi - lo) / step > 6) { step *= 2; lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; }
  const dec = Math.min(4, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  const nf = new Intl.NumberFormat("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const xv = t => L + (t - t0) / ts * pw, yv = v => T + ph - (v - lo) / (hi - lo) * ph;
  let g = "";
  for (let k = 0; lo + k * step <= hi + step / 1e6; k++) { const v = lo + k * step, y = yv(v); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="axis" x="${L - 6}" y="${y + 4}" text-anchor="end">${nf.format(v)}${opts.unit ? " " + opts.unit : ""}</text>`; }
  for (const [t, lab] of timeTicks(t0, t1)) { const x = xv(t); if (x < L + 16 || x > W - R - 16) continue; g += `<text class="axis" x="${x}" y="${H - 8}" text-anchor="middle">${lab}</text>`; }
  const d = "M" + pts.map(p => xv(p[0]).toFixed(1) + "," + yv(p[1]).toFixed(1)).join("L");
  const last = pts[pts.length - 1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "Evolución")}">${g}<line class="base" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>`
    + `<path d="${d}" style="fill:none;stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<circle cx="${xv(last[0])}" cy="${yv(last[1])}" r="4" style="fill:${color};stroke:var(--surface)" stroke-width="2"/>`
    + `<line class="cross" x1="0" x2="0" y1="${T}" y2="${T + ph}" visibility="hidden"/><circle class="cross-dot" r="5" style="fill:${color};stroke:var(--surface)" stroke-width="2" visibility="hidden"/>`
    + `<rect class="t-hit" tabindex="0" x="${L}" y="${T}" width="${pw}" height="${ph}" aria-label="${esc(opts.label || "Evolución")}: usa las flechas para ir de un día a otro"/></svg>`;
  const svg = el.querySelector("svg"), hit = svg.querySelector(".t-hit"), cross = svg.querySelector(".cross"), dot = svg.querySelector(".cross-dot");
  let cur = -1;
  const show = i => {
    cur = Math.max(0, Math.min(pts.length - 1, i));
    const x = xv(pts[cur][0]), y = yv(pts[cur][1]), k = svg.getBoundingClientRect().width / W;
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("visibility", "visible");
    tipShow(el, x * k, y * k, opts.tip ? opts.tip(cur) : nf.format(pts[cur][1]));
  };
  const hide = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tipHide(el); };
  const nearest = cx => {
    const r = svg.getBoundingClientRect(), t = t0 + ((cx - r.left) * W / r.width - L) / pw * ts;
    let a = 0, b = pts.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (pts[m][0] < t) a = m; else b = m; }
    return t - pts[a][0] <= pts[b][0] - t ? a : b;
  };
  hit.addEventListener("pointermove", e => show(nearest(e.clientX)));
  hit.addEventListener("pointerdown", e => show(nearest(e.clientX)));
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("focus", () => show(cur < 0 ? pts.length - 1 : cur));
  hit.addEventListener("blur", hide);
  hit.addEventListener("keydown", e => {
    const st = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") { show(cur - st); e.preventDefault(); }
    else if (e.key === "ArrowRight") { show(cur + st); e.preventDefault(); }
    else if (e.key === "Home") { show(0); e.preventDefault(); }
    else if (e.key === "End") { show(pts.length - 1); e.preventDefault(); }
  });
}
