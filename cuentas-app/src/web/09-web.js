/* ---------- web: entrar con Supabase, y las piezas db / sample / assets encima ----------
   El código de la app habla con `window.claude.use("db" | "sample" | "assets")`, igual que dentro de
   un Artifact de Claude. Aquí eso se resuelve después de entrar: `db` es la tabla cuentas_docs (el
   Row Level Security deja a cada usuario ver y tocar sólo lo suyo), `sample` llama a la Edge Function
   cuentas-claude y `assets` es la carpeta privada cuentas-tickets. */
const CFG = window.CJ_WEB;
const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
// Se entra con el mismo usuario del gimnasio ("juan") y su contraseña: sirve para las dos webs.
// Detrás, cada usuario es un correo de Supabase: "juan" -> juan@gym.example.com.
const loginEmail = u => { u = String(u || "").trim().toLowerCase(); return u.includes("@") ? u : u + "@gym.example.com"; };
let resolveReady, uidNow = null;
const ready = new Promise(r => { resolveReady = r; });

function makeDb(){
  const cache = {}, listeners = {};
  const snap = col => ({ docs: [...(cache[col] || new Map()).values()].map(r => ({ id: r.id, exists: true, data: () => r.data })) });
  const toErr = e => ({ code: e && (e.code === "42501" || /row-level security|violates check/i.test(e.message || "")) ? "invalid_argument" : "unavailable", message: (e && e.message) || "" });
  async function load(col){
    const { data, error } = await sb.from("cuentas_docs").select("id,data").eq("collection", col);
    if (error) throw toErr(error);
    cache[col] = new Map(data.map(r => [r.id, r]));
    for (const f of listeners[col] || []) f(snap(col));
  }
  sb.channel("cuentas-docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "cuentas_docs" }, p => {
      const col = (p.new && p.new.collection) || (p.old && p.old.collection);
      if (col && listeners[col]) load(col).catch(() => {});
    })
    .subscribe();
  // Mezcla como el `update` de Claude: los objetos se mezclan por dentro, lo demás se sustituye,
  // y un null borra la clave (así un movimiento borrado no deja rastro en el mes).
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v === null) delete a[k]; else if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) merge(a[k], v); else a[k] = v; } return a; };
  async function write(col, id, obj){
    const { error } = await sb.from("cuentas_docs").upsert({ owner: uidNow, collection: col, id, data: obj, updated_at: new Date().toISOString() }, { onConflict: "owner,collection,id" });
    if (error) throw toErr(error);
    (cache[col] ||= new Map()).set(id, { id, data: obj });
    for (const f of listeners[col] || []) f(snap(col));
  }
  const ref = (col, id) => ({
    id, path: col + "/" + id,
    set: obj => write(col, id, JSON.parse(JSON.stringify(obj))),
    async update(patch){
      const cur = cache[col] && cache[col].get(id);
      if (!cur) throw { code: "invalid_argument", message: "No existe" };
      await write(col, id, merge(JSON.parse(JSON.stringify(cur.data)), JSON.parse(JSON.stringify(patch))));
    },
    async delete(){
      const { error } = await sb.from("cuentas_docs").delete().eq("collection", col).eq("id", id);
      if (error) throw toErr(error);
      if (cache[col]) cache[col].delete(id);
      for (const f of listeners[col] || []) f(snap(col));
    }
  });
  return {
    collection: col => ({
      doc: id => ref(col, id || crypto.randomUUID()),
      onSnapshot(next, onErr){
        (listeners[col] ||= new Set()).add(next);
        if (cache[col]) next(snap(col)); else load(col).catch(e => onErr && onErr(e));
        return () => listeners[col].delete(next);
      }
    }),
    doc: path => { const [c, i] = path.split("/"); return ref(c, i); },
    refresh: () => Promise.all(Object.keys(listeners).map(c => load(c).catch(() => {})))
  };
}
function parseLoose(text){
  const tries = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  const a = text.search(/[\[{]/), b = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) { if (!t) continue; try { return JSON.parse(t); } catch {} }
  throw { code: "invalid_json", message: "Respuesta sin JSON", text };
}
const toB64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = ko; r.readAsDataURL(blob); });
function makeSample(){
  const call = async (input, opts = {}) => {
    const prompt = typeof input === "string" ? input : input.map(m => m.content).join("\n\n");
    const imgs = opts.images ? Array.from(opts.images.length != null ? opts.images : [opts.images]).slice(0, 4) : [];
    const images = [];
    for (const b of imgs) images.push({ type: b.type || "image/jpeg", data: await toB64(b) });
    const { data } = await sb.auth.getSession();
    if (!data.session) throw { code: "session_expired", message: "Sin sesión" };
    let r;
    try {
      r = await fetch(CFG.url + "/functions/v1/cuentas-claude", {
        method: "POST", signal: opts.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token, apikey: CFG.key },
        body: JSON.stringify({ prompt, images })
      });
    } catch (e) { throw { code: e && e.name === "AbortError" ? "cancelled" : "upstream_error", message: String(e) }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: j.code || (r.status === 429 ? "rate_limited" : "upstream_error"), message: j.error || r.statusText };
    if (opts.signal && opts.signal.aborted) throw { code: "cancelled", message: "" };
    if (opts.onText) opts.onText({ text: j.text, delta: j.text });
    return { text: j.text, truncated: !!j.truncated, modelTierApplied: "default" };
  };
  const s = (input, opts) => call(input, opts);
  s.json = async (input, opts) => parseLoose((await call(input, opts)).text);
  s.limits = async () => ({ maxPromptBytes: 65536, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ["image/jpeg", "image/png", "image/webp"] } });
  return s;
}
function makeAssets(){
  const B = "cuentas-tickets";
  return {
    async upload(blob){
      const id = uidNow + "/" + crypto.randomUUID() + (blob.type === "image/png" ? ".png" : ".jpg");
      const { error } = await sb.storage.from(B).upload(id, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw { code: "unavailable", message: error.message };
      return { id, url: "", sizeBytes: blob.size, contentType: blob.type };
    },
    async signedUrl(id){ const { data } = await sb.storage.from(B).createSignedUrl(id, 3600); return data ? data.signedUrl : ""; },
    async delete(id){ await sb.storage.from(B).remove([id]); }
  };
}
let dbNs = null, sampleNs = null, assetsNs = null;
window.claude = { use: name => ready.then(() => name === "db" ? (dbNs ||= makeDb()) : name === "sample" ? (sampleNs ||= makeSample()) : name === "assets" ? (assetsNs ||= makeAssets()) : null) };

/* pantalla de entrada */
const loginEl = document.createElement("div");
loginEl.id = "login";
document.body.appendChild(loginEl);
function showLogin(msg = ""){
  document.body.classList.add("locked");
  loginEl.innerHTML = `<form id="login-form" class="login-card" novalidate>
    <h1>Las cuentas de Juan</h1>
    <p class="muted" style="margin:0">Entra con tu usuario y tu contraseña. Son los mismos que los del gimnasio.</p>
    <div class="f"><label for="l-user">Usuario</label><input id="l-user" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(store.get("cj.lastuser", ""))}" required></div>
    <div class="f"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="current-password" required></div>
    ${msg ? `<div class="err" role="alert">${esc(msg)}</div>` : ""}
    <button type="submit" class="btn primary">Entrar</button>
  </form>`;
  setTimeout(() => { const u = $("#l-user"), p = $("#l-pass"); if (u && !u.value) u.focus(); else if (p) p.focus(); }, 0);
}
function webBar(){
  let w = $("#webbar");
  if (!w) { w = document.createElement("div"); w.id = "webbar"; $(".strip-in").appendChild(w); }
  w.innerHTML = `<button class="linkbtn" id="pw-open" type="button">Contraseña</button><button class="linkbtn" id="logout" type="button">Salir</button>`;
}
async function enter(session){
  const { data, error } = await sb.from("cuentas_usuarios").select("nombre").eq("user_id", session.user.id).maybeSingle();
  if (error || !data) { await sb.auth.signOut(); showLogin("Este usuario no tiene acceso a las cuentas."); return; }
  uidNow = session.user.id;
  document.body.classList.remove("locked"); loginEl.innerHTML = "";
  webBar(); resolveReady();
}
loginEl.addEventListener("submit", async e => {
  e.preventDefault();
  const user = $("#l-user").value.trim(), pass = $("#l-pass").value;
  store.set("cj.lastuser", user);
  if (!user || !pass) { showLogin("Escribe tu usuario y tu contraseña."); return; }
  const btn = loginEl.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail(user), password: pass });
  if (error || !data.session) { showLogin(/invalid/i.test((error && error.message) || "") ? "Usuario o contraseña incorrectos." : "No se ha podido entrar. Revisa la conexión."); return; }
  enter(data.session);
});

