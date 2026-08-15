import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, canRemindTwoHoursBefore, type List, type NewTask, type Project, type Subtask, type Task } from "./api";
import { CategorySelect } from "./CategorySelect";
import { ConfirmDialog } from "./ConfirmDialog";
import { CornerBrackets } from "./CornerBrackets";
import { IconBellOff, IconGripVertical, IconTrash } from "./icons";
import { PriorityBadge } from "./PriorityBadge";
import { ProjectSelect } from "./ProjectSelect";
import { QuickBadge } from "./QuickBadge";
import { ReminderBadge } from "./ReminderBadge";
import { RoutineBadge } from "./RoutineBadge";
import { OPTION_STYLE, PRIORITIES, SELECT_CLASS } from "./selectStyles";
import { StatusFilterTabs, type StatusFilter } from "./StatusFilterTabs";
import { TimePicker } from "./TimePicker";
import { useCompleteTask } from "./useCompleteTask";

const CR_OFFSET = "-06:00"; // Costa Rica, sin horario de verano — offset fijo

function formatCreatedDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Para precargar los inputs de fecha/hora al editar: Supabase devuelve el
// timestamptz en UTC ("...Z"), así que no se puede recortar el string tal
// cual — hay que convertir a la hora de Costa Rica primero.
function toDateInputValue(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}
function toTimeInputValue(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "America/Costa_Rica",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isOverdue(task: Task) {
  return Boolean(task.due_date) && task.status !== "done" && new Date(task.due_date as string).getTime() < Date.now();
}

function OverdueBadge() {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-red-400/15 text-red-400">
      Atrasada
    </span>
  );
}

// Progreso de subtareas — se calcula acá, no se guarda en ningún lado.
function subtaskProgress(subtasks: Subtask[]) {
  if (subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  return { done, total: subtasks.length, percent: Math.round((done / subtasks.length) * 100) };
}

function StatCard({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] px-3 py-4 text-center">
      <p className="text-2xl font-bold text-white leading-none">{valor}</p>
      <p className="text-[11px] text-white/40 mt-1.5 leading-tight">{etiqueta}</p>
    </div>
  );
}

