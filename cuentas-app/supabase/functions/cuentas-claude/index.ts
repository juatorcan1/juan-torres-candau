// Edge Function cuentas-claude: la web "Las cuentas de Juan" pide aquí a Claude que lea un ticket
// (fotos incluidas), ordene lo dictado, lea un extracto del banco o conteste una pregunta.
// Solo para los usuarios de cuentas_usuarios, con tope diario de llamadas; lo que gasta cada llamada
// (tokens y dólares) queda en cuentas_claude_gasto. Usa la misma clave de
// Anthropic que el gimnasio: el secreto ANTHROPIC_API_KEY de las Edge Functions o, si no está,
// el del Vault (función gym_anthropic_key, solo service_role).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const MODEL = "claude-opus-5-5";
const EFFORT = "medium";
// Dólares por millón de tokens: entrada, salida, escritura en caché (5 min) y lectura de caché.
// También los modelos a los que puede pasar la respuesta de reserva.
const PRICES: Record<string, { in: number; out: number; cw: number; cr: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cw: 5, cr: 0.2 },
  "claude-opus-5": { in: 5, out: 25, cw: 6.25, cr: 0.5 },
  "claude-opus-4-8": { in: 5, out: 25, cw: 6.25, cr: 0.5 },
};
const DAILY_LIMIT = 150;
const MAX_IMAGES = 4;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Img = { type: string; data: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ code: "invalid_request", error: "Solo POST" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return reply({ code: "session_expired", error: "Sesión caducada" }, 401);
  const { data: socio } = await admin.from("cuentas_usuarios").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!socio) return reply({ code: "forbidden", error: "Este usuario no tiene acceso a las cuentas" }, 403);

  // Por nombre: ANTHROPIC_API_KEY, o uno que empiece así (por si se guardó como "ANTHROPIC_API_KEY <nombre>").
  const keyName = Object.keys(Deno.env.toObject()).sort().find((k) => k === "ANTHROPIC_API_KEY" || k.startsWith("ANTHROPIC_API_KEY"));
  let apiKey = keyName ? Deno.env.get(keyName)?.trim() : undefined;
  if (!apiKey) apiKey = (await admin.rpc("gym_anthropic_key")).data ?? undefined;
  if (!apiKey) return reply({ code: "no_key", error: "Falta la clave de Anthropic" }, 503);

  let body: { prompt?: unknown; images?: unknown; fijo?: unknown; tarea?: unknown } = {};
  try { body = await req.json(); } catch { /* cuerpo vacío o no JSON */ }
  let prompt = String(body?.prompt ?? "");
  if (!prompt.trim()) return reply({ code: "invalid_request", error: "Falta el texto" }, 400);
  if (prompt.length > 70000) return reply({ code: "prompt_too_large" }, 413);
  // "fijo": los trozos del principio del prompt que no cambian de una llamada a otra (instrucciones,
  // categorías…), del más estable al menos. Se mandan aparte, delante de las fotos, y quedan en la
  // caché de Anthropic, que cobra la relectura a una vigésima parte. Si no cuadran con el prompt, nada.
  let fijo = (Array.isArray(body?.fijo) ? body.fijo : []).slice(0, 3).map(String).filter((t) => t.trim());
  if (fijo.length && prompt.startsWith(fijo.join(""))) prompt = prompt.slice(fijo.join("").length);
  else fijo = [];
  const tarea = /^[a-z_]{1,20}$/.test(String(body?.tarea ?? "")) ? String(body.tarea) : "otra";
  const images = (Array.isArray(body?.images) ? body.images as Img[] : []).slice(0, MAX_IMAGES)
    .filter((i) => i && IMAGE_TYPES.includes(String(i.type)) && typeof i.data === "string" && i.data.length < 7_000_000);

  const dia = new Date().toISOString().slice(0, 10);
  const { data: uso } = await admin.from("cuentas_claude_uso").select("n").eq("user_id", user.id).eq("dia", dia).maybeSingle();
  const n = uso?.n ?? 0;
  if (n >= DAILY_LIMIT) return reply({ code: "rate_limited", error: "Límite diario de Claude alcanzado" }, 429);
  await admin.from("cuentas_claude_uso").upsert({ user_id: user.id, dia, n: n + 1 });

  const content = [
    ...fijo.map((text) => ({ type: "text", text, cache_control: { type: "ephemeral" } })),
    ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })),
    ...(prompt.trim() ? [{ type: "text", text: prompt }] : []),
  ];
  const client = new Anthropic({ apiKey });
  try {
    // Server-side fallbacks ("default"): if a safety classifier declines, the API re-runs the
    // request on Anthropic's recommended fallback model instead of returning a refusal.
    const params = {
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort: EFFORT },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    };
    // deno-lint-ignore no-explicit-any
    const msg = await client.beta.messages.stream(params as any).finalMessage();
    await apuntarGasto(admin, user.id, tarea, images.length, msg);
    if (msg.stop_reason === "refusal") return reply({ code: "refused" }, 422);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (!text.trim()) return reply({ code: "empty_completion" }, 502);
    return reply({ text, truncated: msg.stop_reason === "max_tokens" });
  } catch (e) {
    // Queda en los registros de la función: sin esto, un fallo de Anthropic no deja rastro.
    console.error("cuentas-claude:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    if (e instanceof Anthropic.RateLimitError) return reply({ code: "rate_limited" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return reply({ code: "no_key", error: "Clave de Anthropic no válida" }, 503);
    if (e instanceof Anthropic.APIError && /credit balance/i.test(e.message)) return reply({ code: "no_credit", error: e.message }, 402);
    if (e instanceof Anthropic.APIError && e.status === 529) return reply({ code: "overloaded", error: e.message }, 503);
    if (e instanceof Anthropic.APIError) return reply({ code: "upstream_error", error: `${e.status ?? ""} ${e.message}`.trim() }, 502);
    return reply({ code: "upstream_error", error: String(e) }, 502);
  }
});

// Lo que ha costado la llamada. msg.usage es la del intento que contestó (si saltó la respuesta de
// reserva, la de ese modelo, que es el que dice msg.model). Si falla el apunte, la lectura sigue.
// deno-lint-ignore no-explicit-any
async function apuntarGasto(admin: any, userId: string, tarea: string, fotos: number, msg: any) {
  const u = msg?.usage ?? {};
  const t = {
    entrada: u.input_tokens ?? 0,
    salida: u.output_tokens ?? 0,
    cache_escrita: u.cache_creation_input_tokens ?? 0,
    cache_leida: u.cache_read_input_tokens ?? 0,
  };
  const modelo = String(msg?.model || MODEL);
  const p = PRICES[modelo] ?? PRICES[MODEL];
  const coste = (t.entrada * p.in + t.salida * p.out + t.cache_escrita * p.cw + t.cache_leida * p.cr) / 1e6;
  const { error } = await admin.from("cuentas_claude_gasto").insert({
    user_id: userId, tarea, modelo, effort: EFFORT, fotos, ...t, coste_usd: Number(coste.toFixed(6)),
  });
  if (error) console.error("cuentas-claude: no se ha apuntado el gasto:", error.message);
}
