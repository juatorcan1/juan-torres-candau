/* ---------- agents: personal trainer ("coach") and dietitian ("nutri") ----------
   Each agent is a chat kept in chats/<athlete>_<agent>. Claude answers with JSON: a short reply plus,
   when asked, a workout to do now (entreno) or a plan (weekly/monthly training, weekly diet). */
let plans = {}, chats = {};
const AGENTS = {
  coach: { name: "Entrenador", who: "tu entrenador personal", sugg: [
    "Entreno de gimnasio de 60 min para hoy", "Calistenia en casa, 30 min", "Natación 45 min para mejorar resistencia",
    "Hazme un plan semanal", "Plan de un mes para ganar fuerza", "¿Cómo supero a Ignacio en press banca?"] },
  nutri: { name: "Dietista", who: "tu dietista", sugg: [
    "Hazme el menú de la semana", "Mañana estoy en la obra, ¿qué me llevo?", "Como en un bar, ¿qué pido?",
    "Me pasé el finde, ¿cómo compenso?", "Quiero bajar 3 kg en un mes", "Cena rápida alta en proteína"] }
};
let chatBusy = {}, chatErr = {}, chatCtl = {};
const chatId = (agent, who = me) => `${who}_${agent}`;
const chatMsgs = agent => (chats[chatId(agent)] && Array.isArray(chats[chatId(agent)].mensajes)) ? chats[chatId(agent)].mensajes : [];
const trainPlan = (who = me) => plans[`${who}_entreno`] || null;
const dietPlan = (who = me) => plans[`${who}_dieta`] || null;
const todayISO = () => toISO(today());
function planDay(plan, date = todayISO()){
  if (!plan || !Array.isArray(plan.semanas)) return null;
  for (const w of plan.semanas) for (const d of w.dias || []) if (d.fecha === date) return d;
  return null;
}

