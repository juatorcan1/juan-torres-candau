/* ---------- muscles: the body map and which muscles each exercise works ----------
   Front and back silhouettes in one 250 × 252 viewBox (front at x 0, back at x 130).
   Level 2 = main muscle (red, pulsing), level 1 = helper muscle (pale red). */
const MUSCLES = {
  pectoral: "Pectoral", deltoides: "Hombro", biceps: "Bíceps", triceps: "Tríceps", antebrazo: "Antebrazo",
  abdomen: "Abdomen", oblicuos: "Oblicuos", trapecio: "Trapecio", dorsal: "Dorsal", lumbar: "Lumbar",
  gluteo: "Glúteo", cuadriceps: "Cuádriceps", isquios: "Isquiotibiales", gemelos: "Gemelos"
};
const MUSCLE_ORDER = ["pectoral", "dorsal", "deltoides", "trapecio", "biceps", "triceps", "antebrazo", "abdomen", "oblicuos", "lumbar", "gluteo", "cuadriceps", "isquios", "gemelos"];
// [main muscles, helper muscles]
const EX_MUS = {
  "Sentadilla": [["cuadriceps", "gluteo"], ["lumbar", "isquios", "abdomen"]], "Press banca": [["pectoral"], ["triceps", "deltoides"]],
  "Peso muerto": [["gluteo", "isquios", "lumbar"], ["dorsal", "trapecio", "cuadriceps", "antebrazo"]], "Peso muerto rumano": [["isquios", "gluteo"], ["lumbar"]],
  "Press militar": [["deltoides"], ["triceps", "trapecio", "abdomen"]], "Remo con barra": [["dorsal"], ["biceps", "trapecio", "lumbar"]],
  "Dominadas": [["dorsal"], ["biceps", "antebrazo", "abdomen"]], "Jalón al pecho": [["dorsal"], ["biceps"]], "Curl con barra": [["biceps"], ["antebrazo"]],
  "Curl martillo": [["biceps", "antebrazo"], []], "Curl en banco Scott": [["biceps"], ["antebrazo"]], "Extensión en polea": [["triceps"], []],
  "Press francés": [["triceps"], []], "Fondos": [["pectoral", "triceps"], ["deltoides"]], "Press inclinado con mancuernas": [["pectoral"], ["deltoides", "triceps"]],
  "Press en máquina": [["pectoral"], ["triceps"]], "Aperturas": [["pectoral"], ["deltoides"]], "Cruce de poleas": [["pectoral"], ["deltoides"]],
  "Elevaciones laterales": [["deltoides"], ["trapecio"]], "Pájaros": [["deltoides"], ["trapecio", "dorsal"]], "Face pull": [["deltoides", "trapecio"], []],
  "Prensa": [["cuadriceps", "gluteo"], ["isquios"]], "Zancadas": [["cuadriceps", "gluteo"], ["isquios", "gemelos"]], "Sentadilla búlgara": [["cuadriceps", "gluteo"], ["isquios"]],
  "Extensión de cuádriceps": [["cuadriceps"], []], "Curl femoral": [["isquios"], ["gemelos"]], "Gemelos": [["gemelos"], []], "Hip thrust": [["gluteo"], ["isquios"]],
  "Plancha": [["abdomen"], ["oblicuos", "deltoides"]], "Crunch": [["abdomen"], []], "Rueda abdominal": [["abdomen"], ["dorsal", "oblicuos"]],
  "Elevación de piernas": [["abdomen"], ["oblicuos"]], "Remo con mancuerna": [["dorsal"], ["biceps", "trapecio"]], "Remo en polea baja": [["dorsal"], ["biceps", "trapecio"]],
  "Flexiones": [["pectoral"], ["triceps", "deltoides", "abdomen"]], "Remo invertido": [["dorsal"], ["biceps", "trapecio"]], "Mountain climbers": [["abdomen"], ["cuadriceps", "deltoides"]],
  "Sentadilla sin peso": [["cuadriceps", "gluteo"], []], "Pike push-up": [["deltoides"], ["triceps"]], "Burpee": [["cuadriceps", "pectoral"], ["deltoides", "abdomen"]],
  "Puente de glúteo": [["gluteo"], ["isquios"]], "Fondos en banco": [["triceps"], ["deltoides", "pectoral"]],
  "Crol": [["dorsal", "deltoides"], ["triceps", "abdomen"]], "Braza": [["pectoral", "cuadriceps"], ["gluteo"]], "Espalda": [["dorsal", "deltoides"], ["gluteo"]],
  "Mariposa": [["pectoral", "deltoides"], ["dorsal", "abdomen"]], "Patada con tabla": [["cuadriceps", "gluteo"], ["gemelos"]], "Pull buoy": [["dorsal", "deltoides"], ["triceps"]]
};
const SPORT_MUS = { cinta: [["cuadriceps", "gemelos"], ["gluteo", "isquios"]], bici: [["cuadriceps", "gluteo"], ["gemelos", "isquios"]], natacion: [["dorsal", "deltoides"], ["triceps", "abdomen"]] };
const GROUP_MUS = { "Pecho": "pectoral", "Espalda": "dorsal", "Piernas": "cuadriceps", "Glúteo": "gluteo", "Hombro": "deltoides", "Bíceps": "biceps", "Tríceps": "triceps", "Core": "abdomen" };

