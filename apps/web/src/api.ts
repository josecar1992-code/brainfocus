import { apiUrl, supabase } from "./supabaseClient";

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  list_id: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "normal" | "high";
  due_date: string | null;
  created_at: string;
  routine_id: string | null;
  created_by: "user" | "agent";
  sort_order: number | null;
}

export interface NewTask {
  title: string;
  notes?: string;
  list_id?: string;
  priority?: "low" | "normal" | "high";
  crearEvento?: boolean;
  fecha?: string; // YYYY-MM-DD, solo si crearEvento
  hora?: string; // HH:MM, solo si crearEvento
  crearRecordatorio?: boolean; // solo si crearEvento — avisa 2h antes
  crearRecordatorioHoraEvento?: boolean; // solo si crearEvento — avisa justo a la hora
  // Fecha límite sin crear evento en Agenda (independiente de crearEvento).
  fechaEntrega?: string; // YYYY-MM-DD
  horaEntrega?: string; // HH:MM, opcional — sin hora se asume fin del día
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  created_at: string;
}

export interface List {
  id: string;
  name: string;
  color: string | null;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  task_id: string | null;
  created_by: "user" | "agent";
}

export interface NewEvent {
  title: string;
  description?: string;
  starts_at: string;
  list_id: string;
  priority?: Task["priority"];
  crearRecordatorio: boolean; // avisa 2h antes
  crearRecordatorioHoraEvento: boolean; // avisa justo a la hora del evento
}

export interface Reminder {
  id: string;
  title: string;
  task_id: string | null;
  event_id: string | null;
  remind_at: string;
  channel: "telegram" | "whatsapp" | "email" | null;
  sent_at: string | null;
  cron_job_id: string | null;
  created_by: "user" | "agent";
}

export interface Note {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
  created_by: "user" | "agent";
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  vehicle_type: string | null;
  plate: string | null;
  created_at: string;
}

export interface NewVehicle {
  brand: string;
  model: string;
  year?: number;
  vehicle_type?: string;
  plate?: string;
}

export interface VehicleMaintenance {
  id: string;
  vehicle_id: string;
  date: string;
  description: string;
  mileage: number | null;
}

export interface NewMaintenance {
  vehicle_id: string;
  date: string;
  description: string;
  mileage?: number;
}

export interface Routine {
  id: string;
  title: string;
  list_id: string | null;
  frequency: "daily" | "weekly";
  interval_weeks: number;
  days_of_week: number[];
  time_of_day: string;
  start_date: string;
  crear_recordatorio: boolean;
  current_task_id: string | null;
  current_event_id: string | null;
  current_occurrence_date: string | null;
}

export interface NewRoutine {
  title: string;
  list_id: string;
  frequency: "daily" | "weekly";
  interval_weeks?: number;
  days_of_week?: number[];
  time_of_day: string;
  start_date: string;
  crear_recordatorio?: boolean;
}

export interface RoutineCompletion {
  id: string;
  routine_id: string;
  occurrence_date: string | null;
  completed_at: string;
}

export interface Document {
  id: string;
  name: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeader()), ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const CR_OFFSET = "-06:00"; // Costa Rica, sin horario de verano — offset fijo

// El mensaje que llega por WhatsApp es literalmente reminders.title (ver
// openclawCron.ts) — sin esto, el aviso solo decía "Recordatorio: <título>",
// sin ninguna hora, y quien lo recibía asumía que la hora de LLEGADA del aviso
// (2h antes por defecto) era la hora del evento. Acá se arma el texto
// completo: título, hora real del evento (America/Costa_Rica) y descripción.
function formatReminderTitle(title: string, startsAt: string, description?: string) {
  const hora = new Date(startsAt).toLocaleTimeString("es-CR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Costa_Rica",
  });
  const base = `Recordatorio: ${title} a las ${hora}`;
  return description ? `${base}. ${description}` : base;
}

// Si el evento empieza en menos de 2h (o ya pasó), "avisar 2h antes" cae en el
// pasado — la API lo rechaza (400) porque OpenClaw no puede programar un cron
// para una hora que ya pasó. Mejor omitir el recordatorio automático en ese
// caso que hacer fallar la creación de la tarea/evento entero por esto.
function isFutureReminder(remindAt: string) {
  return new Date(remindAt).getTime() > Date.now();
}

// Para que el formulario oculte/desmarque solo el check de "avisar 2h antes"
// cuando el evento queda a menos de 2h — evita que el usuario lo deje
// prendido sin darse cuenta y se tope con el 400 de "recordatorio en el pasado".
export function canRemindTwoHoursBefore(fecha: string, hora: string): boolean {
  if (!fecha || !hora) return false;
  const startsAt = new Date(`${fecha}T${hora}:00${CR_OFFSET}`).getTime();
  return startsAt - TWO_HOURS_MS > Date.now();
}