/* context the agents get about the athlete, the rival and the plan */
function athleteContext(who){
  const pr = profileOf(who), w = latestWeight(wts(), who), old = latestWeight(wts(), who, toISO(addDays(today(), -28)));
  const a28 = toISO(addDays(today(), -27)), wk = periodRange("semana");
  const ses = data().filter(s => s.athlete === who && s.date >= a28).sort((x, y) => x.date.localeCompare(y.date));
  const lines = ses.slice(-14).map(s => `${s.date} ${SPORTS[s.sport]} ${fmt(num(s.minutes))} min: ${s.sport === "gym" ? (s.exercises || []).map(e => `${e.name} ${setsLine(e.sets || [])}`).join("; ") : sessionSummary(s)}`);
  const best = {};
  for (const s of data()) if (s.athlete === who && s.sport === "gym") for (const e of s.exercises || []) for (const st of e.sets || []) {
    if (st.warmup || !num(st.reps)) continue; const k = canonicalName(e.name), b = best[k];
    if (!b || num(st.kg) > b.kg || (num(st.kg) === b.kg && num(st.reps) > b.reps)) best[k] = { kg: num(st.kg), reps: num(st.reps), date: s.date };
  }
  const al = alcoholIn(drk(), who, ...wk), t = targetsFor(who).t;
  return [
    `${ATH[who]}: hombre, ${pr.age} años, ${pr.height} cm, ${w ? fmt(w.kg, 1) + " kg" : "peso sin apuntar"}${w && old ? ` (${fmt(w.kg - old.kg, 1)} kg en 4 semanas)` : ""}; objetivo ${GOALS[pr.goal].l.toLowerCase()}; trabajo ${WORK[pr.work].l.toLowerCase()}.`,
    `Media de entreno: ${fmt(weeklyMinutes(who))} min/semana. Alcohol esta semana: ${fmt(al.ube, 1)} UBE (objetivo ${pr.alcoholGoal}).`,
    `Objetivo de dieta: ${t.kcal} kcal, ${t.prot} g proteína, ${t.carbs} g hidratos, ${t.fat} g grasa.`,
    `Mejores series: ${Object.entries(best).map(([k, b]) => `${k} ${b.kg ? fmt(b.kg, 1) + " kg × " : ""}${b.reps}`).join("; ") || "sin datos"}.`,
    `Últimas sesiones:\n${lines.join("\n") || "ninguna"}`
  ].join("\n");
}
function planSummary(plan){
  if (!plan) return "sin plan";
  const d = planDay(plan), next = (plan.semanas || []).flatMap(w => w.dias || []).filter(x => x.fecha >= todayISO()).slice(0, 7);
  return `${plan.titulo || "Plan"}${d ? ` — hoy: ${d.actividad} ${d.duracion_min || ""} min, ${d.foco || ""}` : ""}\n${next.map(x => `${x.fecha} ${x.actividad} ${x.duracion_min || ""} min ${x.foco || ""}`).join("\n")}`;
}
const WORKOUT_SCHEMA = `ENTRENO = {"titulo": str, "tipo": "gym"|"calistenia"|"natacion"|"cinta"|"bici"|"otro", "duracion_min": n, "objetivo": str,
 "bloques": [{"nombre": "Calentamiento"|"Principal"|"Finisher"|"Vuelta a la calma"|..., "items": [
   {"ejercicio": str, "musculos": [clave], "modo": "reps"|"tiempo"|"distancia", "series": n, "reps": n?, "kg": n?, "segundos": n?, "metros": n?, "descanso_s": n, "indicacion": str?, "reto": str?}]}],
 "nota": str}
Lo importante es el músculo, no el ejercicio: organiza el entreno por los músculos que toca trabajar y elige para cada uno el ejercicio que mejor encaje con el lugar y el material. "musculos": los que trabaja, el principal primero, con estas claves: ${Object.keys(MUSCLES).join(", ")}.
Reglas del ENTRENO: que quepa en la duración pedida contando descansos; "reps" para fuerza (kg 0 si es peso corporal), "tiempo" para planchas, intervalos o cardio por tiempo, "distancia" para natación (metros por serie). En "reto" pon cómo superar su última vez o su récord (por ejemplo "Tu mejor: 80 kg × 8. Hoy 82,5 × 8") o cómo ganar a ${"${RIVAL}"}. Progresión prudente: +2,5 kg o +1 rep si la última vez completó todo; nunca más de un 5 %. Para "ejercicio" usa exactamente estos nombres cuando encajen (tienen dibujo): ${Object.keys(GUIDE).join(", ")}. Para natación usa nombres como "Crol", "Braza", "Espalda", "Patada con tabla", "Pull buoy".`;
const TRAIN_PLAN_SCHEMA = `PLAN_ENTRENO = {"tipo": "semana"|"mes", "titulo": str, "semanas": [{"objetivo": str, "dias": [{"fecha": "YYYY-MM-DD", "dia": "lunes"…, "actividad": "gym"|"calistenia"|"natacion"|"cinta"|"bici"|"descanso"|"otro", "duracion_min": n, "foco": str, "detalle": str}]}], "nota": str}
Reglas del PLAN_ENTRENO: empieza hoy; semana = 7 días, mes = 4 semanas; cada semana con su objetivo y progresión; incluye descansos; "detalle" en una frase.`;
const DIET_PLAN_SCHEMA = `PLAN_DIETA = {"titulo": str, "dias": [{"fecha": "YYYY-MM-DD", "dia": "lunes"…, "desayuno": [str], "media": [str], "comida": {"bocadillo": [str], "bar": [str], "oficina": [str]}, "merienda": [str], "cena": [str], "kcal": n}], "consejos": [str]}
Reglas del PLAN_DIETA: 7 días desde hoy; cantidades en gramos ajustadas a su objetivo de kcal; la comida con 3 versiones: bocadillo o tortitas de maíz (obra, sin cocina), bar o restaurante (qué pedir en un menú del día) y oficina con microondas; comida española normal y barata.`;

