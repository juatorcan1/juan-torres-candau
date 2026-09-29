// Dónde queda apuntado lo que pasa en las llamadas: recados, clientes interesados, incidencias,
// citas pedidas y el resumen de cada llamada; y las reglas que pones a cada número (contactos).
// Con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY va a las tablas telefonista_registros y
// telefonista_contactos (supabase/tablas.sql); si no, a datos/registros.jsonl y datos/registros-contactos.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Anterior } from "./instrucciones.ts";
import { soloCifras, type Accion } from "./empresas.ts";

export type Tipo = "cliente" | "recado" | "incidencia" | "cita" | "llamada";

export type Apunte = {
  empresa: string;
  llamada: string; // CallSid de Twilio
  tipo: Tipo;
  telefono: string;
  datos: Record<string, unknown>;
};

// Lo que has decidido para un número: quién es, qué hacer cuando llame y cómo tratarle.
export type Regla = { telefono: string; nombre: string; accion: Accion; instrucciones: string };

export type Reciente = { creado: string; telefono: string; datos: Record<string, unknown> };

export interface Registro {
  guardar(a: Apunte): Promise<void>;
  // Resúmenes de las últimas llamadas de este número a esta empresa, de la más nueva a la más vieja.
  anteriores(empresa: string, telefono: string, cuantas: number): Promise<Anterior[]>;
  // Últimas llamadas a la empresa, de cualquier número.
  recientes(empresa: string, cuantas: number): Promise<Reciente[]>;
  regla(empresa: string, telefono: string): Promise<Regla | null>;
  reglas(empresa: string): Promise<Regla[]>;
  guardarRegla(empresa: string, r: Regla): Promise<void>;
  borrarRegla(empresa: string, telefono: string): Promise<void>;
}

class RegistroSupabase implements Registro {
  private db;
  constructor(url: string, clave: string) {
    this.db = createClient(url, clave, { auth: { persistSession: false } });
  }
  async guardar(a: Apunte) {
    const { error } = await this.db.from("telefonista_registros").insert({ ...a, telefono: soloCifras(a.telefono) });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }
  async anteriores(empresa: string, telefono: string, cuantas: number) {
    if (!soloCifras(telefono)) return [];
    const { data, error } = await this.db.from("telefonista_registros").select("creado, datos")
      .eq("empresa", empresa).eq("telefono", soloCifras(telefono)).eq("tipo", "llamada")
      .order("creado", { ascending: false }).limit(cuantas);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []) as Anterior[];
  }
  async recientes(empresa: string, cuantas: number) {
    const { data, error } = await this.db.from("telefonista_registros").select("creado, telefono, datos")
      .eq("empresa", empresa).eq("tipo", "llamada").order("creado", { ascending: false }).limit(cuantas);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []) as Reciente[];
  }
  async regla(empresa: string, telefono: string) {
    if (!soloCifras(telefono)) return null;
    const { data, error } = await this.db.from("telefonista_contactos").select("telefono, nombre, accion, instrucciones")
      .eq("empresa", empresa).eq("telefono", soloCifras(telefono)).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return data as Regla | null;
  }
  async reglas(empresa: string) {
    const { data, error } = await this.db.from("telefonista_contactos").select("telefono, nombre, accion, instrucciones")
      .eq("empresa", empresa).order("nombre");
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []) as Regla[];
  }
  async guardarRegla(empresa: string, r: Regla) {
    const { error } = await this.db.from("telefonista_contactos")
      .upsert({ empresa, ...r, telefono: soloCifras(r.telefono), actualizado: new Date().toISOString() }, { onConflict: "empresa,telefono" });
    if (error) throw new Error(`Supabase: ${error.message}`);
  }
  async borrarRegla(empresa: string, telefono: string) {
    const { error } = await this.db.from("telefonista_contactos").delete().eq("empresa", empresa).eq("telefono", soloCifras(telefono));
    if (error) throw new Error(`Supabase: ${error.message}`);
  }
}

class RegistroFichero implements Registro {
  private ruta: string;
  private rutaContactos: string;
  constructor(ruta: string) {
    this.ruta = ruta;
    this.rutaContactos = ruta.replace(/\.jsonl$/, "") + "-contactos.json";
    mkdirSync(dirname(ruta), { recursive: true });
  }
  private todos(): (Apunte & { creado: string })[] {
    if (!existsSync(this.ruta)) return [];
    return readFileSync(this.ruta, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  private contactos(): Record<string, Record<string, Regla>> {
    return existsSync(this.rutaContactos) ? JSON.parse(readFileSync(this.rutaContactos, "utf8")) : {};
  }
  private guardarContactos(c: Record<string, Record<string, Regla>>) {
    writeFileSync(this.rutaContactos, JSON.stringify(c, null, 2));
  }
  async guardar(a: Apunte) {
    appendFileSync(this.ruta, JSON.stringify({ creado: new Date().toISOString(), ...a, telefono: soloCifras(a.telefono) }) + "\n");
  }
  async anteriores(empresa: string, telefono: string, cuantas: number) {
    if (!soloCifras(telefono)) return [];
    return this.todos().filter((r) => r.empresa === empresa && r.telefono === soloCifras(telefono) && r.tipo === "llamada")
      .reverse().slice(0, cuantas).map((r) => ({ creado: r.creado, datos: r.datos }));
  }
  async recientes(empresa: string, cuantas: number) {
    return this.todos().filter((r) => r.empresa === empresa && r.tipo === "llamada")
      .reverse().slice(0, cuantas).map((r) => ({ creado: r.creado, telefono: r.telefono, datos: r.datos }));
  }
  async regla(empresa: string, telefono: string) {
    return this.contactos()[empresa]?.[soloCifras(telefono)] ?? null;
  }
  async reglas(empresa: string) {
    return Object.values(this.contactos()[empresa] ?? {}).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  async guardarRegla(empresa: string, r: Regla) {
    const c = this.contactos();
    (c[empresa] ??= {})[soloCifras(r.telefono)] = { ...r, telefono: soloCifras(r.telefono) };
    this.guardarContactos(c);
  }
  async borrarRegla(empresa: string, telefono: string) {
    const c = this.contactos();
    delete c[empresa]?.[soloCifras(telefono)];
    this.guardarContactos(c);
  }
}

export function abrirRegistro(): Registro {
  const url = process.env.SUPABASE_URL, clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && clave) return new RegistroSupabase(url, clave);
  return new RegistroFichero(process.env.REGISTRO_FICHERO ?? "datos/registros.jsonl");
}

// Aviso inmediato al equipo (Slack, Make, Zapier, n8n, un correo vía webhook...): se manda el apunte
// tal cual en JSON. Si falla, la llamada sigue: el apunte ya está guardado.
export async function avisar(webhook: string | undefined, a: Apunte & { empresaNombre: string }) {
  if (!webhook) return;
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error(`Aviso a ${new URL(webhook).host}: HTTP ${r.status}`);
  } catch (e) {
    console.error(`Aviso a ${new URL(webhook).host} fallido:`, e);
  }
}
