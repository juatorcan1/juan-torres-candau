// Edge Function cuentas-drive: la web "Las cuentas de Juan" archiva aquí sus tickets en Google Drive,
// igual que Senda archiva sus facturas:
//   02 - JUAN / 04 - FACTURAS / 01 Tickets / {año} / {Nº TRIMESTRE} / AAAAMMDD_PROVEEDOR_IMPORTE€_NUMERO.pdf
// - El nombre sigue las reglas de factura_nombre.py (el fichero gemelo de senda-whatsapp y senda-360-api):
//   fecha sin separadores, proveedor en mayúsculas sin tildes ni puntos ni comas (con la razón social y la
//   marca entre paréntesis en los que se conocen), importe a la española con €, y el número si lo hay.
// - El año y el trimestre salen de la fecha del ticket. Se usan las carpetas que ya existen
//   («1er TRIMESTRE», «2º TRIMESTRE»…) y sólo se crea una si falta, como «3º TRIMESTRE».
// - Las fotos se pasan a PDF (como _img_a_pdf de Senda). Si ya hay en la carpeta un fichero con ese
//   nombre, o con el mismo número de ticket, no se sube otra vez. Si se corrige un gasto ya subido (fecha, importe, proveedor), se le
//   cambia el nombre y, si toca, la carpeta, pero sólo si el fichero está dentro de «01 Tickets».
// - Escribe con el permiso OAuth de la cuenta de Google de Juan, el mismo que usa la Tía Senda:
//   secretos GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REFRESH_TOKEN.
// - NADA SE MEZCLA CON SENDA: sólo se escribe dentro de «01 Tickets» (id fijo, sin variable de entorno que lo
//   cambie) y, antes de subir, se comprueba que esa carpeta es de verdad 02 - JUAN / 04 - FACTURAS / 01 Tickets.
//   Si no lo es, no se sube nada. Esa carpeta no está compartida con la cuenta de servicio de Senda.
// Solo para los usuarios de cuentas_usuarios; las fotos se leen de su carpeta privada cuentas-tickets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

// «G:\Mi unidad\02 - JUAN\04 - FACTURAS\01 Tickets»
const TICKETS_ID = "1qwlkFeobEgzOPnARJwQqj5Fk6vLZw5VR";
const CADENA = ["01 tickets", "04 - facturas", "02 - juan"];   // la carpeta, su madre y su abuela
const RUTA = "02 - JUAN / 04 - FACTURAS / 01 Tickets";
const BUCKET = "cuentas-tickets";
const MAX_ITEMS = 5;
const FOLDER = "application/vnd.google-apps.folder";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Any = any;