function agentPrompt(agent, userText){
  const other = OTHER[me], hist = chatMsgs(agent).slice(-12);
  const role = agent === "coach"
    ? `Eres el entrenador personal de ${ATH[me]} en su app "Juan vs Ignacio", donde compite con su amigo ${ATH[other]}. Motivas, eres directo y concreto, con pique sano con ${ATH[other]}. Sabes de fuerza, calistenia, natación y cardio.`
    : `Eres el dietista de ${ATH[me]} en su app "Juan vs Ignacio", donde compite con su amigo ${ATH[other]}. Práctico, sin sermones, comida española normal. Tienes en cuenta el alcohol (1 UBE = 10 g) y su trabajo: a veces está en la obra sin cocina, otras come en un bar o en la oficina con microondas.`;
  const schemas = agent === "coach"
    ? `Responde SOLO con JSON: {"respuesta": str, "entreno": ENTRENO|null, "plan": PLAN_ENTRENO|null, "no_gusta": [str]|null, "si_gusta": [str]|null}
Pon "entreno" solo si pide un entrenamiento concreto para hacer (hoy o un día concreto) y "plan" solo si pide un plan semanal o mensual. Si hay plan y pide "el entreno de hoy", hazlo según el plan.
Si dice que un ejercicio no le gusta, le molesta o le cuesta demasiado, pon su nombre en "no_gusta" y en "respuesta" proponle 2 o 3 que trabajen el mismo músculo; si pide entreno, ya sin ese ejercicio. Si dice que vuelve a querer uno que no le gustaba, ponlo en "si_gusta". Nunca pongas en un entreno un ejercicio que no le gusta: usa otro del mismo músculo.
${WORKOUT_SCHEMA.replace("${RIVAL}", ATH[other])}
${TRAIN_PLAN_SCHEMA}`
    : `Responde SOLO con JSON: {"respuesta": str, "plan": PLAN_DIETA|null}
Pon "plan" solo si pide el menú de varios días o de la semana; para un día o una comida, contesta en "respuesta".
${DIET_PLAN_SCHEMA}`;
  return `${role}
Hablas en español de España, de tú. "respuesta": como mucho 120 palabras, sin markdown ni emojis, con saltos de línea si ayudan.
Hoy es ${DIA[today().getDay()]} ${todayISO()}.

${schemas}

Datos de ${ATH[me]}:
${athleteContext(me)}
Músculos trabajados en los últimos 3 días: ${(() => { const r = recentMuscles(me, 3); const k = MUSCLE_ORDER.filter(x => r[x] === 2); return k.length ? musNames(k) : "ninguno"; })()}.
${agent === "coach" ? `Ejercicios que no le gustan: ${dislikes().join(", ") || "ninguno apuntado"}.` : ""}
${checkinText() ? "Cómo está hoy (check-in): " + checkinText() : ""}
Plan de entreno actual: ${planSummary(trainPlan())}
${agent === "nutri" && dietPlan() ? `Tiene un menú semanal guardado: ${dietPlan().titulo || ""}.` : ""}
Su rival, ${ATH[other]}:
${athleteContext(other)}
${isDemo() || wDemo() || dDemo() ? "(Parte de estos datos son de ejemplo de la app; no los trates como reales si no cuadran.)" : ""}

Conversación hasta ahora:
${hist.map(m => `${m.r === "u" ? ATH[me] : AGENTS[agent].name}: ${m.t}`).join("\n") || "(empieza ahora)"}
${ATH[me]}: ${userText}`;
}