export function NewTaskModal({
  lists,
  projects,
  defaultListId,
  defaultProjectId,
  onClose,
}: {
  lists: List[];
  projects: Project[];
  defaultListId?: string;
  defaultProjectId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [listId, setListId] = useState(defaultListId ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [crearEvento, setCrearEvento] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [crearRecordatorio, setCrearRecordatorio] = useState(true);
  const [crearRecordatorioHoraEvento, setCrearRecordatorioHoraEvento] = useState(true);
  // Independiente de crearEvento: una fecha límite sin crear nada en Agenda.
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [horaEntrega, setHoraEntrega] = useState("");
  const [error, setError] = useState<string | null>(null);
  const puedeAvisar2h = canRemindTwoHoursBefore(fecha, hora);

  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear la tarea"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Ponele un nombre a la tarea.");
      return;
    }
    if (!listId) {
      setError("Elegí una categoría (o creá una nueva).");
      return;
    }
    if (crearEvento && (!fecha || !hora)) {
      setError("Si vas a crear un evento, completa fecha y hora.");
      return;
    }
    const input: NewTask = {
      title: title.trim(),
      notes: notes.trim() || undefined,
      list_id: listId,
      project_id: projectId || undefined,
      priority,
      crearEvento,
      fecha: crearEvento ? fecha : undefined,
      hora: crearEvento ? hora : undefined,
      crearRecordatorio: crearEvento ? puedeAvisar2h && crearRecordatorio : undefined,
      crearRecordatorioHoraEvento: crearEvento ? crearRecordatorioHoraEvento : undefined,
      fechaEntrega: !crearEvento && fechaEntrega ? fechaEntrega : undefined,
      horaEntrega: !crearEvento && fechaEntrega ? horaEntrega : undefined,
    };
    createTask.mutate(input);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
      <CornerBrackets />
      <h2 className="text-lg font-medium mb-3">Nueva tarea</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Nombre</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ej. Llamar al banco"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/50">Detalle</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
            rows={2}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 resize-none transition"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Categoría</label>
            <CategorySelect lists={lists} value={listId} onChange={setListId} />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
              className={SELECT_CLASS}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value} style={OPTION_STYLE}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/50">Proyecto (opcional)</label>
            <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
          </div>
        )}

        {!crearEvento && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-white/50">Fecha de entrega (opcional)</label>
              <input
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
              />
            </div>
            {fechaEntrega && (
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Hora (opcional)</label>
                <TimePicker value={horaEntrega} onChange={setHoraEntrega} />
              </div>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={crearEvento}
            onChange={(e) => setCrearEvento(e.target.checked)}
            className="accent-electric-cyan"
          />
          Crear evento en Agenda
        </label>

        {crearEvento && (
          <div className="flex flex-col gap-3 bg-black/20 rounded-xl p-3 border border-white/10">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Hora</label>
                <TimePicker value={hora} onChange={setHora} />
              </div>
            </div>
            {puedeAvisar2h && (
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={crearRecordatorio}
                  onChange={(e) => setCrearRecordatorio(e.target.checked)}
                  className="accent-electric-cyan"
                />
                Avisar 2 horas antes
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={crearRecordatorioHoraEvento}
                onChange={(e) => setCrearRecordatorioHoraEvento(e.target.checked)}
                className="accent-electric-cyan"
              />
              Avisar a la hora del evento
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createTask.isPending}
            className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            {createTask.isPending ? "Creando..." : "Crear tarea"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

function TaskDetail({
  task,
  lists,
  projects,
  onClose,
}: {
  task: Task;
  lists: List[];
  projects: Project[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [listId, setListId] = useState(task.list_id ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(task.priority);
  const [crearEvento, setCrearEvento] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [crearRecordatorio, setCrearRecordatorio] = useState(true);
  const [crearRecordatorioHoraEvento, setCrearRecordatorioHoraEvento] = useState(true);
  // Fecha límite sin evento — precargada desde task.due_date si ya tenía una.
  const [fechaEntrega, setFechaEntrega] = useState(task.due_date ? toDateInputValue(task.due_date) : "");
  const [horaEntrega, setHoraEntrega] = useState(task.due_date ? toTimeInputValue(task.due_date) : "");
  const [error, setError] = useState<string | null>(null);
  const puedeAvisar2h = canRemindTwoHoursBefore(fecha, hora);

  const { data: events } = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  const existingEvent = events?.find((e) => e.task_id === task.id);

  // Recordatorio propio de la tarea (por su due_date) o el del evento ligado
  // — cualquiera de los dos que exista y no haya sonado ya, para mostrar acá
  // el mismo indicador "sin aviso real" que ya existe en Agenda (ReminderBadge).
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.listReminders });
  const taskReminder = reminders?.find(
    (r) => !r.sent_at && (r.task_id === task.id || (existingEvent && r.event_id === existingEvent.id)),
  );

  const { data: subtasks } = useQuery({
    queryKey: ["subtasks", task.id],
    queryFn: () => api.listSubtasks(task.id),
  });
  const progress = subtaskProgress(subtasks ?? []);
  const [newSubtask, setNewSubtask] = useState("");

  const createSubtask = useMutation({
    mutationFn: () => api.createSubtask({ task_id: task.id, title: newSubtask.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks"] });
      setNewSubtask("");
    },
  });

  // Optimista: sin esto, marcar/desmarcar tardaba lo mismo que el viaje
  // redondo a la API (~1-2s) porque el checkbox está controlado por los
  // datos de la query y no cambiaba hasta que volvía la respuesta y se
  // revalidaba. Actualiza ambas cachés (["subtasks", task.id] acá y el
  // ["subtasks"] global de CategoryTasksView) al toque, y si la API falla
  // revierte y deja que onSettled reconcilie con el server.
  const toggleSubtask = useMutation({
    mutationFn: api.toggleSubtask,
    onMutate: async (subtask) => {
      await queryClient.cancelQueries({ queryKey: ["subtasks"] });
      const previous = queryClient.getQueriesData<Subtask[]>({ queryKey: ["subtasks"] });
      queryClient.setQueriesData<Subtask[]>({ queryKey: ["subtasks"] }, (old) =>
        old?.map((s) => (s.id === subtask.id ? { ...s, done: !s.done } : s)),
      );
      return { previous };
    },
    onError: (_err, _subtask, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["subtasks"] }),
  });

  const deleteSubtask = useMutation({
    mutationFn: api.deleteSubtask,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["subtasks"] });
      const previous = queryClient.getQueriesData<Subtask[]>({ queryKey: ["subtasks"] });
      queryClient.setQueriesData<Subtask[]>({ queryKey: ["subtasks"] }, (old) => old?.filter((s) => s.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["subtasks"] }),
  });

  const updateTask = useMutation({
    mutationFn: async () => {
      const dueDateSinEvento =
        !crearEvento && !existingEvent && fechaEntrega
          ? `${fechaEntrega}T${horaEntrega || "23:59"}:00${CR_OFFSET}`
          : undefined;
      const updated = await api.updateTask(task.id, {
        title: title.trim(),
        notes: notes.trim(),
        list_id: listId,
        project_id: projectId,
        priority,
        ...(dueDateSinEvento !== undefined ? { due_date: dueDateSinEvento } : {}),
      });
      if (crearEvento && !existingEvent && fecha && hora) {
        await api.addEventToTask({
          task_id: task.id,
          title: title.trim(),
          description: notes.trim() || undefined,
          starts_at: `${fecha}T${hora}:00${CR_OFFSET}`,
          crearRecordatorio: puedeAvisar2h && crearRecordatorio,
          crearRecordatorioHoraEvento,
        });
      }
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo actualizar la tarea"),
  });

  const deleteTask = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo borrar la tarea"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Ponele un nombre a la tarea.");
      return;
    }
    if (crearEvento && !existingEvent && (!fecha || !hora)) {
      setError("Si vas a crear un evento, completa fecha y hora.");
      return;
    }
    updateTask.mutate();
  }

  const list = task.list_id ? lists.find((l) => l.id === task.list_id) : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-3 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)] max-h-full overflow-y-auto">
        <CornerBrackets />
        {editing ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium mb-1">Editar tarea</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Nombre</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Detalle</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 resize-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Categoría</label>
                <CategorySelect lists={lists} value={listId} onChange={setListId} />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-white/50">Prioridad</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task["priority"])}
                  className={SELECT_CLASS}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value} style={OPTION_STYLE}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {projects.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50">Proyecto (opcional)</label>
                <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
              </div>
            )}

            {existingEvent ? (
              <p className="text-xs text-white/40">
                Ya tiene un evento en Agenda ({new Date(existingEvent.starts_at).toLocaleString("es-CR")}).
              </p>
            ) : (
              <>
                {!crearEvento && (
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-xs text-white/50">Fecha de entrega (opcional)</label>
                      <input
                        type="date"
                        value={fechaEntrega}
                        onChange={(e) => setFechaEntrega(e.target.value)}
                        className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                      />
                    </div>
                    {fechaEntrega && (
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-white/50">Hora (opcional)</label>
                        <TimePicker value={horaEntrega} onChange={setHoraEntrega} />
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={crearEvento}
                    onChange={(e) => setCrearEvento(e.target.checked)}
                    className="accent-electric-cyan"
                  />
                  Crear evento en Agenda
                </label>

                {crearEvento && (
                  <div className="flex flex-col gap-3 bg-black/20 rounded-xl p-3 border border-white/10">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-white/50">Fecha</label>
                        <input
                          type="date"
                          value={fecha}
                          onChange={(e) => setFecha(e.target.value)}
                          className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-white/50">Hora</label>
                        <TimePicker value={hora} onChange={setHora} />
                      </div>
                    </div>
                    {puedeAvisar2h && (
                      <label className="flex items-center gap-2 text-sm text-white/70">
                        <input
                          type="checkbox"
                          checked={crearRecordatorio}
                          onChange={(e) => setCrearRecordatorio(e.target.checked)}
                          className="accent-electric-cyan"
                        />
                        Avisar 2 horas antes
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={crearRecordatorioHoraEvento}
                        onChange={(e) => setCrearRecordatorioHoraEvento(e.target.checked)}
                        className="accent-electric-cyan"
                      />
                      Avisar a la hora del evento
                    </label>
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateTask.isPending}
                className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
              >
                {updateTask.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="text-lg font-medium mb-1 text-white">{task.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {list && (
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${list.color ?? "#5B6B82"}22`, color: list.color ?? "#8FA3BF" }}
                >
                  {list.name}
                </span>
              )}
              <PriorityBadge priority={task.priority} />
              {task.routine_id && <RoutineBadge />}
              {task.created_by === "agent" && <QuickBadge />}
              {isOverdue(task) && <OverdueBadge />}
              {taskReminder && <ReminderBadge reminder={taskReminder} />}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                {task.status === "done" ? "Completada" : task.status === "in_progress" ? "En curso" : "Pendiente"}
              </span>
            </div>
            <p className="text-xs text-white/30">Creada {formatCreatedDate(task.created_at)}</p>
            {task.due_date && (
              <p className={`text-xs ${isOverdue(task) ? "text-red-400" : "text-white/40"}`}>
                Vence {formatDueDate(task.due_date)}
              </p>
            )}
            {task.notes && <p className="text-sm text-white/60 whitespace-pre-wrap">{task.notes}</p>}

            <div className="border-t border-white/8 pt-3 mt-1">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Subtareas</p>
                {progress && (
                  <p className="text-[11px] text-green-400">
                    {progress.done}/{progress.total} · {progress.percent}%
                  </p>
                )}
              </div>
              {progress && (
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mb-2">
                  <div
                    className="h-full bg-green-400 transition-all"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              )}
              {subtasks && subtasks.length > 0 && (
                <ul className="flex flex-col gap-1 mb-2">
                  {subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 group">
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={() => toggleSubtask.mutate(s)}
                        className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                      />
                      <span className={`text-sm flex-1 ${s.done ? "line-through text-white/30" : "text-white/80"}`}>
                        {s.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteSubtask.mutate(s.id)}
                        aria-label="Borrar subtarea"
                        className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <IconTrash className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newSubtask.trim()) createSubtask.mutate();
                }}
                className="flex gap-2"
              >
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="Agregar subtarea..."
                  className="flex-1 border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-1.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition"
                />
                <button
                  type="submit"
                  disabled={!newSubtask.trim() || createSubtask.isPending}
                  className="border border-electric-cyan/40 text-electric-cyan rounded-lg px-3 py-1.5 text-sm hover:bg-electric-cyan/10 transition disabled:opacity-40"
                >
                  +
                </button>
              </form>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="border border-white/10 rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="border border-electric-cyan/40 text-electric-cyan rounded-lg px-2 py-2 text-sm hover:bg-electric-cyan/10 transition"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleteTask.isPending}
                className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteTask.isPending ? "..." : "Borrar"}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message={`¿Borrar "${task.title}"?`}
          pending={deleteTask.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => deleteTask.mutate()}
        />
      )}
    </div>
  );
}

const SIN_CATEGORIA = "__sin_categoria__";

function CategoryCard({
  nombre,
  color,
  total,
  pendientes,
  onClick,
}: {
  nombre: string;
  color: string | null;
  total: number;
  pendientes: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-4 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color ?? "#5B6B82" }} />
        <p className="text-sm font-semibold text-white/90 truncate">{nombre}</p>
      </div>
      <p className="text-xs text-white/40 mt-2">
        {pendientes} pendiente{pendientes === 1 ? "" : "s"} · {total} en total
      </p>
    </button>
  );
}

function CategoryTasksView({
  categoryId,
  categoryName,
  categoryColor,
  tasks,
  onBack,
}: {
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  tasks: Task[];
  onBack: () => void;
}) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [prioridadFilter, setPrioridadFilter] = useState<Task["priority"] | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendientes");
  const [showForm, setShowForm] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const dragStartRef = useRef<{ index: number; clientY: number; rowHeight: number } | null>(null);
  const queryClient = useQueryClient();
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const { data: allSubtasks } = useQuery({ queryKey: ["subtasks"], queryFn: () => api.listSubtasks() });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: api.listReminders });
  const completeTask = useCompleteTask();

  // Solo el caso "sin aviso real" (cron falló o no se programó) — los demás
  // estados (programado/enviado) no aportan tanto en la vista compacta como
  // para justificar el ruido visual de un badge por tarea.
  const tasksWithoutRealReminder = new Set(
    (reminders ?? []).filter((r) => !r.sent_at && !r.cron_job_id && r.task_id).map((r) => r.task_id as string),
  );

  // Reordenar arrastra solo cambia sort_order de la tarea soltada — optimista
  // para que el drop se sienta instantáneo, igual que el toggle de subtareas.
  const reorderTask = useMutation({
    mutationFn: ({ id, sort_order }: { id: string; sort_order: number }) => api.reorderTask(id, sort_order),
    onMutate: async ({ id, sort_order }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previous = queryClient.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) =>
        old?.map((t) => (t.id === id ? { ...t, sort_order } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const subtasksByTask = new Map<string, Subtask[]>();
  for (const s of allSubtasks ?? []) {
    const list = subtasksByTask.get(s.task_id) ?? [];
    list.push(s);
    subtasksByTask.set(s.task_id, list);
  }

  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      setTaskToDelete(null);
    },
  });

  const visibleTasks = tasks
    .filter((t) => (categoryId === SIN_CATEGORIA ? !t.list_id : t.list_id === categoryId))
    .filter((t) => !prioridadFilter || t.priority === prioridadFilter)
    .filter((t) => (statusFilter === "hechas" ? t.status === "done" : t.status !== "done"))
    // Orden manual (drag & drop) en vez de por prioridad — sort_order es un
    // float que se reparte al arrastrar (ver reorderTask), así que el orden
    // que arma el usuario se respeta tal cual.
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const draggingIndex = draggingId ? visibleTasks.findIndex((t) => t.id === draggingId) : -1;
  // Índice "de destino" mientras se arrastra: no se reordena el array real
  // hasta soltar — cada fila calcula su propio desplazamiento visual a
  // partir de este número, así el ítem arrastrado sigue al dedo/mouse 1:1
  // (sin el "salto"/"pegado" de recalcular el orden completo en cada pixel).
  const dragTargetIndex =
    draggingIndex === -1 || !dragStartRef.current
      ? -1
      : Math.max(
          0,
          Math.min(
            visibleTasks.length - 1,
            draggingIndex + Math.round(dragDeltaY / dragStartRef.current.rowHeight),
          ),
        );

  function handleDragPointerDown(e: React.PointerEvent<HTMLElement>, taskId: string) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const row = e.currentTarget.closest<HTMLElement>("[data-task-row]");
    const index = visibleTasks.findIndex((t) => t.id === taskId);
    dragStartRef.current = { index, clientY: e.clientY, rowHeight: row?.offsetHeight || 56 };
    setDraggingId(taskId);
    setDragDeltaY(0);
  }

  function handleDragPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!draggingId || !dragStartRef.current) return;
    e.preventDefault();
    setDragDeltaY(e.clientY - dragStartRef.current.clientY);
  }

  function handleDragPointerUp(e: React.PointerEvent<HTMLElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const dragged = draggingId;
    const fromIndex = dragStartRef.current?.index ?? -1;
    const toIndex = dragTargetIndex;
    setDraggingId(null);
    setDragDeltaY(0);
    dragStartRef.current = null;
    if (!dragged || fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    // Vecinos en la lista YA sin el ítem arrastrado, en la posición de destino.
    const rest = visibleTasks.filter((t) => t.id !== dragged);
    const prevOrder = toIndex > 0 ? (rest[toIndex - 1]?.sort_order ?? null) : null;
    const nextOrder = rest[toIndex]?.sort_order ?? null;
    const newSortOrder =
      prevOrder != null && nextOrder != null
        ? (prevOrder + nextOrder) / 2
        : prevOrder != null
          ? prevOrder + 1
          : nextOrder != null
            ? nextOrder - 1
            : Date.now() / 1000;
    reorderTask.mutate({ id: dragged, sort_order: newSortOrder });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
        >
          ← Categorías
        </button>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: categoryColor ?? "#5B6B82" }}
          />
          <h1 className="text-xl font-bold text-white">{categoryName}</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="ml-auto bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm hover:brightness-110 transition"
        >
          + Crear tarea
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusFilterTabs value={statusFilter} onChange={setStatusFilter} />
        <select
          value={prioridadFilter}
          onChange={(e) => setPrioridadFilter(e.target.value as Task["priority"] | "")}
          className={`${SELECT_CLASS} py-1.5 text-sm`}
        >
          <option value="" style={OPTION_STYLE}>
            Toda prioridad
          </option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value} style={OPTION_STYLE}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] overflow-hidden">
        {visibleTasks.length === 0 && <p className="text-white/40 text-sm px-5 py-5">No hay tareas para este filtro.</p>}

        {visibleTasks.length > 0 && (
          <ul className="relative">
            {visibleTasks.map((task: Task, index) => {
              const progress = subtaskProgress(subtasksByTask.get(task.id) ?? []);
              const isDragging = draggingId === task.id;
              // El ítem arrastrado sigue al puntero 1:1 (translateY = delta
              // exacto); el resto solo se corre un lugar (arriba/abajo) para
              // abrir hueco en el destino — sin tocar el orden real hasta soltar.
              let translateY = 0;
              if (isDragging) {
                translateY = dragDeltaY;
              } else if (draggingId && dragTargetIndex !== -1) {
                if (index > draggingIndex && index <= dragTargetIndex) translateY = -(dragStartRef.current?.rowHeight ?? 56);
                else if (index < draggingIndex && index >= dragTargetIndex) translateY = dragStartRef.current?.rowHeight ?? 56;
              }
              return (
              <li
                key={task.id}
                data-task-row={task.id}
                style={{
                  transform: translateY ? `translateY(${translateY}px)` : undefined,
                  transition: isDragging ? "none" : "transform 150ms ease",
                  position: isDragging ? "relative" : undefined,
                  zIndex: isDragging ? 10 : undefined,
                }}
                className={`flex items-center gap-3 px-5 py-3 border-t border-white/8 first:border-t-0 hover:bg-white/5 transition-colors group cursor-pointer bg-night-blue ${
                  isDragging ? "shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]" : ""
                }`}
                onClick={() => setSelectedTask(task)}
              >
                <span
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => handleDragPointerDown(e, task.id)}
                  onPointerMove={handleDragPointerMove}
                  onPointerUp={handleDragPointerUp}
                  onPointerCancel={handleDragPointerUp}
                  className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none select-none"
                  aria-label="Arrastrar para reordenar"
                >
                  <IconGripVertical className="w-4 h-4" strokeWidth={1.75} />
                </span>
                <input
                  type="checkbox"
                  checked={task.status === "done"}
                  onChange={() => completeTask.request(task)}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-electric-cyan w-4 h-4 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm ${task.status === "done" ? "line-through text-white/30" : "text-white/90"}`}>
                      {task.title}
                    </span>
                    <PriorityBadge priority={task.priority} />
                    {task.routine_id && <RoutineBadge />}
                    {task.created_by === "agent" && <QuickBadge iconOnly />}
                    {isOverdue(task) && <OverdueBadge />}
                    {tasksWithoutRealReminder.has(task.id) && (
                      <span title="Tiene un recordatorio guardado sin aviso automático" className="flex-shrink-0">
                        <IconBellOff className="w-3.5 h-3.5 text-white/40" strokeWidth={1.75} />
                      </span>
                    )}
                    {progress && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-green-500/10 text-green-400">
                        {progress.done}/{progress.total} · {progress.percent}%
                      </span>
                    )}
                  </div>
                  {task.notes && <p className="text-xs text-white/40 mt-0.5 truncate">{task.notes}</p>}
                  <p className="text-[11px] text-white/30 mt-0.5">
                    Creada {formatCreatedDate(task.created_at)}
                    {task.due_date && ` · Vence ${formatDueDate(task.due_date)}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTaskToDelete(task);
                  }}
                  aria-label="Borrar tarea"
                  className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <IconTrash className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          lists={lists ?? []}
          projects={projects ?? []}
          onClose={() => setSelectedTask(null)}
        />
      )}
      {showForm && (
        <NewTaskModal
          lists={lists ?? []}
          projects={projects ?? []}
          defaultListId={categoryId === SIN_CATEGORIA ? undefined : categoryId}
          onClose={() => setShowForm(false)}
        />
      )}
      {taskToDelete && (
        <ConfirmDialog
          message={`¿Borrar "${taskToDelete.title}"?`}
          pending={deleteTask.isPending}
          onCancel={() => setTaskToDelete(null)}
          onConfirm={() => deleteTask.mutate(taskToDelete.id)}
        />
      )}
      {completeTask.pendingTask && (
        <ConfirmDialog
          message={`¿Marcar "${completeTask.pendingTask.title}" como hecha?`}
          confirmLabel="Marcar hecha"
          variant="success"
          pending={completeTask.isPending}
          onCancel={completeTask.cancel}
          onConfirm={completeTask.confirm}
        />
      )}
    </div>
  );
}

export function TasksPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks"], queryFn: api.listTasks });
  const { data: lists } = useQuery({ queryKey: ["lists"], queryFn: api.listLists });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const pendientes = tasks?.filter((t) => t.status !== "done").length ?? 0;
  const completadas = tasks?.filter((t) => t.status === "done").length ?? 0;

  if (selectedCategoryId && tasks) {
    const category = (lists ?? []).find((l) => l.id === selectedCategoryId);
    return (
      <CategoryTasksView
        categoryId={selectedCategoryId}
        categoryName={category?.name ?? "Sin categoría"}
        categoryColor={category?.color ?? null}
        tasks={tasks}
        onBack={() => setSelectedCategoryId(null)}
      />
    );
  }

  const sinCategoriaCount = tasks?.filter((t) => !t.list_id).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Tareas</h1>
          <p className="text-sm text-white/40">Lo que tenés pendiente, en un solo lugar</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + Crear tarea
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard valor={pendientes} etiqueta="Pendientes" />
        <StatCard valor={completadas} etiqueta="Completadas" />
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}

      {tasks && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(lists ?? []).map((l) => {
            const catTasks = tasks.filter((t) => t.list_id === l.id);
            return (
              <CategoryCard
                key={l.id}
                nombre={l.name}
                color={l.color}
                total={catTasks.length}
                pendientes={catTasks.filter((t) => t.status !== "done").length}
                onClick={() => setSelectedCategoryId(l.id)}
              />
            );
          })}
          {sinCategoriaCount > 0 && (
            <CategoryCard
              nombre="Sin categoría"
              color={null}
              total={sinCategoriaCount}
              pendientes={tasks.filter((t) => !t.list_id && t.status !== "done").length}
              onClick={() => setSelectedCategoryId(SIN_CATEGORIA)}
            />
          )}
        </div>
      )}

      {showForm && (
        <NewTaskModal lists={lists ?? []} projects={projects ?? []} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