/* cambiar la contraseña y salir */
function openPassword(){
  const host = $("#pw-panel") || Object.assign(document.createElement("div"), { id: "pw-panel" });
  $("main").prepend(host);
  host.innerHTML = `<form id="pw-form" class="panel" novalidate style="display:grid;gap:12px">
    <h2>Cambiar contraseña</h2>
    <p class="small muted" style="margin:0">Cambia también la del gimnasio: es la misma.</p>
    <div class="fgrid"><div class="f"><label for="pw-new">Nueva contraseña <small>mínimo 8 letras</small></label><input id="pw-new" type="password" autocomplete="new-password" minlength="8"></div>
    <div class="f"><label for="pw-rep">Repítela</label><input id="pw-rep" type="password" autocomplete="new-password"></div></div>
    <div class="row"><button type="submit" class="btn primary">Guardar contraseña</button><button type="button" class="btn ghost" id="pw-close">Cancelar</button></div>
    <div id="pw-msg" role="status"></div>
  </form>`;
  window.scrollTo({ top: 0 }); $("#pw-new").focus();
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "logout") { await sb.auth.signOut(); location.reload(); }
  else if (t.id === "pw-open") openPassword();
  else if (t.id === "pw-close") { const p = $("#pw-panel"); if (p) p.remove(); }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "pw-form") return;
  e.preventDefault();
  const a = $("#pw-new").value, b = $("#pw-rep").value, msg = $("#pw-msg");
  if (a.length < 8) { msg.innerHTML = `<span class="err">Tiene que tener al menos 8 letras o números.</span>`; return; }
  if (a !== b) { msg.innerHTML = `<span class="err">Las dos no coinciden.</span>`; return; }
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) { msg.innerHTML = `<span class="err">No se ha podido cambiar: ${esc(error.message)}</span>`; return; }
  const p = $("#pw-panel"); if (p) p.remove(); toast("Contraseña cambiada");
});

sb.auth.getSession().then(({ data }) => { if (data.session) enter(data.session); else showLogin(); });
sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && !document.body.classList.contains("locked")) location.reload(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && dbNs) dbNs.refresh(); });
