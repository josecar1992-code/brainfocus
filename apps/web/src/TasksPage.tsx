import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Task } from "./api";

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

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Tareas</h2>
      <form
        className="flex gap-2 mb-4"
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
          placeholder="Nueva tarea"
          className="flex-1 border border-deep-blue/40 bg-white/5 rounded px-3 py-2 placeholder:text-white/40"
        />
        <button type="submit" className="bg-electric-cyan text-night-blue font-medium rounded px-3 py-2">
          Agregar
        </button>
      </form>

      {isLoading && <p className="text-white/60">Cargando...</p>}
      <ul className="flex flex-col gap-2">
        {tasks?.map((task: Task) => (
          <li key={task.id} className="flex items-center gap-2 border border-deep-blue/30 rounded px-3 py-2">
            <input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask.mutate(task)} />
            <span className={task.status === "done" ? "line-through text-white/40" : ""}>{task.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
