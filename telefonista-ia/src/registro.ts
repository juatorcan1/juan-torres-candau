// Dónde queda apuntado lo que pasa en las llamadas: recados, clientes interesados, incidencias,
// citas pedidas y el resumen de cada llamada. Con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY va a la
// tabla telefonista_registros (supabase/tablas.sql); si no, a datos/registros.jsonl.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Anterior } from "./instrucciones.ts";
import { soloCifras } from "./empresas.ts";

export type Tipo = "cliente" | "recado" | "incidencia" | "cita" | "llamada";

export type Apunte = {
  empresa: string;
  llamada: string; // CallSid de Twilio
  tipo: Tipo;
  telefono: string;
  datos: Record<string, unknown>;
};

export interface Registro {
  guardar(a: Apunte): Promise<void>;
  // Resúmenes de las últimas llamadas de este número a esta empresa, de la más nueva a la más vieja.
  anteriores(empresa: string, telefono: string, cuantas: number): Promise<Anterior[]>;
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
}

class RegistroFichero implements Registro {
  private ruta: string;
  constructor(ruta: string) {
    this.ruta = ruta;
    mkdirSync(dirname(ruta), { recursive: true });
  }
  async guardar(a: Apunte) {
    appendFileSync(this.ruta, JSON.stringify({ creado: new Date().toISOString(), ...a, telefono: soloCifras(a.telefono) }) + "\n");
  }
  async anteriores(empresa: string, telefono: string, cuantas: number) {
    if (!existsSync(this.ruta) || !soloCifras(telefono)) return [];
    return readFileSync(this.ruta, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      .filter((r) => r.empresa === empresa && r.telefono === soloCifras(telefono) && r.tipo === "llamada")
      .reverse().slice(0, cuantas).map((r) => ({ creado: r.creado, datos: r.datos }));
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
