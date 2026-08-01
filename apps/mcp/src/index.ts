import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { apiRequest } from "./apiClient.js";

interface Task {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  due_date: string | null;
}

// Set chico y de grano grueso a propósito: cada tool se inyecta en el prompt
// del agente en cada turno, así que más tools = más tokens gastados siempre.
// Agregar nutrition/exercise/lists/events cuando haya uso real, no por especulación.
const tools = {
  listar_tareas: {
    description: "Lista las tareas del usuario, opcionalmente filtradas por estado.",
    inputSchema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["pending", "in_progress", "done"] },
      },
    },
    argsSchema: z.object({ estado: z.enum(["pending", "in_progress", "done"]).optional() }),
    handler: async (args: { estado?: string }) => {
      const tasks = await apiRequest<Task[]>("/tasks");
      return args.estado ? tasks.filter((t) => t.status === args.estado) : tasks;
    },
  },

  crear_tarea: {
    description: "Crea una tarea nueva.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        notas: { type: "string" },
        fecha_limite: { type: "string", description: "ISO 8601, opcional" },
      },
      required: ["titulo"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      notas: z.string().optional(),
      fecha_limite: z.string().datetime().optional(),
    }),
    handler: (args: { titulo: string; notas?: string; fecha_limite?: string }) =>
      apiRequest<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, notes: args.notas, due_date: args.fecha_limite }),
      }),
  },

  completar_tarea: {
    description: "Marca una tarea existente como completada.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "id de la tarea" } },
      required: ["id"],
    },
    argsSchema: z.object({ id: z.string().uuid() }),
    handler: (args: { id: string }) =>
      apiRequest<Task>(`/tasks/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done", completed_at: new Date().toISOString() }),
      }),
  },

  crear_recordatorio: {
    description:
      "Guarda un recordatorio en BrainFocus para que se vea en la app. " +
      "Esto NO dispara ningún aviso por WhatsApp/Telegram — para eso hay que crear " +
      "además un cron job (herramienta `cron`), en el mismo turno, incluyendo el id " +
      "de este recordatorio en el nombre del job para poder cancelarlo si la tarea se completa antes.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        recordar_en: { type: "string", description: "ISO 8601, cuándo debería sonar" },
        tarea_id: { type: "string", description: "id de la tarea relacionada, opcional" },
      },
      required: ["titulo", "recordar_en"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      recordar_en: z.string().datetime(),
      tarea_id: z.string().uuid().optional(),
    }),
    handler: (args: { titulo: string; recordar_en: string; tarea_id?: string }) =>
      apiRequest("/reminders", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, remind_at: args.recordar_en, task_id: args.tarea_id }),
      }),
  },

  crear_nota: {
    description: "Guarda una nota o información libre.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        contenido: { type: "string" },
      },
      required: ["contenido"],
    },
    argsSchema: z.object({ titulo: z.string().optional(), contenido: z.string().min(1) }),
    handler: (args: { titulo?: string; contenido: string }) =>
      apiRequest("/notes", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, content: args.contenido }),
      }),
  },
} as const;

const server = new Server(
  { name: "brainfocus-api", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools[request.params.name as keyof typeof tools];
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Tool desconocida: ${request.params.name}` }] };
  }

  const parsed = tool.argsSchema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return { isError: true, content: [{ type: "text", text: `Argumentos inválidos: ${parsed.error.message}` }] };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tool.handler as any)(parsed.data);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
