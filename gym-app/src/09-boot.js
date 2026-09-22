/* ---------- tabs ---------- */
let sampleState = "loading"; // loading | ready | none
let staleView = false;
function setTab(t){
  if (!TABS.includes(t)) t = "duelo";
  tab = t; store.set("gym.tab", t);
  for (const k of TABS) $("#view-" + k).hidden = k !== t;
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === t));
  $(`.tabs button[data-tab="${t}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  renderView();
  window.scrollTo({ top: 0 });
}
function renderView(){
  staleView = false;
  if (tab === "duelo") renderDuelo();
  else if (tab === "apuntar") renderApuntar();
  else if (tab === "historial") renderHistorial();
  else if (tab === "records") renderRecords();
  else if (tab === "cuerpo") renderCuerpo();
  else if (tab === "dieta") renderDieta();
  else renderEjercicios();
}
function renderAll(){ renderHeader(); renderView(); }
// Live data re-renders the view, except while someone is typing in it.
function typing(){ const a = document.activeElement; return !!(a && a.closest && a.closest("main") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
function onData(){
  renderHeader();
  if (tab === "apuntar" && apMode === "form") {
    if (!$("#form") || !$("#form .btn.primary:not([disabled])")) renderRegistrar();
    else draft.exercises.forEach((_, i) => updateHint(i));
    return;
  }
  if (typing()) { staleView = true; return; }
  renderView();
}
document.addEventListener("focusout", () => setTimeout(() => { if (staleView && !typing()) renderView(); }, 0));
let keepT;
document.addEventListener("input", e => {
  const t = e.target;
  if (t.hasAttribute && t.hasAttribute("data-keep")) { kept[t.id] = t.value; clearTimeout(keepT); keepT = setTimeout(() => store.set("gym.kept", kept), 300); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "voz" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); vozGo(); }
});

/* ---------- boot ---------- */
for (const k of TABS) $("#view-" + k).hidden = k !== tab;
renderAll();

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
  if (WEB) setInterval(() => { if (!document.hidden) db.refresh?.(); }, 60000);
  sub("perfiles", rows => { profiles = {}; for (const r of rows) if (ATH[r.id]) profiles[r.id] = r; });
})();
