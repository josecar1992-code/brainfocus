import { apiUrl, supabase } from "./supabaseClient";

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "normal" | "high";
  due_date: string | null;
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

export const api = {
  checkAccess: () => request<Task[]>("/tasks?limit=1"),
  listTasks: () => request<Task[]>("/tasks"),
  createTask: (title: string) => request<Task>("/tasks", { method: "POST", body: JSON.stringify({ title }) }),
  toggleTask: (task: Task) =>
    request<Task>(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: task.status === "done" ? "pending" : "done" }),
    }),
};
