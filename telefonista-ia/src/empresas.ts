// Las empresas a las que atiende la telefonista. Cada una vive en su carpeta de empresas/:
//   ficha.json       -> datos fijos: nombre, números de teléfono, idiomas, horario, a quién pasar llamadas...
//   conocimiento.md  -> lo que tiene que saber: productos, precios, políticas, preguntas frecuentes.
// Un mismo servidor atiende a varias empresas: cada llamada va a la empresa del número marcado.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type Idioma = {
  codigo: string; // BCP-47, como los pide Twilio: "es-ES", "en-US"...
  nombre: string;
  voz?: string; // voz del proveedor de voz; si no se pone, Twilio usa la suya por defecto
  proveedorVoz?: string; // "ElevenLabs", "Google", "Amazon"
};

export type Destino = {
  numero: string; // en formato internacional: +34...
  descripcion: string; // para qué es: "ventas y presupuestos", "incidencias de pedidos"...
  horario?: string; // cuándo se puede pasar la llamada, en palabras: "L-V de 9:00 a 14:00"
};

export type Ficha = {
  id: string; // nombre de la carpeta
  nombre: string;
  sector: string;
  asistente: string; // cómo se llama la telefonista
  telefonos: string[]; // números (de Twilio) que atiende para esta empresa
  idiomaPrincipal: string;
  idiomas: Idioma[];
  zonaHoraria: string;
  horario: string;
  saludo: string; // lo primero que se oye, en el idioma principal
  tono: string;
  transferencias: Record<string, Destino>; // "ventas", "atencion", "obra"...
  transcripcion: { proveedor: string; modelo: string; multilingue: boolean };
  avisos?: { webhook?: string }; // a dónde mandar recados, pedidos e incidencias en cuanto se apuntan
  conocimiento: string;
};

// Nombres de los idiomas más comunes, para no tener que escribirlos en cada ficha.
const NOMBRES: Record<string, string> = {
  "es-ES": "español (España)", "es-MX": "español (México)", "es-US": "español (EE. UU.)",
  "en-US": "inglés (EE. UU.)", "en-GB": "inglés (Reino Unido)", "fr-FR": "francés", "de-DE": "alemán",
  "it-IT": "italiano", "pt-PT": "portugués (Portugal)", "pt-BR": "portugués (Brasil)", "nl-NL": "neerlandés",
  "ca-ES": "catalán", "eu-ES": "euskera", "gl-ES": "gallego", "ru-RU": "ruso", "uk-UA": "ucraniano",
  "pl-PL": "polaco", "ro-RO": "rumano", "sv-SE": "sueco", "da-DK": "danés", "nb-NO": "noruego",
  "fi-FI": "finés", "el-GR": "griego", "tr-TR": "turco", "ar-SA": "árabe", "hi-IN": "hindi",
  "zh-CN": "chino mandarín", "ja-JP": "japonés", "ko-KR": "coreano",
};

export const nombreIdioma = (codigo: string) => NOMBRES[codigo] ?? codigo;

// Los números se comparan sólo por sus cifras: "+34 910 00 00 00" y "+34910000000" son el mismo.
export const soloCifras = (numero: string) => numero.replace(/[^\d]/g, "");

function leerFicha(dir: string, id: string): Ficha {
  const bruto = JSON.parse(readFileSync(join(dir, "ficha.json"), "utf8"));
  const falta = ["nombre", "asistente", "telefonos", "saludo"].filter((k) => !bruto[k]);
  if (falta.length) throw new Error(`${id}/ficha.json: falta ${falta.join(", ")}`);
  const idiomaPrincipal = bruto.idiomaPrincipal ?? "es-ES";
  const idiomas: Idioma[] = (bruto.idiomas ?? [idiomaPrincipal]).map((i: string | Idioma) =>
    typeof i === "string" ? { codigo: i, nombre: nombreIdioma(i) } : { ...i, nombre: i.nombre ?? nombreIdioma(i.codigo) }
  );
  if (!idiomas.some((i) => i.codigo === idiomaPrincipal)) idiomas.unshift({ codigo: idiomaPrincipal, nombre: nombreIdioma(idiomaPrincipal) });
  const conocimientoMd = join(dir, "conocimiento.md");
  return {
    id,
    nombre: bruto.nombre,
    sector: bruto.sector ?? "",
    asistente: bruto.asistente,
    telefonos: bruto.telefonos,
    idiomaPrincipal,
    idiomas,
    zonaHoraria: bruto.zonaHoraria ?? "Europe/Madrid",
    horario: bruto.horario ?? "",
    saludo: bruto.saludo,
    tono: bruto.tono ?? "cercano, profesional y resolutivo",
    transferencias: bruto.transferencias ?? {},
    transcripcion: { proveedor: "Deepgram", modelo: "nova-3-general", multilingue: true, ...bruto.transcripcion },
    avisos: bruto.avisos,
    conocimiento: existsSync(conocimientoMd) ? readFileSync(conocimientoMd, "utf8") : "",
  };
}

export function cargarEmpresas(dir: string): Ficha[] {
  const fichas = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "ficha.json")))
    .map((d) => leerFicha(join(dir, d.name), d.name));
  const vistos = new Map<string, string>();
  for (const f of fichas) {
    for (const t of f.telefonos) {
      const n = soloCifras(t);
      if (vistos.has(n)) throw new Error(`El teléfono ${t} está en ${vistos.get(n)} y en ${f.id}`);
      vistos.set(n, f.id);
    }
  }
  return fichas;
}

export const empresaDelNumero = (fichas: Ficha[], marcado: string) =>
  fichas.find((f) => f.telefonos.some((t) => soloCifras(t) === soloCifras(marcado)));
