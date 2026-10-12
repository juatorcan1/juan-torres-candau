// Edge Function cuentas-kraken: la web "Las cuentas de Juan" mira aquí lo que Juan tiene en Kraken
// (cuántas monedas y cuánto valen hoy en euros). SÓLO PARA LEER: la llave que se guarda es de
// "Consultar fondos" y aquí sólo se llama a Balance (privado) y a Ticker (público). Nunca a nada
// que compre, venda o saque dinero.
// La llave vive en cuentas_secretos (sin permisos para la web: sólo la lee esta función).
// Solo para los usuarios de cuentas_usuarios.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const API = "https://api.kraken.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class KrError extends Error {
  code: string;
  constructor(code: string, msg: string) { super(msg); this.code = code; }
}
// Códigos viejos de Kraken (XXBT, ZEUR…) al nombre de siempre. Lo de después del punto (ALGO.S
// en staking, ALGO.F en Earn…) es la misma moneda guardada de otra manera: se suma.
const OLD: Record<string, string> = { XXBT: "XBT", XETH: "ETH", XXRP: "XRP", XLTC: "LTC", XXLM: "XLM", XXDG: "XDG",
  XETC: "ETC", XXMR: "XMR", XZEC: "ZEC", XMLN: "MLN", XREP: "REP", ZEUR: "EUR", ZUSD: "USD", ZGBP: "GBP", ZCAD: "CAD", ZJPY: "JPY" };
export function normAsset(k: string): string {
  const base = String(k).split(".")[0].toUpperCase();
  return OLD[base] ?? base;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// API-Sign = base64(HMAC-SHA512(base64decode(secreto), ruta + SHA256(nonce + cuerpo)))
export async function firma(path: string, nonce: string, body: string, secret: string): Promise<string> {
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce + body)));
  const msg = new Uint8Array([...new TextEncoder().encode(path), ...sha]);
  const key = await crypto.subtle.importKey("raw", unb64(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, msg)));
}

async function balance(key: string, secret: string): Promise<Record<string, string>> {
  const path = "/0/private/Balance";
  const nonce = String(Date.now() * 1000);
  const body = new URLSearchParams({ nonce }).toString();
  let sign: string;
  try { sign = await firma(path, nonce, body, secret); } catch { throw new KrError("bad_key", "La clave privada no es válida"); }
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "API-Key": key, "API-Sign": sign, "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body,
  });
  const j = await r.json().catch(() => ({}));
  const err: string[] = j.error || [];
  if (err.length) {
    const e = err.join(", ");
    if (/Invalid key|Invalid signature|Invalid nonce/i.test(e)) throw new KrError("bad_key", e);
    if (/Permission denied/i.test(e)) throw new KrError("no_permission", e);
    throw new KrError("upstream_error", e);
  }
  return j.result || {};
}

async function precioEur(asset: string): Promise<number | null> {
  if (asset === "EUR") return 1;
  try {
    const r = await fetch(`${API}/0/public/Ticker?pair=${encodeURIComponent(asset + "EUR")}`);
    const j = await r.json();
    if ((j.error || []).length) return null;
    const t = Object.values(j.result || {})[0] as { c?: string[] } | undefined;
    const p = t && t.c ? Number(t.c[0]) : NaN;
    return Number.isFinite(p) ? p : null;
  } catch { return null; }
}

async function saldo(key: string, secret: string) {
  const bal = await balance(key, secret);
  const suma: Record<string, number> = {};
  for (const [k, v] of Object.entries(bal)) { const n = Number(v); if (n > 0) suma[normAsset(k)] = (suma[normAsset(k)] || 0) + n; }
  const activos = await Promise.all(Object.entries(suma).map(async ([activo, cantidad]) => {
    const precio = await precioEur(activo);
    return { activo, cantidad, precio, eur: precio == null ? null : Math.round(cantidad * precio * 100) / 100 };
  }));
  activos.sort((a, b) => (b.eur ?? 0) - (a.eur ?? 0));
  const total = Math.round(activos.reduce((s, a) => s + (a.eur ?? 0), 0) * 100) / 100;
  return { activos, total, hora: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ code: "invalid_request", error: "Solo POST" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return reply({ code: "session_expired", error: "Sesión caducada" }, 401);
  const { data: socio } = await admin.from("cuentas_usuarios").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!socio) return reply({ code: "forbidden", error: "Este usuario no tiene acceso a las cuentas" }, 403);

  let body: { accion?: string; key?: string; secret?: string } = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const accion = String(body.accion || "saldo");
  try {
    if (accion === "guardar") {
      const key = String(body.key || "").trim(), secret = String(body.secret || "").replace(/\s+/g, "");
      if (key.length < 20 || secret.length < 40) throw new KrError("bad_key", "Faltan la clave o la clave privada");
      const s = await saldo(key, secret);   // si la llave no vale, no se guarda
      const { error } = await admin.from("cuentas_secretos").upsert({ user_id: user.id, nombre: "kraken", valor: { key, secret }, updated_at: new Date().toISOString() });
      if (error) throw new KrError("upstream_error", error.message);
      return reply(s);
    }
    if (accion === "quitar") {
      await admin.from("cuentas_secretos").delete().eq("user_id", user.id).eq("nombre", "kraken");
      return reply({ ok: true });
    }
    const { data: row } = await admin.from("cuentas_secretos").select("valor").eq("user_id", user.id).eq("nombre", "kraken").maybeSingle();
    if (!row) return reply({ code: "not_connected", error: "Kraken no está conectado" }, 404);
    return reply(await saldo(row.valor.key, row.valor.secret));
  } catch (e) {
    if (e instanceof KrError) return reply({ code: e.code, error: e.message }, e.code === "upstream_error" ? 502 : 400);
    return reply({ code: "upstream_error", error: String(e) }, 502);
  }
});
