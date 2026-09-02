import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Document, type Event, type Note, type Project, type Task } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { EventDetail, NewEventForm } from "./AgendaPage";
import { IconArrowLeft, IconCalendar, IconCheckSquare, IconDownload, IconFile, IconNote, IconPlus, IconX } from "./icons";
import { NoteDetail } from "./NoteDetail";
import { NewTaskModal, TaskDetail } from "./TasksPage";
import { PriorityBadge } from "./PriorityBadge";
import { QuickBadge } from "./QuickBadge";
import { useCompleteTask } from "./useCompleteTask";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatEventDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Costa_Rica",
  });
}

// Progreso agregado del proyecto: % de tareas ligadas ya hechas — mismo
// patrón que el progreso de subtareas dentro de una tarea (subtaskProgress
// en TasksPage.tsx), calculado en el cliente, no guardado.
function projectProgress(taskStatuses: ("pending" | "in_progress" | "done")[]) {
  if (taskStatuses.length === 0) return null;
  const done = taskStatuses.filter((s) => s === "done").length;
  return { done, total: taskStatuses.length, percent: Math.round((done / taskStatuses.length) * 100) };
}

/**
 * Vista de detalle de un proyecto: agrupa sus tareas, eventos y notas, y
 * permite crear tareas/eventos ya asignados a este proyecto — antes no había
 * forma de crear nada desde acá ni de ver lo agrupado, "abrir un proyecto"
 * no hacía nada (reportado por el usuario 14-ago-2026).
 */
