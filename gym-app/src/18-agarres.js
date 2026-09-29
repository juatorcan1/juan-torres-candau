/* ---------- grips and bars: which handle or bar you use ----------
   Line drawings of the usual cable attachments and bars. Each exercise that can be done with several
   lists them; the athlete's choice is kept in perfiles/<who>.agarres and shows every time. */
const cableTop = x => `<line class="gc" x1="${x}" y1="0" x2="${x}" y2="13"/><circle class="gk" cx="${x}" cy="13" r="3"/>`;
const GRIPS = {
  barra_larga: { l: "Barra larga", t: "Agarre algo más ancho que los hombros: dorsal ancho.",
    s: cableTop(60) + `<path class="gb" d="M8 36 L24 22 L96 22 L112 36"/><path class="gh" d="M8 36 L20 25.5 M100 25.5 L112 36"/>` },
  neutro: { l: "Agarre neutro", t: "Palmas enfrentadas: más cómodo para los hombros.",
    s: cableTop(60) + `<path class="gb" d="M22 20 L98 20"/><path class="gh" d="M32 20 L32 46 M88 20 L88 46"/>` },
  triangulo: { l: "Triángulo", t: "Agarre estrecho: más recorrido y más bíceps.",
    s: cableTop(60) + `<path class="gb" d="M60 16 L44 46 L76 46 Z"/><path class="gh" d="M46 46 L74 46"/>` },
  barra_recta: { l: "Barra recta", t: "Palmas hacia abajo o hacia ti, según el ejercicio.",
    s: cableTop(60) + `<path class="gb" d="M24 24 L96 24"/><path class="gh" d="M28 24 L48 24 M72 24 L92 24"/>` },
  cuerda: { l: "Cuerda", t: "Separa las manos al final del movimiento.",
    s: cableTop(60) + `<path class="gr" d="M60 16 Q50 30 46 44 M60 16 Q70 30 74 44"/><circle class="gk" cx="46" cy="47" r="4.5"/><circle class="gk" cx="74" cy="47" r="4.5"/>` },
  maneral: { l: "Maneral", t: "A una mano: corrige si un lado va más flojo.",
    s: cableTop(60) + `<path class="gb" d="M60 16 L44 32 L76 32 Z"/><path class="gh" d="M44 32 L48 44 L72 44 L76 32 M48 44 L72 44"/>` },
  ez: { l: "Barra Z", t: "Menos tensión en las muñecas.",
    s: `<path class="gb" d="M8 30 L34 30 L42 38 L50 22 L58 38 L66 22 L74 38 L82 30 L112 30"/>` },
  olimpica: { l: "Barra larga", t: "La barra olímpica larga pesa 20 kg: súmalos al disco.",
    s: `<path class="gb" d="M2 30 L118 30"/><rect class="gp" x="12" y="14" width="8" height="32" rx="2"/><rect class="gp" x="100" y="14" width="8" height="32" rx="2"/><path class="gh" d="M36 30 L50 30 M70 30 L84 30"/>` },
  corta: { l: "Barra corta", t: "La corta pesa menos (suele ser de 5 a 10 kg): pregunta o pésala.",
    s: `<path class="gb" d="M26 30 L94 30"/><rect class="gp" x="30" y="20" width="6" height="20" rx="2"/><rect class="gp" x="84" y="20" width="6" height="20" rx="2"/><path class="gh" d="M44 30 L54 30 M66 30 L76 30"/>` }
};
const GRIP_OPTIONS = {
  "Jalón al pecho": ["barra_larga", "neutro", "triangulo", "barra_recta"],
  "Remo en polea baja": ["triangulo", "neutro", "barra_recta", "cuerda"],
  "Extensión en polea": ["cuerda", "barra_recta", "ez", "maneral"],
  "Curl en polea": ["barra_recta", "ez", "cuerda", "maneral"],
  "Face pull": ["cuerda", "maneral"],
  "Press inclinado con barra": ["olimpica", "corta"],
  "Press banca": ["olimpica", "corta"],
  "Press militar": ["olimpica", "corta"],
  "Remo con barra": ["olimpica", "corta"],
  "Curl con barra": ["corta", "ez"]
};
const gripOf = (name, who = me) => { const a = profiles[who] && profiles[who].agarres, k = a && a[canonicalName(name)]; return GRIPS[k] ? k : ""; };
const gripSVG = k => `<svg class="grip-ico" viewBox="0 0 120 56" aria-hidden="true">${GRIPS[k].s}</svg>`;
function gripHTML(name){
  const opts = GRIP_OPTIONS[canonicalName(name)]; if (!opts || !me) return "";
  const sel = gripOf(name);
  return `<div class="grips"><div class="eyebrow">${sel ? "Tu agarre" : "¿Con qué agarre? Toca el tuyo"}</div>
    <div class="grip-row" role="group" aria-label="Agarre para ${esc(name)}">${opts.map(k => `<button type="button" class="grip" data-grip="${esc(name)}" data-k="${k}" aria-pressed="${sel === k}">${gripSVG(k)}<span>${GRIPS[k].l}</span></button>`).join("")}</div>
    ${sel ? `<div class="muted grip-tip">${esc(GRIPS[sel].t)}</div>` : ""}</div>`;
}
// small tag for lists (preview of the workout)
function gripTag(name){ const k = gripOf(name); return k ? `<span class="grip-tag">${gripSVG(k)}${GRIPS[k].l}</span>` : ""; }
const gripsText = who => Object.entries((profiles[who] && profiles[who].agarres) || {}).filter(([, k]) => GRIPS[k]).map(([n, k]) => `${n}: ${GRIPS[k].l.toLowerCase()}`).join("; ");

async function saveGrip(name, k){
  if (dbState !== "ready" || !me) return;
  const agarres = { ...((profiles[me] && profiles[me].agarres) || {}) }, n = canonicalName(name);
  if (!k || agarres[n] === k) delete agarres[n]; else agarres[n] = k;
  const doc = { ...profileDoc(me), agarres, updatedAt: Date.now() };
  profiles[me] = { id: me, ...doc };
  if (playerOpen()) renderPlayer(); else renderView();
  if (zoomEl && !zoomEl.hidden) openZoom(name);
  try { await db.doc("perfiles/" + me).set(doc); } catch { toast("No se ha podido guardar el agarre"); }
}
document.addEventListener("click", e => {
  const t = e.target.closest("button[data-grip]"); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  saveGrip(t.dataset.grip, t.dataset.k);
}, true);
