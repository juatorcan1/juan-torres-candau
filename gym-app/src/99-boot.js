/* ---------- navigation ---------- */
let sampleState = "loading"; // loading | ready | none
let staleView = false;
const lastLeaf = store.get("gym.leaves", { entrenador: "coach", dietista: "nutri", duelo: "duelo" });
function setTab(t){
  if (!TABS.includes(t)) t = "hoy";
  tab = t; store.set("gym.tab", t);
  const top = LEAF_TOP[t];
  lastLeaf[top] = t; store.set("gym.leaves", lastLeaf);
  for (const sec of document.querySelectorAll("main > .top")) sec.hidden = sec.id !== "top-" + top;
  for (const k of TABS) { const el = $("#view-" + k); if (el) el.hidden = k !== t; }
  for (const b of document.querySelectorAll(".bnav button")) b.setAttribute("aria-current", b.dataset.top === top ? "page" : "false");
  for (const b of document.querySelectorAll(".subnav button")) b.setAttribute("aria-selected", String(b.dataset.leaf === t));
  renderView();
  window.scrollTo({ top: 0 });
}
function renderView(){
  staleView = false;
  const r = { hoy: renderHoy, coach: () => renderChat("coach"), plan: renderPlan, ejercicios: renderEjercicios, apuntar: renderApuntar,
    nutri: () => renderChat("nutri"), dieta: renderDieta, duelo: renderDuelo, historial: renderHistorial, records: renderRecords, cuerpo: renderCuerpo }[tab];
  (r || renderHoy)();
}
function renderAll(){ renderHeader(); renderView(); }
// Live data re-renders the view, except while someone is typing in it.
function typing(){ const a = document.activeElement; return !!(a && a.closest && a.closest("main") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
function onData(){
  renderHeader();
  if (playerOpen()) renderPlayerSoft();
  if (tab === "apuntar" && apMode === "form") {
    if (!$("#form") || !$("#form .btn.primary:not([disabled])")) renderRegistrar();
    else draft.exercises.forEach((_, i) => updateHint(i));
    return;
  }
  if (typing()) { staleView = true; return; }
  renderView();
}
document.addEventListener("focusout", () => setTimeout(() => { if (staleView && !typing()) renderView(); }, 0));
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.top) {
    // the remembered sub-tab only counts if it still lives in that section (tabs have moved between sections)
    const top = t.dataset.top, first = { entrenador: "coach", dietista: "nutri", duelo: "duelo" }[top];
    const leaf = lastLeaf[top] && LEAF_TOP[lastLeaf[top]] === top ? lastLeaf[top] : first;
    setTab(top === "hoy" || top === "apuntar" ? top : (leaf || top));
  }
  else if (t.dataset.leaf) setTab(t.dataset.leaf);
});
let keepT;
document.addEventListener("input", e => {
  const t = e.target;
  if (t.hasAttribute && t.hasAttribute("data-keep")) { kept[t.id] = t.value; clearTimeout(keepT); keepT = setTimeout(() => store.set("gym.kept", kept), 300); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "voz" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); vozGo(); }
});

/* ---------- boot ---------- */
setTab(tab);
renderHeader();
resumePlayer();

(async () => {
  const use = name => (window.claude && window.claude.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
  use("sample").then(s => { sample = s; sampleState = s ? "ready" : "none"; if (!typing()) renderView(); });
  db = await use("db");
  if (!db) { dbState = "none"; onData(); return; }
  const fail = () => { dbState = "none"; onData(); };
  const sub = (name, fn) => db.collection(name).onSnapshot(snap => { fn(snap.docs.map(d => ({ id: d.id, ...d.data() }))); const first = dbState !== "ready"; dbState = "ready"; if (first) renderAll(); else onData(); }, fail);
  sub("sesiones", rows => { real = rows.filter(s => ATH[s.athlete] && s.date); });
  sub("pesajes", rows => { weights = rows.filter(w => ATH[w.athlete] && w.date && num(w.kg) > 0); });
  sub("bebidas", rows => { drinks = rows.filter(d => ATH[d.athlete] && d.date && Object.keys(d.counts || {}).length); });
  sub("perfiles", rows => { profiles = {}; for (const r of rows) if (ATH[r.id]) profiles[r.id] = r; });
  sub("planes", rows => { plans = {}; for (const r of rows) plans[r.id] = r; });
  sub("chats", rows => { chats = {}; for (const r of rows) chats[r.id] = r; });
  sub("comidas", rows => { mealLog = rows.filter(r => ATH[r.athlete] && r.date && r.m); });
  if (WEB) setInterval(() => { if (!document.hidden) db.refresh?.(); }, 60000);
})();
