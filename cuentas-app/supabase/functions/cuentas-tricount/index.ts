// Edge Function cuentas-tricount: la web "Las cuentas de Juan" lee aquí sus tricounts, SOLO PARA LEER.
// Tricount no tiene API pública: esto habla con la API privada de su app (api.tricount.bunq.com),
// como hacen go-tricount, tricount-mcp o tricount-extractor. bunq la puede cambiar o cerrar cuando quiera.
// - Se registra un "aparato" anónimo (clave RSA nueva, no se firma nada) y su sesión se guarda en
//   cuentas_docs (owner = el usuario, colección "tricount", id "sesion") para no registrarse cada vez.
// - Cada tricount se pide con GET /v1/user/{id}/registry?public_identifier_token=<clave del enlace>.
//   Nunca se llama a registry-synchronization (eso se une al tricount) ni a nada que escriba.
// Solo para los usuarios de cuentas_usuarios.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const BASE = "https://api.tricount.bunq.com";
const UA = "com.bunq.tricount.android:RELEASE:7.0.7:3174:ANDROID:13:C";
const REQ_ID = "049bfcdf-6ae4-4cee-af7b-45da31ea85d0";
const MAX_LINKS = 10;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Session = { appId: string; token: string; userId: number };
// deno-lint-ignore no-explicit-any
type Any = any;
class TcError extends Error {
  code: string; reauth: boolean;
  constructor(code: string, msg: string, reauth = false) { super(msg); this.code = code; this.reauth = reauth; }
}

export function parseKey(input: string): string {
  const s = String(input || "").trim();
  let seg = s;
  if (s.includes("/")) {
    try {
      const u = new URL(s.includes("//") ? s : "https://" + s);
      const p = u.pathname.split("/").filter(Boolean);
      seg = p[p.length - 1] ?? "";
    } catch { seg = ""; }
  }
  if (!/^[A-Za-z0-9]{6,64}$/.test(seg)) throw new TcError("bad_link", "Eso no parece un enlace de Tricount");
  return seg;
}