/* validation of what Claude returns */
const clampN = (v, lo, hi) => { const n = num(v); return n >= lo && n <= hi ? n : null; };
function normalizeWorkout(o){
  if (!o || typeof o !== "object" || !Array.isArray(o.bloques)) return null;
  const tipo = ["gym", "calistenia", "natacion", "cinta", "bici", "otro"].includes(o.tipo) ? o.tipo : "gym";
  const bloques = o.bloques.slice(0, 6).map(b => ({
    nombre: String((b && b.nombre) || "Bloque").slice(0, 40),
    items: (Array.isArray(b && b.items) ? b.items : []).slice(0, 12).map(it => {
      const modo = ["reps", "tiempo", "distancia"].includes(it && it.modo) ? it.modo : "reps";
      return {
        ejercicio: canonicalName(String((it && it.ejercicio) || "Ejercicio").slice(0, 50)), modo,
        series: clampN(it.series, 1, 12) || 1,
        reps: modo === "reps" ? (clampN(it.reps, 1, 100) || 10) : null,
        kg: modo === "reps" ? (clampN(it.kg, 0, 500) ?? 0) : null,
        segundos: modo === "tiempo" ? (clampN(it.segundos, 5, 3600) || 30) : null,
        metros: modo === "distancia" ? (clampN(it.metros, 25, 5000) || 100) : null,
        descanso_s: clampN(it.descanso_s, 0, 600) ?? 60,
        indicacion: String(it.indicacion || "").slice(0, 160), reto: String(it.reto || "").slice(0, 160),
        musculos: (Array.isArray(it.musculos) ? it.musculos : []).filter(m => MUSCLES[m]).slice(0, 5)
      };
    })
  })).filter(b => b.items.length);
  if (!bloques.length) return null;
  return { titulo: String(o.titulo || "Entreno").slice(0, 80), tipo, duracion_min: clampN(o.duracion_min, 5, 240) || 45,
    objetivo: String(o.objetivo || "").slice(0, 200), bloques, nota: String(o.nota || "").slice(0, 400) };
}
function normalizeTrainPlan(o){
  if (!o || !Array.isArray(o.semanas)) return null;
  const acts = ["gym", "calistenia", "natacion", "cinta", "bici", "descanso", "otro"];
  const semanas = o.semanas.slice(0, 5).map(w => ({ objetivo: String((w && w.objetivo) || "").slice(0, 160),
    dias: (Array.isArray(w && w.dias) ? w.dias : []).slice(0, 7).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)).map(d => ({
      fecha: d.fecha, dia: String(d.dia || DIA[parseISO(d.fecha).getDay()]), actividad: acts.includes(d.actividad) ? d.actividad : "otro",
      duracion_min: clampN(d.duracion_min, 0, 300) || 0, foco: String(d.foco || "").slice(0, 80), detalle: String(d.detalle || "").slice(0, 240),
      ...(normalizeWorkout(d.entreno) ? { entreno: normalizeWorkout(d.entreno) } : {}) })) }))
    .filter(w => w.dias.length);
  if (!semanas.length) return null;
  return { tipo: o.tipo === "mes" ? "mes" : "semana", titulo: String(o.titulo || "Plan de entreno").slice(0, 80), semanas, nota: String(o.nota || "").slice(0, 400) };
}
function normalizeDietPlan(o){
  if (!o || !Array.isArray(o.dias)) return null;
  const L = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => String(x).slice(0, 200)).slice(0, 6);
  const dias = o.dias.slice(0, 7).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)).map(d => ({
    fecha: d.fecha, dia: String(d.dia || DIA[parseISO(d.fecha).getDay()]), desayuno: L(d.desayuno), media: L(d.media),
    comida: { bocadillo: L(d.comida && d.comida.bocadillo), bar: L(d.comida && d.comida.bar), oficina: L(d.comida && d.comida.oficina) },
    merienda: L(d.merienda), cena: L(d.cena), kcal: clampN(d.kcal, 800, 6000) }));
  if (!dias.length) return null;
  return { titulo: String(o.titulo || "Menú semanal").slice(0, 80), dias, consejos: L(o.consejos) };
}

