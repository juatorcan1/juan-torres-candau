// La centralita en directo: las llamadas que está atendiendo la telefonista y los paneles abiertos
// (/panel) que las siguen. Desde un panel se ve lo que dice cada uno, se oye la llamada, se le dan
// indicaciones a la telefonista, se coge o se cuelga, y se deciden las reglas de cada número.
import type { WebSocket } from "ws";
import type { Conversacion, Evento } from "./agente.ts";
import type { Accion, Ficha } from "./empresas.ts";
import type { Registro, Regla } from "./registro.ts";
import { iguales } from "./twilio.ts";

type Linea = { quien: "cliente" | "asistente" | "indicacion" | "aviso"; texto: string };

type Activa = {
  llamada: string;
  ficha: Ficha;
  desde: string;
  nombre: string;
  inicio: string;
  conv: Conversacion;
  lineas: Linea[];
};

type Panel = { ws: WebSocket; escuchando: string | null };

const ACCIONES: Accion[] = ["ia", "pasar", "preguntar"];

export class Centralita {
  private activas = new Map<string, Activa>();
  private paneles = new Set<Panel>();
  private empresas: Ficha[];
  private registro: Registro;
  private clave: string;

  constructor(empresas: Ficha[], registro: Registro, clave: string) {
    this.empresas = empresas;
    this.registro = registro;
    this.clave = clave;
  }

  alta(a: Omit<Activa, "lineas" | "inicio">) {
    this.activas.set(a.llamada, { ...a, inicio: new Date().toISOString(), lineas: [{ quien: "asistente", texto: a.ficha.saludo }] });
    this.enviarActivas();
  }

  baja(llamada: string) {
    if (this.activas.delete(llamada)) this.enviarActivas();
  }

  // Lo que va pasando: se guarda para quien abra el panel a mitad de llamada y se manda a los abiertos.
  evento(llamada: string, e: Evento) {
    const a = this.activas.get(llamada);
    if (!a) return;
    const ultima = a.lineas.at(-1);
    if (e.tipo === "asistente") {
      if (ultima?.quien === "asistente" && !ultima.texto.endsWith("\n")) ultima.texto += e.texto;
      else a.lineas.push({ quien: "asistente", texto: e.texto });
    } else if (e.tipo === "cliente") {
      if (ultima?.quien === "asistente") ultima.texto += "\n";
      a.lineas.push({ quien: "cliente", texto: e.texto });
    } else if (e.tipo === "indicacion") {
      a.lineas.push({ quien: "indicacion", texto: e.texto });
    } else {
      a.lineas.push({ quien: "aviso", texto: describir(e) });
    }
    this.aTodos({ tipo: "evento", llamada, evento: e });
  }

  // Sonido de la llamada (mu-law a 8 kHz, en base64): sólo a los paneles que la están escuchando.
  audio(llamada: string, pista: "in" | "out", datos: string) {
    for (const p of this.paneles) {
      if (p.escuchando === llamada) enviar(p.ws, { tipo: "audio", pista, d: datos });
    }
  }

  conectarPanel(ws: WebSocket) {
    const panel: Panel = { ws, escuchando: null };
    let dentro = false;
    ws.on("message", async (bruto) => {
      let m: Record<string, any>;
      try { m = JSON.parse(String(bruto)); } catch { return; }
      if (!dentro) {
        if (m.tipo !== "entrar" || !iguales(String(m.clave ?? ""), this.clave)) {
          enviar(ws, { tipo: "error", texto: "Clave incorrecta" });
          return setTimeout(() => ws.close(), 1000); // sin prisa: que no se pueda probar claves a lo loco
        }
        dentro = true;
        this.paneles.add(panel);
        enviar(ws, {
          tipo: "hola",
          empresas: this.empresas.map((f) => ({ id: f.id, nombre: f.nombre, responsable: !!f.filtro?.miTelefono })),
        });
        return enviar(ws, this.listaActivas());
      }
      try {
        await this.orden(panel, m);
      } catch (e) {
        console.error("Panel:", e);
        enviar(ws, { tipo: "error", texto: e instanceof Error ? e.message : String(e) });
      }
    });
    ws.on("close", () => this.paneles.delete(panel));
  }

