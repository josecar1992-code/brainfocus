import { apiUrl, supabase } from "./supabaseClient";

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "normal" | "high";
  due_date: string | null;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

export interface NewEvent {
  title: string;
  description?: string;
  starts_at: string;
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

export const api = {
  checkAccess: () => request<Task[]>("/tasks?limit=1"),
  listTasks: () => request<Task[]>("/tasks"),
  createTask: (title: string) => request<Task>("/tasks", { method: "POST", body: JSON.stringify({ title }) }),
  toggleTask: (task: Task) =>
    request<Task>(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: task.status === "done" ? "pending" : "done" }),
    }),

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

  async createEvent(input: NewEvent): Promise<Event> {
    const event = await request<Event>("/events", {
      method: "POST",
      body: JSON.stringify({ title: input.title, description: input.description, starts_at: input.starts_at }),
    });

    if (input.crearRecordatorio) {
      const remindAt = new Date(new Date(input.starts_at).getTime() - TWO_HOURS_MS).toISOString();
      await request("/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: `Recordatorio: ${input.title}`,
          event_id: event.id,
          remind_at: remindAt,
        }),
      });
    }

    return event;
  },
};
