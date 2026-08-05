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
}

export interface NewTask {
  title: string;
  notes?: string;
  list_id?: string;
  priority?: "low" | "normal" | "high";
  crearEvento?: boolean;
  fecha?: string; // YYYY-MM-DD, solo si crearEvento
  hora?: string; // HH:MM, solo si crearEvento
  crearRecordatorio?: boolean; // solo si crearEvento
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
}

export interface NewEvent {
  title: string;
  description?: string;
  starts_at: string;
  list_id: string;
  priority?: Task["priority"];
  crearRecordatorio: boolean;
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
}

export interface Note {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
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
    input: { title: string; notes?: string; list_id?: string | null; priority: Task["priority"] },
  ) =>
    request<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: input.title,
        notes: input.notes || null,
        list_id: input.list_id || null,
        priority: input.priority,
      }),
    }),

  listLists: () => request<List[]>("/lists"),
  createList: (input: { name: string; color?: string }) =>
    request<List>("/lists", { method: "POST", body: JSON.stringify(input) }),
  deleteList: (id: string) => request<void>(`/lists/${id}`, { method: "DELETE" }),

  async createTask(input: NewTask): Promise<Task> {
    const starts_at =
      input.crearEvento && input.fecha && input.hora ? `${input.fecha}T${input.hora}:00${CR_OFFSET}` : undefined;

    const task = await request<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        notes: input.notes || undefined,
        list_id: input.list_id || undefined,
        priority: input.priority,
        due_date: starts_at,
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

      if (input.crearRecordatorio) {
        const remindAt = new Date(new Date(starts_at).getTime() - TWO_HOURS_MS).toISOString();
        if (isFutureReminder(remindAt)) {
          await request("/reminders", {
            method: "POST",
            body: JSON.stringify({
              title: formatReminderTitle(input.title, starts_at, input.notes),
              event_id: event.id,
              task_id: task.id,
              remind_at: remindAt,
            }),
          });
        }
      }
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

    if (input.crearRecordatorio) {
      const remindAt = new Date(new Date(input.starts_at).getTime() - TWO_HOURS_MS).toISOString();
      if (isFutureReminder(remindAt)) {
        await request("/reminders", {
          method: "POST",
          body: JSON.stringify({
            title: formatReminderTitle(input.title, input.starts_at, input.description),
            event_id: event.id,
            task_id: task.id,
            remind_at: remindAt,
          }),
        });
      }
    }

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

    if (input.crearRecordatorio) {
      const remindAt = new Date(new Date(input.starts_at).getTime() - TWO_HOURS_MS).toISOString();
      if (isFutureReminder(remindAt)) {
        await request("/reminders", {
          method: "POST",
          body: JSON.stringify({
            title: formatReminderTitle(input.title, input.starts_at, input.description),
            event_id: event.id,
            task_id: input.task_id,
            remind_at: remindAt,
          }),
        });
      }
    }

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
};