/* sending a message */
async function saveChat(agent, mensajes){
  if (dbState !== "ready") return;
  await db.doc(`chats/${chatId(agent)}`).set({ athlete: me, agente: agent, mensajes: mensajes.slice(-30), updatedAt: Date.now() });
}
async function sendChat(agent, text, opts = {}){
  text = String(text || "").trim();
  if (!text || chatBusy[agent]) return null;
  if (!sample) { chatErr[agent] = WEB ? "Claude no está disponible ahora mismo." : "Esta vista no puede usar Claude."; renderChatIfShown(agent); return null; }
  const before = chatMsgs(agent).slice();
  const pending = [...before, { r: "u", t: text, ts: Date.now() }];
  chats[chatId(agent)] = { ...(chats[chatId(agent)] || {}), mensajes: pending };
  chatBusy[agent] = true; chatErr[agent] = ""; chatCtl[agent] = new AbortController(); renderChatIfShown(agent);
  let reply = null;
  try {
    const o = await sample.json(agentPrompt(agent, text), { signal: chatCtl[agent].signal, cache: false });
    const msg = { r: "a", t: String((o && o.respuesta) || "Hecho.").slice(0, 2000), ts: Date.now() };
    if (agent === "coach") {
      const w = normalizeWorkout(o && o.entreno), p = normalizeTrainPlan(o && o.plan);
      if (w) msg.entreno = w;
      const L = v => (Array.isArray(v) ? v : []).map(x => String(x).trim().slice(0, 50)).filter(Boolean).slice(0, 6);
      const add = L(o && o.no_gusta), remove = L(o && o.si_gusta);
      if ((add.length || remove.length) && await updateDislikes({ add, remove })) { if (add.length) msg.noGusta = add.map(canonicalName); if (remove.length) msg.siGusta = remove.map(canonicalName); }
      if (p) { msg.plan = p; await db?.doc(`planes/${me}_entreno`).set({ athlete: me, clase: "entreno", ...p, creado: Date.now() }); }
    } else {
      const p = normalizeDietPlan(o && o.plan);
      if (p) { msg.plan = p; await db?.doc(`planes/${me}_dieta`).set({ athlete: me, clase: "dieta", ...p, creado: Date.now() }); }
    }
    const all = [...pending, msg];
    chats[chatId(agent)] = { ...(chats[chatId(agent)] || {}), mensajes: all };
    await saveChat(agent, all).catch(() => {});
    reply = msg;
  } catch (e) {
    chats[chatId(agent)] = { ...(chats[chatId(agent)] || {}), mensajes: before };
    if (e && e.code !== "cancelled") chatErr[agent] = sampleMsg(e);
    if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) sample = null;
  }
  chatBusy[agent] = false; renderChatIfShown(agent);
  if (tab === "hoy") renderHoy();
  return reply;
}
function renderChatIfShown(agent){ if (tab === agent) renderChat(agent); else if (tab === "hoy") renderHoy(); }