async function publicKeyPem(): Promise<string> {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  // SPKI de 2048 bits = cabecera fija de 24 bytes + la clave en PKCS#1, que es lo que manda la app
  const HDR = "30820122300d06092a864886f70d01010105000382010f00";
  const hex = [...spki.slice(0, 24)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (spki.length !== 294 || hex !== HDR) throw new TcError("upstream_error", "Clave RSA inesperada");
  const b64 = btoa(String.fromCharCode(...spki.slice(24)));
  return `-----BEGIN RSA PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END RSA PUBLIC KEY-----\n`;
}
const headers = (appId: string, token?: string) => ({
  "User-Agent": UA, "app-id": appId, "X-Bunq-Client-Request-Id": REQ_ID,
  ...(token ? { "X-Bunq-Client-Authentication": token } : {}),
});

async function register(): Promise<Session> {
  const appId = crypto.randomUUID();
  const res = await fetch(`${BASE}/v1/session-registry-installation`, {
    method: "POST",
    headers: { ...headers(appId), "Content-Type": "application/json" },
    body: JSON.stringify({ app_installation_uuid: appId, client_public_key: await publicKeyPem(), device_description: "Android" }),
  });
  if (!res.ok) throw new TcError("upstream_error", `Tricount no deja conectarse (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const items: Any[] = (await res.json()).Response ?? [];
  const token = items.find((i) => i.Token)?.Token?.token, userId = items.find((i) => i.UserPerson)?.UserPerson?.id;
  if (!token || !userId) throw new TcError("upstream_error", "Tricount no ha devuelto la sesión");
  return { appId, token, userId };
}

async function fetchRegistry(s: Session, key: string) {
  const res = await fetch(`${BASE}/v1/user/${s.userId}/registry?public_identifier_token=${encodeURIComponent(key)}`,
    { headers: headers(s.appId, s.token) });
  if (res.status === 401 || res.status === 403) throw new TcError("unauthorized", "Sesión de Tricount caducada", true);
  if (res.status === 429) throw new TcError("rate_limited", "Tricount pide esperar un poco");
  if (!res.ok) throw new TcError("upstream_error", `Tricount ha fallado (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const regs = (body.Response ?? []).map((i: Any) => i.Registry).filter(Boolean);
  const reg = regs.find((r: Any) => r.public_identifier_token === key) ?? (regs.length === 1 ? regs[0] : null);
  if (!reg) throw new TcError("not_found", "No encuentro ese tricount: revisa el enlace");
  reg.__paginacion = body.Pagination ?? null;
  return reg;
}

// El registro trae sólo los últimos movimientos. Los anteriores se piden por tandas, como en el resto de la
// API de bunq: «los 200 anteriores a este id». Se prueba sin y con la clave del enlace, y se anota qué contesta
// Tricount en cada intento (para poder revisarlo si algo no sale).
async function entradasAnteriores(s: Session, reg: Any, key: string) {
  const diag: Any[] = [];
  const ids = new Set((reg.all_registry_entry ?? []).map((w: Any) => (w.RegistryEntry ?? unwrap(w))?.id).filter(Boolean));
  const mas: Any[] = [];
  let older = Math.min(...[...ids].map(Number));
  if (!isFinite(older)) return { mas, diag };
  const variantes = ["", `&public_identifier_token=${encodeURIComponent(key)}`];
  let v = 0;
  for (let pag = 0; pag < 40; pag++) {
    const url = `${BASE}/v1/user/${s.userId}/registry/${reg.id}/registry-entry?count=200&older_id=${older}${variantes[v]}`;
    const res = await fetch(url, { headers: headers(s.appId, s.token) });
    if (!res.ok) {
      diag.push({ pag, v, status: res.status, txt: (await res.text()).slice(0, 200) });
      if (v + 1 < variantes.length && pag === 0) { v++; pag--; continue; }
      break;
    }
    const body = await res.json();
    const nuevas = (body.Response ?? []).map((i: Any) => i.RegistryEntry ?? unwrap(i)).filter((e: Any) => e && e.id && !ids.has(e.id));
    diag.push({ pag, v, status: res.status, n: nuevas.length, older: body.Pagination?.older_url ?? null });
    if (!nuevas.length) break;
    for (const e of nuevas) { ids.add(e.id); mas.push({ RegistryEntry: e }); }
    older = Math.min(...nuevas.map((e: Any) => Number(e.id)));
  }
  return { mas, diag };
}

// Lo que necesita la web: miembros, gastos y saldos (+ = le deben). Importes en euros (o la moneda del tricount).
const unwrap = (o: Any) => (o && typeof o === "object" ? (Object.values(o)[0] as Any) : undefined);
const cents = (v: unknown) => Math.round(Math.abs(Number(v) || 0) * 100);
function normalise(reg: Any, key: string) {
  const members = new Map<string, { uuid: string; nombre: string; activo: boolean }>();
  const add = (m: Any) => {
    if (m?.uuid && !members.has(m.uuid)) members.set(m.uuid, { uuid: m.uuid, nombre: m.alias?.display_name ?? m.alias?.pointer?.name ?? "¿?", activo: (m.status ?? "ACTIVE") === "ACTIVE" });
  };
  (reg.memberships ?? []).forEach((w: Any) => add(unwrap(w)));
  const saldo: Record<string, number> = {};
  const gastos = (reg.all_registry_entry ?? []).map((w: Any) => w.RegistryEntry ?? unwrap(w))
    .filter((e: Any) => e && (e.status ?? "ACTIVE") === "ACTIVE" && e.amount)
    .map((e: Any) => {
      const payer = unwrap(e.membership_owned); add(payer);
      const tipo = e.type_transaction === "BALANCE" ? "reembolso" : e.type_transaction === "INCOME" ? "ingreso" : "gasto";
      const total = cents(e.amount.value), sg = tipo === "ingreso" ? -1 : 1;
      const reparto: Record<string, number> = {};
      for (const a of e.allocations ?? []) {
        const m = unwrap(a.membership); add(m); if (!m?.uuid) continue;
        const v = cents(a.amount?.value);
        reparto[m.uuid] = (reparto[m.uuid] ?? 0) + v / 100;
        saldo[m.uuid] = (saldo[m.uuid] ?? 0) - sg * v;
      }
      if (payer?.uuid) saldo[payer.uuid] = (saldo[payer.uuid] ?? 0) + sg * total;
      return {
        id: e.id, fecha: String(e.date ?? e.created ?? "").slice(0, 10), concepto: String(e.description ?? ""),
        tipo, total: total / 100, pago: payer?.uuid ?? null, reparto,
        local: e.amount_local && e.amount_local.currency !== e.amount.currency ? { importe: cents(e.amount_local.value) / 100, moneda: e.amount_local.currency } : null,
        categoria: e.category_custom ?? e.category ?? null,
      };
    })
    .sort((a: Any, b: Any) => b.fecha.localeCompare(a.fecha));
  return {
    key, ok: true, titulo: String(reg.title ?? "Tricount"), moneda: String(reg.currency ?? "EUR"), emoji: reg.emoji ?? null,
    miembros: [...members.values()],
    saldos: Object.fromEntries([...members.keys()].map((u) => [u, (saldo[u] ?? 0) / 100])),
    gastos,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ code: "invalid_request", error: "Solo POST" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return reply({ code: "session_expired", error: "Sesión caducada" }, 401);
  const { data: socio } = await admin.from("cuentas_usuarios").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!socio) return reply({ code: "forbidden", error: "Este usuario no tiene acceso a las cuentas" }, 403);

  let body: { links?: unknown } = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const links = (Array.isArray(body?.links) ? body.links : []).map(String).slice(0, MAX_LINKS);
  if (!links.length) return reply({ code: "invalid_request", error: "Faltan los enlaces" }, 400);

  // la sesión guardada, o una nueva
  const where = { owner: user.id, collection: "tricount", id: "sesion" };
  const { data: row } = await admin.from("cuentas_docs").select("data").match(where).maybeSingle();
  let ses: Session | null = row?.data?.token ? row.data as Session : null;
  let nueva = false;
  const sesion = async (forzar = false) => {
    if (!ses || forzar) { ses = await register(); nueva = true; }
    return ses;
  };

  const out: Any[] = [];
  for (const link of links) {
    let key = "";
    try {
      key = parseKey(link);
      let reg;
      try { reg = await fetchRegistry(await sesion(), key); }
      catch (e) { if (!(e instanceof TcError && e.reauth)) throw e; reg = await fetchRegistry(await sesion(true), key); }
      let diag: Any = null;
      try {
        const r = await entradasAnteriores(ses!, reg, key);
        if (r.mas.length) reg.all_registry_entry = [...(reg.all_registry_entry ?? []), ...r.mas];
        diag = { paginacion: reg.__paginacion, anteriores: r.mas.length, intentos: r.diag };
      } catch (e) { diag = { paginacion: reg.__paginacion, error: String((e as Error)?.message ?? e).slice(0, 200) }; }
      const t = normalise(reg, key);
      out.push(t);
      // una copia de lo leído, para revisarlo y para pasar gastos a las cuentas sin volver a pedirlo
      const { error: eg } = await admin.from("cuentas_docs").upsert({ owner: user.id, collection: "tricount", id: "datos-" + key, data: { ...t, leido: new Date().toISOString(), diag }, updated_at: new Date().toISOString() }, { onConflict: "owner,collection,id" });
      if (eg) console.log("[tricount] no se ha guardado la copia:", eg.message);
    } catch (e) {
      const te = e instanceof TcError ? e : new TcError("upstream_error", "No se ha podido leer: " + String((e as Error)?.message ?? e).slice(0, 200));
      out.push({ key: key || link, ok: false, code: te.code, error: te.message });
    }
  }
  if (nueva && ses) await admin.from("cuentas_docs").upsert({ ...where, data: ses, updated_at: new Date().toISOString() }, { onConflict: "owner,collection,id" });
  return reply({ tricounts: out });
});