  private async orden(panel: Panel, m: Record<string, any>) {
    const a = this.activas.get(String(m.llamada ?? ""));
    const ficha = this.empresas.find((f) => f.id === m.empresa);
    switch (m.tipo) {
      case "escuchar":
        panel.escuchando = a ? a.llamada : null;
        return;
      case "indicar":
        if (!a) throw new Error("Esa llamada ya ha terminado");
        a.conv.indicar(String(m.texto ?? ""), m.ya === true);
        return;
      case "pasarme":
        if (!a) throw new Error("Esa llamada ya ha terminado");
        if (!a.conv.pasarAlResponsable()) throw new Error("Falta filtro.miTelefono en la ficha de la empresa");
        return;
      case "colgar":
        if (!a) throw new Error("Esa llamada ya ha terminado");
        a.conv.colgarYa();
        return;
      case "reglas":
        if (!ficha) throw new Error("Empresa desconocida");
        return enviar(panel.ws, { tipo: "reglas", empresa: ficha.id, reglas: await this.registro.reglas(ficha.id) });
      case "recientes":
        if (!ficha) throw new Error("Empresa desconocida");
        return enviar(panel.ws, { tipo: "recientes", empresa: ficha.id, llamadas: await this.registro.recientes(ficha.id, 40) });
      case "guardarRegla": {
        if (!ficha) throw new Error("Empresa desconocida");
        const r = m.regla ?? {};
        const regla: Regla = {
          telefono: String(r.telefono ?? ""), nombre: String(r.nombre ?? "").slice(0, 200),
          accion: ACCIONES.includes(r.accion) ? r.accion : "ia", instrucciones: String(r.instrucciones ?? "").slice(0, 4000),
        };
        if (!regla.telefono.replace(/\D/g, "")) throw new Error("Falta el teléfono");
        await this.registro.guardarRegla(ficha.id, regla);
        return enviar(panel.ws, { tipo: "reglas", empresa: ficha.id, reglas: await this.registro.reglas(ficha.id) });
      }
      case "borrarRegla":
        if (!ficha) throw new Error("Empresa desconocida");
        await this.registro.borrarRegla(ficha.id, String(m.telefono ?? ""));
        return enviar(panel.ws, { tipo: "reglas", empresa: ficha.id, reglas: await this.registro.reglas(ficha.id) });
    }
  }

  private listaActivas() {
    return {
      tipo: "activas",
      llamadas: [...this.activas.values()].map((a) => ({
        llamada: a.llamada, empresa: a.ficha.id, empresaNombre: a.ficha.nombre, desde: a.desde, nombre: a.nombre,
        inicio: a.inicio, lineas: a.lineas, responsable: !!a.ficha.filtro?.miTelefono,
      })),
    };
  }

  private enviarActivas() { this.aTodos(this.listaActivas()); }

  private aTodos(m: Record<string, unknown>) {
    for (const p of this.paneles) enviar(p.ws, m);
  }
}

function describir(e: Evento): string {
  switch (e.tipo) {
    case "idioma": return `Cambia a ${e.codigo}`;
    case "fin": return e.fin.tipo === "pasar" ? `Pasa la llamada a ${e.fin.destino}` : "Cuelga";
    case "herramienta": {
      const nombres: Record<string, string> = {
        apuntar_cliente: "Apunta un cliente interesado", tomar_recado: "Toma un recado", abrir_incidencia: "Abre una incidencia",
        pedir_cita: "Apunta una cita", pasar_llamada: "Va a pasar la llamada", colgar: "Va a colgar", cambiar_idioma: "Cambia de idioma",
      };
      return nombres[e.nombre] ?? e.nombre;
    }
    default: return "";
  }
}

const enviar = (ws: WebSocket, m: Record<string, unknown>) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
};
