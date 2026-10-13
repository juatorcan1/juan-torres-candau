// Lo que la telefonista puede hacer además de hablar: cambiar de idioma, apuntar clientes, recados,
// incidencias y citas, pasar la llamada a una persona y colgar.
import type Anthropic from "@anthropic-ai/sdk";
import type { Ficha } from "./empresas.ts";
import { avisar, type Registro, type Tipo } from "./registro.ts";

export type Fin = { tipo: "colgar"; motivo: string } | { tipo: "pasar"; destino: string; numero: string; motivo: string };

export type Contexto = {
  ficha: Ficha;
  llamada: string;
  desde: string;
  registro: Registro;
  idioma: string;
  cambiarIdioma(codigo: string): void;
  fin: Fin | null;
};

type Herramienta = Anthropic.Beta.BetaTool;

const texto = (description: string) => ({ type: "string", description });
const objeto = (properties: Record<string, unknown>): Herramienta["input_schema"] => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const contacto = {
  nombre: texto("Nombre (y empresa, si llama en nombre de una). Vacío si no lo ha dicho."),
  telefono: texto("Teléfono de contacto confirmado, en formato internacional si se sabe. Vacío si no lo hay."),
  email: texto("Correo confirmado. Vacío si no lo ha dado."),
};

export function herramientas(f: Ficha): Herramienta[] {
  const lista: Herramienta[] = [
    {
      name: "cambiar_idioma",
      description: "Cambia el idioma en el que se te oye y se te entiende. Úsala antes de responder en un idioma distinto del actual.",
      input_schema: objeto({ idioma: { type: "string", enum: f.idiomas.map((i) => i.codigo), description: "Código del idioma." } }),
    },
    {
      name: "apuntar_cliente",
      description: "Apunta a alguien interesado en comprar o contratar (o un pedido, reserva o presupuesto que quiere hacer), para que el equipo comercial lo cierre o le llame.",
      input_schema: objeto({
        ...contacto,
        interes: texto("Qué quiere: productos o servicios, cantidades, tallas, medidas, dirección de la obra... todo lo concreto."),
        presupuesto_plazo: texto("Presupuesto y plazo que ha dicho. Vacío si no."),
        siguiente_paso: texto("Qué se ha acordado: le llamamos, le mandamos presupuesto, viene a la tienda, reserva..."),
        temperatura: { type: "string", enum: ["caliente", "templado", "frio"], description: "Cómo de cerca está de comprar." },
      }),
    },
    {
      name: "tomar_recado",
      description: "Toma un recado para alguien de la empresa o para un departamento.",
      input_schema: objeto({
        ...contacto,
        para: texto("Para quién o qué departamento."),
        mensaje: texto("El recado completo, con lo necesario para devolver la llamada sin volver a preguntar."),
        urgente: { type: "boolean", description: "Si es urgente." },
      }),
    },
    {
      name: "abrir_incidencia",
      description: "Abre una incidencia o queja que no se ha podido resolver en la llamada, para que el equipo la resuelva.",
      input_schema: objeto({
        ...contacto,
        referencia: texto("Número de pedido, de obra, de factura... Vacío si no lo hay."),
        problema: texto("Qué ha pasado, con detalle."),
        lo_que_se_le_ha_dicho: texto("Qué solución o plazo se le ha explicado."),
        prioridad: { type: "string", enum: ["alta", "normal", "baja"], description: "Alta si hay daño, riesgo, un cliente muy enfadado o mucho dinero en juego." },
      }),
    },
    {
      name: "pedir_cita",
      description: "Apunta una petición de cita (visita, medición, prueba, reunión...). El equipo la confirma después: díselo así, no la des por cerrada.",
      input_schema: objeto({
        ...contacto,
        motivo: texto("Para qué es la cita."),
        cuando: texto("Días y horas que le vienen bien, tal cual (\"martes 14 por la tarde\", \"cualquier mañana\")."),
        lugar: texto("Dónde: tienda, oficina, dirección de la obra... Vacío si no aplica."),
      }),
    },
    {
      name: "colgar",
      description: "Termina la llamada. Despídete antes: se cuelga en cuanto acabas de hablar.",
      input_schema: objeto({ motivo: texto("Por qué termina: conversación acabada, no hay nadie, llamada no deseada...") }),
    },
  ];
  const destinos = Object.keys(f.transferencias);
  if (destinos.length) {
    lista.splice(lista.length - 1, 0, {
      name: "pasar_llamada",
      description: "Pasa la llamada a una persona. Dile antes a quién le pasas. Se pasa en cuanto acabas de hablar.",
      input_schema: objeto({
        destino: { type: "string", enum: destinos, description: "A quién." },
        motivo: texto("Resumen para quien la recibe: quién llama y qué necesita."),
      }),
    });
  }
  return lista.map((h) => ({ ...h, strict: true }));
}

const TIPOS: Record<string, Tipo> = { apuntar_cliente: "cliente", tomar_recado: "recado", abrir_incidencia: "incidencia", pedir_cita: "cita" };

// Devuelve lo que se le contesta a Claude en el tool_result.
export async function ejecutar(nombre: string, entrada: Record<string, unknown>, c: Contexto): Promise<string> {
  if (nombre === "cambiar_idioma") {
    const idioma = String(entrada.idioma);
    if (!c.ficha.idiomas.some((i) => i.codigo === idioma)) return `El idioma ${idioma} no está disponible.`;
    c.cambiarIdioma(idioma);
    return `Listo: ahora se te oye y se te entiende en ${idioma}. Sigue en ese idioma.`;
  }
  const tipo = TIPOS[nombre];
  if (tipo) {
    const telefono = String(entrada.telefono || c.desde);
    const apunte = { empresa: c.ficha.id, llamada: c.llamada, tipo, telefono, datos: entrada };
    await c.registro.guardar(apunte);
    void avisar(c.ficha.avisos?.webhook, { ...apunte, empresaNombre: c.ficha.nombre });
    return "Apuntado y enviado al equipo.";
  }
  if (nombre === "pasar_llamada") {
    const destino = String(entrada.destino);
    const d = c.ficha.transferencias[destino];
    if (!d) return `No existe el destino ${destino}.`;
    c.fin = { tipo: "pasar", destino, numero: d.numero, motivo: String(entrada.motivo) };
    return "Preparado. Si no se lo has dicho ya, dile en una frase que le pasas; la llamada se pasa en cuanto termines de hablar.";
  }
  if (nombre === "colgar") {
    c.fin = { tipo: "colgar", motivo: String(entrada.motivo) };
    return "Preparado. Si no te has despedido ya, despídete en una frase; se cuelga en cuanto termines de hablar.";
  }
  return `Herramienta desconocida: ${nombre}`;
}
