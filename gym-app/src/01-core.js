/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
const nf = {};
const fmt = (v, dec = 0) => { const k = dec; nf[k] ||= new Intl.NumberFormat("es-ES", {maximumFractionDigits: dec, minimumFractionDigits: 0, useGrouping: true}); return nf[k].format(v || 0); };
const fmtBig = v => v >= 10000 ? fmt(v / 1000, 1) + " k" : fmt(v);
const pad = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DIA = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const shortDate = d => `${d.getDate()} ${MES[d.getMonth()]}`;
const mmss = mins => { if (!isFinite(mins) || mins <= 0) return "–"; const t = Math.round(mins * 60); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
function relDay(iso){
  const diff = Math.round((today() - parseISO(iso)) / 864e5);
  if (diff === 0) return "hoy"; if (diff === 1) return "ayer"; if (diff > 1 && diff < 7) return `hace ${diff} días`;
  return shortDate(parseISO(iso));
}

/* ---------- domain ---------- */
// WEB = the standalone site (Supabase login); otherwise the Claude Artifact.
const WEB = !!window.GYM_WEB;
const ATH = { juan: "Juan", ignacio: "Ignacio" };
const KEYS = ["juan", "ignacio"];
const OTHER = { juan: "ignacio", ignacio: "juan" };
const SPORTS = { gym: "Gimnasio", bici: "Bicicleta", natacion: "Natación", cinta: "Cinta", otro: "Otro" };
const GROUPS = ["Pecho","Espalda","Piernas","Glúteo","Hombro","Bíceps","Tríceps","Core","Full body","Otro"];
const EQUIP = ["Barra","Mancuernas","Máquina","Polea","Peso corporal","Kettlebell","Otro"];
const CATALOG = {
  "Press banca":"Pecho","Press inclinado con mancuernas":"Pecho","Press en máquina":"Pecho","Aperturas":"Pecho","Cruce de poleas":"Pecho","Fondos":"Pecho",
  "Dominadas":"Espalda","Jalón al pecho":"Espalda","Remo con barra":"Espalda","Remo con mancuerna":"Espalda","Remo en polea baja":"Espalda","Peso muerto":"Espalda",
  "Sentadilla":"Piernas","Sentadilla búlgara":"Piernas","Prensa":"Piernas","Zancadas":"Piernas","Extensión de cuádriceps":"Piernas","Curl femoral":"Piernas","Gemelos":"Piernas",
  "Hip thrust":"Glúteo","Peso muerto rumano":"Glúteo",
  "Press militar":"Hombro","Elevaciones laterales":"Hombro","Pájaros":"Hombro","Face pull":"Hombro",
  "Curl con barra":"Bíceps","Curl martillo":"Bíceps","Curl en banco Scott":"Bíceps",
  "Extensión en polea":"Tríceps","Press francés":"Tríceps",
  "Plancha":"Core","Crunch":"Core","Rueda abdominal":"Core","Elevación de piernas":"Core",
  "Flexiones":"Pecho","Remo invertido":"Espalda","Mountain climbers":"Core","Sentadilla sin peso":"Piernas","Pike push-up":"Hombro",
  "Burpee":"Full body","Puente de glúteo":"Glúteo","Fondos en banco":"Tríceps"
};
const normName = s => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function gymStats(s){
  let vol = 0, sets = 0, reps = 0;
  for (const ex of s.exercises || []) for (const st of ex.sets || []) {
    if (st.warmup) continue; const r = num(st.reps); if (!r) continue;
    sets++; reps += r; vol += r * num(st.kg);
  }
  return { vol, sets, reps };
}
const e1rm = (kg, reps) => reps >= 1 && reps <= 12 ? kg * (1 + reps / 30) : 0;

function totals(list){
  const t = { sesiones: 0, minutos: 0, dias: new Set(), volumen: 0, series: 0, reps: 0, kmBici: 0, kmCinta: 0, mNado: 0, kcal: 0 };
  for (const s of list) {
    t.sesiones++; t.minutos += num(s.minutes); t.dias.add(s.date); t.kcal += num(s.kcal);
    if (s.sport === "gym") { const g = gymStats(s); t.volumen += g.vol; t.series += g.sets; t.reps += g.reps; }
    if (s.sport === "bici") t.kmBici += num(s.km);
    if (s.sport === "cinta") t.kmCinta += num(s.km);
    if (s.sport === "natacion") t.mNado += num(s.meters);
  }
  t.dias = t.dias.size;
  return t;
}
const METRICS = [
  { k: "sesiones", label: "Sesiones" },
  { k: "minutos", label: "Minutos entrenados", unit: "min" },
  { k: "dias", label: "Días activos" },
  { k: "volumen", label: "Volumen levantado", unit: "kg", big: true },
  { k: "series", label: "Series efectivas" },
  { k: "reps", label: "Repeticiones" },
  { k: "kmBici", label: "Bicicleta", unit: "km", dec: 1 },
  { k: "kmCinta", label: "Cinta", unit: "km", dec: 1 },
  { k: "mNado", label: "Natación", unit: "m" },
  { k: "kcal", label: "Calorías quemadas", unit: "kcal" },
  { k: "ube", label: "Alcohol", unit: "UBE", dec: 1, low: true }
];
const canonicalName = n => { const k = normName(n); return Object.keys(CATALOG).find(c => normName(c) === k) || String(n || "").trim(); };
const PERIODS = { semana: "Esta semana", mes: "Este mes", "año": "Este año", todo: "Desde siempre" };
const PERIOD_IN = { semana: "esta semana", mes: "este mes", "año": "este año", todo: "en total" };
function periodRange(p){
  const t = today();
  if (p === "semana") { const s = mondayOf(t); return [toISO(s), toISO(addDays(s, 6))]; }
  if (p === "mes") return [toISO(new Date(t.getFullYear(), t.getMonth(), 1)), toISO(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
  if (p === "año") return [`${t.getFullYear()}-01-01`, `${t.getFullYear()}-12-31`];
  return ["0000-01-01", "9999-12-31"];
}
function sessionSummary(s){
  const bits = [];
  if (s.sport === "gym") {
    const g = gymStats(s); const n = (s.exercises || []).length;
    bits.push(`${n} ejercicio${n === 1 ? "" : "s"}`, `${g.sets} series`, `${fmt(g.vol)} kg`);
  } else if (s.sport === "bici") {
    if (num(s.km)) bits.push(`${fmt(num(s.km), 1)} km`);
    if (num(s.km) && num(s.minutes)) bits.push(`${fmt(num(s.km) / (num(s.minutes) / 60), 1)} km/h`);
    if (num(s.watts)) bits.push(`${fmt(num(s.watts))} W`);
  } else if (s.sport === "natacion") {
    if (num(s.meters)) bits.push(`${fmt(num(s.meters))} m`);
    if (num(s.meters) && num(s.minutes)) bits.push(`${mmss(num(s.minutes) * 100 / num(s.meters))} /100 m`);
    if (s.style) bits.push(s.style);
  } else if (s.sport === "cinta") {
    if (num(s.km)) bits.push(`${fmt(num(s.km), 2)} km`);
    if (num(s.km) && num(s.minutes)) bits.push(`${mmss(num(s.minutes) / num(s.km))} min/km`);
    if (num(s.incline)) bits.push(`${fmt(num(s.incline), 1)} % incl.`);
  } else {
    if (s.activity) bits.push(s.activity);
    if (num(s.km)) bits.push(`${fmt(num(s.km), 1)} km`);
  }
  if (num(s.hrAvg)) bits.push(`${fmt(num(s.hrAvg))} ppm`);
  return bits.join(" · ");
}
function streak(list, who){
  const days = new Set(list.filter(s => s.athlete === who).map(s => s.date));
  let d = today(); if (!days.has(toISO(d))) d = addDays(d, -1);
  let n = 0; while (days.has(toISO(d))) { n++; d = addDays(d, -1); }
  return n;
}
function bestWeekMinutes(list, who){
  const w = {};
  for (const s of list) if (s.athlete === who) { const k = toISO(mondayOf(parseISO(s.date))); w[k] = (w[k] || 0) + num(s.minutes); }
  let best = 0, at = null; for (const k in w) if (w[k] > best) { best = w[k]; at = k; }
  return { best, at };
}

/* ---------- demo data (only shown while the database is empty) ---------- */
function makeDemo(){
  let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647, (seed - 1) / 2147483646);
  const out = []; const t = today(); let n = 0;
  const r25 = x => Math.round(x / 2.5) * 2.5;
  const base = {
    juan: { "Press banca": 80, "Remo con barra": 70, "Press militar": 50, "Curl con barra": 32.5, "Sentadilla": 100, "Peso muerto rumano": 90, "Prensa": 180, "Dominadas": 0 },
    ignacio: { "Press banca": 85, "Remo con barra": 65, "Press militar": 47.5, "Curl con barra": 35, "Sentadilla": 95, "Peso muerto rumano": 100, "Prensa": 170, "Dominadas": 0 }
  };
  const A = ["Press banca", "Remo con barra", "Press militar", "Curl con barra"];
  const B = ["Sentadilla", "Peso muerto rumano", "Prensa", "Dominadas"];
  const plan = { juan: { 0: "gymA", 1: "cinta", 3: "gymB", 5: "bici", 6: "natacion" }, ignacio: { 0: "natacion", 2: "gymA", 3: "cinta", 4: "gymB", 6: "bici" } };
  for (let back = 40; back >= 0; back--) {
    const d = addDays(t, -back), wd = (d.getDay() + 6) % 7, prog = 1 + (40 - back) / 40 * 0.06;
    for (const a of KEYS) {
      const kind = plan[a][wd]; if (!kind || rnd() < 0.18) continue;
      const s = { id: "demo-" + (n++), demo: true, athlete: a, date: toISO(d), time: a === "juan" ? "07:30" : "19:00", rpe: 6 + Math.round(rnd() * 3), kcal: 0 };
      if (kind.startsWith("gym")) {
        const list = kind === "gymA" ? A : B; s.sport = "gym"; s.minutes = 55 + Math.round(rnd() * 25);
        s.exercises = list.map(name => {
          const top = r25(base[a][name] * prog); const bw = top === 0;
          const sets = bw ? [] : [{ reps: 10, kg: r25(top * 0.5), warmup: true }];
          const k = 3 + (rnd() < 0.4 ? 1 : 0);
          for (let i = 0; i < k; i++) sets.push({ reps: bw ? 8 + Math.round(rnd() * 3) : 6 + Math.round(rnd() * 4), kg: top, rir: 1 + Math.round(rnd() * 2), rest: 120 });
          return { name, group: CATALOG[name], equip: bw ? "Peso corporal" : name === "Prensa" ? "Máquina" : "Barra", sets };
        });
        s.kcal = Math.round(s.minutes * 6.5);
      } else if (kind === "cinta") {
        s.sport = "cinta"; s.minutes = 25 + Math.round(rnd() * 20); s.incline = rnd() < .5 ? 1 : 3;
        s.km = +(s.minutes / (a === "juan" ? 5.6 : 5.9)).toFixed(2); s.hrAvg = 148 + Math.round(rnd() * 12); s.kcal = Math.round(s.minutes * 11);
      } else if (kind === "bici") {
        s.sport = "bici"; s.bikeType = rnd() < .5 ? "Carretera" : "Estática"; s.minutes = 50 + Math.round(rnd() * 50);
        s.km = +(s.minutes / 60 * (a === "juan" ? 26 : 24.5)).toFixed(1); s.watts = 150 + Math.round(rnd() * 40); s.hrAvg = 138 + Math.round(rnd() * 10); s.kcal = Math.round(s.minutes * 9);
      } else {
        s.sport = "natacion"; s.minutes = 30 + Math.round(rnd() * 20); s.poolLength = 25; s.style = "Crol";
        s.meters = Math.round(s.minutes * (a === "juan" ? 38 : 44) / 50) * 50; s.laps = s.meters / 25; s.kcal = Math.round(s.minutes * 9.5);
      }
      out.push(s);
    }
  }
  return out;
}
const DEMO = makeDemo();

/* ---------- alcohol ---------- */
// 1 UBE (unidad de bebida estándar) = 10 g de alcohol puro, criterio del Ministerio de Sanidad.
const DRINKS = {
  cana:    { l: "Caña",            m: "200 ml · 5 %",   ube: 1,   kcal: 90 },
  tercio:  { l: "Tercio",          m: "330 ml · 5 %",   ube: 1.5, kcal: 140 },
  pinta:   { l: "Pinta / jarra",   m: "500 ml · 5 %",   ube: 2,   kcal: 215 },
  sin:     { l: "Cerveza 0,0",     m: "330 ml",         ube: 0,   kcal: 60 },
  vino:    { l: "Copa de vino",    m: "100 ml · 13 %",  ube: 1,   kcal: 85 },
  cava:    { l: "Copa de cava",    m: "100 ml · 11 %",  ube: 1,   kcal: 80 },
  vermut:  { l: "Vermut",          m: "100 ml · 15 %",  ube: 1.5, kcal: 150 },
  tinto:   { l: "Tinto de verano", m: "300 ml",         ube: 1,   kcal: 120 },
  sidra:   { l: "Sidra",           m: "200 ml · 5 %",   ube: 1,   kcal: 90 },
  chupito: { l: "Chupito",         m: "30 ml · 40 %",   ube: 1,   kcal: 70 },
  cubata:  { l: "Copa / cubata",   m: "60 ml · 40 % + refresco", ube: 2, kcal: 240 }
};
const DAILY_LOW_RISK = 2;   // UBE/día en hombres (20 g)
const BINGE = 6;            // UBE en una ocasión = consumo intensivo
const dayUbe = counts => Object.entries(counts || {}).reduce((a, [k, n]) => a + (DRINKS[k] ? DRINKS[k].ube * num(n) : 0), 0);
const dayKcal = counts => Object.entries(counts || {}).reduce((a, [k, n]) => a + (DRINKS[k] ? DRINKS[k].kcal * num(n) : 0), 0);
function alcoholIn(drinkDocs, who, a, b){
  let ube = 0, kcal = 0, over = 0, binge = 0, days = 0;
  for (const d of drinkDocs) if (d.athlete === who && d.date >= a && d.date <= b) {
    const u = dayUbe(d.counts); if (!u && !dayKcal(d.counts)) continue;
    ube += u; kcal += dayKcal(d.counts); if (u) days++;
    if (u > DAILY_LOW_RISK) over++; if (u >= BINGE) binge++;
  }
  return { ube, kcal, over, binge, days };
}
function alcoholStatus(ube, goal){
  if (ube <= goal) return { cls: "ok", t: ube === 0 ? "Semana seca" : "Dentro de tu objetivo" };
  if (ube <= DAILY_LOW_RISK * 7) return { cls: "warn", t: "Por encima de tu objetivo" };
  return { cls: "over", t: "Te has pasado" };
}

/* ---------- weights ---------- */
function weightSeries(ws, who){ return ws.filter(w => w.athlete === who && num(w.kg) > 0).sort((a, b) => a.date.localeCompare(b.date)); }
function latestWeight(ws, who, upTo = "9999-12-31"){ const s = weightSeries(ws, who).filter(w => w.date <= upTo); return s.length ? s[s.length - 1] : null; }

/* ---------- demo weights and drinks ---------- */
function makeDemoBody(){
  const t = today(), ws = [], ds = [];
  for (let i = 9; i >= 0; i--) {
    const d = toISO(addDays(mondayOf(t), -7 * i));
    ws.push({ id: "dw-j" + i, demo: true, athlete: "juan", date: d, kg: +(84.6 - (9 - i) * 0.22 + (i % 3 === 0 ? 0.3 : 0)).toFixed(1), waist: 92 - Math.round((9 - i) / 3) });
    ws.push({ id: "dw-i" + i, demo: true, athlete: "ignacio", date: d, kg: +(79.4 - (9 - i) * 0.09 + (i % 4 === 1 ? 0.25 : 0)).toFixed(1) });
  }
  for (let i = 5; i >= 0; i--) {
    const sat = addDays(mondayOf(t), -7 * i + 5), fri = addDays(sat, -1);
    if (sat <= t) {
      ds.push({ id: "dd-js" + i, demo: true, athlete: "juan", date: toISO(sat), counts: i % 2 ? { cana: 4, cubata: 2 } : { cana: 3, vino: 1 } });
      ds.push({ id: "dd-is" + i, demo: true, athlete: "ignacio", date: toISO(sat), counts: i % 2 ? { tercio: 2, cubata: 1 } : { vino: 2 } });
    }
    if (fri <= t && i % 2 === 0) ds.push({ id: "dd-jf" + i, demo: true, athlete: "juan", date: toISO(fri), counts: { cana: 2 } });
    if (fri <= t && i % 3 === 0) ds.push({ id: "dd-if" + i, demo: true, athlete: "ignacio", date: toISO(fri), counts: { cana: 3, chupito: 1 } });
  }
  return { ws, ds };
}
const DEMO_BODY = makeDemoBody();