function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const { data: events } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const { data: notes } = useQuery({ queryKey: ["notes"], queryFn: api.listNotes });
  const { data: documents } = useQuery({ queryKey: ["documents"], queryFn: () => api.listDocuments() });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.listReminders });
  const completeTask = useCompleteTask();
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [openEvent, setOpenEvent] = useState<Event | null>(null);
  const [openNote, setOpenNote] = useState<Note | null>(null);

  const remindersByEvent = new Map((reminders ?? []).filter((r) => r.event_id).map((r) => [r.event_id as string, r]));

  const deleteEvent = useMutation({
    mutationFn: api.deleteEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setEventToDelete(null);
    },
  });

  const projectEvents = (events ?? [])
    .filter((e) => e.project_id === project.id)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const eventTaskIds = new Set(projectEvents.map((e) => e.task_id).filter(Boolean));

  // Toda tarea con evento ya se ve en la lista de eventos (con su checkbox) —
  // mostrarla también acá sería la misma duplicación que se corrigió en Hoy.
  const projectTasks = (tasks ?? [])
    .filter((t) => t.project_id === project.id && !eventTaskIds.has(t.id))
    .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0));

  const projectNotes = (notes ?? []).filter((n) => n.project_id === project.id);
  const projectDocuments = (documents ?? []).filter((d) => d.project_id === project.id);
  const tasksById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const progress = projectProgress((tasks ?? []).filter((t) => t.project_id === project.id).map((t) => t.status));

  async function handleOpenDocument(doc: Document) {
    const { url } = await api.getDocumentDownloadUrl(doc.id);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-white/40 hover:text-electric-cyan transition-colors p-1 -ml-1"
          aria-label="Volver a proyectos"
        >
          <IconArrowLeft className="w-5 h-5" strokeWidth={1.75} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate">{project.name}</h1>
            {project.created_by === "agent" && <QuickBadge iconOnly />}
          </div>
          {project.description && <p className="text-sm text-white/40 whitespace-pre-wrap">{project.description}</p>}
        </div>
      </div>

      {progress && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 max-w-[240px] rounded-full bg-white/8 overflow-hidden">
            <div className="h-full bg-green-400 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="text-[11px] text-green-400">
            {progress.done}/{progress.total} tareas · {progress.percent}%
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-1.5 text-sm border border-electric-cyan/20 rounded-lg px-3 py-1.5 text-electric-cyan/90 hover:bg-electric-cyan/10 transition-colors"
        >
          <IconPlus className="w-4 h-4" strokeWidth={1.75} />
          Tarea
        </button>
        <button
          type="button"
          onClick={() => setShowNewEvent(true)}
          className="flex items-center gap-1.5 text-sm border border-electric-cyan/20 rounded-lg px-3 py-1.5 text-electric-cyan/90 hover:bg-electric-cyan/10 transition-colors"
        >
          <IconPlus className="w-4 h-4" strokeWidth={1.75} />
          Evento
        </button>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-2">
          <IconCalendar className="w-4 h-4 flex-shrink-0 text-electric-cyan/70" strokeWidth={1.75} />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Eventos</p>
          <span className="text-[11px] text-white/30">({projectEvents.length})</span>
        </div>
        {projectEvents.length === 0 && <p className="text-white/40 text-sm px-5 pb-5">Sin eventos todavía.</p>}
        {projectEvents.length > 0 && (
          <ul>
            {projectEvents.map((event) => {
              const linkedTask = event.task_id ? tasksById.get(event.task_id) : undefined;
              return (
                <li
                  key={event.id}
                  className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3 group cursor-pointer"
                  onClick={() => setOpenEvent(event)}
                >
                  {linkedTask && (
                    <input
                      type="checkbox"
                      checked={linkedTask.status === "done"}
                      onChange={(e) => {
                        e.stopPropagation();
                        completeTask.request(linkedTask);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm ${linkedTask?.status === "done" ? "line-through text-white/30" : "text-white/90"}`}
                      >
                        {event.title}
                      </span>
                      {linkedTask && <PriorityBadge priority={linkedTask.priority} />}
                      {event.created_by === "agent" && <QuickBadge iconOnly />}
                    </div>
                    <p className="text-[11px] text-electric-cyan/80 mt-0.5">{formatEventDateTime(event.starts_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEventToDelete(event);
                    }}
                    aria-label="Borrar evento"
                    className="text-white/20 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
                  >
                    <IconX className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-2">
          <IconCheckSquare className="w-4 h-4 flex-shrink-0 text-electric-cyan/70" strokeWidth={1.75} />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Tareas</p>
          <span className="text-[11px] text-white/30">({projectTasks.length})</span>
        </div>
        {projectTasks.length === 0 && <p className="text-white/40 text-sm px-5 pb-5">Sin tareas propias todavía.</p>}
        {projectTasks.length > 0 && (
          <ul>
            {projectTasks.map((task) => (
              <li
                key={task.id}
                className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setOpenTask(task)}
              >
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={(e) => {
                    e.stopPropagation();
                    completeTask.request(task);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm ${task.status === "done" ? "line-through text-white/30" : "text-white/90"}`}>
                      {task.title}
                    </span>
                    <PriorityBadge priority={task.priority} />
                    {task.created_by === "agent" && <QuickBadge iconOnly />}
                  </div>
                  {task.due_date && <p className="text-[11px] text-white/30 mt-0.5">Vence {formatDate(task.due_date)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {projectNotes.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-2">
            <IconNote className="w-4 h-4 flex-shrink-0 text-electric-cyan/70" strokeWidth={1.75} />
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Notas</p>
            <span className="text-[11px] text-white/30">({projectNotes.length})</span>
          </div>
          <ul>
            {projectNotes.map((note) => (
              <li
                key={note.id}
                className="px-5 py-3 border-t border-white/8 first:border-t-0 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setOpenNote(note)}
              >
                {note.title && <p className="text-sm text-white/90">{note.title}</p>}
                {note.content && <p className="text-sm text-white/50 whitespace-pre-wrap line-clamp-2 mt-0.5">{note.content}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {projectDocuments.length > 0 && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5 pb-2">
            <IconFile className="w-4 h-4 flex-shrink-0 text-electric-cyan/70" strokeWidth={1.75} />
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Documentos</p>
            <span className="text-[11px] text-white/30">({projectDocuments.length})</span>
          </div>
          <ul>
            {projectDocuments.map((doc) => (
              <li
                key={doc.id}
                className="px-5 py-3 border-t border-white/8 first:border-t-0 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors group"
                onClick={() => handleOpenDocument(doc)}
              >
                <IconFile className="w-5 h-5 text-electric-cyan/70 flex-shrink-0" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/90 truncate">{doc.name}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {formatDateTime(doc.created_at)}
                    {doc.size ? ` · ${formatSize(doc.size)}` : ""}
                  </p>
                </div>
                <IconDownload
                  className="w-4 h-4 text-white/20 group-hover:text-electric-cyan transition-colors flex-shrink-0"
                  strokeWidth={1.75}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNewTask && (
        <NewTaskModal
          lists={lists ?? []}
          projects={projects ?? []}
          defaultProjectId={project.id}
          onClose={() => setShowNewTask(false)}
        />
      )}
      {showNewEvent && (
        <NewEventForm
          lists={lists ?? []}
          projects={projects ?? []}
          defaultProjectId={project.id}
          onClose={() => setShowNewEvent(false)}
        />
      )}

      {eventToDelete && (
        <ConfirmDialog
          message={`¿Borrar el evento "${eventToDelete.title}"?`}
          pending={deleteEvent.isPending}
          onCancel={() => setEventToDelete(null)}
          onConfirm={() => deleteEvent.mutate(eventToDelete.id)}
        />
      )}

      {openTask && (
        <TaskDetail
          task={tasksById.get(openTask.id) ?? openTask}
          lists={lists ?? []}
          projects={projects ?? []}
          onClose={() => setOpenTask(null)}
        />
      )}
      {openEvent && (
        <EventDetail
          event={openEvent}
          reminder={remindersByEvent.get(openEvent.id)}
          task={openEvent.task_id ? tasksById.get(openEvent.task_id) : undefined}
          onToggleDone={(task) => completeTask.request(task)}
          onClose={() => setOpenEvent(null)}
        />
      )}
      {openNote && <NoteDetail note={openNote} projects={projects ?? []} onClose={() => setOpenNote(null)} />}

      {completeTask.pendingTask && (
        <ConfirmDialog
          message={`¿Marcar "${completeTask.pendingTask.title}" como hecha?`}
          variant="success"
          confirmLabel="Marcar hecha"
          pending={completeTask.isPending}
          onCancel={completeTask.cancel}
          onConfirm={completeTask.confirm}
        />
      )}
    </div>
  );
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [openProject, setOpenProject] = useState<Project | null>(null);

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

  // Si el proyecto abierto se archiva/borra desde otra pestaña, o ya no está
  // en la lista fresca, no dejar la vista de detalle en un estado fantasma.
  const openProjectFresh = openProject ? (projects ?? []).find((p) => p.id === openProject.id) ?? null : null;
  useEffect(() => {
    if (openProject && !openProjectFresh && !isLoading) setOpenProject(null);
  }, [openProject, openProjectFresh, isLoading]);

  if (openProject && openProjectFresh) {
    return <ProjectDetail project={openProjectFresh} onBack={() => setOpenProject(null)} />;
  }

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
                  className="px-5 py-4 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group cursor-pointer"
                  onClick={() => setOpenProject(project)}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveProject.mutate({
                            id: project.id,
                            status: project.status === "active" ? "archived" : "active",
                          });
                        }}
                        className="text-[11px] text-white/40 hover:text-electric-cyan transition-colors px-1.5"
                      >
                        {project.status === "active" ? "Archivar" : "Reactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
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
