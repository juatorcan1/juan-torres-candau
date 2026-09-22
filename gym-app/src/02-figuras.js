/* ---------- exercise figures ----------
   Side view faces right. Coordinates live in a 200 × 206 box (viewBox 0 -14 200 206), floor at y = 188.
   A pose gives the hip position and torso angle (0 = up, 90 = forward, 180 = down) plus targets
   for ankles and wrists; two-bone IK places knees and elbows, so bar paths stay straight. */
const FL = { torso: 52, neck: 19, thigh: 40, shin: 40, ua: 28, fa: 26, foot: 13 };
const vA = (a, l) => [Math.sin(a * Math.PI / 180) * l, -Math.cos(a * Math.PI / 180) * l];
const vAdd = (p, v) => [p[0] + v[0], p[1] + v[1]];
function ik(A, T, l1, l2, pref){
  const dx = T[0] - A[0], dy = T[1] - A[1], d = Math.hypot(dx, dy) || 0.001;
  const dd = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, d));
  const ux = dx / d, uy = dy / d, a = (l1 * l1 + dd * dd - l2 * l2) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = A[0] + ux * a, my = A[1] + uy * a;
  const c1 = [mx - uy * h, my + ux * h], c2 = [mx + uy * h, my - ux * h];
  const score = c => pref === "fwd" || pref === "out" ? c[0] : pref === "back" ? -c[0] : pref === "up" ? -c[1] : c[1];
  return [score(c1) >= score(c2) ? c1 : c2, [A[0] + ux * dd, A[1] + uy * dd]];
}
function lerpPose(a, b, u){
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? b[k], y = b[k] ?? a[k];
    if (typeof x === "number") o[k] = x + (y - x) * u;
    else if (Array.isArray(x)) o[k] = x.map((v, i) => v + (y[i] - v) * u);
    else o[k] = u < .5 ? x : y;
  }
  return o;
}
function solveSide(p){
  const hip = p.hip, sh = vAdd(hip, vA(p.to, FL.torso)), head = vAdd(sh, vA(p.hd ?? p.to, FL.neck));
  const [knee, ank] = ik(hip, p.ank, FL.thigh, FL.shin, p.kb || "fwd");
  const [knee2, ank2] = p.ank2 ? ik(hip, p.ank2, FL.thigh, FL.shin, p.kb2 || "fwd") : [knee, ank];
  const toe = vAdd(ank, vA(p.ft ?? 90, FL.foot)), toe2 = vAdd(ank2, vA(p.ft2 ?? p.ft ?? 90, FL.foot));
  const [el, wr] = ik(sh, p.wr, FL.ua, FL.fa, p.eb || "down");
  const [el2, wr2] = p.wr2 ? ik(sh, p.wr2, FL.ua, FL.fa, p.eb2 || "down") : [el, wr];
  return { hip, sh, head, knee, ank, toe, knee2, ank2, toe2, el, wr, el2, wr2 };
}
// Front view: body centred on x = 100; the right arm's wrist target is mirrored for the left.
function solveFront(p){
  const sc = p.sc ?? 1, R = [116, 54], L = [84, 54];
  const [elR, wrR] = ik(R, p.wr, FL.ua * sc, FL.fa * sc, "out");
  const wl = [200 - p.wr[0], p.wr[1]];
  const [elL0, wrL0] = ik([200 - L[0], L[1]], [200 - wl[0], wl[1]], FL.ua * sc, FL.fa * sc, "out");
  return { R, L, elR, wrR, elL: [200 - elL0[0], elL0[1]], wrL: [200 - wrL0[0], wrL0[1]] };
}
const P = pts => pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
const bone = (pts, cls = "") => `<polyline class="bone ${cls}" points="${P(pts)}"/>`;
function drawProps(props, J, layer){
  let s = "";
  for (const p of props || []) {
    const front = p.t === "plate" || p.t === "db" || p.t === "wheel" || p.t === "hbar" || p.t === "handle" || p.t === "pad";
    if ((layer === "front") !== front) continue;
    const at = p.j ? (J[p.j] || J.wr) : null;
    if (p.t === "plate") s += `<circle class="plate" cx="${at[0]}" cy="${at[1]}" r="${p.r || 12}"/><circle class="prop fill" cx="${at[0]}" cy="${at[1]}" r="2.5"/>`;
    else if (p.t === "db") s += `<rect class="prop fill" x="${at[0] - 8}" y="${at[1] - 4}" width="16" height="8" rx="3"/>`;
    else if (p.t === "wheel") s += `<circle class="plate" cx="${at[0]}" cy="${at[1] + 3}" r="9"/>`;
    else if (p.t === "hbar") s += `<line class="prop" x1="${at[0] - 16}" y1="${at[1]}" x2="${at[0] + 16}" y2="${at[1]}"/>`;
    else if (p.t === "handle") s += `<line class="prop" x1="${at[0]}" y1="${at[1] - 8}" x2="${at[0]}" y2="${at[1] + 8}"/>`;
    else if (p.t === "pad") s += `<circle class="prop fill" cx="${at[0]}" cy="${at[1]}" r="6"/>`;
    else if (p.t === "bench") s += `<rect class="prop2" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h || 7}" rx="2"/>${p.legs === false ? "" : `<line class="prop2s" stroke-width="4" x1="${p.x + 8}" y1="${p.y + 4}" x2="${p.x + 8}" y2="188"/><line class="prop2s" stroke-width="4" x1="${p.x + p.w - 8}" y1="${p.y + 4}" x2="${p.x + p.w - 8}" y2="188"/>`}`;
    else if (p.t === "line") s += `<line class="prop2s" stroke-width="${p.w || 6}" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}"/>`;
    else if (p.t === "bar") s += `<line class="prop" stroke-width="4" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}"/>`;
    else if (p.t === "cable") { const w = J[p.j || "wr"]; s += `<circle class="prop" cx="${p.from[0]}" cy="${p.from[1]}" r="4"/><line class="cable" x1="${p.from[0]}" y1="${p.from[1]}" x2="${w[0]}" y2="${w[1]}"/>`; }
    else if (p.t === "plat") { const a = J.toe, d = p.d; s += `<line class="prop" stroke-width="4" x1="${a[0] - d[0] * 20 + 3}" y1="${a[1] - d[1] * 20}" x2="${a[0] + d[0] * 20 + 3}" y2="${a[1] + d[1] * 20}"/>`; }
  }
  return s;
}
function drawSide(ex, u, ghost){
  const J = solveSide(lerpPose(ex.a, ex.b, u)), hl = new Set(ex.hl || []);
  const c = k => hl.has(k) ? "hl" : "";
  const farLeg = bone([J.hip, J.knee2, J.ank2, J.toe2], "far"), farArm = bone([J.sh, J.el2, J.wr2], "far");
  const body = [
    ex.b.ank2 || ex.a.ank2 ? farLeg : "",
    ex.b.wr2 || ex.a.wr2 ? farArm : "",
    bone([J.hip, J.sh], c("torso")),
    bone([J.hip, J.knee], c("thigh")), bone([J.knee, J.ank, J.toe], c("shin")),
    bone([J.sh, J.el], c("ua")), bone([J.el, J.wr], c("fa")),
    `<circle class="headc" cx="${J.head[0].toFixed(1)}" cy="${J.head[1].toFixed(1)}" r="10"/>`
  ].join("");
  return ghost ? `<g class="ghost">${body}</g>` : drawProps(ex.props, J, "back") + body + drawProps(ex.props, J, "front");
}
function drawFront(ex, u, ghost){
  const p = lerpPose(ex.a, ex.b, u), J = solveFront(p), hl = new Set(ex.hl || []);
  const c = k => hl.has(k) ? "hl" : "";
  const body = [
    bone([[92, 106], [90, 146], [89, 186], [80, 188]], c("legs")), bone([[108, 106], [110, 146], [111, 186], [120, 188]], c("legs")),
    bone([[100, 48], [100, 104]], c("torso")), bone([[84, 54], [116, 54]], c("torso")), bone([[92, 106], [108, 106]]),
    bone([J.R, J.elR], c("ua")), bone([J.elR, J.wrR], c("fa")), bone([J.L, J.elL], c("ua")), bone([J.elL, J.wrL], c("fa")),
    `<circle class="headc" cx="100" cy="34" r="10"/>`
  ].join("");
  if (ghost) return `<g class="ghost">${body}</g>`;
  let back = "", front = "";
  for (const q of ex.props || []) {
    if (q.t === "bench") back += `<rect class="prop2" x="86" y="20" width="28" height="104" rx="4"/>`;
    if (q.t === "cables") back += [[q.from, J.wrR], [[200 - q.from[0], q.from[1]], J.wrL]].map(([f, w]) => `<circle class="prop" cx="${f[0]}" cy="${f[1]}" r="4"/><line class="cable" x1="${f[0]}" y1="${f[1]}" x2="${w[0].toFixed(1)}" y2="${w[1].toFixed(1)}"/>`).join("");
    if (q.t === "db") front += [J.wrR, J.wrL].map(w => `<rect class="prop fill" x="${(w[0] - 4).toFixed(1)}" y="${(w[1] - 8).toFixed(1)}" width="8" height="16" rx="3"/>`).join("");
  }
  return back + body + front;
}
function figSVG(name, u = 0, withGhost = false){
  const g = GUIDE[name]; if (!g || !g.fig) return "";
  const f = g.fig, draw = f.v === "front" ? drawFront : drawSide;
  const floor = f.nofloor ? "" : `<line class="floor" x1="4" y1="188" x2="196" y2="188"/>`;
  return floor + (withGhost ? draw(f, 0, true) : "") + draw(f, u, false);
}