/* ---------- el nombre (port de factura_nombre.py) ---------- */
const PROHIBIDO = /[\\/:*?"<>|]/g;
const sinTildes = (s: string) => s.replace(/ñ/g, "\x00").replace(/Ñ/g, "\x01").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\x00/g, "ñ").replace(/\x01/g, "Ñ");
const normU = (s: string) => sinTildes(s).toUpperCase().replace(/[^A-Z0-9Ñ]+/g, " ").trim();
const PROVEEDORES: [string[], string, string][] = [
  [["OBRAMAT", "BRICOMAN", "BRICOMAX"], "BRICOLAJE BRICOMAN, S.L.U.", "OBRAMAT"],
  [["LEROY MERLIN", "LEROYMERLIN"], "LEROY MERLIN ESPAÑA, S.L.U.", "LEROY MERLIN"],
  [["MERCADONA"], "MERCADONA, S.A.", "MERCADONA"],
];
const CIF_PROVEEDOR: Record<string, number> = { B84406289: 0, B84818442: 1, A46103834: 2 };
const CENTROS = ["ALCALA DE GUADAIRA", "BORMUJOS", "CORDOBA", "SEVILLA", "MAIRENA", "DOS HERMANAS", "JEREZ", "HUELVA", "MALAGA", "NERVION", "SAN JUAN"];
function proveedorNormalizado(nombre: string, cif = ""): string {
  const original = String(nombre || "").trim().slice(0, 200);
  if (!original) return original;
  const n = normU(original);
  let idx = CIF_PROVEEDOR[sinTildes(String(cif || "")).toUpperCase().replace(/[^A-Z0-9]/g, "")];
  if (idx == null) idx = PROVEEDORES.findIndex(([claves]) => claves.some((k) => n.includes(k)));
  if (idx == null || idx < 0) return original;
  const [, razon, marca] = PROVEEDORES[idx];
  const centro = CENTROS.find((c) => n.includes(c)) || "";
  if (normU(razon).includes(marca)) return centro ? `${razon} (${centro})` : razon;
  return `${razon} (${(marca + " " + centro).trim()})`;
}
function trozoProveedor(prov: string, cif: string): string {
  let p = sinTildes(proveedorNormalizado(prov, cif).slice(0, 90)).toUpperCase().replace(/\./g, "");
  p = p.replace(PROHIBIDO, " ").replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();
  return !p || p.replace(/[-–— ]/g, "") === "" ? "SIN PROVEEDOR" : p;
}
function importeEs(v: unknown): string {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!isFinite(n) || String(v ?? "").trim() === "") return "";
  const [ent, dec] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
}
export function nombreFichero(d: { fecha: string; proveedor: string; cif?: string; total?: unknown; numero?: string }, ext: string): string {
  const partes = [/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha.replace(/-/g, "") : "SIN FECHA", trozoProveedor(d.proveedor, d.cif || "")];
  const imp = importeEs(d.total);
  if (imp) partes.push(imp + "€");
  const num = String(d.numero || "").trim().slice(0, 40).replace(PROHIBIDO, "-").replace(/\s+/g, " ").trim();
  if (num) partes.push(num);
  return partes.join("_").slice(0, 180) + ext;
}

