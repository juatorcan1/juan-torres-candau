// Edge Function gym-claude: la app web de gimnasio (Juan vs Ignacio) pide aquí a Claude que
// ordene lo dictado, valore la semana o proponga un menú. Solo para los usuarios de gym_usuarios,
// con tope diario de llamadas. Necesita la clave de Anthropic: secreto ANTHROPIC_API_KEY o,
// si no está, el secreto del Vault 'gym_anthropic_api_key' (función SQL gym_anthropic_key).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const MODEL = "claude-opus-5";
const DAILY_LIMIT = 80;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
  const { data: gymUser } = await admin.from("gym_usuarios").select("athlete").eq("user_id", user.id).maybeSingle();
  if (!gymUser) return reply({ code: "forbidden", error: "Este usuario no es del gimnasio" }, 403);

  // The key lives in the function secrets (ANTHROPIC_API_KEY, or a secret whose name starts with it or
  // whose value is an Anthropic key, in case it was saved as "ANTHROPIC_API_KEY <nombre>") or in the Vault.
  const env = Deno.env.toObject();
  let apiKey = (env["ANTHROPIC_API_KEY"] || Object.entries(env).find(([k, v]) => k.startsWith("ANTHROPIC_API_KEY") || /^sk-ant-/.test(v || ""))?.[1])?.trim();
  if (!apiKey) apiKey = (await admin.rpc("gym_anthropic_key")).data ?? undefined;
  if (!apiKey) return reply({ code: "no_key", error: "Falta la clave de Anthropic (ANTHROPIC_API_KEY o Vault)" }, 503);

  let prompt = "";
  try { prompt = String((await req.json())?.prompt ?? ""); } catch { /* cuerpo vacío o no JSON */ }
  if (!prompt.trim()) return reply({ code: "invalid_request", error: "Falta el texto" }, 400);
  if (prompt.length > 60000) return reply({ code: "prompt_too_large" }, 413);

  const dia = new Date().toISOString().slice(0, 10);
  const { data: uso } = await admin.from("gym_claude_uso").select("n").eq("user_id", user.id).eq("dia", dia).maybeSingle();
  const n = uso?.n ?? 0;
  if (n >= DAILY_LIMIT) return reply({ code: "rate_limited", error: "Límite diario de Claude alcanzado" }, 429);
  await admin.from("gym_claude_uso").upsert({ user_id: user.id, dia, n: n + 1 });

  const client = new Anthropic({ apiKey });
  try {
    // Server-side fallbacks ("default"): if a safety classifier declines, the API re-runs the
    // request on Anthropic's recommended fallback model instead of returning a refusal.
    const params = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    };
    // deno-lint-ignore no-explicit-any
    const msg = await client.beta.messages.create(params as any);
    if (msg.stop_reason === "refusal") return reply({ code: "refused" }, 422);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (!text.trim()) return reply({ code: "empty_completion" }, 502);
    return reply({ text, truncated: msg.stop_reason === "max_tokens" });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return reply({ code: "rate_limited" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return reply({ code: "no_key", error: "Clave de Anthropic no válida" }, 503);
    if (e instanceof Anthropic.APIError) return reply({ code: "upstream_error", error: e.message }, 502);
    return reply({ code: "upstream_error", error: String(e) }, 502);
  }
});
