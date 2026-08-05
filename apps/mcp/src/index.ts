import { readFile } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { apiRequest, apiUpload } from "./apiClient.js";

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

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface Document {
  id: string;
  name: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
}

interface Routine {
  id: string;
  title: string;
  list_id: string | null;
  frequency: "daily" | "weekly";
  interval_weeks: number;
  days_of_week: number[];
  time_of_day: string;
  start_date: string;
  crear_recordatorio: boolean;
  current_occurrence_date: string | null;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// El mensaje que llega por WhatsApp es literalmente reminders.title (ver
// openclawCron.ts en la API) — sin esto, el aviso solo decía "Recordatorio:
// <título>", sin ninguna hora, y quien lo recibía asumía que la hora de
// LLEGADA del aviso (2h antes por defecto) era la hora del evento.
function formatReminderTitle(titulo: string, inicio: string, descripcion?: string) {
  const hora = new Date(inicio).toLocaleTimeString("es-CR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Costa_Rica",
  });
  const base = `Recordatorio: ${titulo} a las ${hora}`;
  return descripcion ? `${base}. ${descripcion}` : base;
}

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
        recordatorio_hora_evento: {
          type: "boolean",
          description: "Si además avisar justo a la hora del evento (independiente del de 2h antes). Default false.",
        },
      },
      required: ["titulo", "inicio"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      descripcion: z.string().optional(),
      inicio: z.string().datetime({ offset: true }),
      crear_recordatorio: z.boolean().optional(),
      recordatorio_hora_evento: z.boolean().optional(),
    }),
    handler: async (args: {
      titulo: string;
      descripcion?: string;
      inicio: string;
      crear_recordatorio?: boolean;
      recordatorio_hora_evento?: boolean;
    }) => {
      const event = await apiRequest<Event>("/events", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, description: args.descripcion, starts_at: args.inicio }),
      });

      // Si el evento empieza en menos de 2h (o ya pasó), "avisar 2h antes" cae
      // en el pasado y la API lo rechaza (400) — mejor omitir el recordatorio
      // automático que hacer fallar la creación del evento entero por esto.
      if ((args.crear_recordatorio ?? true) && new Date(args.inicio).getTime() - TWO_HOURS_MS > Date.now()) {
        const remindAt = new Date(new Date(args.inicio).getTime() - TWO_HOURS_MS).toISOString();
        await apiRequest("/reminders", {
          method: "POST",
          body: JSON.stringify({
            title: formatReminderTitle(args.titulo, args.inicio, args.descripcion),
            event_id: event.id,
            remind_at: remindAt,
          }),
        });
      }

      if (args.recordatorio_hora_evento && new Date(args.inicio).getTime() > Date.now()) {
        await apiRequest("/reminders", {
          method: "POST",
          body: JSON.stringify({
            title: formatReminderTitle(args.titulo, args.inicio, args.descripcion),
            event_id: event.id,
            remind_at: args.inicio,
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

  listar_categorias: {
    description:
      "Lista las categorías del usuario (id, nombre, color) — usar esto primero para obtener el " +
      "`categoria_id` antes de crear una rutina o una tarea con categoría.",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => apiRequest<Category[]>("/lists?limit=100"),
  },

  listar_rutinas: {
    description:
      "Lista las rutinas (tareas repetitivas) del usuario: frecuencia, días, hora y la fecha de la " +
      "próxima ocurrencia pendiente.",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => apiRequest<Routine[]>("/routines"),
  },

  crear_rutina: {
    description:
      "Crea una rutina: una tarea que se repite (diaria, ciertos días de la semana, o cada N " +
      "semanas — ej. 'sacar la basura los martes y viernes' o 'cada domingo de por medio'). " +
      "Genera automáticamente la tarea y el evento de la próxima ocurrencia; al marcarse esa tarea " +
      "como hecha, la siguiente se crea sola — nunca hay que crear las ocurrencias a mano. Necesita " +
      "`categoria_id` — usar `listar_categorias` primero si no se conoce.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "ej. 'Sacar la basura'" },
        categoria_id: { type: "string" },
        frecuencia: { type: "string", enum: ["diaria", "semanal"] },
        dias_semana: {
          type: "array",
          items: { type: "number" },
          description: "0=domingo .. 6=sábado. Requerido si frecuencia es 'semanal'.",
        },
        cada_cuantas_semanas: {
          type: "number",
          description: "1 = toda semana (default), 2 = de por medio, 3, 4... Solo aplica a 'semanal'.",
        },
        hora: { type: "string", description: "HH:MM, 24 horas. ej. '19:00'" },
        fecha_inicio: {
          type: "string",
          description:
            "YYYY-MM-DD. Ancla para contar la paridad de semanas (ej. de qué domingo en adelante " +
            "cuenta 'de por medio'). Si no se especifica, se usa la fecha de hoy.",
        },
        crear_recordatorio: {
          type: "boolean",
          description: "Si Quicks debe avisar justo a la hora de cada ocurrencia. Default true.",
        },
      },
      required: ["titulo", "categoria_id", "frecuencia", "hora"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      categoria_id: z.string().uuid(),
      frecuencia: z.enum(["diaria", "semanal"]),
      dias_semana: z.array(z.number().int().min(0).max(6)).optional(),
      cada_cuantas_semanas: z.number().int().min(1).max(52).optional(),
      hora: z.string().regex(/^\d{2}:\d{2}$/),
      fecha_inicio: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      crear_recordatorio: z.boolean().optional(),
    }),
    handler: (args: {
      titulo: string;
      categoria_id: string;
      frecuencia: "diaria" | "semanal";
      dias_semana?: number[];
      cada_cuantas_semanas?: number;
      hora: string;
      fecha_inicio?: string;
      crear_recordatorio?: boolean;
    }) =>
      apiRequest<Routine>("/routines", {
        method: "POST",
        body: JSON.stringify({
          title: args.titulo,
          list_id: args.categoria_id,
          frequency: args.frecuencia === "diaria" ? "daily" : "weekly",
          days_of_week: args.dias_semana,
          interval_weeks: args.cada_cuantas_semanas,
          time_of_day: args.hora,
          start_date: args.fecha_inicio ?? new Date().toISOString().slice(0, 10),
          crear_recordatorio: args.crear_recordatorio,
        }),
      }),
  },

  guardar_documento: {
    description:
      "Guarda un documento (PDF/imagen) que el usuario mandó por WhatsApp, con el nombre que " +
      "pida usar para buscarlo después. Usa el MediaPath/MediaType que ya vienen expuestos del " +
      "mensaje entrante — sube los bytes tal cual, sin leer ni describir el contenido. Si ya " +
      "existe un documento con ese nombre, lo reemplaza (no duplica).",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre único por el que se va a buscar después." },
        media_path: { type: "string", description: "Ruta local del archivo (MediaPath del mensaje entrante)." },
        media_type: { type: "string", description: "MIME type del archivo (MediaType del mensaje entrante)." },
      },
      required: ["nombre", "media_path"],
    },
    argsSchema: z.object({
      nombre: z.string().min(1),
      media_path: z.string().min(1),
      media_type: z.string().optional(),
    }),
    handler: async (args: { nombre: string; media_path: string; media_type?: string }) => {
      const bytes = await readFile(args.media_path);
      const form = new FormData();
      form.set("name", args.nombre);
      form.set(
        "file",
        new Blob([bytes], { type: args.media_type || "application/octet-stream" }),
        args.nombre,
      );
      return apiUpload<Document>("/documents/upload", form);
    },
  },

  enviar_documento: {
    description:
      "Busca un documento guardado por su nombre exacto y devuelve la URL para reenviarlo como " +
      "adjunto real (imagen/documento, con forceDocument si aplica) — nunca describir ni leer el " +
      "contenido, solo reenviar el archivo.",
    inputSchema: {
      type: "object",
      properties: { nombre: { type: "string", description: "Nombre exacto con el que se guardó." } },
      required: ["nombre"],
    },
    argsSchema: z.object({ nombre: z.string().min(1) }),
    handler: async (args: { nombre: string }) => {
      const params = new URLSearchParams({ name: args.nombre, limit: "1" });
      const [doc] = await apiRequest<Document[]>(`/documents?${params.toString()}`);
      if (!doc) throw new Error(`No hay ningún documento guardado con el nombre "${args.nombre}"`);

      const download = await apiRequest<{ url: string; name: string; mime_type: string | null; size: number | null }>(
        `/documents/${doc.id}/download-url`,
      );
      return download;
    },
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