// Compartido entre createTask/createEvent/addEventToTask: arma los 0-2
// recordatorios de un evento (2h antes y/o justo a la hora), cada uno
// activable por separado. Ambos se omiten en silencio si caen en el pasado.
async function createEventReminders(input: {
  eventId: string;
  taskId: string;
  title: string;
  startsAt: string;
  description?: string;
  crearRecordatorio?: boolean;
  crearRecordatorioHoraEvento?: boolean;
}) {
  const base = { event_id: input.eventId, task_id: input.taskId };

  if (input.crearRecordatorio) {
    const remindAt = new Date(new Date(input.startsAt).getTime() - TWO_HOURS_MS).toISOString();
    if (isFutureReminder(remindAt)) {
      await request("/reminders", {
        method: "POST",
        body: JSON.stringify({
          ...base,
          title: formatReminderTitle(input.title, input.startsAt, input.description),
          remind_at: remindAt,
        }),
      });
    }
  }

  if (input.crearRecordatorioHoraEvento && isFutureReminder(input.startsAt)) {
    await request("/reminders", {
      method: "POST",
      body: JSON.stringify({
        ...base,
        title: formatReminderTitle(input.title, input.startsAt, input.description),
        remind_at: input.startsAt,
      }),
    });
  }
}

export const api = {
  checkAccess: () => request<Task[]>("/tasks?limit=1"),
  listTasks: () => request<Task[]>("/tasks"),
  toggleTask: (task: Task) =>
    request<Task>(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: task.status === "done" ? "pending" : "done" }),
    }),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" }),
  updateTask: (
    id: string,
    input: {
      title: string;
      notes?: string;
      list_id?: string | null;
      priority: Task["priority"];
      due_date?: string | null;
    },
  ) =>
    request<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: input.title,
        notes: input.notes || null,
        list_id: input.list_id || null,
        priority: input.priority,
        ...(input.due_date !== undefined ? { due_date: input.due_date } : {}),
      }),
    }),
  // Solo toca sort_order — separado de updateTask para no arrastrar el resto
  // del formulario de edición en cada drag & drop.
  reorderTask: (id: string, sort_order: number) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ sort_order }) }),

  listLists: () => request<List[]>("/lists"),
  createList: (input: { name: string; color?: string }) =>
    request<List>("/lists", { method: "POST", body: JSON.stringify(input) }),
  deleteList: (id: string) => request<void>(`/lists/${id}`, { method: "DELETE" }),

  async createTask(input: NewTask): Promise<Task> {
    const starts_at =
      input.crearEvento && input.fecha && input.hora ? `${input.fecha}T${input.hora}:00${CR_OFFSET}` : undefined;
    // Fecha de entrega sin evento: sin hora se asume fin del día (23:59), para
    // que "vence el viernes" no dependa de que el usuario elija una hora.
    const dueDateSinEvento = input.fechaEntrega
      ? `${input.fechaEntrega}T${input.horaEntrega || "23:59"}:00${CR_OFFSET}`
      : undefined;

    const task = await request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        notes: input.notes || undefined,
        list_id: input.list_id || undefined,
        priority: input.priority,
        due_date: starts_at ?? dueDateSinEvento,
      }),
    });

    if (starts_at) {
      const event = await request<Event>("/events", {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          description: input.notes || undefined,
          starts_at,
          task_id: task.id,
        }),
      });

      await createEventReminders({
        eventId: event.id,
        taskId: task.id,
        title: input.title,
        startsAt: starts_at,
        description: input.notes,
        crearRecordatorio: input.crearRecordatorio,
        crearRecordatorioHoraEvento: input.crearRecordatorioHoraEvento,
      });
    }

    return task;
  },

  listEvents: () => request<Event[]>("/events"),
  updateEvent: (id: string, input: { title: string; description?: string; starts_at: string }) =>
    request<Event>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteEvent: (id: string) => request<void>(`/events/${id}`, { method: "DELETE" }),

  listReminders: () => request<Reminder[]>("/reminders"),

  listNotes: () => request<Note[]>("/notes"),
  createNote: (input: { title?: string; content: string }) =>
    request<Note>("/notes", { method: "POST", body: JSON.stringify(input) }),
  updateNote: (id: string, input: { title?: string; content: string }) =>
    request<Note>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteNote: (id: string) => request<void>(`/notes/${id}`, { method: "DELETE" }),

  listVehicles: () => request<Vehicle[]>("/vehicles"),
  createVehicle: (input: NewVehicle) => request<Vehicle>("/vehicles", { method: "POST", body: JSON.stringify(input) }),
  updateVehicle: (id: string, input: NewVehicle) =>
    request<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteVehicle: (id: string) => request<void>(`/vehicles/${id}`, { method: "DELETE" }),

  listMaintenance: (vehicleId: string) =>
    request<VehicleMaintenance[]>(`/vehicle-maintenance?vehicle_id=${vehicleId}&limit=200`),
  createMaintenance: (input: NewMaintenance) =>
    request<VehicleMaintenance>("/vehicle-maintenance", { method: "POST", body: JSON.stringify(input) }),
  deleteMaintenance: (id: string) => request<void>(`/vehicle-maintenance/${id}`, { method: "DELETE" }),

  listRoutines: () => request<Routine[]>("/routines"),
  createRoutine: (input: NewRoutine) => request<Routine>("/routines", { method: "POST", body: JSON.stringify(input) }),
  updateRoutine: (id: string, input: Partial<NewRoutine>) =>
    request<Routine>(`/routines/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteRoutine: (id: string) => request<void>(`/routines/${id}`, { method: "DELETE" }),
  listRoutineCompletions: (routineId: string) =>
    request<RoutineCompletion[]>(`/routine-completions?routine_id=${routineId}&limit=100`),

  // Todo evento tiene obligatoriamente una tarea asociada (misma categoría), simétrico
  // al flujo inverso (tarea -> evento) en createTask.
  async createEvent(input: NewEvent): Promise<Event> {
    const task = await request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        notes: input.description || undefined,
        list_id: input.list_id,
        priority: input.priority,
        due_date: input.starts_at,
      }),
    });

    const event = await request<Event>("/events", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        starts_at: input.starts_at,
        task_id: task.id,
      }),
    });

    await createEventReminders({
      eventId: event.id,
      taskId: task.id,
      title: input.title,
      startsAt: input.starts_at,
      description: input.description,
      crearRecordatorio: input.crearRecordatorio,
      crearRecordatorioHoraEvento: input.crearRecordatorioHoraEvento,
    });

    return event;
  },

  // Agrega un evento a una tarea ya creada (edición posterior) — misma lógica que
  // createTask cuando se marca "crear evento" desde el inicio.
  async addEventToTask(input: {
    task_id: string;
    title: string;
    description?: string;
    starts_at: string;
    crearRecordatorio: boolean;
    crearRecordatorioHoraEvento: boolean;
  }): Promise<Event> {
    const event = await request<Event>("/events", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        starts_at: input.starts_at,
        task_id: input.task_id,
      }),
    });

    await createEventReminders({
      eventId: event.id,
      taskId: input.task_id,
      title: input.title,
      startsAt: input.starts_at,
      description: input.description,
      crearRecordatorio: input.crearRecordatorio,
      crearRecordatorioHoraEvento: input.crearRecordatorioHoraEvento,
    });

    return event;
  },

  listDocuments: (q?: string) =>
    request<Document[]>(`/documents${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),

  // Subida binaria: no puede pasar por request() porque esa fuerza
  // Content-Type: application/json siempre — acá el navegador arma el
  // multipart/form-data con su propio boundary.
  async uploadDocument(name: string, file: File): Promise<Document> {
    const form = new FormData();
    form.set("name", name);
    form.set("file", file);
    const res = await fetch(`${apiUrl}/documents/upload`, {
      method: "POST",
      headers: await authHeader(),
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },

  // URL firmada de vencimiento corto — se pide justo antes de descargar, nunca se guarda.
  getDocumentDownloadUrl: (id: string) =>
    request<{ url: string; name: string; mime_type: string | null; size: number | null }>(
      `/documents/${id}/download-url`,
    ),

  // Sin taskId trae TODAS las subtareas del usuario — sirve para mostrar el
  // % completado en las listas de tareas sin una consulta por tarea.
  listSubtasks: (taskId?: string) =>
    request<Subtask[]>(`/subtasks?limit=200${taskId ? `&task_id=${taskId}` : ""}`),
  createSubtask: (input: { task_id: string; title: string }) =>
    request<Subtask>("/subtasks", { method: "POST", body: JSON.stringify(input) }),
  toggleSubtask: (subtask: Subtask) =>
    request<Subtask>(`/subtasks/${subtask.id}`, { method: "PATCH", body: JSON.stringify({ done: !subtask.done }) }),
  deleteSubtask: (id: string) => request<void>(`/subtasks/${id}`, { method: "DELETE" }),
};
