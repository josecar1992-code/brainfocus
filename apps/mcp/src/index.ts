import { readFile } from "node:fs/promises";
import { formatReminderTitle, horaActualCR, isoACostaRica, TWO_HOURS_MS } from "@brainfocus/shared-time";
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

interface RecurringReminder {
  id: string;
  title: string;
  schedule_type: "once" | "recurring";
  scheduled_at: string | null;
  is_instruction: boolean;
  frequency: "every_n_hours" | "daily" | "weekly" | null;
  interval_hours: number | null;
  time_of_day: string | null;
  day_of_week: number | null;
  active: boolean;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  vehicle_type: string | null;
  plate: string | null;
  next_maintenance_date: string | null;
  next_maintenance_mileage: number | null;
}

interface VehicleMaintenance {
  id: string;
  vehicle_id: string;
  date: string;
  description: string;
  mileage: number | null;
}

interface VehicleMileageLog {
  id: string;
  vehicle_id: string;
  mileage: number;
  logged_at: string;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
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
  frequency: "daily" | "weekly" | "monthly";
  interval_weeks: number;
  days_of_week: number[];
  day_of_month: number | null;
  time_of_day: string;
  start_date: string;
  crear_recordatorio: boolean;
  current_occurrence_date: string | null;
}

// TWO_HOURS_MS, horaActualCR, isoACostaRica y formatReminderTitle vienen de
// @brainfocus/shared-time (09-ago-2026) — eran casi idénticas a su
// equivalente en apps/web/src/api.ts y ya habían empezado a divergir, ver
// PENDIENTES.md sección 4.
//
// Ancla explícita de "ahora" en Costa Rica para las tools que reciben fechas
// (crear_tarea, crear_recordatorio, crear_evento, crear_rutina) — sin esto,
// el agente tenía que inferir la fecha/hora actual solo de su propio
// contexto de conversación, y confundía "hoy"/"mañana"/el offset con
// bastante frecuencia (confirmado por el usuario: corregía un recordatorio
// mal puesto y el siguiente volvía a fallar). Este servidor MCP se levanta
// de cero por invocación (`docker compose run --rm`, ver DEPLOY.md), así que
// evaluar esto al cargar el módulo ya da la hora real de cada llamada, no
// una constante vieja de un proceso de larga duración.
const AHORA_CR = `Ahora mismo en Costa Rica es: ${horaActualCR()} (offset -06:00).`;

