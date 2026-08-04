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

interface Event {
  id: string;
  title: string;
  starts_at: string;
}

interface Note {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  vehicle_type: string | null;
  plate: string | null;
}

interface VehicleMaintenance {
  id: string;
  vehicle_id: string;
  date: string;
  description: string;
  mileage: number | null;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Set chico y de grano grueso a propósito: cada tool se inyecta en el prompt
// del agente en cada turno, así que más tools = más tokens gastados siempre.
// Agregar nutrition/exercise/lists/events cuando haya uso real, no por especulación.
const tools = {
  listar_tareas: {
    description: "Lista las tareas del usuario, opcionalmente filtradas por estado. Trae máximo 50.",
    inputSchema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["pending", "in_progress", "done"] },
      },
    },
    argsSchema: z.object({ estado: z.enum(["pending", "in_progress", "done"]).optional() }),
    handler: (args: { estado?: string }) => {
      const params = new URLSearchParams({ limit: "50", fields: "id,title,status,due_date" });
      if (args.estado) params.set("status", args.estado);
      return apiRequest<Task[]>(`/tasks?${params.toString()}`);
    },
  },

  crear_tarea: {
    description: "Crea una tarea nueva.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        notas: { type: "string" },
        fecha_limite: {
          type: "string",
          description: "ISO 8601 con offset de zona horaria; para Costa Rica usar -06:00. Opcional.",
        },
      },
      required: ["titulo"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      notas: z.string().optional(),
      fecha_limite: z.string().datetime({ offset: true }).optional(),
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
      "Guarda un recordatorio en Focusbrain. La API programa sola el aviso real de " +
      "WhatsApp/Telegram (cron de disparo único en OpenClaw) — no hace falta crear " +
      "ningún cron aparte con la herramienta `cron`. Si la tarea/evento relacionado " +
      "se completa o se borra antes de la hora, el recordatorio y su aviso se cancelan solos.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        recordar_en: {
          type: "string",
          description:
            "ISO 8601 con offset de zona horaria; para Costa Rica usar -06:00. Cuándo debería sonar.",
        },
        tarea_id: { type: "string", description: "id de la tarea relacionada, opcional" },
      },
      required: ["titulo", "recordar_en"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      recordar_en: z.string().datetime({ offset: true }),
      tarea_id: z.string().uuid().optional(),
    }),
    handler: (args: { titulo: string; recordar_en: string; tarea_id?: string }) =>
      apiRequest("/reminders", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, remind_at: args.recordar_en, task_id: args.tarea_id }),
      }),
  },

  crear_evento: {
    description:
      "Crea un evento en la Agenda de Focusbrain (ej. una cita, una llamada, algo con hora fija). " +
      "Por defecto además crea un recordatorio para 2 horas antes del evento — la API lo programa " +
      "sola en OpenClaw, no hace falta crear ningún cron aparte con la herramienta `cron`.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        descripcion: { type: "string" },
        inicio: {
          type: "string",
          description: "ISO 8601 con offset de zona horaria; para Costa Rica usar -06:00. Cuándo empieza.",
        },
        crear_recordatorio: {
          type: "boolean",
          description: "Si crear el recordatorio automático 2h antes. Default true.",
        },
      },
      required: ["titulo", "inicio"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      descripcion: z.string().optional(),
      inicio: z.string().datetime({ offset: true }),
      crear_recordatorio: z.boolean().optional(),
    }),
    handler: async (args: {
      titulo: string;
      descripcion?: string;
      inicio: string;
      crear_recordatorio?: boolean;
    }) => {
      const event = await apiRequest<Event>("/events", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, description: args.descripcion, starts_at: args.inicio }),
      });

      if (args.crear_recordatorio ?? true) {
        const remindAt = new Date(new Date(args.inicio).getTime() - TWO_HOURS_MS).toISOString();
        await apiRequest("/reminders", {
          method: "POST",
          body: JSON.stringify({
            title: `Recordatorio: ${args.titulo}`,
            event_id: event.id,
            remind_at: remindAt,
          }),
        });
      }

      return event;
    },
  },

  crear_nota: {
    description:
      "Guarda una nota o información libre que el usuario te dicte o pida anotar. Se puede " +
      "recuperar después con `buscar_notas`.",
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

  buscar_notas: {
    description:
      "Busca o lista las notas guardadas del usuario. Si le pide 'buscá la nota de...' o " +
      "'¿qué anoté sobre...?', usar `busqueda` (busca por palabra en título y contenido). Sin " +
      "`busqueda`, trae las más recientes. Trae máximo 20.",
    inputSchema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Palabra o frase a buscar en título/contenido. Opcional." },
      },
    },
    argsSchema: z.object({ busqueda: z.string().optional() }),
    handler: (args: { busqueda?: string }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (args.busqueda) params.set("q", args.busqueda);
      return apiRequest<Note[]>(`/notes?${params.toString()}`);
    },
  },

  listar_vehiculos: {
    description:
      "Lista los vehículos del usuario (marca, modelo, año, tipo, placa) — usar esto primero para " +
      "obtener el `id` de un vehículo antes de crear un mantenimiento o listar su historial.",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => apiRequest<Vehicle[]>("/vehicles?limit=100"),
  },

  crear_vehiculo: {
    description: "Registra un vehículo nuevo del usuario.",
    inputSchema: {
      type: "object",
      properties: {
        marca: { type: "string" },
        modelo: { type: "string" },
        anio: { type: "number" },
        tipo: { type: "string", description: "ej. Sedán, SUV, Pickup, Moto. Opcional." },
        placa: { type: "string" },
      },
      required: ["marca", "modelo"],
    },
    argsSchema: z.object({
      marca: z.string().min(1),
      modelo: z.string().min(1),
      anio: z.number().int().optional(),
      tipo: z.string().optional(),
      placa: z.string().optional(),
    }),
    handler: (args: { marca: string; modelo: string; anio?: number; tipo?: string; placa?: string }) =>
      apiRequest<Vehicle>("/vehicles", {
        method: "POST",
        body: JSON.stringify({ brand: args.marca, model: args.modelo, year: args.anio, vehicle_type: args.tipo, plate: args.placa }),
      }),
  },

  crear_mantenimiento: {
    description:
      "Agrega una línea al historial de mantenimiento de un vehículo (ej. 'cambio de aceite'). " +
      "Necesita el `id` del vehículo — usar `listar_vehiculos` primero si no se conoce.",
    inputSchema: {
      type: "object",
      properties: {
        vehiculo_id: { type: "string" },
        fecha: { type: "string", description: "ISO 8601 con offset; para Costa Rica usar -06:00." },
        descripcion: { type: "string", description: "ej. 'Cambio de aceite'" },
        kilometraje: { type: "number" },
      },
      required: ["vehiculo_id", "fecha", "descripcion"],
    },
    argsSchema: z.object({
      vehiculo_id: z.string().uuid(),
      fecha: z.string().datetime({ offset: true }),
      descripcion: z.string().min(1),
      kilometraje: z.number().optional(),
    }),
    handler: (args: { vehiculo_id: string; fecha: string; descripcion: string; kilometraje?: number }) =>
      apiRequest<VehicleMaintenance>("/vehicle-maintenance", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: args.vehiculo_id,
          date: args.fecha,
          description: args.descripcion,
          mileage: args.kilometraje,
        }),
      }),
  },

  listar_mantenimientos: {
    description: "Lista el historial de mantenimiento de un vehículo, del más reciente al más viejo.",
    inputSchema: {
      type: "object",
      properties: { vehiculo_id: { type: "string" } },
      required: ["vehiculo_id"],
    },
    argsSchema: z.object({ vehiculo_id: z.string().uuid() }),
    handler: (args: { vehiculo_id: string }) =>
      apiRequest<VehicleMaintenance[]>(`/vehicle-maintenance?vehicle_id=${args.vehiculo_id}&limit=100`),
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
