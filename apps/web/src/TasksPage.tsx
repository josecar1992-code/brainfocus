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
    <div className="max-w-md mx-auto mt-10">
      <h1 className="text-xl font-semibold mb-4">Tareas</h1>
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
          className="border rounded px-3 py-2 flex-1"
        />
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          Agregar
        </button>
      </form>

      {isLoading && <p>Cargando...</p>}
      <ul className="flex flex-col gap-2">
        {tasks?.map((task: Task) => (
          <li key={task.id} className="flex items-center gap-2 border rounded px-3 py-2">
            <input type="checkbox" checked={task.status === "done"} onChange={() => toggleTask.mutate(task)} />
            <span className={task.status === "done" ? "line-through text-gray-400" : ""}>{task.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
