/* ---------- web: login with Supabase, and the db / sample capabilities on top of it ----------
   The shared app code talks to `window.claude.use("db" | "sample")`, as it does inside a Claude
   Artifact. Here those resolve after login: `db` is the gym_docs table (Row Level Security lets
   each user write only their own athlete's rows) and `sample` calls the gym-claude Edge Function. */
const CFG = window.GYM_WEB;
const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
const LOGIN_EMAIL = { juan: "juan@gym.example.com", ignacio: "ignacio@gym.example.com" };
let resolveReady;
const ready = new Promise(r => { resolveReady = r; });

function makeDb(){
  const cache = {}, listeners = {};
  const snap = col => ({ docs: [...(cache[col] || new Map()).values()].map(r => ({ id: r.id, exists: true, data: () => r.data })) });
  const toErr = e => ({ code: e && (e.code === "42501" || /row-level security|violates check/i.test(e.message || "")) ? "invalid_argument" : "unavailable", message: (e && e.message) || "" });
  async function load(col){
    const { data, error } = await sb.from("gym_docs").select("id,data").eq("collection", col);
    if (error) throw toErr(error);
    cache[col] = new Map(data.map(r => [r.id, r]));
    for (const f of listeners[col] || []) f(snap(col));
  }
  sb.channel("gym-docs")
    .on("postgres_changes", { event: "*", schema: "public", table: "gym_docs" }, p => {
      const col = (p.new && p.new.collection) || (p.old && p.old.collection);
      if (col && listeners[col]) load(col).catch(() => {});
    })
    .subscribe();
  const ref = (col, id) => ({
    id, path: col + "/" + id,
    async set(obj){
      const athlete = col === "perfiles" ? id : obj.athlete;
      const { error } = await sb.from("gym_docs").upsert({ collection: col, id, athlete, data: obj, updated_at: new Date().toISOString() }, { onConflict: "collection,id" });
      if (error) throw toErr(error);
      await load(col);
    },
    async delete(){
      const { error } = await sb.from("gym_docs").delete().eq("collection", col).eq("id", id);
      if (error) throw toErr(error);
      await load(col);
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
function makeSample(){
  const call = async (input, opts = {}) => {
    const prompt = typeof input === "string" ? input : input.map(m => m.content).join("\n\n");
    const { data } = await sb.auth.getSession();
    if (!data.session) throw { code: "session_expired", message: "Sin sesión" };
    let r;
    try {
      r = await fetch(CFG.url + "/functions/v1/gym-claude", {
        method: "POST", signal: opts.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token, apikey: CFG.key },
        body: JSON.stringify({ prompt })
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
  s.limits = async () => ({ maxPromptBytes: 60000 });
  return s;
}
let dbNs = null, sampleNs = null;
window.claude = { use: name => ready.then(() => name === "db" ? (dbNs ||= makeDb()) : name === "sample" ? (sampleNs ||= makeSample()) : null) };

/* login screen */
const loginEl = document.createElement("div");
loginEl.id = "login";
document.body.appendChild(loginEl);
function showLogin(msg = ""){
  document.body.classList.add("locked");
  const last = store.get("gym.lastuser", "juan");
  loginEl.innerHTML = `<form id="login-form" class="login-card" novalidate>
    <h1>Juan<span class="vs">vs</span>Ignacio</h1>
    <p class="muted" style="margin:0">Entra con tu usuario para apuntar y ver el duelo.</p>
    <div class="f"><label for="l-user">Usuario</label><select id="l-user">${KEYS.map(k => `<option value="${k}" ${k === last ? "selected" : ""}>${ATH[k]}</option>`).join("")}</select></div>
    <div class="f"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="current-password" required></div>
    ${msg ? `<div class="err" role="alert">${esc(msg)}</div>` : ""}
    <button type="submit" class="btn primary" style="background:var(--ink);border-color:var(--ink);color:var(--bg)">Entrar</button>
  </form>`;
  setTimeout(() => $("#l-pass")?.focus(), 0);
}
async function enter(session){
  const { data, error } = await sb.from("gym_usuarios").select("athlete").eq("user_id", session.user.id).maybeSingle();
  if (error || !data || !ATH[data.athlete]) { await sb.auth.signOut(); showLogin("Este usuario no tiene acceso al gimnasio."); return; }
  me = data.athlete; store.set("gym.me", me); store.set("gym.lastuser", me);
  document.body.classList.remove("locked"); loginEl.innerHTML = "";
  renderAll(); resolveReady();
}
loginEl.addEventListener("submit", async e => {
  e.preventDefault();
  const user = $("#l-user").value, pass = $("#l-pass").value;
  if (!pass) { showLogin("Escribe tu contraseña."); return; }
  const btn = loginEl.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: LOGIN_EMAIL[user], password: pass });
  if (error || !data.session) { store.set("gym.lastuser", user); showLogin(/invalid/i.test(error?.message || "") ? "Usuario o contraseña incorrectos." : "No se ha podido entrar. Revisa la conexión."); return; }
  enter(data.session);
});

/* password change and logout */
function openPassword(){
  const host = $("#pw-panel") || Object.assign(document.createElement("div"), { id: "pw-panel" });
  $(".brand").after(host);
  host.innerHTML = `<form id="pw-form" class="panel" novalidate style="margin-bottom:12px;gap:10px">
    <h2 style="font-size:18px">Cambiar contraseña</h2>
    <div class="fgrid"><div class="f"><label for="pw-new">Nueva contraseña <small>mínimo 8 caracteres</small></label><input id="pw-new" type="password" autocomplete="new-password" minlength="8"></div>
    <div class="f"><label for="pw-rep">Repítela</label><input id="pw-rep" type="password" autocomplete="new-password"></div></div>
    <div class="row-btns"><button type="submit" class="btn primary">Guardar contraseña</button><button type="button" class="btn ghost" id="pw-close">Cancelar</button></div>
    <div id="pw-msg" role="status"></div>
  </form>`;
  $("#pw-new").focus();
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "logout") { await sb.auth.signOut(); store.del("gym.me"); location.reload(); }
  else if (t.id === "pw-open") openPassword();
  else if (t.id === "pw-close") $("#pw-panel")?.remove();
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "pw-form") return;
  e.preventDefault();
  const a = $("#pw-new").value, b = $("#pw-rep").value, msg = $("#pw-msg");
  if (a.length < 8) { msg.innerHTML = `<span class="err">Tiene que tener al menos 8 caracteres.</span>`; return; }
  if (a !== b) { msg.innerHTML = `<span class="err">Las dos contraseñas no coinciden.</span>`; return; }
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) { msg.innerHTML = `<span class="err">No se ha podido cambiar: ${esc(error.message)}</span>`; return; }
  $("#pw-panel")?.remove(); toast("Contraseña cambiada");
});

sb.auth.getSession().then(({ data }) => { if (data.session) enter(data.session); else showLogin(); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && !document.body.classList.contains("locked")) location.reload(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && dbNs) dbNs.refresh(); });
