import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Task } from "./api";

// Un solo botón/checkbox de "marcar como hecha" compartido entre Tareas,
// Agenda y Rutinas: siempre pega al mismo endpoint (PATCH /tasks/:id), así
// que marcarla en cualquier módulo la refleja en los otros tres (el backend
// ya cancela recordatorios y avanza la rutina si aplica). Pide confirmación
// solo al marcar como hecha (no al desmarcar) para evitar clicks accidentales.
export function useCompleteTask() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Task | null>(null);

  const mutation = useMutation({
    mutationFn: api.toggleTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      queryClient.invalidateQueries({ queryKey: ["routine-completions"] });
      setPending(null);
    },
  });

  function request(task: Task) {
    if (task.status === "done") {
      mutation.mutate(task);
    } else {
      setPending(task);
    }
  }

  return {
    pendingTask: pending,
    isPending: mutation.isPending,
    request,
    confirm: () => pending && mutation.mutate(pending),
    cancel: () => setPending(null),
  };
}
