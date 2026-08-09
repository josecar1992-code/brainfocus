import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Project } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconX } from "./icons";
import { QuickBadge } from "./QuickBadge";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

// Progreso agregado del proyecto: % de tareas ligadas ya hechas — mismo
// patrón que el progreso de subtareas dentro de una tarea (subtaskProgress
// en TasksPage.tsx), calculado en el cliente, no guardado.
function projectProgress(taskStatuses: ("pending" | "in_progress" | "done")[]) {
  if (taskStatuses.length === 0) return null;
  const done = taskStatuses.filter((s) => s === "done").length;
  return { done, total: taskStatuses.length, percent: Math.round((done / taskStatuses.length) * 100) };
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: projects, isLoading } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });

  const createProject = useMutation({
    mutationFn: api.createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setName("");
      setDescription("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear el proyecto"),
  });

  const archiveProject = useMutation({
    mutationFn: (input: { id: string; status: "active" | "archived" }) =>
      api.updateProject(input.id, { status: input.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  const deleteProject = useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setProjectToDelete(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Escribí un nombre para el proyecto.");
      return;
    }
    createProject.mutate({ name: name.trim(), description: description.trim() || undefined });
  }

  const visibleProjects = (projects ?? []).filter((p) => (showArchived ? p.status === "archived" : p.status === "active"));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Proyectos</h1>
          <p className="text-sm text-white/40">
            Agrupá tareas, eventos y notas relacionadas — Quicks también puede crear y usar proyectos
          </p>
        </div>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Nuevo proyecto</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. Mudanza, Renovar pasaporte)"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 resize-none transition"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={createProject.isPending}
            className="self-end bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createProject.isPending ? "Creando..." : "Crear proyecto"}
          </button>
        </form>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
            {showArchived ? "Archivados" : "Activos"}
          </p>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-[11px] text-electric-cyan/80 hover:text-electric-cyan transition-colors"
          >
            {showArchived ? "Ver activos" : "Ver archivados"}
          </button>
        </div>

        {isLoading && <p className="text-white/40 text-sm px-5 pb-5">Cargando...</p>}

        {visibleProjects.length === 0 && !isLoading && (
          <p className="text-white/40 text-sm px-5 pb-5">
            {showArchived ? "No hay proyectos archivados." : "No hay proyectos todavía."}
          </p>
        )}

        {visibleProjects.length > 0 && (
          <ul>
            {visibleProjects.map((project) => {
              const linkedStatuses = (tasks ?? []).filter((t) => t.project_id === project.id).map((t) => t.status);
              const progress = projectProgress(linkedStatuses);
              return (
                <li
                  key={project.id}
                  className="px-5 py-4 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white/90">{project.name}</p>
                        {project.created_by === "agent" && <QuickBadge iconOnly />}
                      </div>
                      {project.description && (
                        <p className="text-sm text-white/60 whitespace-pre-wrap mt-0.5">{project.description}</p>
                      )}
                      {progress && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 max-w-[180px] rounded-full bg-white/8 overflow-hidden">
                            <div
                              className="h-full bg-green-400 transition-all"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-green-400">
                            {progress.done}/{progress.total} tareas · {progress.percent}%
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-white/30 mt-1.5">Creado {formatDate(project.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() =>
                          archiveProject.mutate({
                            id: project.id,
                            status: project.status === "active" ? "archived" : "active",
                          })
                        }
                        className="text-[11px] text-white/40 hover:text-electric-cyan transition-colors px-1.5"
                      >
                        {project.status === "active" ? "Archivar" : "Reactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectToDelete(project)}
                        aria-label="Borrar proyecto"
                        className="text-white/20 hover:text-red-400 transition-colors p-1"
                      >
                        <IconX className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {projectToDelete && (
        <ConfirmDialog
          message={`¿Borrar el proyecto "${projectToDelete.name}"? Las tareas/eventos/notas ligados no se borran, solo quedan sin proyecto.`}
          pending={deleteProject.isPending}
          onCancel={() => setProjectToDelete(null)}
          onConfirm={() => deleteProject.mutate(projectToDelete.id)}
        />
      )}
    </div>
  );
}
