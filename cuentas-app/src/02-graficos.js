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