/* muscles for an exercise name, or for a workout item that brings its own list */
function musclesOf(nameOrItem){
  const item = typeof nameOrItem === "object" ? nameOrItem : null, name = canonicalName(item ? item.ejercicio : nameOrItem);
  if (EX_MUS[name]) return { main: EX_MUS[name][0], help: EX_MUS[name][1] };
  const own = item && Array.isArray(item.musculos) ? item.musculos.filter(m => MUSCLES[m]) : [];
  if (own.length) return { main: own.slice(0, 2), help: own.slice(2) };
  const g = GROUP_MUS[CATALOG[name]];
  return { main: g ? [g] : [], help: [] };
}
function levelsFor(list){ // list of {main, help}; main wins over help
  const lv = {};
  for (const m of list) { for (const k of m.help) lv[k] = Math.max(lv[k] || 0, 1); for (const k of m.main) lv[k] = 2; }
  return lv;
}
const musNames = keys => keys.map(k => MUSCLES[k]).join(" · ");

/* muscles an athlete worked in the last n days (from saved sessions) */
function recentMuscles(who, days = 3){
  const from = toISO(addDays(today(), -(days - 1))), out = {};
  for (const s of data()) if (s.athlete === who && s.date >= from) {
    if (s.sport === "gym") for (const e of s.exercises || []) { const m = musclesOf(e.name); for (const k of m.main) out[k] = Math.max(out[k] || 0, 2); for (const k of m.help) out[k] = Math.max(out[k] || 0, 1); }
    else if (SPORT_MUS[s.sport]) { for (const k of SPORT_MUS[s.sport][0]) out[k] = Math.max(out[k] || 0, 1); }
  }
  return out;
}

