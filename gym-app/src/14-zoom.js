/* ---------- tap a small drawing to see it big ----------
   Every small figure is a button (data-figzoom); it opens the animated drawing with the muscles,
   the steps and the usual mistake, above everything else, including the guided workout. */
function figMini(name){
  if (!GUIDE[name]) return `<div class="fig mini nofig">${esc(String(name).slice(0, 2))}</div>`;
  return `<button type="button" class="figbtn" data-figzoom="${esc(name)}" aria-label="Ver cómo se hace ${esc(name)}"><svg class="fig mini" viewBox="0 -14 200 206" aria-hidden="true">${figSVG(name, 1, false)}</svg></button>`;
}
let zoomEl = null, zoomBack = null;
function openZoom(name){
  const g = GUIDE[name]; if (!g) return;
  const m = musclesOf(name);
  if (!zoomEl) { zoomEl = document.createElement("div"); zoomEl.className = "figzoom"; document.body.appendChild(zoomEl); }
  zoomBack = document.activeElement;
  zoomEl.innerHTML = `<div class="fz-back" data-fz="close"></div>
    <div class="fz-card" role="dialog" aria-modal="true" aria-labelledby="fz-t">
      <button type="button" class="btn sm ghost fz-x" data-fz="close" aria-label="Cerrar">✕</button>
      <div class="fz-fig">${figMarkup(name)}</div>
      <div>${m.main.length ? `<div class="mus-chip">${esc(musNames(m.main))}</div>` : ""}<h3 id="fz-t">${esc(name)}</h3>${m.help.length ? `<div class="muted" style="font-size:13px">Ayudan: ${esc(musNames(m.help))}</div>` : ""}</div>
      <ol>${g.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
      <div class="ojo"><b>Ojo:</b> ${esc(g.ojo)}</div>
      <button type="button" class="btn primary" data-fz="close">Entendido</button>
    </div>`;
  zoomEl.hidden = false; mountFigs();
  zoomEl.querySelector(".fz-x")?.focus();
}
function closeZoom(){
  if (!zoomEl || zoomEl.hidden) return false;
  zoomEl.hidden = true; zoomEl.innerHTML = "";
  if (zoomBack && zoomBack.isConnected) zoomBack.focus();
  return true;
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-figzoom],[data-fz]"); if (!t) return;
  if (t.dataset.figzoom) { e.preventDefault(); e.stopPropagation(); openZoom(t.dataset.figzoom); }
  else closeZoom();
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && closeZoom()) e.stopImmediatePropagation(); }, true);
