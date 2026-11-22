/* ---------- personal notes per exercise ----------
   perfiles/<who>.notas = { "Press inclinado con barra": "Con la barra larga, no la corta", … }.
   The note shows wherever that exercise comes up (preview, the set, the rest before it, Músculos)
   and the coach reads them too. */
const exNote = (name, who = me) => { const n = profiles[who] && profiles[who].notas; return (n && n[canonicalName(name)]) || ""; };
async function saveExNote(name, text){
  if (dbState !== "ready" || !me) return false;
  const notas = { ...((profiles[me] && profiles[me].notas) || {}) }, k = canonicalName(name);
  if (text) notas[k] = text.slice(0, 300); else delete notas[k];
  const doc = { ...profileDoc(me), notas, updatedAt: Date.now() };
  profiles[me] = { id: me, ...doc };
  try { await db.doc("perfiles/" + me).set(doc); return true; }
  catch { toast("No se ha podido guardar la nota"); return false; }
}
// the note, or an invitation to write one
function noteHTML(name, { small = false, add = true } = {}){
  const n = exNote(name);
  if (n) return `<button type="button" class="ex-note ${small ? "sm" : ""}" data-note-edit="${esc(name)}" aria-label="Editar tu nota de ${esc(name)}"><span aria-hidden="true">📝</span> ${esc(n)}</button>`;
  return add && me ? `<button type="button" class="linkbtn note-add" data-note-edit="${esc(name)}">+ Añadir nota</button>` : "";
}
const notesText = who => Object.entries((profiles[who] && profiles[who].notas) || {}).map(([k, v]) => `${k}: ${v}`).join("; ");

let noteEl = null, noteFor = "", noteBack = null;
function openNote(name){
  noteFor = name; noteBack = document.activeElement;
  if (!noteEl) { noteEl = document.createElement("div"); noteEl.className = "note-sheet-wrap"; document.body.appendChild(noteEl); }
  noteEl.innerHTML = `<div class="fz-back" data-note="close"></div>
    <div class="note-sheet" role="dialog" aria-modal="true" aria-labelledby="note-t">
      <div class="swap-h"><div><div class="eyebrow">Tu nota</div><b id="note-t">${esc(name)}</b><div class="muted" style="font-size:13px">Te saldrá cada vez que toque este ejercicio.</div></div>
        <button type="button" class="btn sm ghost" data-note="close" aria-label="Cerrar">✕</button></div>
      <div class="voz-box"><textarea id="note-text" rows="3" maxlength="300" placeholder="Ej.: con la barra larga, no la corta · asiento en el 4 · agarre ancho">${esc(exNote(name))}</textarea>${micButton("note-text")}</div>
      <div class="row-btns"><button type="button" class="btn primary" data-note="save">Guardar</button>${exNote(name) ? `<button type="button" class="btn ghost" data-note="del">Borrar nota</button>` : ""}</div>
    </div>`;
  noteEl.hidden = false;
  setTimeout(() => { const t = $("#note-text"); if (t) { t.focus(); autoGrow(t); } }, 30);
}
function closeNote(){
  if (!noteEl || noteEl.hidden) return false;
  if (rec && recTarget === "note-text") rec.stop();
  noteEl.hidden = true; noteEl.innerHTML = "";
  if (noteBack && noteBack.isConnected) noteBack.focus();
  return true;
}
function rerenderNotes(){ if (playerOpen()) renderPlayer(); else renderView(); }
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-note-edit],[data-note]"); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  if (t.dataset.noteEdit) { if (!me) { toast("Elige primero quién eres"); return; } openNote(t.dataset.noteEdit); return; }
  const a = t.dataset.note;
  if (a === "close") closeNote();
  else if (a === "save" || a === "del") {
    const text = a === "del" ? "" : String(($("#note-text") || {}).value || "").trim();
    const name = noteFor; closeNote();
    if (await saveExNote(name, text)) { toast(text ? "Nota guardada" : "Nota borrada"); rerenderNotes(); }
  }
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && closeNote()) e.stopImmediatePropagation(); }, true);