/* the body map */
function bodyMap(levels = {}, opts = {}){
  const lv = k => levels[k] || 0;
  const cls = k => `m ${lv(k) === 2 ? "l2" : lv(k) === 1 ? "l1" : ""} ${opts.pick === k ? "picked" : ""}`;
  const tap = k => opts.clickable ? ` data-mus="${k}" role="button" tabindex="0" aria-label="${MUSCLES[k]}"` : "";
  const E = (k, cx, cy, rx, ry, rot = 0) => `<ellipse class="${cls(k)}"${tap(k)} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ""}/>`;
  const Pth = (k, d) => `<path class="${cls(k)}"${tap(k)} d="${d}"/>`;
  const R = (k, x, y, w, h, r) => `<rect class="${cls(k)}"${tap(k)} x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
  const body = `<g class="sil">
    <circle cx="60" cy="18" r="12"/><rect x="54" y="28" width="12" height="12" rx="3"/>
    <path d="M34 42 Q60 36 86 42 L91 60 L85 118 Q60 128 35 118 L29 60 Z"/><path d="M35 114 L85 114 L87 138 L60 147 L33 138 Z"/>
    <line x1="30" y1="47" x2="22" y2="94" class="limb" stroke-width="16"/><line x1="22" y1="94" x2="17" y2="134" class="limb" stroke-width="12"/><circle cx="16" cy="140" r="6"/>
    <line x1="90" y1="47" x2="98" y2="94" class="limb" stroke-width="16"/><line x1="98" y1="94" x2="103" y2="134" class="limb" stroke-width="12"/><circle cx="104" cy="140" r="6"/>
    <line x1="48" y1="140" x2="47" y2="188" class="limb" stroke-width="20"/><line x1="47" y1="188" x2="47" y2="232" class="limb" stroke-width="14"/><ellipse cx="46" cy="239" rx="8" ry="5"/>
    <line x1="72" y1="140" x2="73" y2="188" class="limb" stroke-width="20"/><line x1="73" y1="188" x2="73" y2="232" class="limb" stroke-width="14"/><ellipse cx="74" cy="239" rx="8" ry="5"/>
  </g>`;
  const front = `<g>${body}
    ${E("deltoides", 31, 50, 8, 9)}${E("deltoides", 89, 50, 8, 9)}
    ${Pth("pectoral", "M59 50 Q46 45 37 54 Q37 68 49 72 Q58 73 59 66 Z")}${Pth("pectoral", "M61 50 Q74 45 83 54 Q83 68 71 72 Q62 73 61 66 Z")}
    ${E("biceps", 26, 72, 5.5, 13, 9)}${E("biceps", 94, 72, 5.5, 13, -9)}
    ${E("antebrazo", 19.5, 113, 4.5, 14, 7)}${E("antebrazo", 100.5, 113, 4.5, 14, -7)}
    ${R("abdomen", 51, 76, 18, 40, 6)}<path class="abs-lines" d="M51 89 H69 M51 102 H69 M60 76 V116"/>
    ${E("oblicuos", 43, 97, 5, 14)}${E("oblicuos", 77, 97, 5, 14)}
    ${E("cuadriceps", 48, 162, 8.5, 21)}${E("cuadriceps", 72, 162, 8.5, 21)}
    <text x="60" y="251" class="ml">Delante</text></g>`;
  const back = `<g transform="translate(130 0)">${body}
    ${Pth("trapecio", "M60 31 L79 46 L60 76 L41 46 Z")}
    ${E("deltoides", 31, 50, 8, 9)}${E("deltoides", 89, 50, 8, 9)}
    ${Pth("dorsal", "M44 58 Q35 72 42 97 L57 104 L58 64 Z")}${Pth("dorsal", "M76 58 Q85 72 78 97 L63 104 L62 64 Z")}
    ${E("triceps", 25, 72, 5.5, 13, 9)}${E("triceps", 95, 72, 5.5, 13, -9)}
    ${E("antebrazo", 19.5, 113, 4.5, 14, 7)}${E("antebrazo", 100.5, 113, 4.5, 14, -7)}
    ${R("lumbar", 52, 102, 16, 15, 4)}
    ${E("gluteo", 50, 132, 10, 10)}${E("gluteo", 70, 132, 10, 10)}
    ${E("isquios", 48, 166, 8, 18)}${E("isquios", 72, 166, 8, 18)}
    ${E("gemelos", 47, 207, 6, 14)}${E("gemelos", 73, 207, 6, 14)}
    <text x="60" y="251" class="ml">Detrás</text></g>`;
  const label = opts.label || Object.keys(levels).filter(k => levels[k] === 2).map(k => MUSCLES[k]).join(", ");
  return `<svg class="bodymap ${opts.cls || ""}" viewBox="0 0 250 256" role="img" aria-label="Mapa muscular${label ? ": " + esc(label) : ""}">${front}${back}</svg>`;
}

function onMuscleTap(k, el){
  if (el.closest("#view-hoy")) { const i = ck.quiero.indexOf(k); if (i >= 0) ck.quiero.splice(i, 1); else ck.quiero.push(k); saveCk(); renderHoy(); }
  else if (el.closest("#view-ejercicios")) { gMus = k; store.set("gym.gmus", k); renderEjercicios(); }
}
document.addEventListener("click", e => { const el = e.target.closest && e.target.closest("[data-mus]"); if (el) onMuscleTap(el.dataset.mus, el); });
document.addEventListener("keydown", e => { const el = e.target.closest && e.target.closest("[data-mus]"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onMuscleTap(el.dataset.mus, el); } });