/* ---------- foto -> PDF (una página, la foto entera) ---------- */
function jpegSize(b: Uint8Array): { w: number; h: number; comps: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}
export function jpegToPdf(jpg: Uint8Array): Uint8Array | null {
  const s = jpegSize(jpg); if (!s || !s.w || !s.h) return null;
  const W = 595, H = Math.round(s.h * W / s.w * 100) / 100;     // ancho de un A4, alto en proporción
  const cs = s.comps === 1 ? "/DeviceGray" : s.comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";
  const enc = new TextEncoder();
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  const parts: Uint8Array[] = []; const offs: number[] = []; let pos = 0;
  const put = (x: string | Uint8Array) => { const u = typeof x === "string" ? enc.encode(x) : x; parts.push(u); pos += u.length; };
  put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const obj = (n: number, body: string) => { offs[n] = pos; put(`${n} 0 obj\n${body}\nendobj\n`); };
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offs[4] = pos;
  put(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${s.w} /Height ${s.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${s.comps === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""} /Length ${jpg.length} >>\nstream\n`);
  put(jpg); put("\nendstream\nendobj\n");
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = pos;
  let x = "xref\n0 6\n0000000000 65535 f \n";
  for (let n = 1; n <= 5; n++) x += String(offs[n]).padStart(10, "0") + " 00000 n \n";
  put(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------- Google Drive ---------- */
async function googleToken(): Promise<string> {
  const id = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim(), secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim(), rt = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")?.trim();
  if (!id || !secret || !rt) throw Object.assign(new Error("Falta el permiso de Google Drive"), { code: "no_drive" });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error("Google no acepta el permiso de Drive: " + (j.error_description || j.error || r.status)), { code: "no_drive" });
  return j.access_token;
}
const qs = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function gd(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: "Bearer " + token, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Drive ${r.status}: ${j?.error?.message || ""}`.slice(0, 300));
  return j;
}
async function hijos(token: string, padre: string, extra = "") {
  const q = `'${qs(padre)}' in parents and trashed = false${extra}`;
  const j = await gd(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return (j.files || []) as Any[];
}
const normL = (s: string) => sinTildes(String(s || "")).toLowerCase().replace(/\s+/g, " ").trim();
async function carpeta(token: string, padre: string, elige: (n: string) => boolean, crear: string): Promise<string> {
  const fs = await hijos(token, padre, ` and mimeType = '${FOLDER}'`);
  const f = fs.find((x) => elige(normL(x.name)));
  if (f) return f.id;
  const c = await gd(token, "https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: crear, mimeType: FOLDER, parents: [padre] }),
  });
  return c.id;
}
async function subir(token: string, padre: string, nombre: string, mime: string, datos: Uint8Array) {
  const b = "cuentas" + crypto.randomUUID().replace(/-/g, "");
  const head = new TextEncoder().encode(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [padre] })}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = new TextEncoder().encode(`\r\n--${b}--`);
  const body = new Uint8Array(head.length + datos.length + tail.length);
  body.set(head); body.set(datos, head.length); body.set(tail, head.length + datos.length);
  return await gd(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body,
  });
}
// La carpeta: año / trimestre (o «SIN FECHA», aparte, como hace Senda con las dudas)
async function destinoDe(token: string, fecha: string, carpetas: Record<string, string>) {
  if (fecha) {
    const anio = fecha.slice(0, 4), q = Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;
    const ka = "a" + anio, kq = ka + "q" + q;
    carpetas[ka] ||= await carpeta(token, TICKETS_ID, (n) => n === anio, anio);
    carpetas[kq] ||= await carpeta(token, carpetas[ka], (n) => n.includes("trimestre") && n.includes(String(q)), `${q}\u00ba TRIMESTRE`);
    return { destino: carpetas[kq], ruta: `${RUTA} / ${anio} / ${q}\u00ba TRIMESTRE` };
  }
  carpetas.sf ||= await carpeta(token, TICKETS_ID, (n) => n === "sin fecha", "SIN FECHA");
  return { destino: carpetas.sf, ruta: `${RUTA} / SIN FECHA` };
}
// El candado: «01 Tickets» tiene que colgar de «04 - FACTURAS», y esta de «02 - JUAN». Si alguien la mueve
// (por ejemplo, dentro de Senda), no se sube nada hasta que vuelva a su sitio.
async function carpetaBuena(token: string): Promise<boolean> {
  let id = TICKETS_ID;
  for (const nombre of CADENA) {
    const f = await gd(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=name,parents,trashed&supportsAllDrives=true`);
    if (f.trashed || normL(f.name) !== nombre) return false;
    id = (f.parents || [])[0];
    if (!id) return false;
  }
  return true;
}
// ¿Este fichero está dentro de «01 Tickets»? (fichero → trimestre → año → 01 Tickets, o fichero → SIN FECHA → 01 Tickets)
async function dentroDeTickets(token: string, fileId: string): Promise<string | null> {
  const f = await gd(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,parents,trashed&supportsAllDrives=true`);
  if (f.trashed) return null;
  const padre = (f.parents || [])[0];
  let id = padre;
  for (let i = 0; i < 3 && id; i++) {
    if (id === TICKETS_ID) return padre;
    const p = await gd(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=parents&supportsAllDrives=true`);
    id = (p.parents || [])[0];
  }
  return null;
}
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

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

  let body: { items?: unknown } = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const items = (Array.isArray(body?.items) ? body.items as Any[] : []).slice(0, MAX_ITEMS);
  if (!items.length) return reply({ code: "invalid_request", error: "No hay nada que subir" }, 400);

  let token: string;
  try { token = await googleToken(); }
  catch (e) { return reply({ code: (e as Any).code || "no_drive", error: (e as Error).message }, 503); }
  try {
    if (!(await carpetaBuena(token))) return reply({ code: "carpeta", error: "La carpeta de tickets no está en 02 - JUAN / 04 - FACTURAS / 01 Tickets: no subo nada" }, 409);
  } catch (e) { return reply({ code: "upstream_error", error: "No puedo comprobar la carpeta de Drive: " + (e as Error).message }, 502); }

  const out: Any[] = [];
  const carpetas: Record<string, string> = {};
  for (const it of items) {
    const id = String(it?.id || "");
    try {
      // Cambiar uno que ya está: nombre y carpeta nuevos, sin volver a subirlo (sólo si está dentro de «01 Tickets»)
      if (typeof it?.fileId === "string" && it.fileId && !it?.data && !it?.ticket) {
        const padre = await dentroDeTickets(token, it.fileId);
        if (!padre) throw new Error("Ese fichero no está en la carpeta de tickets: no lo toco");
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(it?.fecha || "")) ? String(it.fecha) : "";
        const nombre = nombreFichero({ fecha, proveedor: String(it?.proveedor || ""), cif: String(it?.cif || ""), total: it?.total, numero: String(it?.numero || "") }, ".pdf");
        const { destino, ruta } = await destinoDe(token, fecha, carpetas);
        const mover = destino !== padre ? `&addParents=${destino}&removeParents=${padre}` : "";
        const f = await gd(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(it.fileId)}?fields=id,webViewLink&supportsAllDrives=true${mover}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nombre }),
        });
        out.push({ id, ok: true, fileId: f.id, enlace: f.webViewLink || "", nombre, ruta, cambiado: true });
        continue;
      }
      // el fichero: el PDF original que manda la web, o la foto de su carpeta privada
      let datos: Uint8Array, mime = String(it?.mime || "");
      if (typeof it?.data === "string" && it.data) {
        if (it.data.length > 14_000_000) throw new Error("El fichero es demasiado grande");
        datos = b64ToBytes(it.data);
      } else if (typeof it?.ticket === "string" && it.ticket.startsWith(user.id + "/")) {
        const { data: blob, error } = await admin.storage.from(BUCKET).download(it.ticket);
        if (error || !blob) throw new Error("No encuentro la foto del ticket");
        datos = new Uint8Array(await blob.arrayBuffer()); mime = blob.type || mime;
      } else throw new Error("Falta el ticket");
      const esPdf = mime.includes("pdf") || (datos[0] === 0x25 && datos[1] === 0x50 && datos[2] === 0x44 && datos[3] === 0x46);
      if (!esPdf) { const pdf = jpegToPdf(datos); if (pdf) { datos = pdf; mime = "application/pdf"; } }
      const pdf = mime.includes("pdf") || datos[0] === 0x25;
      const ext = pdf ? ".pdf" : mime.includes("png") ? ".png" : mime.includes("hei") ? ".heic" : ".jpg";
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(it?.fecha || "")) ? String(it.fecha) : "";
      const nombre = nombreFichero({ fecha, proveedor: String(it?.proveedor || ""), cif: String(it?.cif || ""), total: it?.total, numero: String(it?.numero || "") }, ext);
      const { destino, ruta } = await destinoDe(token, fecha, carpetas);
      // ¿Ya está? Mismo nombre, o (si el ticket tiene número) cualquier fichero de la carpeta con ese número,
      // aunque el proveedor se leyera distinto: así un ticket no se sube dos veces.
      const numN = String(it?.numero || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const ya = (await hijos(token, destino)).find((x) => x.mimeType !== FOLDER &&
        (x.name === nombre || (numN.length >= 6 && String(x.name).toUpperCase().replace(/[^A-Z0-9]/g, "").includes(numN))));
      const f = ya || await subir(token, destino, nombre, pdf ? "application/pdf" : (mime || "image/jpeg"), datos);
      out.push({ id, ok: true, fileId: f.id, enlace: f.webViewLink || "", nombre: ya ? ya.name : nombre, ruta, yaEstaba: !!ya });
    } catch (e) {
      out.push({ id, ok: false, error: String((e as Error)?.message || e).slice(0, 300) });
    }
  }
  return reply({ subidos: out });
});