/* Exercise guide: muscles, steps and common mistakes, plus the figure (a = start, b = end). */
const GUIDE = {
  "Sentadilla": { m: "Cuádriceps, glúteo, aductores y lumbar", steps: ["Barra apoyada en la parte alta de la espalda, pies a la anchura de hombros.", "Baja llevando la cadera atrás y abajo, rodillas hacia fuera en la línea de los pies.", "Llega a romper el paralelo y sube empujando el suelo con todo el pie."], ojo: "Rodillas que se meten hacia dentro; talones que se levantan.",
    fig: { a: { hip: [92, 106], to: 3, ank: [92, 186], wr: [89, 54] }, b: { hip: [66, 141], to: 45, ank: [92, 186], wr: [98, 104] }, hl: ["thigh"], props: [{ t: "plate", j: "wr" }] } },
  "Press banca": { m: "Pectoral, tríceps y hombro anterior", steps: ["Tumbado, ojos bajo la barra, escápulas juntas y pies firmes en el suelo.", "Baja la barra controlada hasta rozar la parte baja del pecho.", "Empuja hacia arriba y ligeramente atrás hasta estirar los brazos."], ojo: "Rebotar la barra en el pecho; codos totalmente abiertos a 90°.",
    fig: { a: { hip: [112, 140], to: -90, ank: [152, 184], kb: "up", wr: [60, 86] }, b: { hip: [112, 140], to: -90, ank: [152, 184], kb: "up", wr: [77, 125] }, hl: ["torso", "fa"], props: [{ t: "bench", x: 22, y: 146, w: 100 }, { t: "plate", j: "wr" }] } },
  "Peso muerto": { m: "Glúteo, isquios, lumbar y espalda completa", steps: ["Barra sobre el medio del pie, espinillas cerca de la barra.", "Espalda neutra, pecho arriba; tensa antes de tirar.", "Sube empujando el suelo y extiende cadera y rodillas a la vez; baja por el mismo camino."], ojo: "Redondear la espalda; alejar la barra del cuerpo.",
    fig: { a: { hip: [70, 141], to: 50, ank: [96, 186], wr: [108, 160], eb: "fwd" }, b: { hip: [96, 106], to: 0, ank: [96, 186], wr: [97, 106], eb: "fwd" }, hl: ["torso", "thigh"], props: [{ t: "plate", j: "wr" }] } },
  "Peso muerto rumano": { m: "Isquiotibiales y glúteo", steps: ["De pie con la barra, rodillas ligeramente flexionadas y fijas.", "Lleva la cadera atrás deslizando la barra pegada a los muslos.", "Baja hasta notar tensión en los isquios (rodilla o media tibia) y vuelve apretando glúteo."], ojo: "Doblar las rodillas como en una sentadilla; curvar la espalda.",
    fig: { a: { hip: [94, 108], to: 0, ank: [96, 186], wr: [96, 106], eb: "fwd" }, b: { hip: [72, 116], to: 58, ank: [96, 186], wr: [110, 140], eb: "fwd" }, hl: ["thigh"], props: [{ t: "plate", j: "wr" }] } },
  "Press militar": { m: "Hombro, tríceps y core", steps: ["De pie, barra a la altura de las clavículas, glúteos y abdomen apretados.", "Empuja la barra en vertical apartando la cara un poco.", "Bloquea arriba con la barra sobre la cabeza y baja controlado."], ojo: "Arquear mucho la zona lumbar para empujar.",
    fig: { a: { hip: [100, 106], to: 0, ank: [100, 186], wr: [108, 52] }, b: { hip: [100, 106], to: 0, ank: [100, 186], wr: [102, 2] }, hl: ["ua"], props: [{ t: "plate", j: "wr" }] } },
  "Remo con barra": { m: "Dorsal, romboides y bíceps", steps: ["Inclina el tronco unos 45°, espalda recta y rodillas algo flexionadas.", "Tira de la barra hacia el ombligo llevando los codos atrás.", "Aprieta las escápulas arriba y baja estirando los brazos sin perder la postura."], ojo: "Levantar el tronco para dar impulso.",
    fig: { a: { hip: [72, 116], to: 60, ank: [94, 186], wr: [117, 142] }, b: { hip: [72, 116], to: 60, ank: [94, 186], wr: [96, 118], eb: "up" }, hl: ["torso", "ua"], props: [{ t: "plate", j: "wr" }] } },
  "Dominadas": { m: "Dorsal, bíceps y core", steps: ["Cuélgate con agarre algo más ancho que los hombros.", "Tira bajando los codos hacia las costillas hasta pasar la barbilla por encima de la barra.", "Baja controlado hasta estirar los brazos del todo."], ojo: "Balancearse; hacer medias repeticiones.",
    fig: { a: { hip: [104, 112], to: 0, ank: [86, 168], wr: [104, 6] }, b: { hip: [96, 66], to: 0, ank: [78, 122], wr: [104, 6], eb: "fwd" }, hl: ["torso", "ua"], nofloor: true, props: [{ t: "bar", x1: 56, y1: 6, x2: 152, y2: 6 }] } },
  "Jalón al pecho": { m: "Dorsal y bíceps", steps: ["Sentado con los muslos bajo el rodillo y agarre ancho.", "Inclínate un poco atrás y baja la barra hasta la parte alta del pecho.", "Sube controlando hasta estirar los brazos."], ojo: "Llevar la barra detrás de la nuca; tirar solo con los brazos.",
    fig: { a: { hip: [92, 138], to: -8, ank: [132, 180], kb: "up", wr: [88, 34] }, b: { hip: [92, 138], to: -8, ank: [132, 180], kb: "up", wr: [86, 88] }, hl: ["torso", "ua"], props: [{ t: "bench", x: 70, y: 143, w: 44 }, { t: "cable", from: [88, -12] }, { t: "hbar", j: "wr" }] } },
  "Curl con barra": { m: "Bíceps", steps: ["De pie, codos pegados al cuerpo y agarre a la anchura de hombros.", "Sube la barra doblando solo el codo.", "Aprieta arriba y baja despacio hasta estirar."], ojo: "Balancear el cuerpo; adelantar los codos.",
    fig: { a: { hip: [100, 106], to: 0, ank: [100, 186], wr: [102, 106], eb: "fwd" }, b: { hip: [100, 106], to: 0, ank: [100, 186], wr: [112, 58] }, hl: ["fa"], props: [{ t: "plate", j: "wr", r: 9 }] } },
  "Curl martillo": { m: "Bíceps y braquial", steps: ["Mancuernas con las palmas mirándose (agarre neutro).", "Sube sin girar la muñeca y con el codo quieto.", "Baja controlado."], ojo: "Mover el hombro para ayudar.",
    fig: { a: { hip: [100, 106], to: 0, ank: [100, 186], wr: [102, 106], eb: "fwd" }, b: { hip: [100, 106], to: 0, ank: [100, 186], wr: [112, 58] }, hl: ["fa"], props: [{ t: "db", j: "wr" }] } },
  "Curl en banco Scott": { m: "Bíceps", steps: ["Apoya la parte de atrás del brazo en el banco inclinado.", "Sube la barra sin despegar el brazo del apoyo.", "Baja casi hasta estirar, sin bloquear de golpe."], ojo: "Soltar el peso abajo: tensión en el tendón.",
    fig: { a: { hip: [90, 140], to: 15, ank: [132, 180], kb: "up", wr: [133, 135] }, b: { hip: [90, 140], to: 15, ank: [132, 180], kb: "up", wr: [128, 88] }, hl: ["fa"], props: [{ t: "bench", x: 70, y: 145, w: 40 }, { t: "line", x1: 108, y1: 100, x2: 128, y2: 124, w: 9 }, { t: "plate", j: "wr", r: 9 }] } },
  "Extensión en polea": { m: "Tríceps", steps: ["De pie frente a la polea alta, codos pegados al cuerpo.", "Empuja hacia abajo hasta estirar los brazos.", "Sube hasta que el antebrazo pase de la horizontal, sin mover los codos."], ojo: "Echar el cuerpo encima del agarre.",
    fig: { a: { hip: [96, 106], to: 8, ank: [96, 186], wr: [125, 64] }, b: { hip: [96, 106], to: 8, ank: [96, 186], wr: [109, 108], eb: "back" }, hl: ["ua"], props: [{ t: "cable", from: [128, -12] }, { t: "handle", j: "wr" }] } },
  "Press francés": { m: "Tríceps", steps: ["Tumbado con la barra sobre la cara, brazos estirados.", "Dobla solo los codos bajando la barra hacia la frente o detrás de la cabeza.", "Estira de nuevo sin abrir los codos."], ojo: "Abrir los codos hacia fuera.",
    fig: { a: { hip: [112, 140], to: -90, ank: [152, 184], kb: "up", wr: [54, 87] }, b: { hip: [112, 140], to: -90, ank: [152, 184], kb: "up", wr: [32, 124], eb: "up" }, hl: ["ua"], props: [{ t: "bench", x: 22, y: 146, w: 100 }, { t: "plate", j: "wr", r: 9 }] } },
  "Fondos": { m: "Pectoral inferior, tríceps y hombro", steps: ["En las paralelas con los brazos estirados.", "Baja inclinando un poco el tronco hasta que el hombro quede a la altura del codo.", "Sube empujando hasta estirar."], ojo: "Bajar demasiado si molesta el hombro.",
    fig: { a: { hip: [96, 110], to: 5, ank: [76, 164], wr: [100, 104], eb: "back" }, b: { hip: [95, 117], to: 25, ank: [74, 172], wr: [100, 104], eb: "back" }, hl: ["ua", "torso"], props: [{ t: "bar", x1: 78, y1: 104, x2: 142, y2: 104 }, { t: "line", x1: 136, y1: 104, x2: 136, y2: 188, w: 4 }] } },
  "Press inclinado con mancuernas": { m: "Pectoral superior y hombro", steps: ["Banco a unos 30°, mancuernas a los lados del pecho.", "Empuja hacia arriba juntándolas un poco.", "Baja controlado hasta notar el estiramiento."], ojo: "Banco demasiado inclinado: pasa a ser de hombro.",
    fig: { a: { hip: [110, 150], to: -55, ank: [150, 184], kb: "up", wr: [70, 67] }, b: { hip: [110, 150], to: -55, ank: [150, 184], kb: "up", wr: [88, 106] }, hl: ["torso"], props: [{ t: "line", x1: 114, y1: 158, x2: 60, y2: 122, w: 7 }, { t: "line", x1: 112, y1: 158, x2: 132, y2: 158, w: 7 }, { t: "line", x1: 100, y1: 158, x2: 100, y2: 188, w: 4 }, { t: "db", j: "wr" }] } },
  "Press en máquina": { m: "Pectoral y tríceps", steps: ["Sentado con la espalda pegada al respaldo, agarres a la altura del pecho.", "Empuja hasta casi estirar los brazos.", "Vuelve despacio sin dejar que el peso choque."], ojo: "Despegar la espalda del respaldo.",
    fig: { a: { hip: [80, 140], to: -5, ank: [122, 180], kb: "up", wr: [84, 100], eb: "back" }, b: { hip: [80, 140], to: -5, ank: [122, 180], kb: "up", wr: [128, 89] }, hl: ["torso", "fa"], props: [{ t: "bench", x: 62, y: 145, w: 40 }, { t: "line", x1: 70, y1: 146, x2: 64, y2: 80, w: 7 }, { t: "handle", j: "wr" }] } },
  "Aperturas": { m: "Pectoral", steps: ["Tumbado en banco plano, mancuernas arriba con los codos un poco doblados.", "Abre los brazos en arco hasta notar estiramiento en el pecho.", "Cierra abrazando un barril imaginario."], ojo: "Estirar los codos del todo o bajar demasiado.",
    fig: { v: "front", a: { wr: [168, 62], sc: 1 }, b: { wr: [104, 72], sc: .6 }, hl: ["torso"], props: [{ t: "bench" }, { t: "db" }] } },
  "Cruce de poleas": { m: "Pectoral", steps: ["De pie entre dos poleas altas, un pie adelantado.", "Lleva las manos hacia abajo y al centro en arco.", "Aprieta el pecho abajo y vuelve controlado."], ojo: "Doblar y estirar los codos: se convierte en un press.",
    fig: { v: "front", a: { wr: [164, 42], sc: 1 }, b: { wr: [106, 98], sc: .9 }, hl: ["torso"], props: [{ t: "cables", from: [184, -6] }] } },
  "Elevaciones laterales": { m: "Hombro (deltoides lateral)", steps: ["De pie, mancuernas a los lados y codos apenas doblados.", "Sube los brazos hacia los lados hasta la altura de los hombros.", "Baja despacio."], ojo: "Subir más arriba de los hombros o usar impulso.",
    fig: { v: "front", a: { wr: [121, 106], sc: 1 }, b: { wr: [168, 58], sc: 1 }, hl: ["ua"], props: [{ t: "db" }] } },
  "Pájaros": { m: "Hombro posterior y romboides", steps: ["Inclina el tronco casi horizontal con mancuernas colgando.", "Abre los brazos hacia los lados apretando las escápulas.", "Baja controlado. (Dibujo visto de frente.)"], ojo: "Tirar con la espalda baja.",
    fig: { v: "front", a: { wr: [118, 106], sc: 1 }, b: { wr: [166, 64], sc: 1 }, hl: ["ua"], props: [{ t: "db" }] } },
  "Face pull": { m: "Hombro posterior y manguito rotador", steps: ["Polea a la altura de la cara con cuerda.", "Tira hacia la frente separando las manos y con los codos altos.", "Vuelve despacio."], ojo: "Bajar los codos y tirar hacia el pecho.",
    fig: { a: { hip: [90, 106], to: 0, ank: [90, 186], wr: [143, 52] }, b: { hip: [90, 106], to: 0, ank: [90, 186], wr: [84, 36], eb: "back" }, hl: ["ua"], props: [{ t: "cable", from: [192, 40] }, { t: "handle", j: "wr" }] } },
  "Prensa": { m: "Cuádriceps y glúteo", steps: ["Espalda y cadera pegadas al respaldo, pies a la anchura de hombros.", "Baja la plataforma hasta que las rodillas lleguen cerca del pecho.", "Empuja sin bloquear del todo las rodillas."], ojo: "Despegar la cadera del asiento abajo.",
    fig: { a: { hip: [76, 150], to: -50, ank: [133, 137], kb: "up", ft: 20, wr: [84, 150], eb: "fwd" }, b: { hip: [76, 150], to: -50, ank: [146, 112], kb: "up", ft: 20, wr: [84, 150], eb: "fwd" }, hl: ["thigh"], props: [{ t: "line", x1: 84, y1: 158, x2: 28, y2: 118, w: 7 }, { t: "line", x1: 80, y1: 160, x2: 80, y2: 188, w: 5 }, { t: "plat", d: [0.88, 0.48] }] } },
  "Zancadas": { m: "Cuádriceps y glúteo", steps: ["Da un paso largo al frente con el tronco recto.", "Baja hasta que la rodilla de atrás casi toque el suelo.", "Empuja con la pierna de delante para subir."], ojo: "Rodilla delantera que se va hacia dentro.",
    fig: { a: { hip: [100, 118], to: 0, ank: [128, 186], ank2: [52, 180], kb2: "down", ft2: 118, wr: [101, 118] }, b: { hip: [92, 146], to: 5, ank: [128, 186], ank2: [52, 180], kb2: "down", ft2: 118, wr: [97, 146] }, hl: ["thigh"], props: [{ t: "db", j: "wr" }] } },
  "Sentadilla búlgara": { m: "Cuádriceps y glúteo", steps: ["Pie de atrás apoyado en un banco, el de delante adelantado.", "Baja en vertical hasta que el muslo delantero quede casi horizontal.", "Sube empujando con el talón delantero."], ojo: "Pie delantero demasiado cerca del banco.",
    fig: { a: { hip: [104, 112], to: 0, ank: [134, 186], ank2: [44, 146], kb2: "down", ft2: 150, wr: [105, 112] }, b: { hip: [96, 142], to: 8, ank: [134, 186], ank2: [44, 146], kb2: "down", ft2: 150, wr: [100, 140] }, hl: ["thigh"], props: [{ t: "bench", x: 16, y: 152, w: 44 }, { t: "db", j: "wr" }] } },
  "Extensión de cuádriceps": { m: "Cuádriceps", steps: ["Sentado con el rodillo sobre los tobillos.", "Estira las rodillas hasta tener las piernas rectas.", "Aguanta un segundo y baja despacio."], ojo: "Dar golpes o levantar la cadera del asiento.",
    fig: { a: { hip: [80, 140], to: -8, ank: [118, 178], kb: "up", wr: [82, 146], eb: "back" }, b: { hip: [80, 140], to: -8, ank: [158, 138], kb: "up", wr: [82, 146], eb: "back" }, hl: ["thigh"], props: [{ t: "bench", x: 60, y: 145, w: 64 }, { t: "line", x1: 68, y1: 146, x2: 62, y2: 84, w: 7 }, { t: "pad", j: "ank" }] } },
  "Curl femoral": { m: "Isquiotibiales", steps: ["Tumbado boca abajo con el rodillo sobre los talones.", "Dobla las rodillas llevando los talones al glúteo.", "Baja controlado sin despegar la cadera."], ojo: "Levantar la cadera para ayudarte.",
    fig: { a: { hip: [112, 146], to: -90, hd: -100, ank: [192, 146], kb: "down", wr: [70, 170], eb: "fwd" }, b: { hip: [112, 146], to: -90, hd: -100, ank: [140, 110], kb: "down", wr: [70, 170], eb: "fwd" }, hl: ["thigh"], props: [{ t: "bench", x: 40, y: 152, w: 120 }, { t: "pad", j: "ank" }] } },
  "Gemelos": { m: "Gemelos y sóleo", steps: ["De pie, puntas de los pies en un escalón o plataforma.", "Sube de puntillas todo lo que puedas.", "Baja lento hasta notar el estiramiento."], ojo: "Rebotar abajo.",
    fig: { a: { hip: [100, 106], to: 0, ank: [100, 186], ft: 90, wr: [101, 106] }, b: { hip: [100, 96], to: 0, ank: [100, 176], ft: 128, wr: [101, 96] }, hl: ["shin"], props: [{ t: "db", j: "wr" }] } },
  "Hip thrust": { m: "Glúteo", steps: ["Parte alta de la espalda apoyada en un banco, barra sobre la cadera.", "Empuja la cadera hacia arriba hasta alinear rodillas, cadera y hombros.", "Aprieta el glúteo arriba y baja controlado."], ojo: "Arquear la zona lumbar en lugar de subir con la cadera.",
    fig: { a: { hip: [100, 168], to: -72, ank: [140, 186], kb: "up", wr: [100, 158], eb: "up" }, b: { hip: [100, 142], to: -90, ank: [140, 186], kb: "up", wr: [100, 132], eb: "up" }, hl: ["thigh"], props: [{ t: "bench", x: 8, y: 150, w: 48 }, { t: "plate", j: "wr" }] } },
  "Plancha": { m: "Abdomen y core", steps: ["Antebrazos en el suelo bajo los hombros.", "Cuerpo recto de la cabeza a los talones, glúteo y abdomen apretados.", "Aguanta el tiempo marcado respirando normal."], ojo: "Cadera caída o demasiado alta.",
    fig: { a: { hip: [95, 162], to: 85, hd: 90, ank: [16, 172], ft: 180, wr: [172, 184] }, b: { hip: [95, 160], to: 85, hd: 90, ank: [16, 172], ft: 180, wr: [172, 184] }, hl: ["torso"], props: [] } },
  "Crunch": { m: "Abdomen", steps: ["Tumbado boca arriba, rodillas dobladas y manos junto a la cabeza.", "Despega los hombros del suelo acercando las costillas a la cadera.", "Baja despacio sin apoyar del todo la cabeza."], ojo: "Tirar del cuello con las manos.",
    fig: { a: { hip: [100, 180], to: -90, ank: [140, 184], kb: "up", wr: [52, 170], eb: "up" }, b: { hip: [100, 180], to: -58, ank: [140, 184], kb: "up", wr: [60, 144], eb: "up" }, hl: ["torso"], props: [] } },
  "Rueda abdominal": { m: "Abdomen y core", steps: ["De rodillas con la rueda bajo los hombros.", "Rueda hacia delante manteniendo el abdomen apretado.", "Vuelve tirando con el abdomen, no con la cadera."], ojo: "Hundir la zona lumbar.",
    fig: { a: { hip: [70, 146], to: 20, ank: [30, 184], kb: "down", ft: 180, wr: [102, 176] }, b: { hip: [100, 168], to: 80, ank: [30, 184], kb: "down", ft: 180, wr: [184, 176] }, hl: ["torso"], props: [{ t: "wheel", j: "wr" }] } },
  "Elevación de piernas": { m: "Abdomen inferior y flexores de cadera", steps: ["Colgado de la barra con los brazos estirados.", "Sube las piernas hasta la horizontal (o las rodillas al pecho).", "Baja sin balancearte."], ojo: "Usar el balanceo.",
    fig: { a: { hip: [100, 112], to: 0, ank: [100, 190], kb: "fwd", wr: [100, 6] }, b: { hip: [100, 112], to: 0, ank: [178, 106], kb: "down", wr: [100, 6] }, hl: ["torso", "thigh"], nofloor: true, props: [{ t: "bar", x1: 56, y1: 6, x2: 150, y2: 6 }] } },
  "Remo con mancuerna": { m: "Dorsal y romboides", steps: ["Rodilla y mano del mismo lado apoyadas en el banco, espalda plana.", "Tira de la mancuerna hacia la cadera con el codo pegado.", "Baja estirando el brazo."], ojo: "Girar el tronco para subir más peso.",
    fig: { a: { hip: [70, 106], to: 80, ank: [70, 186], ank2: [30, 146], kb2: "down", ft2: 180, wr: [121, 150], wr2: [124, 150], eb2: "back" }, b: { hip: [70, 106], to: 80, ank: [70, 186], ank2: [30, 146], kb2: "down", ft2: 180, wr: [100, 132], eb: "up", wr2: [124, 150], eb2: "back" }, hl: ["torso", "ua"], props: [{ t: "bench", x: 18, y: 152, w: 120 }, { t: "db", j: "wr" }] } },
  "Remo en polea baja": { m: "Espalda media y dorsal", steps: ["Sentado con los pies en la plataforma y la espalda recta.", "Tira del agarre hacia el abdomen llevando los codos atrás.", "Estira los brazos sin encorvarte."], ojo: "Balancear el tronco adelante y atrás.",
    fig: { a: { hip: [80, 160], to: 0, ank: [156, 166], kb: "up", ft: 10, wr: [133, 110] }, b: { hip: [80, 160], to: 0, ank: [156, 166], kb: "up", ft: 10, wr: [96, 128], eb: "back" }, hl: ["torso", "ua"], props: [{ t: "bench", x: 58, y: 165, w: 44 }, { t: "line", x1: 168, y1: 144, x2: 168, y2: 188, w: 5 }, { t: "cable", from: [192, 150] }, { t: "handle", j: "wr" }] } }
};
