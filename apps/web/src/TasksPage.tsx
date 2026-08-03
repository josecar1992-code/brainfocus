import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Task } from "./api";

function StatCard({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 px-3 py-4 text-center">
      <p className="text-2xl font-bold text-white leading-none">{valor}</p>
      <p className="text-[11px] text-white/40 mt-1.5 leading-tight">{etiqueta}</p>
    </div>
  );
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");

  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });

  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleTask = useMutation({
    mutationFn: api.toggleTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const pendientes = tasks?.filter((t) => t.status !== "done").length ?? 0;
  const completadas = tasks?.filter((t) => t.status === "done").length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Tareas</h1>
        <p className="text-sm text-white/40">Lo que tenés pendiente, en un solo lugar</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard valor={pendientes} etiqueta="Pendientes" />
        <StatCard valor={completadas} etiqueta="Completadas" />
      </div>

      <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Nueva tarea</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            createTask.mutate(title);
            setTitle("");
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej. Llamar al banco"
            className="flex-1 border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
          />
          <button
            type="submit"
            className="bg-electric-cyan text-night-blue font-medium rounded-lg px-4 py-2 hover:brightness-110 transition"
          >
            Agregar
          </button>
        </form>
      </div>

      <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 px-5 pt-5 pb-2">Lista</p>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {tasks && tasks.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">No hay tareas todavía.</p>
        )}

        {tasks && tasks.length > 0 && (
          <ul>
            {tasks.map((task: Task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 px-5 py-3 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => toggleTask.mutate(task)}
                  className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                />
                <span className={`text-sm ${task.status === "done" ? "line-through text-white/30" : "text-white/90"}`}>
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
