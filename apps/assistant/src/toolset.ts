import { z } from "zod";
import { horaActualCR } from "@brainfocus/shared-time";
import { apiUpload, runWithApi } from "@brainfocus/focusbrain-tools";
import type { Attachment } from "./attachments.js";
import type { ToolSpec } from "./llm/qwen.js";

// Forma mínima de cada entrada de la tabla de herramientas compartida (packages/focusbrain-tools).
export interface ToolDef {
  description: string;
  inputSchema: unknown;
  argsSchema: { safeParse(v: unknown): { success: true; data: unknown } | { success: false; error: { message: string } } };
  handler: (args: any) => unknown | Promise<unknown>;
}
export type ToolTable = Record<string, ToolDef>;

// Herramientas del MCP que NO aplican al asistente:
//  - consultar_consumos: gasto del servidor, solo del administrador (la credencial del asistente no tiene ese scope).
export const EXCLUDED_TOOLS = new Set(["consultar_consumos"]);

export interface ApiAccess {
  baseUrl: string;
  serviceKey: string;
}

/** Lo que cada mensaje le deja a las herramientas de documentos (el adjunto recibido y cómo mandar uno de vuelta). */
export interface ToolContext {
  attachment(): Attachment | null;
  sendDocument(doc: { url: string; name: string; mimeType: string | null }): Promise<void>;
}

const STALE_NOW = /Ahora mismo en Costa Rica es: .*? \(offset -06:00\)\./g;

// En el MCP, guardar_documento lee un archivo del disco del VPS (MediaPath de OpenClaw) y enviar_documento
// devuelve una URL para que OpenClaw la reenvíe. El asistente no tiene disco compartido ni reenvío: usa el adjunto
// que el usuario acaba de mandar y envía el archivo él mismo por WhatsApp. Misma API, mismos permisos.
const SAVE_SPEC = {
  description:
    "Guarda como documento el archivo (PDF/imagen) que la persona mandó por WhatsApp hace un momento, con el nombre " +
    "que pida para buscarlo después. Si ya existe uno con ese nombre, lo reemplaza. No leas ni describas el contenido. " +
    "Si no hay un adjunto reciente, pedile que lo vuelva a mandar.",
  parameters: {
    type: "object",
    properties: {
      nombre: { type: "string", description: 'Nombre único por el que se va a buscar después (ej. "cédula").' },
      proyecto_id: { type: "string", description: "id del proyecto, opcional (listar_proyectos si no se conoce)." },
    },
    required: ["nombre"],
  },
};
const saveArgs = z.object({ nombre: z.string().min(1), proyecto_id: z.string().uuid().optional() });

const SEND_DESCRIPTION_SUFFIX =
  " El archivo se envía directamente por WhatsApp a la persona; después de llamar esta herramienta solo confirmá que se lo mandaste.";

export interface Toolset {
  specs(): ToolSpec[];
  /** Ejecuta una herramienta EN NOMBRE de userId. El userId lo pone el servidor, nunca el modelo. */
  execute(userId: string, name: string, rawArgs: string, ctx?: ToolContext): Promise<string>;
}

export function buildToolset(table: ToolTable, api: ApiAccess, opts: { now?: () => string } = {}): Toolset {
  const now = opts.now ?? horaActualCR;
  const names = Object.keys(table).filter((n) => !EXCLUDED_TOOLS.has(n));
  const apiCtx = (userId: string) => ({
    baseUrl: api.baseUrl,
    headers: { "X-Service-Key": api.serviceKey, "X-On-Behalf-Of": userId },
  });

  async function saveDocument(userId: string, rawArgs: unknown, ctx?: ToolContext): Promise<unknown> {
    const parsed = saveArgs.safeParse(rawArgs);
    if (!parsed.success) throw new Error(`Argumentos inválidos: ${parsed.error.message}`);
    const att = ctx?.attachment();
    if (!att) throw new Error("No hay ningún archivo reciente de esta persona. Pedile que lo vuelva a mandar.");
    const form = new FormData();
    form.set("name", parsed.data.nombre);
    if (parsed.data.proyecto_id) form.set("project_id", parsed.data.proyecto_id);
    form.set("file", new Blob([att.bytes as BlobPart], { type: att.mimeType }), parsed.data.nombre);
    const doc = await runWithApi(apiCtx(userId), () => apiUpload<{ id: string; name: string }>("/documents/upload", form));
    return { guardado: true, id: doc.id, nombre: doc.name };
  }

  async function sendDocument(userId: string, args: unknown, ctx?: ToolContext): Promise<unknown> {
    const result = await runWithApi(apiCtx(userId), () => table.enviar_documento.handler(args));
    const r = result as { url?: string; name?: string; mime_type?: string | null } | null;
    if (!r?.url) return result; // ambiguo / sin coincidencias: el modelo le pregunta a la persona
    if (!ctx) throw new Error("No se pueden enviar archivos desde aquí");
    await ctx.sendDocument({ url: r.url, name: r.name ?? "documento", mimeType: r.mime_type ?? null });
    return { enviado: true, nombre: r.name };
  }

  return {
    specs() {
      // La descripción trae "Ahora mismo en Costa Rica es: <hora>" fijada al cargar el módulo; en un servicio
      // de larga duración eso queda viejo, así que se reescribe con la hora real en cada turno.
      const fresh = `Ahora mismo en Costa Rica es: ${now()} (offset -06:00).`;
      return names.map((name) => {
        if (name === "guardar_documento") return { type: "function" as const, function: { name, ...SAVE_SPEC } };
        const description =
          table[name].description.replace(STALE_NOW, fresh) + (name === "enviar_documento" ? SEND_DESCRIPTION_SUFFIX : "");
        return { type: "function" as const, function: { name, description, parameters: table[name].inputSchema } };
      });
    },

    async execute(userId, name, rawArgs, ctx) {
      if (!names.includes(name)) return JSON.stringify({ error: `Herramienta desconocida: ${name}` });

      let args: unknown;
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        return JSON.stringify({ error: "Argumentos inválidos: no es JSON" });
      }

      try {
        if (name === "guardar_documento") return JSON.stringify(await saveDocument(userId, args, ctx));
        const parsed = table[name].argsSchema.safeParse(args);
        if (!parsed.success) return JSON.stringify({ error: `Argumentos inválidos: ${parsed.error.message}` });
        if (name === "enviar_documento") return JSON.stringify(await sendDocument(userId, parsed.data, ctx));
        const result = await runWithApi(apiCtx(userId), () => table[name].handler(parsed.data));
        return JSON.stringify(result ?? { ok: true });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
