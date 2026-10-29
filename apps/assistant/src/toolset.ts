import { horaActualCR } from "@brainfocus/shared-time";
import { runWithApi } from "@brainfocus/focusbrain-tools";
import type { ToolSpec } from "./llm/qwen.js";

// Forma mínima de cada entrada de la tabla de herramientas compartida (packages/focusbrain-tools).
export interface ToolDef {
  description: string;
  inputSchema: unknown;
  argsSchema: { safeParse(v: unknown): { success: true; data: unknown } | { success: false; error: { message: string } } };
  handler: (args: any) => unknown | Promise<unknown>;
}
export type ToolTable = Record<string, ToolDef>;

// Herramientas del MCP que NO aplican al asistente: leen archivos del disco del VPS (adjuntos que
// OpenClaw deja en /root/.openclaw/media) y aquí no existe esa ruta.
export const EXCLUDED_TOOLS = new Set(["guardar_documento"]);

export interface ApiAccess {
  baseUrl: string;
  serviceKey: string;
}

const STALE_NOW = /Ahora mismo en Costa Rica es: .*? \(offset -06:00\)\./g;

export interface Toolset {
  specs(): ToolSpec[];
  /** Ejecuta una herramienta EN NOMBRE de userId. El userId lo pone el servidor, nunca el modelo. */
  execute(userId: string, name: string, rawArgs: string): Promise<string>;
}

export function buildToolset(table: ToolTable, api: ApiAccess, opts: { now?: () => string } = {}): Toolset {
  const now = opts.now ?? horaActualCR;
  const names = Object.keys(table).filter((n) => !EXCLUDED_TOOLS.has(n));

  return {
    specs() {
      // La descripción trae "Ahora mismo en Costa Rica es: <hora>" fijada al cargar el módulo; en un servicio
      // de larga duración eso queda viejo, así que se reescribe con la hora real en cada turno.
      const fresh = `Ahora mismo en Costa Rica es: ${now()} (offset -06:00).`;
      return names.map((name) => ({
        type: "function" as const,
        function: { name, description: table[name].description.replace(STALE_NOW, fresh), parameters: table[name].inputSchema },
      }));
    },

    async execute(userId, name, rawArgs) {
      if (!names.includes(name)) return JSON.stringify({ error: `Herramienta desconocida: ${name}` });

      let args: unknown;
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        return JSON.stringify({ error: "Argumentos inválidos: no es JSON" });
      }
      const parsed = table[name].argsSchema.safeParse(args);
      if (!parsed.success) return JSON.stringify({ error: `Argumentos inválidos: ${parsed.error.message}` });

      try {
        const result = await runWithApi(
          { baseUrl: api.baseUrl, headers: { "X-Service-Key": api.serviceKey, "X-On-Behalf-Of": userId } },
          () => table[name].handler(parsed.data),
        );
        return JSON.stringify(result ?? { ok: true });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