/* chat screen */
function workoutCard(w, ref){
  const n = w.bloques.reduce((a, b) => a + b.items.length, 0);
  return `<div class="wcard">
    <div class="wcard-h"><span class="chip">${esc(SPORTS[w.tipo === "calistenia" ? "gym" : w.tipo] || "Entreno")}${w.tipo === "calistenia" ? " · calistenia" : ""}</span><b>${esc(w.titulo)}</b><span class="muted">${w.duracion_min} min · ${n} ejercicios</span></div>
    <div class="wcard-figs">${w.bloques.flatMap(b => b.items).filter(it => GUIDE[it.ejercicio]).slice(0, 4).map(it => figMini(it.ejercicio)).join("")}</div>
    <button type="button" class="btn primary" data-start="${esc(ref)}">Ver y empezar</button>
  </div>`;
}
function planCard(p, agent){
  if (agent === "coach") {
    const d = planDay(p);
    return `<div class="wcard"><div class="wcard-h"><span class="chip">Plan ${p.tipo === "mes" ? "mensual" : "semanal"}</span><b>${esc(p.titulo)}</b>${d ? `<span class="muted">Hoy: ${esc(d.foco || d.actividad)}</span>` : ""}</div>
      <button type="button" class="btn" data-leaf="plan">Ver el plan</button></div>`;
  }
  return `<div class="wcard"><div class="wcard-h"><span class="chip">Menú semanal</span><b>${esc(p.titulo)}</b><span class="muted">${p.dias.length} días</span></div>
    <button type="button" class="btn" data-leaf="dieta">Ver el menú</button></div>`;
}
function renderChat(agent){
  const v = $("#view-" + agent); if (!v) return;
  const A = AGENTS[agent], msgs = chatMsgs(agent), busy = chatBusy[agent];
  if (!me) { v.innerHTML = `<div class="panel"><p style="margin:0">Elige quién eres en <b>Apuntar</b> para hablar con ${A.who}.</p></div>`; return; }
  v.innerHTML = `<div class="chat">
    <div class="chat-head"><div class="avatar ${agent}">${agent === "coach" ? "E" : "D"}</div><div><b>${A.name}</b><div class="muted" style="font-size:13px">${agent === "coach" ? "Entrenos, planes y cómo superarte" : "Menús, compras y qué pedir fuera"}</div></div>
      ${msgs.length ? `<button type="button" class="btn sm ghost" data-chat-clear="${agent}">Nueva conversación</button>` : ""}</div>
    <div class="msgs" id="msgs-${agent}">
      ${msgs.length ? "" : `<div class="bubble a">Hola, ${ATH[me]}. Soy ${A.who}. ${agent === "coach" ? "Pídeme el entreno de hoy, un plan semanal o mensual, o cómo ganarle a " + ATH[OTHER[me]] + "." : "Pídeme el menú de la semana o qué comer hoy según dónde estés."}</div>`}
      ${msgs.map((m, i) => `<div class="bubble ${m.r}">${esc(m.t)}${m.noGusta ? `<div class="note">Apuntado: no te gusta ${esc(m.noGusta.join(", "))}. No te lo vuelvo a poner.</div>` : ""}${m.siGusta ? `<div class="note">Vuelve a tu lista: ${esc(m.siGusta.join(", "))}.</div>` : ""}${m.entreno ? workoutCard(m.entreno, `${agent}:${i}`) : ""}${m.plan ? planCard(m.plan, agent) : ""}</div>`).join("")}
      ${busy ? `<div class="bubble a typing"><span class="spin"></span>${agent === "coach" ? "Preparando…" : "Pensando…"}</div>` : ""}
    </div>
    ${chatErr[agent] ? `<div class="err" role="alert">${esc(chatErr[agent])}</div>` : ""}
    <div class="sugg">${A.sugg.map(s => `<button type="button" data-say="${agent}" data-text="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <form class="composer" data-agent="${agent}" novalidate>
      <textarea id="in-${agent}" data-keep rows="1" placeholder="Escribe o pulsa el micro…">${esc(keep("in-" + agent))}</textarea>
      ${micButton("in-" + agent)}
      ${busy ? `<button type="button" class="btn" data-chat-stop="${agent}">Parar</button>` : `<button type="submit" class="btn primary" ${sample ? "" : "disabled"}>Enviar</button>`}
    </form>
  </div>`;
  const box = $("#msgs-" + agent); if (box) box.scrollTop = box.scrollHeight;
}
function submitChat(agent){
  const t = String(keep("in-" + agent)).trim(); if (!t) return;
  kept["in-" + agent] = ""; store.set("gym.kept", kept);
  sendChat(agent, t);
}
document.addEventListener("submit", e => { const f = e.target.closest("form.composer"); if (f) { e.preventDefault(); submitChat(f.dataset.agent); } });
document.addEventListener("keydown", e => { if (e.target.matches && e.target.matches(".composer textarea") && e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer:fine)").matches) { e.preventDefault(); submitChat(e.target.closest("form").dataset.agent); } });
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.say) { const a = t.dataset.say; sendChat(a, t.dataset.text); }
  else if (t.dataset.chatStop) chatCtl[t.dataset.chatStop]?.abort();
  else if (t.dataset.chatClear) { const a = t.dataset.chatClear; chats[chatId(a)] = { mensajes: [] }; await saveChat(a, []).catch(() => {}); renderChat(a); }
  else if (t.dataset.start) {
    const [a, i] = t.dataset.start.split(":"); const m = chatMsgs(a)[+i];
    if (m && m.entreno) openPlayer(m.entreno);
  }
});

/* plan screen */
function renderPlan(){
  const v = $("#view-plan"), p = trainPlan(), o = trainPlan(OTHER[me]);
  const dayRow = d => { const isToday = d.fecha === todayISO(), past = d.fecha < todayISO(), done = data().some(s => s.athlete === me && s.date === d.fecha);
    return `<div class="pday ${isToday ? "today" : ""} ${past ? "past" : ""}">
      <div class="pd-date"><b>${esc(d.dia.slice(0, 3))}</b><span>${parseISO(d.fecha).getDate()}</span></div>
      <div class="pd-body"><div><b>${d.actividad === "descanso" ? "Descanso" : esc(d.foco || SPORTS[d.actividad] || d.actividad)}</b>${d.duracion_min ? ` <span class="muted">· ${d.duracion_min} min</span>` : ""}${done ? ' <span class="pill ok">hecho</span>' : ""}</div><div class="muted" style="font-size:13px">${esc(d.detalle)}</div></div>
      ${d.actividad === "descanso" || past || (isToday && done) ? "" : d.entreno ? `<button type="button" class="btn sm ${isToday ? "primary" : ""}" data-plan-open="${d.fecha}">${isToday ? "Empezar" : "Ver"}</button>`
        : `<button type="button" class="btn sm ${isToday ? "primary" : ""}" data-plan-day="${d.fecha}">${isToday ? "Empezar" : "Preparar"}</button>`}
    </div>`; };
  v.innerHTML = `<div style="display:grid;gap:18px">
    ${p ? `<div class="panel"><div class="panel-head"><div><h2>${esc(p.titulo)}</h2><div class="muted" style="font-size:13px;margin-top:2px">Plan ${p.tipo === "mes" ? "mensual" : "semanal"} de ${ATH[me]}${p.nota ? " · " + esc(p.nota) : ""}</div></div>
        <div class="row-btns"><button type="button" class="btn sm" data-say="coach" data-text="Hazme un plan semanal nuevo">Nuevo semanal</button><button type="button" class="btn sm" data-say="coach" data-text="Hazme un plan de un mes">Nuevo mensual</button></div></div>
      ${p.semanas.map((w, i) => `<div class="pweek"><div class="eyebrow">Semana ${i + 1}${w.objetivo ? " · " + esc(w.objetivo) : ""}</div>${w.dias.map(dayRow).join("")}</div>`).join("")}</div>`
    : `<div class="panel empty-plan"><h2>Sin plan todavía</h2><p class="muted">Pídeselo a tu entrenador: tendrá en cuenta lo que has hecho, tu objetivo y cómo va ${ATH[OTHER[me]]}.</p>
      <div class="row-btns" style="justify-content:center"><button type="button" class="btn primary" data-say="coach" data-text="Hazme un plan semanal">Plan semanal</button><button type="button" class="btn" data-say="coach" data-text="Hazme un plan de un mes">Plan mensual</button></div>
      ${chatBusy.coach ? `<div class="thinking" style="justify-content:center;margin-top:12px"><span class="spin"></span>Preparando tu plan…</div>` : ""}</div>`}
    ${me ? dislikesHTML() : ""}
    ${o ? `<div class="panel"><div class="panel-head"><h2>El plan de ${ATH[OTHER[me]]}</h2></div>${(o.semanas[0] ? o.semanas.flatMap(w => w.dias).filter(d => d.fecha >= todayISO()).slice(0, 4) : []).map(d => `<div class="pday"><div class="pd-date"><b>${esc(d.dia.slice(0, 3))}</b><span>${parseISO(d.fecha).getDate()}</span></div><div class="pd-body"><b>${d.actividad === "descanso" ? "Descanso" : esc(d.foco || d.actividad)}</b> <span class="muted">${d.duracion_min ? "· " + d.duracion_min + " min" : ""}</span></div></div>`).join("")}</div>` : ""}
  </div>`;
}
/* a plan day that already carries its workout opens straight away */
function openPlanDay(fecha){
  const d = planDay(trainPlan(), fecha), w = d && normalizeWorkout(d.entreno);
  if (w) openPlayer(w); else toast("Ese día no tiene entreno preparado");
}
document.addEventListener("click", e => { const t = e.target.closest("button[data-plan-open]"); if (t) openPlanDay(t.dataset.planOpen); });
document.addEventListener("click", async e => {
  const t = e.target.closest("button[data-plan-day]"); if (!t) return;
  const d = planDay(trainPlan(), t.dataset.planDay); if (!d) return;
  t.disabled = true; t.textContent = "Preparando…";
  await quickWorkout({ plan: d });
});

/* ask for a workout from anywhere (Hoy, plan) */
async function quickWorkout({ tipo, minutos, plan, checkin } = {}){
  const text = plan
    ? `Prepárame el entreno del ${plan.dia} ${plan.fecha} según mi plan: ${plan.actividad}, ${plan.duracion_min} min, ${plan.foco}. ${plan.detalle}${plan.entreno ? ` El previsto era: ${plan.entreno.bloques.flatMap(b => b.items).map(x => `${x.ejercicio} ${x.series} × ${target(x)}`).join("; ")}. Adáptalo trabajando los mismos músculos.` : ""}${checkin ? " Ten en cuenta cómo estoy hoy." : ""}`
    : checkin
    ? `Hazme el entreno de hoy según cómo estoy: ${checkinText()}. Adáptalo: si estoy flojo o he dormido mal, baja volumen e intensidad; si voy a tope, ponme un reto fuerte. No cargues los músculos que me molestan y evita repetir los que trabajé ayer si no te lo pido.`
    : `Hazme un entreno de ${tipo === "casa" ? "calistenia en casa sin material" : tipo} de ${minutos} minutos para hoy, que me haga superar mi última sesión.`;
  if (tab !== "hoy" && tab !== "plan") setTab("coach");
  const r = await sendChat("coach", text);
  if (r && r.entreno) openPlayer(r.entreno);
  else if (r) { setTab("coach"); }
  if (tab === "plan") renderPlan();
}

/* speech recognition (web only: inside Claude the microphone is blocked) */
const SR = WEB ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
let rec = null, recTarget = null;
function micButton(targetId){
  if (!SR) return "";
  const on = rec && recTarget === targetId;
  return `<button type="button" class="mic ${on ? "on" : ""}" data-mic="${targetId}" aria-label="${on ? "Parar el dictado" : "Dictar por voz"}" aria-pressed="${on}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>`;
}
function toggleMic(targetId){
  if (rec) { rec.stop(); return; }
  const el = $("#" + targetId); if (!el) return;
  rec = new SR(); rec.lang = "es-ES"; rec.continuous = true; rec.interimResults = true; recTarget = targetId;
  const base = el.value ? el.value.replace(/\s*$/, " ") : "";
  let finalText = "";
  rec.onresult = ev => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finalText += r[0].transcript + " "; else interim += r[0].transcript; }
    const f = $("#" + targetId); if (f) { f.value = base + finalText + interim; kept[targetId] = f.value; store.set("gym.kept", kept); }
  };
  rec.onerror = ev => { if (ev.error === "not-allowed") toast("Permite el micrófono en el navegador para dictar"); };
  rec.onend = () => { rec = null; recTarget = null; document.querySelectorAll("[data-mic]").forEach(b => { b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); }); };
  try { rec.start(); document.querySelectorAll(`[data-mic="${targetId}"]`).forEach(b => { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); }); }
  catch { rec = null; toast("No se ha podido usar el micrófono"); }
}
document.addEventListener("click", e => { const t = e.target.closest("button[data-mic]"); if (t) { e.preventDefault(); toggleMic(t.dataset.mic); } });