// Set chico y de grano grueso a propósito: cada tool se inyecta en el prompt
// del agente en cada turno, así que más tools = más tokens gastados siempre.
// Agregar nutrition/exercise/lists/events cuando haya uso real, no por especulación.
const tools = {
  // Sin esto, la única forma que tenía el agente de anclar "qué día es hoy"
  // era la hora inyectada en la descripción de crear_tarea/recordatorio/
  // evento/rutina — que solo se ve cuando ya va a ESCRIBIR algo. Si el
  // usuario solo pregunta por una fecha o pide reagendar sin llamar a esas
  // tools, no tenía ningún ancla real y terminaba adivinando (confirmado
  // 06-ago-2026: el usuario reportó una fecha mal calculada en Agenda y el
  // agente "le echó la culpa al cron" — no había ningún tool que fallara,
  // simplemente no tenía cómo saber la hora real en ese turno).
  hora_actual: {
    description:
      "Devuelve la fecha y hora actuales reales en Costa Rica. Usar SIEMPRE antes de razonar sobre " +
      '"hoy", "mañana", "en X días/horas", o antes de confirmarle una fecha al usuario — nunca ' +
      "asumir ni calcular la fecha de memoria del contexto de la conversación.",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => ({
      ahora_costa_rica: horaActualCR(),
      offset: "-06:00",
      iso: new Date().toISOString(),
    }),
  },

  listar_tareas: {
    description:
      "Lista las tareas del usuario, opcionalmente filtradas por estado. Trae máximo 50. " +
      "due_date_costa_rica ya viene calculado en hora local (YYYY-MM-DD HH:MM) — usar ese campo " +
      "para hablarle al usuario de fechas, no convertir due_date (UTC) a mano.",
    inputSchema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["pending", "in_progress", "done"] },
      },
    },
    argsSchema: z.object({ estado: z.enum(["pending", "in_progress", "done"]).optional() }),
    handler: async (args: { estado?: string }) => {
      const params = new URLSearchParams({ limit: "50", fields: "id,title,status,due_date" });
      if (args.estado) params.set("status", args.estado);
      const tareas = await apiRequest<Task[]>(`/tasks?${params.toString()}`);
      return tareas.map((t) => ({ ...t, due_date_costa_rica: t.due_date ? isoACostaRica(t.due_date) : null }));
    },
  },

  crear_tarea: {
    description:
      `Crea una tarea nueva. Las tareas sí tienen categoría en Focusbrain (igual que las rutinas) — ` +
      `usar \`categoria_id\` cuando el usuario mencione una categoría/etiqueta (ej. "trabajo", ` +
      `"personal"), no asumir que no se puede. ${AHORA_CR}`,
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        notas: { type: "string" },
        fecha_limite: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica). Construir a partir de la hora real que " +
            "devuelve `hora_actual`, no de memoria/estimación. Opcional.",
        },
        proyecto_id: {
          type: "string",
          description: "id del proyecto al que pertenece, opcional — usar `listar_proyectos` si no se conoce.",
        },
        categoria_id: {
          type: "string",
          description: "id de la categoría, opcional — usar `listar_categorias` primero si no se conoce.",
        },
      },
      required: ["titulo"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      notas: z.string().optional(),
      fecha_limite: z.string().datetime({ offset: true }).optional(),
      proyecto_id: z.string().uuid().optional(),
      categoria_id: z.string().uuid().optional(),
    }),
    handler: async (args: {
      titulo: string;
      notas?: string;
      fecha_limite?: string;
      proyecto_id?: string;
      categoria_id?: string;
    }) => {
      const tarea = await apiRequest<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: args.titulo,
          notes: args.notas,
          due_date: args.fecha_limite,
          project_id: args.proyecto_id,
          list_id: args.categoria_id,
        }),
      });
      return { ...tarea, due_date_costa_rica: tarea.due_date ? isoACostaRica(tarea.due_date) : null };
    },
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

  editar_tarea: {
    description:
      "Edita una tarea ya existente (título, notas, fecha límite, categoría, proyecto o prioridad) — " +
      "solo mandá los campos que cambian, el resto queda igual. Necesita el `id` — usar `listar_tareas` " +
      `primero si no se conoce. Para marcarla como hecha usar \`completar_tarea\`, no esto. ${AHORA_CR}`,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "id de la tarea" },
        titulo: { type: "string" },
        notas: { type: "string" },
        fecha_limite: {
          type: "string",
          description: "ISO 8601 con offset -06:00 (Costa Rica). Mandar null para quitarle la fecha límite.",
        },
        proyecto_id: {
          type: "string",
          description: "id del proyecto, opcional. Mandar null para quitarla de su proyecto.",
        },
        categoria_id: {
          type: "string",
          description: "id de la categoría, opcional — usar `listar_categorias` si no se conoce.",
        },
        prioridad: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["id"],
    },
    argsSchema: z.object({
      id: z.string().uuid(),
      titulo: z.string().min(1).optional(),
      notas: z.string().nullable().optional(),
      fecha_limite: z.string().datetime({ offset: true }).nullable().optional(),
      proyecto_id: z.string().uuid().nullable().optional(),
      categoria_id: z.string().uuid().nullable().optional(),
      prioridad: z.enum(["low", "normal", "high"]).optional(),
    }),
    handler: (args: {
      id: string;
      titulo?: string;
      notas?: string | null;
      fecha_limite?: string | null;
      proyecto_id?: string | null;
      categoria_id?: string | null;
      prioridad?: "low" | "normal" | "high";
    }) => {
      const { id, titulo, notas, fecha_limite, proyecto_id, categoria_id, prioridad } = args;
      return apiRequest<Task>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: titulo,
          notes: notas,
          due_date: fecha_limite,
          project_id: proyecto_id,
          list_id: categoria_id,
          priority: prioridad,
        }),
      });
    },
  },

  crear_recordatorio: {
    description:
      "Guarda un recordatorio en Focusbrain. La API programa sola el aviso real de " +
      "WhatsApp/Telegram (cron de disparo único en OpenClaw) — no hace falta crear " +
      "ningún cron aparte con la herramienta `cron`. Si la tarea/evento relacionado " +
      "se completa o se borra antes de la hora, el recordatorio y su aviso se cancelan solos. " +
      `${AHORA_CR} Calculá "recordar_en" a partir de esta hora, no de tu propia estimación.`,
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        recordar_en: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica). Construir a partir de la hora real que " +
            "devuelve `hora_actual`, no de memoria/estimación. Cuándo debería sonar.",
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

  crear_aviso_asistente: {
    description:
      "Crea un aviso del módulo Asistente — puede ser único (una vez, ej. 'recordame a las 6pm que " +
      "salga la carne del freezer') o recurrente (se repite solo, ej. 'recordame tomar agua cada 2 " +
      "horas', 'todos los días a las 8pm recordame la pastilla'). A diferencia de `crear_recordatorio` " +
      "(siempre atado a una tarea/hora única y sin instrucciones) o `crear_rutina` (genera tarea+evento " +
      "por ocurrencia), esto es un aviso suelto sin tarea ni historial. `es_instruccion=true` es para " +
      "cuando el texto NO es algo para repetirle al usuario tal cual, sino una orden para que VOS " +
      "ejecutes cuando dispare (ej. 'dame el tipo de cambio del bitcoin actual', 'contame el clima de " +
      "hoy') — en ese caso el texto se te manda como instrucción, no como aviso a relayar. La API " +
      `programa sola el cron real (único o recurrente) en OpenClaw. ${AHORA_CR}`,
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "El aviso a relayar, o la instrucción si es_instruccion=true" },
        es_instruccion: {
          type: "boolean",
          description: "true si el texto es una orden para que ejecutes vos (no un dato para el usuario). Default false.",
        },
        tipo: { type: "string", enum: ["unico", "recurrente"], description: "Default 'recurrente'." },
        fecha_hora: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica). Requerido si tipo='unico'. Construir a partir de " +
            "`hora_actual`, no de memoria/estimación.",
        },
        frecuencia: { type: "string", enum: ["cada_n_horas", "diaria", "semanal"], description: "Requerido si tipo='recurrente'." },
        cada_cuantas_horas: {
          type: "number",
          description: "1-23. Requerido si frecuencia es 'cada_n_horas'. Dispara en marcas de reloj " +
            "múltiplos de este número (ej. 3 = 12am, 3am, 6am...), no 'cada N horas desde ahora'.",
        },
        hora: { type: "string", description: "HH:MM, 24 horas. Requerido si frecuencia es 'diaria' o 'semanal'." },
        dia_semana: {
          type: "number",
          description: "0=domingo .. 6=sábado. Requerido si frecuencia es 'semanal'.",
        },
      },
      required: ["titulo"],
    },
    argsSchema: z.object({
      titulo: z.string().min(1),
      es_instruccion: z.boolean().optional(),
      tipo: z.enum(["unico", "recurrente"]).default("recurrente"),
      fecha_hora: z.string().datetime({ offset: true }).optional(),
      frecuencia: z.enum(["cada_n_horas", "diaria", "semanal"]).optional(),
      cada_cuantas_horas: z.number().int().min(1).max(23).optional(),
      hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      dia_semana: z.number().int().min(0).max(6).optional(),
    }),
    handler: (args: {
      titulo: string;
      es_instruccion?: boolean;
      tipo: "unico" | "recurrente";
      fecha_hora?: string;
      frecuencia?: "cada_n_horas" | "diaria" | "semanal";
      cada_cuantas_horas?: number;
      hora?: string;
      dia_semana?: number;
    }) => {
      const frequency = args.frecuencia
        ? { cada_n_horas: "every_n_hours", diaria: "daily", semanal: "weekly" }[args.frecuencia]
        : undefined;
      return apiRequest<RecurringReminder>("/recurring-reminders", {
        method: "POST",
        body: JSON.stringify({
          title: args.titulo,
          is_instruction: args.es_instruccion,
          schedule_type: args.tipo === "unico" ? "once" : "recurring",
          scheduled_at: args.fecha_hora,
          frequency,
          interval_hours: args.cada_cuantas_horas,
          time_of_day: args.hora,
          day_of_week: args.dia_semana,
        }),
      });
    },
  },

  listar_avisos_asistente: {
    description: "Lista los avisos del módulo Asistente del usuario (únicos y recurrentes, con su estado).",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => apiRequest<RecurringReminder[]>("/recurring-reminders?limit=100"),
  },

  pausar_aviso_asistente: {
    description:
      "Activa o pausa un aviso recurrente del Asistente sin borrarlo (pausado, no vuelve a sonar hasta " +
      "que se reactive; no aplica a avisos únicos). Necesita el `id` — usar `listar_avisos_asistente` " +
      "primero si no se conoce.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, activo: { type: "boolean" } },
      required: ["id", "activo"],
    },
    argsSchema: z.object({ id: z.string().uuid(), activo: z.boolean() }),
    handler: (args: { id: string; activo: boolean }) =>
      apiRequest<RecurringReminder>(`/recurring-reminders/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: args.activo }),
      }),
  },

  borrar_aviso_asistente: {
    description:
      "Borra un aviso del Asistente y cancela su cron. Necesita el `id` — usar `listar_avisos_asistente` " +
      "primero si no se conoce.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    argsSchema: z.object({ id: z.string().uuid() }),
    handler: (args: { id: string }) => apiRequest(`/recurring-reminders/${args.id}`, { method: "DELETE" }),
  },

  crear_evento: {
    description:
      "Crea un evento en la Agenda de Focusbrain (ej. una cita, una llamada, algo con hora fija). " +
      "Por defecto además crea un recordatorio para 2 horas antes del evento — la API lo programa " +
      "sola en OpenClaw, no hace falta crear ningún cron aparte con la herramienta `cron`. " +
      `${AHORA_CR} Calculá "inicio" a partir de esta hora, no de tu propia estimación.`,
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        descripcion: { type: "string" },
        inicio: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica). Construir a partir de la hora real que " +
            "devuelve `hora_actual`, no de memoria/estimación. Cuándo empieza.",
        },
        crear_recordatorio: {
          type: "boolean",
          description: "Si crear el recordatorio automático 2h antes. Default true.",
        },
        recordatorio_hora_evento: {
          type: "boolean",
          description: "Si además avisar justo a la hora del evento (independiente del de 2h antes). Default false.",
        },
        proyecto_id: {
          type: "string",
          description: "id del proyecto al que pertenece, opcional — usar `listar_proyectos` si no se conoce.",
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
      proyecto_id: z.string().uuid().optional(),
    }),
    handler: async (args: {
      titulo: string;
      descripcion?: string;
      inicio: string;
      crear_recordatorio?: boolean;
      recordatorio_hora_evento?: boolean;
      proyecto_id?: string;
    }) => {
      // Todo evento tiene obligatoriamente una tarea asociada (mismo invariante que
      // la web en createEvent, api.ts) — sin esto el evento quedaba huérfano: no
      // aparecía en Tareas, sin prioridad/categoría, y no podía avanzar una rutina.
      const task = await apiRequest<{ id: string }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: args.titulo,
          notes: args.descripcion,
          due_date: args.inicio,
          project_id: args.proyecto_id,
        }),
      });

      const event = await apiRequest<Event>("/events", {
        method: "POST",
        body: JSON.stringify({
          title: args.titulo,
          description: args.descripcion,
          starts_at: args.inicio,
          task_id: task.id,
          project_id: args.proyecto_id,
        }),
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
        proyecto_id: {
          type: "string",
          description: "id del proyecto al que pertenece, opcional — usar `listar_proyectos` si no se conoce.",
        },
      },
      required: ["contenido"],
    },
    argsSchema: z.object({
      titulo: z.string().optional(),
      contenido: z.string().min(1),
      proyecto_id: z.string().uuid().optional(),
    }),
    handler: (args: { titulo?: string; contenido: string; proyecto_id?: string }) =>
      apiRequest("/notes", {
        method: "POST",
        body: JSON.stringify({ title: args.titulo, content: args.contenido, project_id: args.proyecto_id }),
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

  fijar_proximo_mantenimiento: {
    description:
      "Guarda cuándo/a qué kilometraje toca el próximo mantenimiento de un vehículo (ej. 'avisame " +
      "del cambio de aceite en 3 meses' o 'a los 55000 km'). Si le pasás fecha, la API programa sola " +
      "un aviso real por WhatsApp/Telegram para ese día, igual que un recordatorio normal — no hace " +
      "falta crear ningún cron aparte. El kilometraje es solo referencia visual en la app (no hay forma " +
      "de avisar solo cuando se llega a un km sin que alguien registre el odómetro). Necesita el `id` " +
      `del vehículo — usar \`listar_vehiculos\` primero si no se conoce. ${AHORA_CR}`,
    inputSchema: {
      type: "object",
      properties: {
        vehiculo_id: { type: "string" },
        fecha: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica), fecha del próximo mantenimiento. Opcional: " +
            "omitilo para dejar la fecha actual sin cambios, o mandá null explícito para borrarla.",
        },
        kilometraje: { type: "number", description: "Kilometraje objetivo del próximo mantenimiento. Opcional." },
      },
      required: ["vehiculo_id"],
    },
    argsSchema: z.object({
      vehiculo_id: z.string().uuid(),
      fecha: z.string().datetime({ offset: true }).optional().nullable(),
      kilometraje: z.number().optional().nullable(),
    }),
    handler: (args: { vehiculo_id: string; fecha?: string | null; kilometraje?: number | null }) =>
      apiRequest<Vehicle>(`/vehicles/${args.vehiculo_id}`, {
        method: "PATCH",
        body: JSON.stringify({ next_maintenance_date: args.fecha, next_maintenance_mileage: args.kilometraje }),
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
        fecha: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica). Construir a partir de la hora real que " +
            "devuelve `hora_actual`, no de memoria/estimación.",
        },
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

  registrar_kilometraje: {
    description:
      "Guarda una lectura de kilometraje (odómetro) de un vehículo — distinto de un mantenimiento: " +
      "es solo 'hoy tiene tantos km', no que se le hizo algo. Se usa para el control de uso mensual y " +
      "para saber si ya llegó al kilometraje del próximo mantenimiento (`next_maintenance_mileage` en " +
      `\`listar_vehiculos\`). Necesita el \`id\` del vehículo — usar \`listar_vehiculos\` primero si no ` +
      `se conoce. ${AHORA_CR}`,
    inputSchema: {
      type: "object",
      properties: {
        vehiculo_id: { type: "string" },
        kilometraje: { type: "number" },
        fecha: {
          type: "string",
          description:
            "ISO 8601 con offset -06:00 (Costa Rica). Opcional — si no se manda, se usa el momento actual.",
        },
      },
      required: ["vehiculo_id", "kilometraje"],
    },
    argsSchema: z.object({
      vehiculo_id: z.string().uuid(),
      kilometraje: z.number(),
      fecha: z.string().datetime({ offset: true }).optional(),
    }),
    handler: (args: { vehiculo_id: string; kilometraje: number; fecha?: string }) =>
      apiRequest<VehicleMileageLog>("/vehicle-mileage", {
        method: "POST",
        body: JSON.stringify({ vehicle_id: args.vehiculo_id, mileage: args.kilometraje, logged_at: args.fecha }),
      }),
  },

  listar_kilometrajes: {
    description: "Lista las lecturas de kilometraje guardadas de un vehículo, de la más reciente a la más vieja.",
    inputSchema: {
      type: "object",
      properties: { vehiculo_id: { type: "string" } },
      required: ["vehiculo_id"],
    },
    argsSchema: z.object({ vehiculo_id: z.string().uuid() }),
    handler: (args: { vehiculo_id: string }) =>
      apiRequest<VehicleMileageLog[]>(`/vehicle-mileage?vehicle_id=${args.vehiculo_id}&limit=100`),
  },

  listar_categorias: {
    description:
      "Lista las categorías del usuario (id, nombre, color) — usar esto primero para obtener el " +
      "`categoria_id` antes de crear una rutina o una tarea con categoría.",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => apiRequest<Category[]>("/lists?limit=100"),
  },

  listar_proyectos: {
    description:
      "Lista los proyectos del usuario (id, nombre, descripción, estado) — usar esto primero para " +
      "obtener el `proyecto_id` antes de crear una tarea/evento/nota dentro de un proyecto. Un " +
      "proyecto agrupa tareas, eventos y notas relacionadas (distinto de una categoría: cruza varios " +
      "tipos de recurso, no solo tareas).",
    inputSchema: { type: "object", properties: {} },
    argsSchema: z.object({}),
    handler: () => apiRequest<Project[]>("/projects?limit=100"),
  },

  crear_proyecto: {
    description:
      "Crea un proyecto nuevo, para agrupar tareas/eventos/notas relacionadas (ej. 'Mudanza', " +
      "'Renovar pasaporte'). Después usá `proyecto_id` al crear tareas/eventos/notas para ligarlos.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        descripcion: { type: "string" },
      },
      required: ["nombre"],
    },
    argsSchema: z.object({ nombre: z.string().min(1), descripcion: z.string().optional() }),
    handler: (args: { nombre: string; descripcion?: string }) =>
      apiRequest<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name: args.nombre, description: args.descripcion }),
      }),
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
      "Crea una rutina: una tarea que se repite (diaria, ciertos días de la semana, cada N semanas, " +
      "o un día fijo de cada mes — ej. 'sacar la basura los martes y viernes', 'cada domingo de por " +
      "medio', o 'pagar el alquiler el 15 de cada mes'). Genera automáticamente la tarea y el evento " +
      "de la próxima ocurrencia; al marcarse esa tarea como hecha, la siguiente se crea sola — nunca " +
      "hay que crear las ocurrencias a mano. Necesita " +
      `\`categoria_id\` — usar \`listar_categorias\` primero si no se conoce. ${AHORA_CR}`,
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "ej. 'Sacar la basura'" },
        categoria_id: { type: "string" },
        frecuencia: { type: "string", enum: ["diaria", "semanal", "mensual"] },
        dias_semana: {
          type: "array",
          items: { type: "number" },
          description: "0=domingo .. 6=sábado. Requerido si frecuencia es 'semanal'.",
        },
        cada_cuantas_semanas: {
          type: "number",
          description: "1 = toda semana (default), 2 = de por medio, 3, 4... Solo aplica a 'semanal'.",
        },
        dia_del_mes: {
          type: "number",
          description:
            "1..31. Requerido si frecuencia es 'mensual' — ej. 15 para 'el 15 de cada mes'. En meses " +
            "más cortos cae en el último día real del mes (el 31 en febrero cae el 28/29).",
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
      frecuencia: z.enum(["diaria", "semanal", "mensual"]),
      dias_semana: z.array(z.number().int().min(0).max(6)).optional(),
      cada_cuantas_semanas: z.number().int().min(1).max(52).optional(),
      dia_del_mes: z.number().int().min(1).max(31).optional(),
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
      frecuencia: "diaria" | "semanal" | "mensual";
      dias_semana?: number[];
      cada_cuantas_semanas?: number;
      dia_del_mes?: number;
      hora: string;
      fecha_inicio?: string;
      crear_recordatorio?: boolean;
    }) =>
      apiRequest<Routine>("/routines", {
        method: "POST",
        body: JSON.stringify({
          title: args.titulo,
          list_id: args.categoria_id,
          frequency: args.frecuencia === "diaria" ? "daily" : args.frecuencia === "mensual" ? "monthly" : "weekly",
          days_of_week: args.dias_semana,
          interval_weeks: args.cada_cuantas_semanas,
          day_of_month: args.dia_del_mes,
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
        proyecto_id: {
          type: "string",
          description: "id del proyecto al que pertenece, opcional — usar `listar_proyectos` si no se conoce.",
        },
      },
      required: ["nombre", "media_path"],
    },
    argsSchema: z.object({
      nombre: z.string().min(1),
      media_path: z.string().min(1),
      media_type: z.string().optional(),
      proyecto_id: z.string().uuid().optional(),
    }),
    handler: async (args: { nombre: string; media_path: string; media_type?: string; proyecto_id?: string }) => {
      const bytes = await readFile(args.media_path);
      const form = new FormData();
      form.set("name", args.nombre);
      if (args.proyecto_id) form.set("project_id", args.proyecto_id);
      form.set(
        "file",
        new Blob([bytes], { type: args.media_type || "application/octet-stream" }),
        args.nombre,
      );
      return apiUpload<Document>("/documents/upload", form);
    },
  },

  buscar_documentos: {
    description:
      "Lista los documentos guardados cuyo nombre contiene el texto buscado (sin importar " +
      "mayúsculas/tildes/orden), o los últimos guardados si no se pasa nombre. Usar esto antes de " +
      "`enviar_documento` cuando no estés seguro del nombre exacto, o cuando `enviar_documento` " +
      "devuelva varias coincidencias y haya que preguntarle al usuario cuál quiere.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Palabra o frase a buscar en el nombre. Opcional." },
      },
    },
    argsSchema: z.object({ nombre: z.string().optional() }),
    handler: (args: { nombre?: string }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (args.nombre) params.set("q", args.nombre);
      return apiRequest<Document[]>(`/documents?${params.toString()}`);
    },
  },

  enviar_documento: {
    description:
      "Busca un documento guardado por coincidencia parcial del nombre (sin importar " +
      "mayúsculas/tildes/orden de palabras) y devuelve la URL para reenviarlo como adjunto real " +
      "(imagen/documento, con forceDocument si aplica) — nunca describir ni leer el contenido, solo " +
      "reenviar el archivo. Si hay más de una coincidencia, NO adivinar ni mandar la primera: devuelve " +
      "la lista de nombres para que le preguntes al usuario cuál quiere y volvés a llamar esta tool " +
      "con el nombre exacto que eligió.",
    inputSchema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo o parcial con el que se guardó." },
      },
      required: ["nombre"],
    },
    argsSchema: z.object({ nombre: z.string().min(1) }),
    handler: async (args: { nombre: string }) => {
      const params = new URLSearchParams({ q: args.nombre, limit: "10" });
      const matches = await apiRequest<Document[]>(`/documents?${params.toString()}`);

      if (matches.length === 0) {
        throw new Error(
          `No encontré ningún documento guardado que coincida con "${args.nombre}". Usá ` +
            "buscar_documentos para ver los nombres guardados.",
        );
      }
      if (matches.length > 1) {
        return {
          ambiguo: true,
          mensaje: "Hay más de un documento que coincide — preguntale al usuario cuál quiere y volvé a llamar con el nombre exacto.",
          coincidencias: matches.map((d) => d.name),
        };
      }

      const download = await apiRequest<{ url: string; name: string; mime_type: string | null; size: number | null }>(
        `/documents/${matches[0].id}/download-url`,
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
